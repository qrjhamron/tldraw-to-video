import assert from "node:assert/strict";
import { test } from "node:test";
import { b64Vecs } from "@tldraw/tlschema";
import { textLayout, penProgress, mathGlyphs } from "../src/handwriting/engine";
import {
  mathLayout,
  fraction,
  script,
  row,
} from "../src/handwriting/math-layout";
import {
  evaluate,
  derivative,
  integral,
  riemannSum,
  secantSlope,
  optimizeQuadratic,
  ticks,
  transformPoint,
  type FunctionModel,
} from "../src/math/models";
import { project, functionPlot, slopeTriangle } from "../src/math/geometry";
import { frameBounds, screenPoint } from "../src/story/camera";
import { flagshipLesson } from "../src/story/flagship";
import { validateLesson } from "../src/story/types";
import {
  alignNarration,
  narrationSchedule,
  validateClip,
} from "../src/audio/timeline";
const square: FunctionModel = { kind: "polynomial", coefficients: [0, 0, 1] };
test("seeded centerline penmanship is reproducible, restrained and pressure-aware", () => {
  const a = textLayout("Perubahan x^2 ∫ Σ α β π θ √", 0, 0, { seed: 123 });
  const b = textLayout("Perubahan x^2 ∫ Σ α β π θ √", 0, 0, { seed: 123 });
  assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
  assert.notDeepEqual(
    b,
    textLayout("Perubahan x^2 ∫ Σ α β π θ √", 0, 0, { seed: 124 }),
  );
  assert.ok(b.paths.every((p) => p.points.length >= 2));
  assert.ok(
    b.paths.flatMap((p) => p.points).every((p) => p.z >= 0.2 && p.z <= 0.65),
  );
  assert.ok(Object.keys(mathGlyphs).length >= 12);
});
test("b64 stroke encoding preserves coordinates within SDK Float16 delta precision", () => {
  const points = textLayout("x^2 + 2x", 0, 0, { seed: 14 }).paths[0].points,
    encoded = b64Vecs.encodePoints(points),
    decoded = b64Vecs.decodePoints(encoded);
  assert.equal(decoded.length, points.length);
  for (let i = 0; i < points.length; i++) {
    assert.ok(Math.abs(points[i].x - decoded[i].x) < 0.03);
    assert.ok(Math.abs(points[i].y - decoded[i].y) < 0.03);
    assert.ok(Math.abs(points[i].z - (decoded[i].z ?? 0.5)) < 0.002);
  }
  assert.equal(b64Vecs.encodePoints(decoded), encoded);
});
test("math layout makes fractions, scripts, limits, radicals and sums into pen strokes", () => {
  for (const e of [
    fraction("x^2", "2"),
    script("x", "2", "i"),
    { type: "root" as const, body: "x+1" },
    { type: "limit" as const, under: "h → 0", body: fraction("2xh+h^2", "h") },
    { type: "sum" as const, lower: "i=1", upper: "n", body: "x" },
  ]) {
    const l = mathLayout(e, { seed: 5, height: 40 });
    assert.ok(l.paths.length > 0 && l.width > 0 && l.height > 0);
  }
  const l = mathLayout(row("A=", fraction("x^2", "2")), { seed: 1 });
  assert.ok(l.height > 100);
});
test("minimum jerk pen motion has zero entry and exit velocity", () => {
  assert.equal(penProgress(0), 0);
  assert.equal(penProgress(1), 1);
  assert.equal(penProgress(0.5), 0.5);
  assert.ok(penProgress(0.01) < 0.00002);
  assert.ok(1 - penProgress(0.99) < 0.00002);
});
test("analytic calculus and secant limit compute the correct quantities", () => {
  assert.equal(evaluate(square, 3), 9);
  assert.equal(derivative(square, 3), 6);
  assert.equal(secantSlope(square, 1, 2.5), 3.5);
  assert.equal(secantSlope(square, 1, 1), 2);
  assert.ok(Math.abs(integral(square, 0, 2) - 8 / 3) < 1e-12);
  assert.ok(Math.abs(riemannSum(square, 0, 2, 4) - 2.625) < 1e-12);
  assert.ok(Math.abs(riemannSum(square, 0, 2, 1000) - 8 / 3) < 1e-6);
  assert.equal(integral({ kind: "polynomial", coefficients: [0, 2] }, 0, 3), 9);
  assert.equal(
    derivative({ kind: "polynomial", coefficients: [0, 0, 0.5] }, 2),
    2,
  );
});
test("optimization, ticks and affine coordinates derive from models", () => {
  assert.deepEqual(
    optimizeQuadratic({ kind: "polynomial", coefficients: [0, 20, -2] }),
    { x: 5, y: 50, kind: "maximum" },
  );
  assert.deepEqual(ticks(0, 4), [0, 1, 2, 3, 4]);
  assert.deepEqual(transformPoint({ x: 1, y: 2 }, [0, 1, -1, 0, 5, 0]), {
    x: 3,
    y: 1,
  });
});
test("graph and camera bounds keep mathematical coordinates in the safe frame", () => {
  const g = {
    x: 100,
    y: 200,
    width: 600,
    height: 400,
    xMin: 0,
    xMax: 4,
    yMin: 0,
    yMax: 16,
  };
  assert.deepEqual(project(g, 2, 4), [400, 500]);
  assert.ok(functionPlot(g, square).length);
  const triangle = slopeTriangle(g, square, 1);
  assert.ok(triangle.points.length > 5);
  const c = frameBounds({ x: 5000, y: 100, w: 1600, h: 900 });
  for (const p of [
    { x: 5000, y: 100 },
    { x: 6600, y: 1000 },
  ]) {
    const s = screenPoint(c, p);
    assert.ok(s.x >= 63 && s.x <= 1857 && s.y >= 63 && s.y <= 1017);
  }
});
test("flagship content spans eight coherent chapters and a thinking pause", () => {
  const l = validateLesson(flagshipLesson());
  assert.equal(l.duration, 540000);
  assert.equal(l.chapters.length, 8);
  assert.ok(
    l.chapters.every(
      (c) => c.objectives.length && c.actions.some((a) => a.type === "narrate"),
    ),
  );
  assert.ok(
    l.chapters[7].actions.some(
      (a) => a.type === "pause" && "duration" in a && a.duration === 7000,
    ),
  );
  assert.deepEqual(l, flagshipLesson());
});
test("actual narration durations expand visual timing monotonically with aligned segments", () => {
  const lesson = flagshipLesson(),
    n = lesson.chapters[0].actions.find((a) => a.type === "narrate")!;
  const clip = {
    id: n.id,
    provider: "test",
    voice: "test",
    file: "test.wav",
    durationMs: n.duration + 2000,
    sha256: "abc",
    words: [],
  };
  const aligned = alignNarration(lesson, [clip]);
  assert.equal(aligned.duration, lesson.duration + 2400);
  assert.equal(aligned.chapters[1].start, lesson.chapters[1].start + 2400);
  const first = aligned.chapters[0].actions.find((a) => a.id === n.id)!;
  assert.equal(first.duration, clip.durationMs + 400);
  assert.throws(() => narrationSchedule(aligned, []), /Missing audio/);
  assert.throws(
    () =>
      validateClip({
        ...clip,
        words: [
          { offsetMs: clip.durationMs + 500, durationMs: 100, text: "bad" },
        ],
      }),
    /outside/,
  );
});
test("predictive director frames off-canvas writing before the pen begins", async () => {
  const { directLesson } = await import("../src/story/director");
  const l = flagshipLesson();
  l.chapters[0].actions.push({
    id: "remote-writing",
    type: "write",
    at: 60000,
    duration: 2000,
    content: "x = 4",
    x: 6000,
    y: 200,
  });
  const directed = directLesson(l),
    camera = directed.chapters[0].actions.find(
      (a) => a.id === "auto-camera-remote-writing",
    );
  assert.ok(camera && camera.at + camera.duration === 60000);
});
test("zero-frequency sine reduces to its constant offset for integration", () => {
  const f: FunctionModel = {
    kind: "sine",
    amplitude: 3,
    frequency: 0,
    offset: 2,
  };
  assert.equal(evaluate(f, 4), 2);
  assert.equal(derivative(f, 4), 0);
  assert.equal(integral(f, 1, 4), 6);
});
test("simulated car displacement agrees with its position-time function", async () => {
  const { motionFraction } = await import("../src/story/motion");
  const model = { fn: square, from: 0, to: 4 };
  assert.equal(motionFraction(0, model), 0);
  assert.equal(motionFraction(0.5, model), 0.25);
  assert.equal(motionFraction(1, model), 1);
  assert.throws(
    () =>
      motionFraction(0.5, {
        fn: { kind: "polynomial", coefficients: [2] },
        from: 0,
        to: 4,
      }),
    /displacement/,
  );
});
test("invalid semantic chapters, graph ranges and models fail before native compilation", async () => {
  const { validateLesson } = await import("../src/story/types");
  const { ticks } = await import("../src/math/models");
  let r = flagshipLesson();
  r.chapters[0].start = NaN;
  assert.throws(() => validateLesson(r), /timing/);
  r = flagshipLesson();
  const a = r.chapters.flatMap((c) => c.actions).find((a) => "graph" in a)!;
  if ("graph" in a) a.graph.xMax = a.graph.xMin;
  assert.throws(() => validateLesson(r), /graph/);
  assert.throws(() => ticks(1, 1), /range/);
});
test("narration adapters reject nonfinite and negative provider word timestamps", async () => {
  const { validateClip } = await import("../src/audio/timeline");
  const clip = {
    id: "a",
    provider: "fixture",
    voice: "id",
    file: "a.wav",
    durationMs: 1000,
    sha256: "fixture",
    words: [{ offsetMs: NaN, durationMs: 100, text: "a" }],
  };
  assert.throws(() => validateClip(clip), /timestamps/);
  clip.words[0].offsetMs = -1;
  assert.throws(() => validateClip(clip), /timestamps/);
});
