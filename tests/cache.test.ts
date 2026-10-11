import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRecording } from "../src/engine/schema";
import { segmentInput, canonical } from "../src/engine/segment-input";
const r = parseRecording(
  JSON.parse(readFileSync("public/lesson.recording.json", "utf8")),
);
test("video chunk fingerprints ignore JSON key order but preserve native state dependencies", () => {
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
  const edited = structuredClone(r),
    first = edited.events.find((e) => e.record?.typeName === "shape")!,
    id = first.id;
  for (const e of edited.events) {
    if (e.id === id && e.record?.typeName === "shape") e.record.x += 20;
  }
  assert.notEqual(
    canonical(segmentInput(r, 0, 300)),
    canonical(segmentInput(edited, 0, 300)),
  );
  assert.notEqual(
    canonical(segmentInput(r, 900, 300)),
    canonical(segmentInput(edited, 900, 300)),
  );
});
test("a later edit leaves earlier chunk inputs identical", () => {
  const edited = structuredClone(r),
    target = edited.events.find(
      (e) => e.t > 100000 && e.record?.typeName === "shape",
    )!;
  if (target.record?.typeName === "shape") target.record.x += 20;
  assert.equal(
    canonical(segmentInput(r, 0, 300)),
    canonical(segmentInput(edited, 0, 300)),
  );
});
test("nonvisual user profiles do not invalidate native video geometry", () => {
  const edited = structuredClone(r);
  for (const [id, record] of Object.entries(edited.initial.document.store)) {
    if (record.typeName === "user")
      delete edited.initial.document.store[
        id as keyof typeof edited.initial.document.store
      ];
  }
  assert.equal(
    canonical(segmentInput(r, 0, 300)),
    canonical(segmentInput(edited, 0, 300)),
  );
});
test("imported snapshots can declare unknown acquisition provenance without claiming human input", () => {
  const imported = structuredClone(r);
  imported.metadata.origin = "unknown";
  assert.equal(parseRecording(imported).metadata.origin, "unknown");
});
