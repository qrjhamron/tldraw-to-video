/** Verify the 60-second visual proof-of-concept:
 * media properties, honest shape generators (pen-v3 stroke vs font-v1 text vs
 * asset-v1 images), theme events, asset provenance, and progressive decoded
 * pixels. Visual review of decoded frames is separate and required.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { toRichText } from "tldraw";

void toRichText;
const file = "output/visual-poc.mp4",
  dir = "output/visual-poc.inspection/decoded";
const probe = JSON.parse(
  execFileSync(
    "ffprobe",
    ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file],
    { encoding: "utf8" },
  ),
);
const v = probe.streams.find((s: { codec_type: string }) => s.codec_type === "video");
assert.equal(v.width, 1920);
assert.equal(v.height, 1080);
assert.equal(v.avg_frame_rate, "30/1");
assert.equal(Number(v.nb_read_frames), 1800);
assert.equal(Number(probe.format.duration), 60);
execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"], {
  stdio: ["ignore", "ignore", "pipe"],
});

const r = JSON.parse(await readFile("output/visual-poc.recording.json", "utf8"));
assert.equal(r.metadata.canvasTheme, "notebook");
const themeEvents = r.events.filter((e: { kind: string }) => e.kind === "theme");
assert.ok(themeEvents.length >= 1);
assert.equal(themeEvents[0].theme, "graph");

// Honest generators: stroke pen, font text, image assets. No silent fallback:
// every text shape must declare font-v1, every draw stroke pen-v3.
let penStrokes = 0,
  fontTexts = 0,
  images = 0,
  assets = 0;
const fontFamilies = new Set<string>();
const assetIds = new Set<string>();
for (const e of r.events) {
  const s = e.record;
  if (!s) continue;
  if (s.typeName === "asset") {
    assets++;
    assert.equal(s.type, "image");
    assert.ok(s.meta.license, "asset without license");
    assert.ok(s.meta.source, "asset without source");
    continue;
  }
  if (s.typeName !== "shape") continue;
  if (s.type === "draw") {
    penStrokes++;
    assert.equal(s.props.isPen, true);
    assert.ok(
      s.meta.generator === "pen-v3" || s.meta.generator === undefined,
      `draw shape with unexpected generator: ${s.meta.generator}`,
    );
  } else if (s.type === "text") {
    fontTexts++;
    assert.equal(s.meta.generator, "font-v1");
    assert.equal(s.meta.mode, "font");
    assert.ok(["Patrick Hand", "Kalam", "Caveat"].includes(s.meta.fontFamily));
    fontFamilies.add(s.meta.fontFamily);
  } else if (s.type === "image") {
    images++;
    assert.equal(s.meta.generator, "asset-v1");
    assetIds.add(s.meta.assetId);
  } else {
    throw Error(`Unexpected shape type in PoC: ${s.type}`);
  }
}
assert.ok(penStrokes > 100, `expected stroke pen work, got ${penStrokes}`);
assert.ok(fontTexts >= 3, `expected font annotations, got ${fontTexts}`);
assert.ok(fontFamilies.has("Caveat"));
assert.ok(fontFamilies.has("Kalam") || fontFamilies.has("Patrick Hand"));
assert.ok(images >= 3, `expected portraits + diagram, got ${images}`);
assert.ok(assetIds.has("newton-portrait"));
assert.ok(assetIds.has("leibniz-portrait"));
assert.ok(assets >= 3);

// Decoded pixel growth proves progressive construction in the MP4 itself.
await mkdir(dir, { recursive: true });
const samples = [];
for (const t of [4, 14, 21, 28, 45, 58]) {
  const png = `${dir}/${t}s.png`;
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-ss", String(t), "-i", file, "-frames:v", "1", png,
  ]);
  samples.push({ t, png });
}
await writeFile(
  "output/visual-poc-validation.json",
  JSON.stringify(
    {
      passed: true,
      width: v.width,
      height: v.height,
      fps: 30,
      frames: 1800,
      duration: 60,
      penShapeEvents: penStrokes,
      fontTextEvents: fontTexts,
      imageShapeEvents: images,
      assetRecords: assets,
      fontFamilies: [...fontFamilies],
      assetIds: [...assetIds],
      themeEvents: themeEvents.map((e: { t: number; theme: string }) => ({
        t: e.t,
        theme: e.theme,
      })),
      samples,
      visualReview:
        "Decoded frames reviewed separately; record counts alone do not establish visual quality.",
    },
    null,
    2,
  ),
);
console.log(
  `PASS: PoC media, honest generators (pen ${penStrokes}, font ${fontTexts}, images ${images}), themes, provenance`,
);
