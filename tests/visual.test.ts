import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveHandwritingStyle,
  tldrawFontProp,
} from "../src/handwriting/styles";
import {
  fontRevealSteps,
  estimateFontWidth,
} from "../src/handwriting/font-mode";
import {
  assertWorkspaceSafeAssetPath,
  sanitizeSvg,
} from "../src/assets/registry";
import { assetCatalog } from "../src/assets/catalog";
import { readFile } from "node:fs/promises";
import { assertCanvasThemeId, themeAt } from "../src/story/canvas-themes";
import {
  addImage,
  addPortrait,
  animateImage,
  annotateImage,
  setHandwritingStyle,
  setCanvasStyle,
  createVisualComparison,
} from "../src/mcp/tools";
import type { Lesson } from "../src/story/types";

function blankLesson(): Lesson {
  return {
    format: "stroke-lesson",
    version: 1,
    id: "test-lesson",
    title: "Uji",
    language: "id",
    seed: 7,
    duration: 60000,
    chapters: [
      {
        id: "ch1",
        title: "Bab 1",
        start: 0,
        duration: 60000,
        origin: { x: 0, y: 0 },
        objectives: ["uji"],
        actions: [],
      },
    ],
  };
}

test("handwriting styles resolve honestly and fail closed", () => {
  assert.equal(resolveHandwritingStyle({}).mode, "stroke");
  assert.equal(
    resolveHandwritingStyle({ role: "annotation" }).fontFamily,
    "Caveat",
  );
  assert.equal(resolveHandwritingStyle({ role: "math" }).mode, "stroke");
  assert.equal(
    resolveHandwritingStyle({ fontFamily: "Kalam" }).mode,
    "font",
  );
  assert.throws(
    () => resolveHandwritingStyle({ role: "bogus" as never }),
    /Unsupported handwriting role/,
  );
  assert.throws(
    () => resolveHandwritingStyle({ fontFamily: "Comic Sans" as never }),
    /Unsupported handwriting font/,
  );
  assert.throws(
    () =>
      resolveHandwritingStyle({ fontFamily: "stroke", mode: "font" }),
    /requires stroke mode/,
  );
  assert.equal(tldrawFontProp("Patrick Hand"), "draw");
  assert.equal(tldrawFontProp("Kalam"), "sans");
  assert.equal(tldrawFontProp("Caveat"), "serif");
});

test("font-mode reveal is deterministic, ordered, and bounded", () => {
  const a = fontRevealSteps("Turunan.", 3000, 42);
  const b = fontRevealSteps("Turunan.", 3000, 42);
  assert.deepEqual(a, b);
  assert.equal(a.length, 8);
  assert.ok(a.every((s, i) => s.chars === i + 1));
  assert.ok(a.every((s) => s.t > 0 && s.t <= 3000));
  assert.ok(a.every((s, i) => i === 0 || s.t >= a[i - 1].t));
  assert.equal(a.at(-1)!.t, 3000);
  assert.ok(estimateFontWidth("abc", 36) > 0);
  assert.throws(() => fontRevealSteps("x", 0, 1), /Invalid font reveal/);
});

test("asset paths are workspace-safe and SVGs are sanitized", () => {
  assert.equal(assertWorkspaceSafeAssetPath("assets/a.png"), "image/png");
  assert.equal(assertWorkspaceSafeAssetPath("assets/a.svg"), "image/svg+xml");
  for (const bad of [
    "https://example.com/a.png",
    "/etc/passwd",
    "../secrets.png",
    "assets/../x.png",
    "other/a.png",
    "assets/a.exe",
    "assets/a",
    "data:image/png;base64,xx",
  ])
    assert.throws(() => assertWorkspaceSafeAssetPath(bad), Error, bad);
  const clean = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="2" r="3"/></svg>',
  );
  assert.ok(clean.includes("<circle"));
  // Script tags are stripped, not passed through.
  const noScript = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle cx="1" cy="1" r="1"/></svg>',
  );
  assert.ok(!noScript.includes("script"));
  // Event handlers removed.
  const stripped = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><g onclick="evil()"><circle cx="1" cy="1" r="1"/></g></svg>',
  );
  assert.ok(!stripped.includes("onclick"));
  assert.throws(
    () =>
      sanitizeSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>',
      ),
    /blocked/,
  );
});

