# Repository audit — 2.0

Inspected baseline commit `0753dde` on 2026-10-11. The working tree was clean and the remote matches this history. Baseline: all eight Node tests passed; strict TypeScript/Vite production build passed. Chromium and FFmpeg are installed. The npm registry also reports 5.5.2 as the latest version at audit time. No SDK upgrade is necessary to deliver the new authoring layer: retain lockfile-pinned tldraw 5.5.2.

## Architecture to preserve

React 19 / TypeScript / Vite application, self-hosted SDK assets, `Recorder` synchronous store side effects, version-1 event records and 5-second document checkpoints. Human creation, updates, completion, deletion, erasure, transformations, undo/redo outcomes and camera changes are captured without polling. `Replay` folds exact records and evaluates camera keys at absolute time. Generated strokes also go through real Editor create/update/delete operations and the same recorder. All lesson marks are genuine `draw` shapes with free segments, encoded paths and pressure. No handwriting uses text shapes, masks or screenshots.

The original 180-second lesson remains supported. Its Hershey single-line glyphs have explicit pen lifts; this is a centerline stroke source, not an outline font. MIT provenance: [upstream data/library](https://github.com/techninja/hersheytextjs) and [license](https://github.com/techninja/hersheytextjs/blob/master/LICENSE), retained in `src/lesson/HERSHEY-LICENSE.txt`. 2.0 keeps this data and authors new mathematical centerline glyphs. Data source paths give useful stroke order, but they are procedural lettering and do not claim to reproduce any person's handwriting.

## Current SDK research

Checked official documentation and the installed SDK implementation:

- [Draw shapes](https://tldraw.dev/sdk-features/draw-shape): supported creation with `segments: [{ type: 'free', path: b64Vecs.encodePoints(points) }]`, `isPen`, `isComplete`, scale, dash and color. `DrawShapeUtil` uses pressure-aware freehand outlines and caps interactive strokes at 600 points by default. Programmatic strokes are bounded by our sampled geometry.
- [DrawShapeUtil](https://tldraw.dev/reference/tldraw/DrawShapeUtil) and [TLDrawShapeSegment](https://tldraw.dev/reference/tlschema/TLDrawShapeSegment): native renderer and typed records are reused unchanged.
- [b64Vecs](https://tldraw.dev/reference/tlschema/b64Vecs): first point is Float32, subsequent deltas Float16; use `decodePoints(path, dim)`. Round trips are subject to encoding quantization; stored strings are replayed exactly, never repeatedly decoded/re-encoded.
- [Editor](https://tldraw.dev/sdk-features/editor), [Store](https://tldraw.dev/sdk-features/store), [side effects](https://tldraw.dev/sdk-features/side-effects): supported operations and synchronous hooks, transaction batching and ignored history for generated timelines.
- [Camera](https://tldraw.dev/sdk-features/camera): coordinates are translations in page units, zoom scales them into screen coordinates. Offline rendering must evaluate absolute-time keys rather than depend on SDK animation RAF.
- [Image export](https://tldraw.dev/sdk-features/image-export): SDK SVG export renders native geometry using explicit bounds. Chromium rasterizes each timeline sample and FFmpeg encodes H.264. UI and license controls are not SVG drawing geometry.
- [Themes](https://tldraw.dev/sdk-features/themes): native SDK theme palettes support the warm board and restrained ink colors consistently in editor and SVG.

## Technical debt addressed

The baseline lesson embeds content, handwriting and camera scheduling in one module. Math is correct but manually laid out; lettering uses uniform baseline/spacing and essentially constant pressure. Export has a fixed duration and cannot resume. There is no semantic lesson schema, audio adapter or timing editor. Large snapshots can consume memory, and SDK SVG work is expensive during active ink; unchanged frames are cached, and offscreen strokes culled during export.

2.0 adds separately testable handwriting, math layout, mathematical models, declarative storytelling, camera framing, audio alignment, recording editing and resumable chunk rendering. The recorder/replay and v1 schema stay compatible; optional metadata carries narration and deterministic seeds.

## Explicit boundaries

Native SDK erasure is whole-shape erasure, not partial-path clipping. The compiler deletes actual shapes with the eraser tool selected and records those deletions. No white overlays pretend to erase. Arbitrary symbolic algebra is outside the current model: reusable polynomial and sine functions are evaluated analytically, not arbitrary strings or `eval`. Imported editor snapshots must match the pinned SDK; cross-version records need explicit migration. TTS is network-dependent; audio timestamps are validated against probed duration and silent export is independent. Mathematical handwriting remains seeded procedural penmanship, not captured human handwriting.
