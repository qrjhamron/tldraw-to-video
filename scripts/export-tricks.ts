/** Render a tricks lesson (aligned JSON) to MP4 and mux narration audio.
 *
 * Usage: export-tricks.ts <aligned.json> <wav> <output.mp4>
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { openStudio } from "./browser";

const [alignedPath, wavPath, output] = process.argv.slice(2);
if (!alignedPath || !wavPath || !output) throw Error("Usage: export-tricks.ts <aligned.json> <wav> <output.mp4>");
const lesson = JSON.parse(await readFile(alignedPath, "utf8"));
const fps = 30;
const durationMs: number = lesson.duration;
const frames = Math.ceil((durationMs / 1000) * fps);
await mkdir("output/inspection", { recursive: true });
const session = await openStudio("?export=1&lesson=intro");
try {
  const recording = await session.page.evaluate((l) => JSON.stringify(window.studio!.compile(l)), lesson as never);
  const r = JSON.parse(recording as string);
  const silent = output.replace(".mp4", ".silent.mp4");
  const ffmpeg = spawn("ffmpeg", [
    "-hide_banner", "-loglevel", "warning", "-y",
    "-f", "image2pipe", "-framerate", String(fps), "-vcodec", "mjpeg", "-i", "pipe:0",
    "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
    "-r", String(fps), "-frames:v", String(frames), "-movflags", "+faststart", silent,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let encodingError = "";
  ffmpeg.stderr.on("data", (d) => { encodingError += d.toString(); });
  const encodingDone = once(ffmpeg, "close");
  ffmpeg.stdin.on("error", () => {});
  const hashes: { frame: number; t: number; sha256: string }[] = [];
  const start = Date.now();
  const tag = output.split("/").pop()!.replace(".mp4", "");
  for (let i = 0; i < frames; i++) {
    const t = Math.min(i * 1000 / fps, durationMs - 1);
    const jpeg = (await session.page.evaluate((ms) => window.studio!.renderFrame(ms), t)) as string;
    const buffer = Buffer.from(jpeg.slice(jpeg.indexOf(",") + 1), "base64");
    if (!ffmpeg.stdin.write(buffer)) await once(ffmpeg.stdin, "drain");
    if (i % (fps * 10) === 0) {
      await writeFile(`output/inspection/${tag}-${(t / 1000).toFixed(0)}s.jpg`, buffer);
      hashes.push({ frame: i, t, sha256: createHash("sha256").update(buffer).digest("hex") });
    }
    if (i % 300 === 0) console.log(`Rendered ${i}/${frames} (${((Date.now() - start) / 1000).toFixed(0)}s elapsed)`);
  }
  ffmpeg.stdin.end();
  const [code] = await encodingDone;
  if (code !== 0) throw Error(`FFmpeg failed (${code}): ${encodingError}`);
  // Mux narration.
  const mux = spawn("ffmpeg", [
    "-hide_banner", "-loglevel", "warning", "-y", "-i", silent, "-i", wavPath,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    "-ar", "48000", "-shortest", "-movflags", "+faststart", output,
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let muxErr = "";
  mux.stderr.on("data", (d) => { muxErr += d.toString(); });
  const [muxCode] = (await once(mux, "close")) as number[];
  if (muxCode !== 0) throw Error(`Mux failed (${muxCode}): ${muxErr}`);
  await writeFile(
    output.replace(".mp4", ".manifest.json"),
    JSON.stringify({ output, width: 1920, height: 1080, fps, frames, durationMs, recordingEvents: (r.events as unknown[]).length, samples: hashes, browserErrors: session.errors, renderSeconds: (Date.now() - start) / 1000 }, null, 2),
  );
  console.log(`Exported ${output} (${frames} frames)`);
} finally {
  await session.close();
}
