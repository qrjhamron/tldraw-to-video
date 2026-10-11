import { spawn } from "node:child_process";
import {
  mkdir,
  writeFile,
  readFile,
  rename,
  copyFile,
  access,
} from "node:fs/promises";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { resolve, dirname, basename } from "node:path";
import { parseRecording } from "../src/engine/schema";
import { openStudio } from "./browser";
const option = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  const value = process.argv[i + 1];
  if (!value || value.startsWith("--"))
    throw Error(`Missing value for ${name}`);
  return value;
};
const inputRecording = option("--recording"),
  inputLesson = option("--lesson"),
  custom = !!(inputRecording || inputLesson);
if (inputRecording && inputLesson)
  throw Error("Choose --recording or --lesson");
const fps = 30,
  chunkFrames = 300,
  output = option("--output", "output/calculus_flagship_silent.mp4")!,
  dir = option(
    "--cache",
    custom
      ? `output/render-cache-${basename(output, ".mp4")}`
      : "output/render-cache-v3",
  )!;
if (!output.endsWith(".mp4")) throw Error("Output must be an MP4 path");
await mkdir(dirname(output), { recursive: true });
await mkdir(dir, { recursive: true });
const inspectionDir = custom
  ? output.replace(/\.mp4$/, ".inspection")
  : "output/flagship-inspection";
await mkdir(inspectionDir, { recursive: true });
const session = await openStudio("?export=1&offline=1"),
  { page } = session;
if (inputRecording) {
  const r = parseRecording(JSON.parse(await readFile(inputRecording, "utf8")));
  await page.evaluate(
    (raw: string) => window.studio!.load(JSON.parse(raw)),
    JSON.stringify(r),
  );
}
if (inputLesson) {
  const lesson = JSON.parse(await readFile(inputLesson, "utf8"));
  await page.evaluate((lesson) => window.studio!.compile(lesson), lesson);
}
const recording = await page.evaluate(() =>
    JSON.stringify(window.studio!.recording),
  ),
  r = JSON.parse(recording);
if (!custom && r.metadata.lessonId !== "calculus-flagship")
  throw Error("Flagship recording not loaded; run lesson:compile first");
const frames = Math.max(
    Math.ceil((r.durationMs * fps) / 1000),
    Math.floor(((r.events.at(-1)?.t ?? 0) * fps) / 1000) + 2,
  ),
  duration = frames / fps,
  hash = createHash("sha256").update(recording).digest("hex");
const signature = JSON.stringify({
  hash,
  fps,
  width: 1920,
  height: 1080,
  crf: 17,
  palette: "teaching-v2",
  pipeline: 4,
});
let previous = "";
try {
  previous = await readFile(`${dir}/signature.json`, "utf8");
} catch {}
if (previous && previous !== signature)
  throw Error(
    "Render cache belongs to a different recording/pipeline. Use a new cache directory or remove the old cache explicitly.",
  );
await writeFile(`${dir}/signature.json`, signature);
const samples: number[] = (r.metadata.chapters as { t: number }[]).flatMap(
  (c, i, all) => {
    const end = all[i + 1]?.t ?? r.durationMs;
    return [
      Math.round(((c.t + 10000) * fps) / 1000),
      Math.round(((end - 1500) * fps) / 1000),
    ];
  },
);
const sampleInfo: {
  frame: number;
  t: number;
  sha256: string;
  nativeDraws: number;
}[] = [];
try {
  const prior = JSON.parse(
    await readFile(
      custom
        ? output.replace(".mp4", ".manifest.json")
        : "output/flagship-export-manifest.json",
      "utf8",
    ),
  );
  if (prior.recordingSha256 === hash) sampleInfo.push(...prior.samples);
} catch {}
const started = Date.now();
let rendered = 0,
  resumed = 0;
