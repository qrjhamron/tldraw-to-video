# Native Stroke Studio

A React/TypeScript recorder and deterministic animation engine built with **tldraw SDK 5.5.2**. All lesson lettering, formulas, graphs, axes and annotations are native `draw` shapes. There are no text shapes or raster drawing assets in the lesson.

## Setup and usage

Requires Node 22+, Playwright Chromium and FFmpeg/FFprobe on PATH.

```sh
npm ci
npx playwright install --with-deps chromium
npm run dev
```

Open `http://localhost:5173`. Play/Pause, Restart, playback speed, timeline scrubbing and chapter buttons control the supplied lesson. Playback is read-only; navigation remains available. The viewer fits the original recording viewport to its canvas.

Choose **Record a whiteboard** to start a human recording. Draw, erase, transform shapes, undo/redo and navigate using the native tldraw tools. **Stop & replay** ends recording. **Save recording** downloads JSON; **Import JSON** restores it. The MP4 button downloads the delivered video.

Assets are served locally from `public/tldraw`. No external font or asset CDN is needed. Set `VITE_TLDRAW_LICENSE_KEY` for licensed production deployment under [tldraw's SDK license](https://tldraw.dev/community/license). The default editor license notice is retained without a key. Video rendering uses the supported drawing-only SVG export API.

## Export and verification

```sh
npm run export                  # render the supplied recording
npm run export -- --regenerate  # author a fresh lesson through the native SDK first
npm test
npm run test:browser
npm run test:controls
npm run verify:media
npm run inspect:media
npx tsx scripts/verify-export.ts
npm run build
```

Export starts Vite if needed; `STUDIO_URL` can select a running development server. Browser tests use source imports and require Vite development mode. The optional decoded-frame inspection also needs Python 3 and Pillow. Build output is in `dist`. Export copies the video into `public/output`; rebuild afterward to include the latest MP4 in the built app. A temporary MP4 is renamed only after successful encoding.

Deliverables:

- `output/calculus_intro_180s.mp4`: 1920×1080, H.264/yuv420p, 30 FPS, 5,400 frames, 180 seconds, no audio.
- `output/calculus_intro_180s.recording.json`: native recording with initial document/schema and session.
- `output/export-manifest.json`: recording hash, sampled frame hashes and geometry counts.
- `output/media-validation.json`, `output/browser-validation.json`: machine verification results.
- `output/inspection`: native frame exports and an application screenshot.
- `VERIFICATION.md`: validation findings and visual inspection.

## Architecture

`src/engine/recorder.ts` uses supported store side effects: after-create, after-change and after-delete handlers for document records, camera changes and page changes. Hooks run after committed atomic operations. They preserve separate transactions occurring in one animation frame, unlike RAF-batched store listeners. Recording does not poll the canvas or infer geometry from screenshots.

A monotonic clock measures elapsed milliseconds; a sequence number orders equal-time operations. Events retain full native records, prior records when applicable, tool, source (`user`/`remote`) and origin (`human`/`generated`). Draw path strings are copied exactly, including dimensions, pressure, styling, transforms, parent IDs and shape indices. Draw completion and eraser deletion are explicit event kinds. Undo/redo records the resulting document changes instead of replaying commands against another undo stack.

`src/engine/state.ts` folds events into checkpoint maps at five-second boundaries. Maps share immutable record payloads rather than duplicating every stroke. `src/engine/replay.ts` restores checkpoints on backward/large seeks, then consumes events through the requested time. Forward playback processes every intervening event. Restores use remote store transactions and ignore local history. Camera keys use binary search, hold/linear/smoothstep pan and logarithmic zoom interpolation. RAF schedules presentation; explicit time defines the document state.

`src/lesson/paths.ts` decodes single-line Hershey vector glyphs and custom mathematical symbols into pen-down paths. Each path becomes a native draw shape. Arc-length reveal controls writing, with pen-up pauses between strokes. Superscripts and stacked fractions are geometry. `src/lesson/calculus.ts` schedules native `createShape`, `updateShape` and deletion operations at up to 60 point samples per second. A virtual clock feeds the same recorder as human input. Every lesson event and shape declares generated provenance; synthetic pressure and handwriting are never claimed to be human capture.

The secant updates the same draw record and transforms Q. Erasing removes actual shape records in spatial order. Rectangles are refined, removed, and replaced with stroke hatching to reveal accumulation. Camera direction moves continuously across adjacent regions on one infinite page, with a small zoom during the secant explanation.

`window.studio` exposes `editor`, `recording`, `replay`, `seek`, `load` and `renderFrame` for automation. Export samples time `i * 1000 / 30` for `i=0…5399`, reconstructs the native document, and calls `Editor.getSvgString` using camera-derived page bounds. Chromium rasterizes that SDK SVG at 1920×1080. JPEG frames stream with backpressure to FFmpeg/libx264. Unchanged states may reuse their encoded frame after processing all events. This caches stationary frames, not drawing geometry. Exactly one frame is supplied for each scheduled timestamp. No real-time screen recorder or audio stream is used.

## Recording format v1

See `recording.schema.json` for JSON Schema and `src/engine/schema.ts` for the TypeScript schema and validating reader.

```ts
{
  format: 'tldraw-stroke-recording', version: 1, sdkVersion: '5.5.2',
  durationMs: 180000, viewport: { width: 1920, height: 1080 },
  initial: { document: /* native store and schema */, session: /* native session */ },
  initialCamera: { x: 0, y: 0, z: 1.2 },
  metadata: { origin: 'generated', language: 'id', title: '…', chapters: [] },
  events: [
    { seq: 0, t: 0, kind: 'create', origin: 'generated', source: 'user',
      tool: 'draw', id: 'shape:…', record: /* complete native record */ },
    // update, complete, erase, delete, camera, page
  ]
}
```

The reader rejects unsupported versions/SDK versions, invalid times/order and missing required fields. tldraw validates records entering its store. A future SDK upgrade must explicitly migrate event payloads as well as initial snapshots; unknown event schemas are never silently reinterpreted.

## SDK limits and adapters

- **Eraser:** SDK 5.5.2 deletes whole shapes; its native eraser does not provide partial path erasure. Human erasing is recorded from the actual tool. The generated sweep schedules equivalent whole-stroke deletions through `deleteShapes` while the eraser is active. Replay applies those records, without white overlays or opacity masks. Temporary cursor, hover and selection previews are UI state and are excluded from drawing-only video.
- **Precision:** native paths use a Float32 starting point and Float16 deltas. Existing path strings are preserved exactly; generated paths have the SDK's compression precision. Input coalesced inside a native transaction or by the browser cannot be recovered. Every committed record state is captured.
- **Navigation:** there are no canvas bounds or pan constraints. Zoom retains the SDK's standard finite range. Extremely wide min/max ratios cause the native hatch-pattern LOD generator to allocate oversized textures. Human camera positions between observed samples are interpolated estimates.
- **Determinism:** identical recording/time produces identical document and camera state. Pixels are verified in the same Chromium/SDK environment; rasterization can vary across operating systems. Vector pen motion is programmatic handwriting.
- **Scope:** checkpoints are rebuilt on import and held in memory. This is a local recorder, without an audio or collaboration backend. Stopping during an unfinished stroke preserves its unfinished native state.

## Lesson

| Time | Visual explanation |
|---|---|
| 0–20s | Calculus studies change and accumulation |
| 20–62s | Coordinate axes, parabola, secant approaching tangent, slope 2 at x=1 |
| 62–98s | Difference quotient, expansion, cancellation, limit, derivative 2x |
| 98–115s | Derivative of x²+3x and value 7 at x=2 |
| 115–121s | Erasing the current work |
| 121–158s | Accumulation under y=x, refined rectangles, area from 0 to 2 |
| 158–173s | Definite integral equals 2; triangle-area check |
| 173–180s | Turunan → laju sesaat; integral → akumulasi |

## Research and attribution

Checked against official documentation and the installed SDK source before implementation:

- [Draw shape format and rendering](https://tldraw.dev/sdk-features/draw-shape)
- [Store records and snapshots](https://tldraw.dev/sdk-features/store)
- [Supported side effects](https://tldraw.dev/sdk-features/side-effects)
- [Camera coordinates and APIs](https://tldraw.dev/sdk-features/camera)
- [Native eraser behavior](https://tldraw.dev/blog/erasing)
- [Editor API and SVG export](https://tldraw.dev/reference/editor/Editor)

The `futural` glyph data comes from [Hershey Text](https://github.com/techninja/hersheytextjs); see `src/lesson/HERSHEY-LICENSE.txt`. tldraw and its assets retain their SDK license; `public/tldraw/LICENSE.md` accompanies the copied assets.
