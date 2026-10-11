import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { b64Vecs } from "@tldraw/tlschema";
import { applyRecordEvent } from "../src/engine/state";
const file = "output/handwriting-comparison.mp4",
  dir = "output/handwriting-comparison.inspection/decoded";
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
);
const v = probe.streams.find((s: any) => s.codec_type === "video");
assert.equal(v.width, 1920);
assert.equal(v.height, 1080);
assert.equal(v.avg_frame_rate, "30/1");
assert.equal(Number(v.nb_read_frames), 900);
assert.equal(Number(probe.format.duration), 30);
execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"], {
  stdio: ["ignore", "ignore", "pipe"],
});
const r = JSON.parse(
  await readFile("output/handwriting-comparison.recording.json", "utf8"),
);
const sequences = new Map<string, any[]>();
for (const e of r.events) {
  const s = e.record;
  if (s?.typeName !== "shape") continue;
  assert.equal(s.type, "draw");
  assert.equal(s.props.isPen, true);
  assert.equal(s.props.fill, "none");
  if (s.meta.pen) {
    assert.equal(s.meta.generator, "pen-v3");
    sequences.set(s.id, [...(sequences.get(s.id) ?? []), s]);
  }
}
let progressivelyConstructed = 0;
const styles = new Set<string>();
for (const seq of sequences.values()) {
  const full = b64Vecs.decodePoints(seq.at(-1).props.segments[0].path);
  styles.add(seq[0].meta.pen.style);
  let last = 0;
  for (const s of seq) {
    const points = b64Vecs.decodePoints(s.props.segments[0].path);
    assert.ok(points.length >= last);
    last = points.length;
    for (let i = 0; i < points.length - 1; i++) {
      assert.ok(Math.abs(points[i].x - full[i].x) < 0.04);
      assert.ok(Math.abs(points[i].y - full[i].y) < 0.04);
    }
  }
  if (seq.length > 2 && full.length > 2) progressivelyConstructed++;
  assert.equal(seq.at(-1).props.isComplete, true);
}
assert.ok(progressivelyConstructed > 50);
assert.deepEqual([...styles].sort(), ["explanation", "heading", "math"]);
await mkdir(dir, { recursive: true });
const samples = [];
for (const t of [1.05, 1.15, 1.3, 10.5, 15, 20.5, 29.5]) {
  const png = `${dir}/${t}s.png`;
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-ss",
    String(t),
    "-i",
    file,
    "-frames:v",
    "1",
    png,
  ]);
  const pixels = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    png,
    "-vf",
    "crop=800:160:980:190",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  let inkPixels = 0;
  for (let p = 0; p < pixels.length; p += 3)
    if (pixels[p] + pixels[p + 1] + pixels[p + 2] < 600) inkPixels++;
  const records = new Map<string, any>(
    Object.values(r.initial.document.store).map((s: any) => [s.id, s]),
  );
  for (const e of r.events) {
    if (e.t > t * 1000 + 1e-7) break;
    applyRecordEvent(records, e);
  }
  const shapes = [...records.values()].filter(
    (s) => s.typeName === "shape" && s.meta.action?.startsWith("after-"),
  );
  const points = shapes.reduce(
    (n, s) => n + b64Vecs.decodePoints(s.props.segments[0].path).length,
    0,
  );
  samples.push({ t, inkPixels, points, nativeDraws: shapes.length });
}
assert.ok(samples[1].points > samples[0].points);
assert.ok(samples[2].points > samples[1].points);
assert.ok(samples[1].inkPixels > samples[0].inkPixels);
assert.ok(samples[2].inkPixels > samples[1].inkPixels);
await writeFile(
  "output/handwriting-validation.json",
  JSON.stringify(
    {
      passed: true,
      width: v.width,
      height: v.height,
      fps: 30,
      frames: 900,
      duration: 30,
      progressivelyConstructed,
      styles: [...styles],
      samples,
      visualReview:
        "Decoded frames reviewed separately; native records and pixel growth alone do not establish visual handwriting quality.",
    },
    null,
    2,
  ),
);
console.log(
  "PASS: comparison media, native ordered prefixes, pressure styles, progressive decoded pixels",
);