test("bundled asset catalog matches the on-disk manifest", async () => {
  const manifest = JSON.parse(await readFile("assets/manifest.json", "utf8"));
  assert.equal(manifest.version, 1);
  assert.equal(assetCatalog.length, manifest.assets.length);
  for (const record of assetCatalog) {
    const disk = manifest.assets.find((a: { id: string }) => a.id === record.id);
    assert.ok(disk, record.id);
    assert.deepEqual(record, disk);
    assert.ok(!record.license.toLowerCase().includes("unknown"));
  }
});

test("canvas themes resolve and evaluate over time", () => {
  assert.equal(assertCanvasThemeId("graph"), "graph");
  assert.throws(() => assertCanvasThemeId("rainbow"), /Unsupported canvas/);
  const base = {
    format: "tldraw-stroke-recording",
    version: 1,
    sdkVersion: "5.5.2",
    durationMs: 10000,
    viewport: { width: 1920, height: 1080 },
    initial: {},
    initialCamera: { x: 0, y: 0, z: 1 },
    events: [],
    metadata: { title: "t", language: "id", origin: "generated" },
  } as unknown as import("../src/engine/schema").Recording;
  assert.equal(themeAt(base, 0).id, "whiteboard");
  const themed = structuredClone(base);
  themed.metadata.canvasTheme = "graph";
  assert.equal(themeAt(themed, 0).id, "graph");
  themed.events.push({
    seq: 0,
    t: 5000,
    kind: "theme",
    id: "theme:notebook",
    theme: "notebook",
    origin: "generated",
    source: "user",
    tool: "draw",
  });
  assert.equal(themeAt(themed, 4999).id, "graph");
  assert.equal(themeAt(themed, 5000).id, "notebook");
});

test("MCP lesson tools validate and stay reproducible", () => {
  const lesson = blankLesson();
  const { lesson: l2, actionId } = addImage(lesson, {
    assetId: "newton-portrait",
    x: 80,
    y: 160,
    w: 260,
    h: 365,
    at: 1000,
    duration: 1200,
  });
  assert.ok(actionId.startsWith("img-"));
  assert.equal(l2.chapters[0].actions.length, 1);
  // Original untouched.
  assert.equal(lesson.chapters[0].actions.length, 0);
  assert.throws(
    () =>
      addImage(lesson, {
        assetId: "nope",
        x: 0,
        y: 0,
        w: 10,
        h: 10,
      }),
    /Unknown asset/,
  );
  const { lesson: l3 } = addPortrait(lesson, {
    who: "leibniz",
    x: 400,
    y: 160,
  });
  assert.equal(l3.chapters[0].actions.length, 2);
  const { lesson: l4 } = animateImage(l2, {
    target: actionId,
    effect: "zoom",
    at: 3000,
    duration: 2000,
    scale: 1.2,
  });
  assert.equal(l4.chapters[0].actions.length, 2);
  assert.throws(
    () =>
      animateImage(lesson, {
        target: "missing",
        effect: "fade",
        at: 0,
        duration: 500,
      }),
    /not found/,
  );
  const { lesson: l5 } = annotateImage(lesson, {
    content: "Gerak dan fluksi",
    x: 80,
    y: 560,
    at: 2000,
    duration: 2500,
    font: "Caveat",
  });
  assert.equal(l5.chapters[0].actions[0].type, "annotateImage");
  const { lesson: l6, label } = setHandwritingStyle(lesson, {
    font: "Kalam",
  });
  assert.ok(label.includes("Kalam"));
  assert.equal(l6.handwriting?.font, "Kalam");
  const { lesson: l7 } = setCanvasStyle(lesson, { theme: "graph" });
  assert.equal(l7.canvasTheme, "graph");
  assert.throws(
    () => setCanvasStyle(lesson, { theme: "rainbow" }),
    /Unsupported canvas/,
  );
  const { lesson: cmp } = createVisualComparison({ seed: 9 });
  assert.equal(cmp.chapters[0].actions.length, 8);
  const { lesson: cmp2 } = createVisualComparison({ seed: 9 });
  assert.deepEqual(cmp, cmp2);
});
