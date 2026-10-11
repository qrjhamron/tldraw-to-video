import assert from "node:assert/strict";
import { test } from "node:test";
import { assembleChapter, assembleOpening, assembleShowcase } from "../src/tricks/assemble";
import { runVisualQa } from "../src/mcp/director-tools";

test("each chapter assembles 10 trick scenes with clean QA", () => {
  for (let c = 1; c <= 5; c++) {
    const { lesson, scenes } = assembleChapter(c, 1000);
    assert.equal(lesson.chapters.length, 10);
    assert.equal(scenes.length, 10);
    assert.ok(lesson.duration > 0);
    const qa = runVisualQa({ lesson });
    assert.deepEqual(qa.errors, []);
  }
});

test("showcase fits the 60-90s silent window", () => {
  const { lesson } = assembleShowcase(500);
  assert.equal(lesson.chapters.length, 3);
  assert.ok(lesson.duration >= 60000 && lesson.duration <= 90000, `showcase ${lesson.duration}ms`);
  const qa = runVisualQa({ lesson });
  assert.deepEqual(qa.errors, []);
});

test("opening is a short valid lesson", () => {
  const lesson = assembleOpening(7);
  assert.equal(lesson.duration, 24000);
  assert.ok(lesson.chapters[0].actions.some((a) => a.type === "narrate"));
  const qa = runVisualQa({ lesson });
  assert.deepEqual(qa.errors, []);
});
