import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_TRICKS, trickToScene } from "../src/tricks/catalog";
import { validateMathSteps } from "../src/mcp/math-tools";
import { verifyTrick } from "../src/math/verify";
import { validateScenePlan } from "../src/director/plan";
import { directScene } from "../src/director/templates";

test("catalog holds 50 distinct tricks in 5 chapters of 10", () => {
  assert.equal(ALL_TRICKS.length, 50);
  assert.deepEqual([...new Set(ALL_TRICKS.map((t) => t.id))].length, 50);
  for (let c = 1; c <= 5; c++)
    assert.equal(
      ALL_TRICKS.filter((t) => t.chapter === c).length,
      10,
      `chapter ${c} must hold 10 tricks`,
    );
});

for (const t of ALL_TRICKS) {
  test(`${t.id} worked example verifies (no invalid step)`, () => {
    assert.ok(t.steps.length >= 2, "needs at least two steps");
    const r = validateMathSteps({
      steps: t.steps.map((s) => ({ source: s.source, rule: s.rule ?? "given", conditions: s.conditions ?? [] })),
    });
    for (const v of r.verdicts)
      assert.notEqual(v.kind, "invalid", `${t.id} step ${v.index} (${v.source}): ${v.detail}`);
    assert.equal(r.ok, true);
  });

  if (t.check) {
    const check = t.check;
    test(`${t.id} shortcut matches exact arithmetic`, () => {
      const v = verifyTrick(t.id, check);
      assert.notEqual(v.kind, "invalid", `${t.id}: ${v.detail}`);
    });
  }

  test(`${t.id} lowers to a valid scene`, () => {
    const scene = trickToScene(t);
    validateScenePlan(scene);
    assert.equal(scene.beats.length, 3);
    const d = directScene(scene, 11);
    assert.ok(d.actions.length > 0);
    assert.ok(d.durationMs > 0);
  });
}
