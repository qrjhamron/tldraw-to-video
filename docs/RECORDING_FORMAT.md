# Recording and project compatibility

`recording.schema.json` specifies `tldraw-stroke-recording`, version 1. `parseRecording` enforces chronological finite timestamps, contiguous `seq`, provenance, supported SDK version, record IDs, viewport and camera validity. The initial document and session are native `getSnapshot` values. Events carry absolute milliseconds, stable sequence numbers, tool/source, origin and record/before records as appropriate. Equal timestamps are ordered by sequence.

Event kinds: create, update, complete, erase, delete, camera, page. Full records preserve encoded stroke paths, segment dimensions, styles, pressure, transforms and metadata. Undo/redo replay the resulting native changes. The supported store API coalesces changes within one atomic transaction, matching the state committed by the editor; the compiler deliberately commits individual pen samples. The recording does not invent unobserved intermediate pen points.

New optional metadata: `lessonId`, `seed`, and `narration: [{ id, t, durationMs, text, visual? }]`. These are additive fields; existing v1 recordings continue to load without migration. SDK records themselves are version-bound: migration between SDK releases must use supported schema migrations and is not silently attempted.

Semantic lessons use a separate `stroke-lesson`, version 1 format. They are editable authoring projects; recordings are executable document timelines. They can both be imported/exported as JSON. SDK `TLEditorSnapshot` objects can be imported as a static initial document. Raw `.tldr` containers have a different wrapper and are not claimed to be supported by this snapshot adapter.

Editing functions operate on copies. Trimming folds all events before the cut into the initial snapshot and captures the camera at the cut. Retiming scales every event and metadata timestamp. Concatenation restores each independent clip’s initial document with explicit differences and a camera/page key. Reordering chapters uses these primitives. Partially cut narration is omitted until regenerated, avoiding an incorrect full-sentence audio association. `reusableStrokes` returns final native draw records for reusable human/generated handwriting; provenance stays with those records.

Provenance additionally accepts `unknown` for imported snapshots without trustworthy acquisition history. Native records retain their existing shape metadata. Snapshot import never labels unverified geometry as physically human-recorded. Recorded new pointer input defaults to `human`; automated fixtures explicitly use `generated`.
