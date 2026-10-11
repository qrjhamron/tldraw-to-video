# tldraw-to-video

A reusable educational whiteboard engine built with the real tldraw SDK. Stroke handwriting, diagrams and mathematical notation are native pressure-aware draw shapes; opt-in handwritten fonts render as honestly labeled native text shapes; placed portraits and diagrams are native image shapes with provenance. An event-sourced recorder preserves geometry, and deterministic replay reconstructs the document at each offline video frame.

The flagship Indonesian lesson, **Kalkulus: Matematika untuk Memahami Perubahan**, follows motion → history (Newton/Leibniz portraits on notebook paper) → limits → derivatives → accumulation → the fundamental theorem → a final challenge, with graph paper for derivations. Eight chapters, a moving car, model-driven secants/tangents, explicit algebra, refined Riemann rectangles and an intentional thinking pause. Narration uses actual Edge TTS audio, voice `id-ID-GadisNeural`, with measured clip durations. Generated handwriting is clearly labeled as procedural geometry, never human-recorded penmanship; font-mode text never claims pen construction.

## Delivered artifacts

- [30-second handwriting comparison](output/handwriting-comparison.mp4)
- [60-second visual proof-of-concept](output/visual-poc.mp4)
- [Handwriting audit and implementation](docs/HANDWRITING.md)
- [Visual assets](docs/VISUAL_ASSETS.md) · [Canvas themes](docs/CANVAS_THEMES.md) · [MCP tools](docs/MCP_TOOLS.md)
- [Silent flagship MP4](output/calculus_flagship_silent.mp4)
- [Narrated flagship MP4](output/calculus_flagship_narrated.mp4)
- [Semantic lesson](examples/calculus-flagship.lesson.json)
- [Aligned narration lesson](public/flagship.lesson.json)
- [Native event recording](public/flagship.recording.json)
- [Original 180-second lesson](output/calculus_intro_180s.mp4)
- [2.0 verification report](docs/VERIFICATION_2.md)

Both flagship videos are 1920×1080, 30 FPS H.264, **9:37.167** long. The narrated version contains real Indonesian TTS; the silent version has no audio track. Media checks, 40 unit tests and browser suites pass; representative decoded frames were visually inspected.

## 50 Trik Hitung Cepat Matematika (4.0 flagship)

The autonomous directing stack produces **50 Trik Hitung Cepat Matematika — Dari Akar sampai Integral**: five individually renderable chapters of ten verified techniques each, a short opening, a 60–90s showcase, and a combined full-length flagship, all with Indonesian `id-ID-GadisNeural` narration warped to measured audio.

- `output/tricks/showcase.mp4` — narrated showcase (82.8s, 1920×1080, 30 FPS)
- `output/tricks/ch1.mp4` … `ch5.mp4` — narrated chapters (~6 min each)
- `output/tricks/full.mp4` — combined flagship with chapter markers (`output/tricks/full-manifest.json`)
- `src/tricks/` — technique catalog; every worked example is machine-verified (no `invalid` step) and every shortcut is tested against exact arithmetic (`tests/tricks.test.ts`, 112 tests)

Pipeline: `npx tsx scripts/compile-tricks.ts` (assemble + static QA) → `scripts/narrate-tricks.ts` (TTS + warp) → `scripts/export-tricks.ts` (MP4 + mux). Preview any lesson with `render_lesson_preview` (MCP) or `scripts/render-preview.ts`. New capabilities: semantic math AST with verified transforms, seven-pattern scene director with measured layout, narration director with math reading rules, and 16 new MCP tools — see [architecture](docs/ARCHITECTURE.md), [lesson authoring](docs/LESSON_AUTHORING.md), and [MCP tools](docs/MCP_TOOLS.md).

## Run

Node 22+, Python 3.10+ only for optional TTS, FFmpeg/FFprobe, Chromium:

```sh
npm ci
npx playwright install chromium
npm run dev
```

The app opens the flagship lesson by default. `?lesson=intro` opens the original. Play/pause, restart, speed selection, scrubbing and chapter seeking reconstruct native documents. Record a whiteboard to capture real editor strokes, erase operations, transformations, camera and undo/redo. Save/import JSON, import semantic lesson definitions or pinned-SDK editor snapshots, inspect native point/pressure data, and edit timing through trim, retime and chapter reorder controls. Edited projects remain previewable and downloadable copies.