async function ffmpegFile(args: string[]) {
  const child = spawn(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", ...args],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let errors = "";
  child.stderr.on("data", (d) => (errors += d));
  const [code] = await once(child, "close");
  if (code !== 0) throw Error(`FFmpeg ${code}: ${errors}`);
}
try {
  const files: string[] = [];
  for (let first = 0; first < frames; first += chunkFrames) {
    const end = Math.min(first + chunkFrames, frames),
      file = `${dir}/${String(first).padStart(6, "0")}.mp4`,
      done = `${file}.json`;
    files.push(file);
    try {
      const meta = JSON.parse(await readFile(done, "utf8"));
      const bytes = await readFile(file);
      if (
        meta.frames === end - first &&
        meta.sha256 === createHash("sha256").update(bytes).digest("hex")
      ) {
        resumed += end - first;
        console.log(`Resume ${first}–${end}/${frames}`);
        continue;
      }
    } catch {}
    const encoder = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "image2pipe",
        "-framerate",
        String(fps),
        "-vcodec",
        "mjpeg",
        "-i",
        "pipe:0",
        "-an",
        "-vf",
        "zscale=primariesin=709:transferin=iec61966-2-1:matrixin=470bg:rangein=full:primaries=709:transfer=709:matrix=709:range=limited,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "17",
        "-pix_fmt",
        "yuv420p",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-colorspace",
        "bt709",
        "-r",
        String(fps),
        "-frames:v",
        String(end - first),
        `${file}.partial.mp4`,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let encodingError = "";
    encoder.stderr.on("data", (d) => (encodingError += d));
    encoder.stdin.on("error", () => {});
    const doneEncoding = once(encoder, "close");
    try {
      for (let i = first; i < end; i++) {
        const t = (i * 1000) / fps,
          jpeg = await page.evaluate((t) => window.studio!.renderFrame(t), t),
          buffer = Buffer.from(jpeg.split(",")[1], "base64");
        if (!encoder.stdin.write(buffer)) await once(encoder.stdin, "drain");
        if (samples.includes(i)) {
          await writeFile(`${inspectionDir}/frame-${i}.jpg`, buffer);
          const native = await page.evaluate(() => {
            const s = window.studio!;
            return s.editor
              .getCurrentPageShapes()
              .filter((s) => s.type === "draw").length;
          });
          if (!sampleInfo.some((s) => s.frame === i))
            sampleInfo.push({
              frame: i,
              t,
              sha256: createHash("sha256").update(buffer).digest("hex"),
              nativeDraws: native,
            });
        }
      }
      encoder.stdin.end();
      const [code] = await doneEncoding;
      if (code !== 0) throw Error(encodingError);
      await rename(`${file}.partial.mp4`, file);
      await writeFile(
        done,
        JSON.stringify({
          first,
          frames: end - first,
          sha256: createHash("sha256")
            .update(await readFile(file))
            .digest("hex"),
        }),
      );
      rendered += end - first;
    } finally {
      encoder.stdin.destroy();
      if (encoder.exitCode === null) encoder.kill();
    }
    console.log(
      `Rendered ${end}/${frames} (${(end / fps).toFixed(1)}s), elapsed ${Math.round((Date.now() - started) / 1000)}s`,
    );
  }
  await writeFile(
    `${dir}/concat.txt`,
    files.map((file) => `file '${resolve(file)}'`).join("\n"),
  );
  await ffmpegFile([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    `${dir}/concat.txt`,
    "-map",
    "0:v:0",
    "-an",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    output.replace(".mp4", ".partial.mp4"),
  ]);
  await rename(output.replace(".mp4", ".partial.mp4"), output);
  if (output.startsWith("output/")) {
    await mkdir(dirname("public/" + output), { recursive: true });
    await copyFile(output, "public/" + output);
  }
  let narrated = false;
  try {
    const manifest = JSON.parse(
      await readFile("output/audio/narration-manifest.json", "utf8"),
    );
    if (!custom && manifest.status === "available") {
      if (Math.abs(manifest.durationMs - r.durationMs) > 1)
        throw Error(
          "Audio timeline differs from recording; recompile the aligned lesson",
        );
      await access("output/audio/calculus_flagship.wav");
      await ffmpegFile([
        "-i",
        output,
        "-i",
        "output/audio/calculus_flagship.wav",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-t",
        String(duration),
        "-movflags",
        "+faststart",
        "output/calculus_flagship_narrated.partial.mp4",
      ]);
      await rename(
        "output/calculus_flagship_narrated.partial.mp4",
        "output/calculus_flagship_narrated.mp4",
      );
      await copyFile(
        "output/calculus_flagship_narrated.mp4",
        "public/output/calculus_flagship_narrated.mp4",
      );
      narrated = true;
    }
  } catch (e) {
    console.error(
      "Silent video complete; narration mux failed or unavailable:",
      String(e),
    );
  }
  await writeFile(
    custom
      ? output.replace(".mp4", ".manifest.json")
      : "output/flagship-export-manifest.json",
    JSON.stringify(
      {
        output,
        narrated,
        width: 1920,
        height: 1080,
        fps,
        frames,
        duration,
        logicalDurationMs: r.durationMs,
        recordingSha256: hash,
        events: r.events.length,
        rendered,
        resumed,
        elapsedSeconds: (Date.now() - started) / 1000,
        samples: sampleInfo,
        browserErrors: session.errors,
        colorConversion:
          "Chromium sRGB/full-range JPEG BT.601 matrix → zscale transfer/matrix conversion → limited-range Rec.709 H.264",
        pipeline:
          "Absolute frame time → native tldraw replay → native SDK SVG → Chromium JPEG raster → resumable H.264 chunks → lossless concat",
      },
      null,
      2,
    ),
  );
  if (session.errors.length)
    throw Error(`Browser errors: ${session.errors.join("; ")}`);
  console.log("Completed:", output, narrated ? "and narrated MP4" : "(silent)");
} finally {
  await session.close();
}
