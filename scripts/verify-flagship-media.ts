import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import assert from "node:assert/strict";
import { b64Vecs } from "tldraw";
import { applyRecordEvent } from "../src/engine/state";
const manifest = JSON.parse(
    await readFile("output/flagship-export-manifest.json", "utf8"),
  ),
  results: unknown[] = [];
await mkdir("output/flagship-inspection/decoded", { recursive: true });
for (const [file, audio] of [
  ["output/calculus_flagship_silent.mp4", false],
  ["output/calculus_flagship_narrated.mp4", true],
] as const) {
  if (audio && !manifest.narrated) continue;
  await access(file);
  const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-count_frames",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          file,
        ],
        { encoding: "utf8" },
      ),
    ),
    video = probe.streams.find(
      (s: { codec_type: string }) => s.codec_type === "video",
    );
  assert.equal(video.codec_name, "h264");
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.equal(video.avg_frame_rate, "30/1");
  assert.equal(Number(video.nb_read_frames), manifest.frames);
  assert.equal(video.pix_fmt, "yuv420p");
  for (const field of ["color_space", "color_transfer", "color_primaries"])
    assert.equal(video[field], "bt709");
  assert.ok(Math.abs(Number(video.duration) - manifest.duration) < 0.002);
  assert.equal(
    probe.streams.some((s: { codec_type: string }) => s.codec_type === "audio"),
    audio,
  );
  if (audio) {
    const stream = probe.streams.find(
      (s: { codec_type: string }) => s.codec_type === "audio",
    );
    assert.equal(stream.codec_name, "aac");
    assert.ok(
      Math.abs(Number(stream.duration) - Number(video.duration)) < 0.04,
    );
  }
  execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const timestamps = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "frame=best_effort_timestamp_time",
      "-of",
      "csv=p=0",
      file,
    ],
    { encoding: "utf8", maxBuffer: 8e6 },
  )
    .trim()
    .split("\n")
    .filter((l) => /^\d/.test(l))
    .map((l) => Number(l.split(",")[0]));
  assert.equal(timestamps.length, manifest.frames);
  for (let i = 0; i < timestamps.length; i++)
    assert.ok(Math.abs(timestamps[i] - i / 30) < 0.00001);
  results.push({
    file,
    passed: true,
    codec: video.codec_name,
    width: video.width,
    height: video.height,
    frames: video.nb_read_frames,
    fps: video.avg_frame_rate,
    duration: video.duration,
    audio,
    uniquePTS: timestamps.length,
  });
}
const r = JSON.parse(await readFile("public/flagship.recording.json", "utf8")),
  times = [
    3,
    3 + 1 / 30,
    3 + 2 / 30,
    3 + 3 / 30,
    ...r.metadata.chapters.flatMap(
      (c: { t: number }, i: number, all: { t: number }[]) => [
        (c.t + 12000) / 1000,
        ((all[i + 1]?.t ?? r.durationMs) - 1500) / 1000,
      ],
    ),
  ];
for (const [i, t] of times.entries())
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-ss",
    String(t),
    "-i",
    "output/calculus_flagship_silent.mp4",
    "-frames:v",
    "1",
    `output/flagship-inspection/decoded/${String(i).padStart(2, "0")}-${t.toFixed(3)}s.png`,
  ]);
const progressive = [];
for (let i = 0; i < 4; i++) {
  const t = times[i],
    records = new Map(
      Object.values(r.initial.document.store).map((v: any) => [v.id, v]),
    );
  for (const e of r.events) {
    if (e.t > t * 1000 + 1e-7) break;
    applyRecordEvent(records, e);
  }
  const shapes = [...records.values()].filter(
    (v: any) => v.typeName === "shape" && v.type === "draw",
  ) as any[];
  const points = shapes.reduce(
    (n, v) =>
      n +
      v.props.segments.reduce(
        (a: number, s: any) => a + b64Vecs.decodePoints(s.path, s.dim).length,
        0,
      ),
    0,
  );
  const file = `output/flagship-inspection/decoded/${String(i).padStart(2, "0")}-${t.toFixed(3)}s.png`;
  const pixels = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { maxBuffer: 8e6 },
  );
  let inkPixels = 0;
  for (let p = 0; p < pixels.length; p += 3)
    if (pixels[p] + pixels[p + 1] + pixels[p + 2] < 600) inkPixels++;
  progressive.push({ t, points, nativeShapes: shapes.length, inkPixels });
}
assert.ok(progressive[1].points > progressive[0].points);
assert.ok(progressive[1].inkPixels > progressive[0].inkPixels);
assert.ok(progressive[3].nativeShapes > progressive[0].nativeShapes);
assert.ok(progressive[3].inkPixels > progressive[1].inkPixels);
await writeFile(
  "output/flagship-media-validation.json",
  JSON.stringify(
    {
      results,
      progressiveNativeInk: progressive,
      decodedInspectionTimes: times,
      frameSchedule:
        "All frame PTS equal frame index / 30; no missing logical frames.",
    },
    null,
    2,
  ),
);
console.log(
  "Validated silent/narrated media and extracted representative decoded frames",
);
