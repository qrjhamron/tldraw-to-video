import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { flagshipLesson } from "../src/story/flagship";
import {
  alignNarration,
  narrationSchedule,
  validateClip,
  type AudioClip,
  type NarrationProvider,
} from "../src/audio/timeline";
function command(cmd: string, args: string[], stdin?: string): Promise<string> {
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
export class EdgeNarration implements NarrationProvider {
  readonly id = "edge-tts-7.2.8";
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
    const selected = process.argv[process.argv.indexOf("--segment") + 1];
    if (
      !process.argv.includes("--regenerate") &&
      !(process.argv.includes("--segment") && selected === request.id)
    )
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
const lesson = flagshipLesson(),
  provider = new EdgeNarration(),
  clips: AudioClip[] = [];
await mkdir("output/audio", { recursive: true });
try {
  for (const c of lesson.chapters)
    for (const a of c.actions) {
      if (a.type !== "narrate") continue;
      console.log(`Narration ${a.id}: ${a.text.slice(0, 65)}…`);
      clips.push(
        await provider.synthesize({
          id: a.id,
          text: a.text,
          voice: "id-ID-GadisNeural",
          rate: "+15%",
          outputDir: "output/audio/cache",
        }),
      );
    }
  const aligned = alignNarration(lesson, clips),
    schedule = narrationSchedule(aligned, clips);
  if (aligned.duration > 600000)
    throw Error(
      `Narration requires ${(aligned.duration / 1000).toFixed(1)}s; revise content to stay under 10 minutes`,
    );
  await writeFile(
    "output/audio/aligned.lesson.json",
    JSON.stringify(aligned, null, 2),
  );
  await writeFile("public/flagship.lesson.json", JSON.stringify(aligned));
  const filters =
    schedule
      .map(
        (s, i) =>
          `[${i}:a]aresample=48000,atrim=duration=${s.durationMs / 1000},asetpts=PTS-STARTPTS,adelay=${Math.round(s.t)}:all=1[a${i}]`,
      )
      .join(";") +
    `;${schedule.map((_, i) => `[a${i}]`).join("")}amix=inputs=${schedule.length}:normalize=0,apad,atrim=duration=${aligned.duration / 1000},loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
  await command("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...schedule.flatMap((s) => ["-i", s.file]),
    "-filter_complex",
    filters,
    "-map",
    "[out]",
    "-ar",
    "48000",
    "-c:a",
    "pcm_s16le",
    "output/audio/calculus_flagship.wav",
  ]);
  await writeFile(
    "output/audio/narration-manifest.json",
    JSON.stringify(
      {
        status: "available",
        provider: provider.id,
        voice: "id-ID-GadisNeural",
        durationMs: aligned.duration,
        originalDurationMs: lesson.duration,
        schedule,
        timestampValidation:
          "Boundaries validated for monotonicity and within decoded clip duration; word-level perceptual accuracy is not assumed. Segment starts align to actual audio duration.",
        normalization: "FFmpeg loudnorm I=-16 TP=-1.5 LRA=11",
      },
      null,
      2,
    ),
  );
  console.log(`Narration ready: ${(aligned.duration / 1000).toFixed(3)}s`);
} catch (e) {
  await writeFile(
    "output/audio/narration-manifest.json",
    JSON.stringify(
      {
        status: "unavailable",
        reason: String(e),
        completedSegments: clips.length,
      },
      null,
      2,
    ),
  );
  console.error("Narration unavailable; silent export remains independent:", e);
  process.exitCode = 1;
}
