import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  trim,
  retime,
  concatenate,
  reusableStrokes,
} from "../src/editing/project";
import { parseRecording } from "../src/engine/schema";
import { applyRecordEvent, cameraAt } from "../src/engine/state";
const r = parseRecording(
  JSON.parse(readFileSync("public/lesson.recording.json", "utf8")),
);
function recordsAt(recording: typeof r, t: number) {
  const map = new Map(
    Object.values(recording.initial.document.store).map((v) => [
      v.id as string,
      v,
    ]),
  );
  for (const e of recording.events) if (e.t <= t) applyRecordEvent(map, e);
  return [...map].sort(([a], [b]) => a.localeCompare(b));
}
test("trim copy materializes original boundary state and preserves later geometry", () => {
  const clipped = trim(r, 67000, 98000);
  assert.deepEqual(recordsAt(clipped, 10000), recordsAt(r, 77000));
  assert.deepEqual(clipped.initialCamera, cameraAt(r, 67000));
  assert.equal(clipped.durationMs, 31000);
});
test("retiming preserves exact records and proportional camera timing", () => {
  const fast = retime(r, 2);
  assert.deepEqual(recordsAt(fast, 45000), recordsAt(r, 90000));
  assert.deepEqual(cameraAt(fast, 23000), cameraAt(r, 46000));
  assert.equal(fast.durationMs, 90000);
  assert.throws(() => retime(r, 0), /positive/);
});
test("reordered clips restore explicit independent initial states", () => {
  const a = trim(r, 98000, 115000),
    b = trim(r, 22000, 62000),
    joined = concatenate([a, b]);
  assert.deepEqual(
    recordsAt(joined, a.durationMs + 15000),
    recordsAt(b, 15000),
  );
  assert.equal(joined.durationMs, 57000);
  assert.ok(joined.events.some((e) => e.tool === "segment-edit"));
  assert.ok(reusableStrokes(r).length > 500);
});
