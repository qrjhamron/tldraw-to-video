import assert from "node:assert/strict";
import { test } from "node:test";
import { handwritingGlyphs, mathGlyphs } from "../src/handwriting/glyphs";
import {
  sampleGlyph,
  textLayout,
  strokeProgress,
} from "../src/handwriting/engine";
import {
  mathLayout,
  row,
  fraction,
  script,
} from "../src/handwriting/math-layout";
import { prefix, length, lettering } from "../src/lesson/paths";
test("every authored glyph samples into finite ordered pen centerlines", () => {
  for (const [ch, glyph] of Object.entries({
    ...handwritingGlyphs,
    ...mathGlyphs,
  })) {
    const strokes = sampleGlyph(glyph.d);
    assert.equal(strokes.length, (glyph.d.match(/M/g) ?? []).length, ch);
    assert.ok(
      strokes.every(
        (s) =>
          s.length >= 2 &&
          s.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      ),
      ch,
    );
    assert.ok(glyph.advance > 0);
  }
  // Construction, rather than outlining: a bowl then stem; i stem then dot;
  // e is one open continuous stroke with its crossbar incorporated.
  assert.equal(sampleGlyph(handwritingGlyphs.a.d).length, 2);
  assert.equal(sampleGlyph(handwritingGlyphs.i.d).length, 2);
  assert.equal(sampleGlyph(handwritingGlyphs.e.d).length, 1);
  const e = sampleGlyph(handwritingGlyphs.e.d)[0];
  assert.notDeepEqual(e[0], e.at(-1));
  assert.ok(handwritingGlyphs.o.d.includes("C"));
});
test("all production lettering routes through the authored library and fails closed", () => {
  assert.deepEqual(
    lettering("Perubahan sesaat.", 4, 5, 32),
    textLayout("Perubahan sesaat.", 4, 5, {
      seed: 1,
      height: 32,
      color: "black",
      style: "explanation",
    }).paths,
  );
  assert.throws(
    () => textLayout("Tidak tersedia 🦄", 0, 0, { seed: 1 }),
    /Unsupported stroke glyph/,
  );
  assert.throws(() => lettering("🦄", 0, 0), /Unsupported stroke glyph/);
  assert.throws(() => mathLayout("x^", { seed: 1 }), /Empty superscript/);
});
test("pen styles and within-word variations remain distinct, bounded and reproducible", () => {
  const all = ["heading", "explanation", "math"].map((style) =>
    textLayout("aaaa", 0, 0, { seed: 57, height: 40, style: style as "math" }),
  );
  assert.notDeepEqual(all[0].paths, all[1].paths);
  assert.notDeepEqual(all[1].paths, all[2].paths);
  const a = all[1];
  assert.ok(a.paths.every((p) => p.pen?.liftMs! >= 25 && p.pen?.liftMs! <= 80));
  const stems = a.paths.filter((p) => p.pen?.stroke === 1);
  assert.equal(stems.length, 4);
  assert.ok(new Set(stems.map((p) => p.points.at(-1)!.y.toFixed(3))).size > 1);
  const flat = textLayout("aaaa", 0, 0, {
    seed: 57,
    height: 40,
    style: "explanation",
    variation: 0,
  });
  assert.ok(Math.abs(a.width - flat.width) < flat.width * 0.06);
  assert.deepEqual(
    a,
    textLayout("aaaa", 0, 0, { seed: 57, height: 40, style: "explanation" }),
  );
});
test("curve-aware absolute-time reveal preserves ordered prefixes and exact endpoints", () => {
  const points = textLayout("e", 0, 0, { seed: 4, height: 40 }).paths[0].points;
  let prev = 0;
  for (let i = 0; i <= 100; i++) {
    const f = strokeProgress(points, i / 100);
    assert.ok(f >= prev && f <= 1);
    prev = f;
    const revealed = prefix(points, f);
    assert.ok(length(revealed) <= length(points) + 1e-6);
    assert.deepEqual(
      revealed.slice(0, -1),
      points.slice(0, revealed.length - 1),
    );
  }
  assert.equal(strokeProgress(points, 0), 0);
  assert.equal(strokeProgress(points, 1), 1);
  assert.deepEqual(prefix(points, strokeProgress(points, 1)), points);
  assert.ok(strokeProgress(points, 0.01) < 0.0001);
});
test("equation rows share baselines and nested structures reserve script extents", () => {
  const style = { seed: 1, height: 40 };
  const a = mathLayout("A=", style),
    b = mathLayout(fraction("x", "2"), { ...style, seed: 198 });
  const whole = mathLayout(row("A=", fraction("x", "2")), style);
  assert.equal(whole.baseline, b.baseline);
  const dy = whole.paths[0].points[0].y - a.paths[0].points[0].y;
  assert.ok(Math.abs(dy - (b.baseline! - a.baseline!)) < 1e-8);
  const nested = mathLayout(
    fraction(script("x", "2", "i"), {
      type: "integral",
      lower: "0",
      upper: "1",
      body: "αx",
    }),
    style,
  );
  assert.ok(nested.height > 140);
  const pts = nested.paths.flatMap((p) => p.points);
  assert.ok(Math.min(...pts.map((p) => p.y)) >= -2);
  assert.ok(Math.max(...pts.map((p) => p.y)) < nested.height);
});
