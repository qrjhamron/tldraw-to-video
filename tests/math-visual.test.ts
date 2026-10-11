import assert from "node:assert/strict";
import { test } from "node:test";
import { mathLayout, paint, row } from "../src/handwriting/math-layout";
import {
  evaluate,
  derivative,
  integral,
  validateFunction,
  quadraticRoots,
  intersectLines,
  bisectRoot,
  optimizeQuadratic,
} from "../src/math/models";
import {
  rect,
  ellipse,
  areaModel,
  fractionBar,
  triangle,
  rightTriangle,
  projection,
  functionPlot,
} from "../src/math/geometry";
import { validateDiagram, validateLesson } from "../src/story/types";
import type { Lesson } from "../src/story/types";

test("per-node colors override inherited ink in layout", () => {
  const red = mathLayout(paint("x", "red"), { seed: 1, height: 40 });
  assert.ok(red.paths.length > 0);
  assert.ok(red.paths.every((p) => p.color === "red"));
  const mixed = mathLayout(row(paint("a", "blue"), "b"), {
    seed: 1,
    height: 40,
    color: "black",
  });
  const colors = new Set(mixed.paths.map((p) => p.color));
  assert.ok(colors.has("blue") && colors.has("black"));
  // Unpainted subtrees keep the inherited color.
  const plain = mathLayout(row("a", "b"), { seed: 1, height: 40, color: "green" });
  assert.ok(plain.paths.every((p) => p.color === "green"));
});

test("exp/log models evaluate, differentiate, integrate", () => {
  const e = { kind: "exp", base: 2 } as const;
  assert.equal(evaluate(e, 3), 8);
  assert.ok(Math.abs(derivative(e, 1) - 2 * Math.LN2) < 1e-12);
  assert.ok(Math.abs(integral(e, 0, 1) - 1 / Math.LN2) < 1e-12);
  const l = { kind: "log", base: 10 } as const;
  assert.equal(evaluate(l, 100), 2);
  assert.ok(Number.isNaN(evaluate(l, -1)));
  assert.ok(Number.isNaN(derivative(l, 0)));
  assert.throws(() => validateFunction({ kind: "log", base: 1 }), /base/);
  assert.throws(() => validateFunction({ kind: "exp", base: -2 }), /base/);
  // Log plots skip non-positive x without connecting across the gap.
  const g = { x: 0, y: 0, width: 400, height: 300, xMin: -2, xMax: 4, yMin: -3, yMax: 3 };
  const paths = functionPlot(g, l, "blue");
  assert.ok(paths.length >= 1);
  assert.ok(paths.every((p) => p.points.length > 1));
});

test("numeric helpers solve quadratics, intersections, roots", () => {
  assert.deepEqual(quadraticRoots(1, -3, 2), [1, 2]);
  assert.deepEqual(quadraticRoots(1, 2, 1), [-1]);
  assert.deepEqual(quadraticRoots(1, 0, 1), []);
  assert.deepEqual(intersectLines(1, 0, -1, 4), { x: 2, y: 2 });
  assert.equal(intersectLines(1, 0, 1, 2), null);
  const r = bisectRoot({ kind: "polynomial", coefficients: [-2, 0, 1] }, 0, 2);
  assert.ok(Math.abs(r - Math.SQRT2) < 1e-6);
  assert.throws(
    () => bisectRoot({ kind: "polynomial", coefficients: [1, 0, 1] }, 0, 2),
    /sign change/,
  );
  const opt = optimizeQuadratic({ kind: "polynomial", coefficients: [0, 0, 1] });
  assert.equal(opt.x + 0, 0);
});

test("geometry helpers build valid stroke paths", () => {
  assert.equal(rect(0, 0, 100, 50).length, 1);
  assert.ok(ellipse(0, 0, 10, 5)[0].points.length > 60);
  assert.equal(areaModel(0, 0, 100, 100, 2, 3).length, 1 + 1 + 2);
  assert.ok(fractionBar(0, 0, 100, 20, 3, 4).length > 4);
  assert.equal(triangle([0, 0], [10, 0], [0, 10]).length, 1);
  assert.equal(rightTriangle(0, 100, 60, 40).length, 2);
  assert.equal(projection(0, 0, 3, 4, 1, 0).length, 2);
  assert.throws(() => rect(0, 0, -1, 5), /positive/);
  assert.throws(() => fractionBar(0, 0, 10, 10, 5, 4), /filled/);
});

test("diagram and animateCurve actions validate strictly", () => {
  const base: Lesson = {
    format: "stroke-lesson",
    version: 1,
    id: "t",
    title: "t",
    language: "id",
    seed: 1,
    duration: 60000,
    chapters: [
      { id: "c", title: "c", start: 0, duration: 60000, origin: { x: 0, y: 0 }, objectives: [], actions: [] },
    ],
  };
  const good = structuredClone(base);
  good.chapters[0].actions.push(
    { id: "d1", type: "diagram", at: 0, duration: 1000, diagram: { kind: "circle", cx: 1, cy: 2, r: 3 } },
    {
      id: "d2", type: "animateCurve", at: 1000, duration: 2000,
      graph: { x: 0, y: 0, width: 400, height: 300, xMin: 0, xMax: 3, yMin: 0, yMax: 9 },
      from: { kind: "polynomial", coefficients: [0, 0, 1] },
      to: { kind: "polynomial", coefficients: [0, 0, 2] },
      pointX: 2,
    },
  );
  validateLesson(good);
  const badKind = structuredClone(base);
  badKind.chapters[0].actions.push(
    { id: "d1", type: "diagram", at: 0, duration: 1000, diagram: { kind: "circle", cx: 1, cy: 2, r: -3 } } as never,
  );
  assert.throws(() => validateLesson(badKind), /circle/);
  const badMorph = structuredClone(base);
  badMorph.chapters[0].actions.push({
    id: "d1", type: "animateCurve", at: 0, duration: 2000,
    graph: { x: 0, y: 0, width: 400, height: 300, xMin: 0, xMax: 3, yMin: 0, yMax: 9 },
    from: { kind: "polynomial", coefficients: [0, 1] },
    to: { kind: "sine", amplitude: 1, frequency: 1 },
  });
  assert.throws(() => validateLesson(badMorph), /matching model kinds/);
  assert.throws(() => validateDiagram({ kind: "nope" } as never), /diagram/);
});
