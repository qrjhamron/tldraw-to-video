import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMathExpression,
  transformMathExpression,
  validateMathSteps,
  expressionMathExpr,
} from "../src/mcp/math-tools";
import {
  animateMathGraph,
  animateGeometry,
  setSemanticColors,
  planLessonScenes,
  directSceneTool,
  autoLayoutScene,
  validateSceneLayout,
  reframeCamera,
  inspectTimeline,
  runVisualQa,
} from "../src/mcp/director-tools";
import { validateLesson, type Lesson } from "../src/story/types";

function lesson(): Lesson {
  return validateLesson({
    format: "stroke-lesson",
    version: 1,
    id: "t",
    title: "Uji",
    language: "id",
    seed: 3,
    duration: 30000,
    canvasTheme: "whiteboard",
    chapters: [
      {
        id: "c1",
        title: "Bab",
        objectives: ["uji"],
        start: 0,
        duration: 30000,
        origin: { x: 0, y: 0 },
        actions: [
          { id: "w1", type: "write", content: "x + 2 = 5", x: 100, y: 100, height: 64, at: 0, duration: 2000 },
          { id: "n1", type: "narrate", text: "Perhatikan persamaan ini.", at: 0, duration: 1500 },
        ],
      },
    ],
  });
}

const graph = { x: 100, y: 300, width: 700, height: 500, xMin: -5, xMax: 5, yMin: -5, yMax: 5 };

test("create_math_expression parses with stable variables", () => {
  const r = createMathExpression({ source: "x^2 + 2*x + 1 = 0" });
  assert.deepEqual([...r.variables].sort(), ["x"]);
  assert.match(r.text, /x/);
});

test("transform_math_expression expands and verifies equivalence", () => {
  const r = transformMathExpression({ source: "(x+1)^2", op: "expand" });
  assert.equal(r.steps.length, 1);
  assert.equal(r.steps[0].verdict.kind, "equivalent");
  assert.match(r.final, /x\^2/);
});

test("transform_math_expression rejects unknown ops", () => {
  assert.throws(() => transformMathExpression({ source: "x", op: "teleport" as never }), /Unknown transform/);
});

test("validate_math_steps flags invalid rewrites", () => {
  const r = validateMathSteps({
    steps: [{ source: "x = 2" }, { source: "x^2 = 4", rule: "square-both-sides" }, { source: "x = 5" }],
  });
  assert.equal(r.verdicts[0].kind, "implication");
  assert.equal(r.verdicts[1].kind, "invalid");
  assert.equal(r.ok, false);
});

test("math_expression_layout lowers to MathExpr", () => {
  const r = expressionMathExpr({ source: "1/2 + x^2" });
  assert.ok(r.mathexpr && typeof r.mathexpr === "object");
});

test("animate_math_graph appends axes + curve + tangent", () => {
  const r = animateMathGraph(lesson(), {
    at: 2000,
    graph,
    curves: [{ fn: { kind: "polynomial", coefficients: [0, 0, 1] }, color: "blue" }],
    tangent: { curve: 0, at: 1, duration: 2500 },
    points: [{ x: 1, y: 1, label: "P" }],
  });
  const types = r.lesson.chapters[0].actions.map((a) => a.type);
  assert.ok(types.includes("drawAxes") && types.includes("drawGraph") && types.includes("animateTangent"));
  assert.ok(r.actionIds.length >= 4);
});

test("animate_geometry validates shape payloads", () => {
  const r = animateGeometry(lesson(), {
    at: 1000,
    shapes: [{ kind: "areaModel", x: 0, y: 0, w: 200, h: 120, rows: 2, cols: 3 } as never],
  });
  assert.equal(r.actionIds.length, 1);
  assert.throws(() => animateGeometry(lesson(), { at: 0, shapes: [] }), /at least one shape/);
});

test("set_semantic_colors paints symbol substrings", () => {
  const r = setSemanticColors(lesson(), { actionId: "w1", colors: { x: "blue", "2": "red" } });
  const a = r.lesson.chapters[0].actions.find((x) => x.id === "w1") as Extract<
    import("../src/story/types").Action,
    { type: "write" }
  >;
  assert.equal(typeof a.content, "object");
  assert.deepEqual(r.warnings, []);
  assert.throws(() => setSemanticColors(lesson(), { actionId: "nope", colors: {} }), /Unknown action/);
});

function sceneFixture(): unknown {
  return {
    id: "s1",
    title: "Kuadrat",
    purpose: "demo",
    concept: "square-ending-5",
    pattern: "derivation",
    beats: [
      {
        id: "b1",
        mode: "demonstrate",
        purpose: "contoh",
        narration: ["Perhatikan dua puluh lima."],
        equations: [{ source: "25^2 = 625", reason: "trik", rule: "heuristic" }],
      },
    ],
  };
}

test("plan/direct/auto_layout scene pipeline", () => {
  const planned = planLessonScenes({
    plan: {
      id: "p", title: "T", seed: 1, objectives: ["o"], scenes: [sceneFixture()],
    },
  });
  assert.equal(planned.scenes.length, 1);
  assert.ok(planned.totalEstimatedMs > 0);
  const d = directSceneTool({ scene: sceneFixture(), seed: 1 });
  assert.ok(d.actions.length > 0 && d.durationMs > 0);
  const auto = autoLayoutScene({ scene: sceneFixture(), seed: 1 });
  assert.equal(typeof auto.durationMs, "number");
  assert.ok(Array.isArray(auto.frames));
});

test("validate_scene_layout + run_visual_qa report on the fixture", () => {
  const v = validateSceneLayout({ lesson: lesson() });
  assert.equal(typeof v.ok, "boolean");
  const qa = runVisualQa({ lesson: lesson() });
  assert.ok(qa.warnings.some((w) => /camera/.test(w)));
});

test("reframe_camera frames measured actions", () => {
  const r = reframeCamera(lesson(), { at: 500, actionIds: ["w1"] });
  assert.ok(r.actionId.length > 0);
  assert.ok(Number.isFinite(r.camera.x));
  assert.throws(() => reframeCamera(lesson(), { at: 0 }), /bounds or actionIds/);
});

test("inspect_timeline summarizes chapters", () => {
  const r = inspectTimeline({ lesson: lesson() });
  assert.equal(r.chapters.length, 1);
  assert.equal(r.chapters[0].byType.write, 1);
  assert.deepEqual(r.chapters[0].narrationIds, ["n1"]);
});
