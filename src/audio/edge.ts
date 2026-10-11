/** Edge TTS narration provider (extracted for reuse by scripts and MCP).
 *
 * Synthesis is content-hashed and cached: identical text/voice/rate never
 * re-synthesizes. Word boundaries come from the provider stream and are
 * validated for monotonicity and containment in the probed duration.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  validateClip,
  type AudioClip,
  type NarrationProvider,
} from "./timeline";

export function command(cmd: string, args: string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] }),
      output: Buffer[] = [],
      errors: Buffer[] = [];
    child.stdout.on("data", (d) => output.push(d));
    child.stderr.on("data", (d) => errors.push(d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(output).toString())
        : reject(
            Error(
              `${cmd} failed (${code}): ${Buffer.concat(errors).toString().slice(-2000)}`,
            ),
          ),
    );
    child.stdin.end(stdin);
  });
}

export interface EdgeOptions {
  /** Bypass the cache and re-synthesize. */
  regenerate?: boolean;
}

export class EdgeNarration implements NarrationProvider {
  readonly id = "edge-tts-7.2.8";
  constructor(private opts: EdgeOptions = {}) {}
  async synthesize(
    request: Parameters<NarrationProvider["synthesize"]>[0],
  ): Promise<AudioClip> {
    const key = createHash("sha256")
        .update(
          JSON.stringify({
            provider: this.id,
            text: request.text,
            voice: request.voice,
            rate: request.rate,
          }),
        )
        .digest("hex"),
      file = `${request.outputDir}/${key}.mp3`,
      meta = `${request.outputDir}/${key}.json`;
    await mkdir(request.outputDir, { recursive: true });
    if (!this.opts.regenerate)
      try {
        const cached = JSON.parse(await readFile(meta, "utf8")) as AudioClip;
        const sha = createHash("sha256")
          .update(await readFile(file))
          .digest("hex");
        if (sha === cached.sha256)
          return validateClip({ ...cached, id: request.id });
      } catch {}
    const words = JSON.parse(
      await command(
        process.env.TTS_PYTHON ?? "python3",
        ["scripts/edge-tts.py"],
        JSON.stringify({ ...request, output: file }),
      ),
    );
    const probe = JSON.parse(
        await command("ffprobe", [
          "-v",
          "error",
          "-show_format",
          "-of",
          "json",
          file,
        ]),
      ),
      durationMs = Number(probe.format.duration) * 1000;
    const clip = validateClip({
      id: request.id,
      provider: this.id,
      voice: request.voice,
      file,
      durationMs,
      sha256: createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
      words,
    });
    await writeFile(meta, JSON.stringify(clip, null, 2));
    return clip;
  }
}