A licensed deployment may set `VITE_TLDRAW_LICENSE_KEY` in `.env.local`; no key is required to inspect this development workspace. Assets and their SDK license are self-hosted. Keep credentials out of recordings and lesson definitions.

## Rebuild the flagship

```sh
npm test
npm run build
# Optional Indonesian narration:
python3 -m venv .venv
.venv/bin/pip install edge-tts==7.2.8
TTS_PYTHON=.venv/bin/python npm run tts
npm run lesson:compile
npm run export:flagship -- --cache output/render-cache-handwriting-final
npm run verify:flagship
```

Silent export is independent of TTS. The export pipeline evaluates explicit frame times at 30 FPS, reconstructs native tldraw geometry, exports SVG with the SDK, rasterizes in Chromium and encodes H.264 at 1920×1080. Completed ten-second chunks are hash-verified and resumable. No real-time screen recording, controls, text reveal masks or video-generation substitute is used.

```sh
npm run test:browser       # legacy native pen/erase/undo/seek equivalence
npm run test:controls      # browser transport/import/record controls
npm run test:v2:browser    # flagship and reusable compiler in Chromium
npm run test:editing       # inspector, trim, retime, reuse and snapshot import
npm run export            # original exactly 180-second silent lesson
npm run verify:media      # original media verification
```

## Architecture and authoring

- [Audit and SDK research](docs/AUDIT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Lesson authoring](docs/LESSON_AUTHORING.md)
- [Recording/project format](docs/RECORDING_FORMAT.md)
- [Export and resume](docs/EXPORT.md)
- [TTS configuration and alignment](docs/TTS.md)
- [Visual assets](docs/VISUAL_ASSETS.md)
- [Canvas themes](docs/CANVAS_THEMES.md)
- [MCP tools](docs/MCP_TOOLS.md)
- [Algebra example](examples/algebra.lesson.json)
- [Legacy implementation reference](docs/LEGACY.md)

Core modules: `engine` (recorder/replay), `handwriting` (seeded ordered centerlines, structured math layout, honest font mode), `assets` (registry, provenance, sanitization), `math` (semantic AST, verified transforms, analytic models, projected geometry), `story` (typed content/compiler/camera/themes), `director` (scene plans, measured layout, static QA), `tricks` (50-technique catalog + assembly), `audio` (TTS, math speech rules, duration warp), `editing` (materialized clips and document diffs), `mcp` (tool implementations). Rendering has no lesson-specific logic. Strict TypeScript, a pinned lockfile, Node tests and real-browser CI checks support reproducibility.

## Scope and limitations

Native erasure removes whole draw shapes; partial-path erasure is not supported by the pinned SDK and is not simulated with white paint. Math models currently support polynomials and sine functions, rather than arbitrary symbolic expressions. Math layout is a typed tree, not a complete TeX parser. Raw `.tldr` wrappers need a separate importer; pinned editor snapshots are supported. Imported static geometry cannot recover pen timing that was never recorded. Word timestamps are validated for duration/order but are advisory; segment audio durations drive synchronization. TTS availability depends on Microsoft’s external service. Partial narration cut by a trim is omitted until regenerated.

## Credits

The production handwriting glyphs are authored ordered pen trajectories in [glyphs.ts](src/handwriting/glyphs.ts). Hershey is retained only for the comparison fixture. The Hershey single-line data comes from [Hershey Text](https://github.com/techninja/hersheytextjs), under its [MIT license](src/lesson/HERSHEY-LICENSE.txt). Custom mathematical centerline glyphs are authored in this repository. Font-mode handwriting uses Patrick Hand, Kalam, and Caveat under the SIL Open Font License (see [attribution](assets/ATTRIBUTION.md)). Portraits are public-domain paintings via Wikimedia Commons; see [attribution](assets/ATTRIBUTION.md) and `assets/manifest.json` for provenance. tldraw and self-hosted assets retain their [SDK license](public/tldraw/LICENSE.md). Historical content is based on [MacTutor’s calculus history](https://mathshistory.st-andrews.ac.uk/HistTopics/The_rise_of_calculus/), acknowledging earlier work alongside Newton and Leibniz.
