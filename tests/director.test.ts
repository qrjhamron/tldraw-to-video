import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CanvasPlanner,
  contrastRatio,
  checkInkOnTheme,
  overlaps,
  derivationColumn,
  sideBySide,
  graphWithExplanation,
} from "../src/director/layout";
import {
  validateLessonPlan,
  estimateBeatMs,
  type LessonPlan,
} from "../src/director/plan";
import { directScene } from "../src/director/templates";
import { validateLesson } from "../src/story/types";
import type { Lesson } from "../src/story/types";

function plan(): LessonPlan {
  return validateLessonPlan({
    id: "p1",
    title: "Uji",
    seed: 7,
    objectives: ["memahami kuadrat"],
    scenes: [
      {
        id: "s1",
        title: "Kuadrat 25",
        purpose: "Menunjukkan trik 5² lewat (2·3)|25",
        concept: "square-ending-5",
        pattern: "derivation",
        palette: { a: "blue" },
        beats: [
          {
            id: "b1",
            mode: "demonstrate",
            purpose: "Contoh 25² langkah demi langkah",
            narration: ["Perhatikan angka dua puluh lima."],
            cues: ["dua puluh lima"],
            equations: [
              { source: "25^2 = 625", reason: "2·3=6, tempel 25", rule: "heuristic", conditions: ["bilangan berakhiran 5"] },
            ],
          },
          {
            id: "b2",
            mode: "ask",
            purpose: "Tantangan mental 35²",
            narration: ["Sekarang coba tiga puluh lima kuadrat."],
            lines: ["Berapa 35 kuadrat?"],
          },
        ],
      },
    ],
  });
}

test("plan validation rejects sloppy scenes with reasons", () => {
  assert.throws(() => validateLessonPlan({}), /object|string/);
  const bad = plan();
  (bad.scenes[0].beats[0] as { purpose: string }).purpose = "";
  assert.throws(() => validateLessonPlan(bad), /purpose/);
  const badMode = plan();
  (badMode.scenes[0].beats[0] as { mode: string }).mode = "dance";
  assert.throws(() => validateLessonPlan(badMode), /mode/);
  const badColor = plan();
  badColor.scenes[0].palette = { a: "purple" as never };
  assert.throws(() => validateLessonPlan(badColor), /palette/);
  assert.ok(estimateBeatMs(plan().scenes[0].beats[0]) > 2000);
});

test("directed scenes lower to valid, deterministic lessons", () => {
  const p = plan();
  const a = directScene(p.scenes[0], p.seed);
  const b = directScene(p.scenes[0], p.seed);
  assert.deepEqual(a, b);
  assert.ok(a.actions.length > 5);
  assert.ok(a.checkpoints.length === 2);
  assert.ok(a.cues.length === 1 && a.cues[0].measured === false);
  assert.ok(a.durationMs > 5000);
  // The lowered actions validate as a real chapter.
  const lesson: Lesson = {
    format: "stroke-lesson",
    version: 1,
    id: "t",
    title: "t",
    language: "id",
    seed: 1,
    duration: a.durationMs + 1000,
    chapters: [
      { id: "c", title: "c", start: 0, duration: a.durationMs + 1000, origin: { x: 0, y: 0 }, objectives: [], actions: a.actions },
    ],
  };
  validateLesson(lesson);
  // Every action fits inside the chapter.
  for (const act of a.actions)
    assert.ok(act.at + act.duration <= a.durationMs + 1000, act.id);
});

test("planner measures, packs, and detects layout failures", () => {
  const p = new CanvasPlanner({ seed: 3 });
  const r1 = p.textLine("t1", "Halo dunia", 80, 30, "uji");
  assert.ok(r1.w > 50 && r1.h > 10);
  const r2 = p.reserve("box", 80, 200, 100, "uji", { y: r1.y });
  assert.deepEqual(p.collisions({ x: 80, y: r1.y, w: 50, h: 20 }, ["t1"]), ["box"]);
  assert.ok(p.allOverlaps().length >= 1);
  p.reserve("off", 1600, 200, 100, "uji", { y: 0 });
  assert.deepEqual(p.outOfFrame(), ["off"]);
  const cam = p.frameFor(["t1"]);
  assert.ok(Number.isFinite(cam.z) && cam.z > 0);
  assert.throws(() => p.reserve("t1", 0, 10, 10, "dup"), /Duplicate/);
  assert.ok(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }));
  assert.ok(!overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 50, y: 50, w: 10, h: 10 }));
});

test("layout primitives partition space without overlap", () => {
  const rows = derivationColumn(80, 100, [{ w: 100, h: 40 }, { w: 120, h: 40 }]);
  assert.equal(rows.length, 2);
  assert.ok(rows[1].y > rows[0].y + rows[0].h);
  const { left, right } = sideBySide(0, 0, 1640, 700, 800);
  assert.ok(left.x + left.w <= right.x && right.x + right.w <= 1640);
  const g = graphWithExplanation(0, 0, 1640, 800);
  assert.ok(g.graph.w === 720 && g.text.x + g.text.w <= 1640);
  assert.throws(() => sideBySide(0, 0, 100, 90, 10), /positive right/);
});

test("contrast gate validates ink on every theme", () => {
  assert.ok(contrastRatio("#000000", "#ffffff") > 15);
  for (const theme of ["whiteboard", "graph", "notebook"] as const) {
    for (const ink of ["black", "blue", "red", "green", "orange", "grey"] as const) {
      const r = checkInkOnTheme(ink, theme);
      assert.ok(r.ok, `${ink} on ${theme}: ${r.ratio}`);
    }
    // Core inks also clear the strict 4.5 body-text bar.
    for (const ink of ["black", "blue"] as const)
      assert.ok(checkInkOnTheme(ink, theme, 4.5).ok);
  }
  // Orange/grey are large-text grade only.
  assert.ok(!checkInkOnTheme("orange", "whiteboard", 4.5).ok);
});
