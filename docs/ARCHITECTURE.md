# Architecture

Content (`story/types`, lesson definitions) → camera guard (`director`) → math/handwriting geometry → scene compiler → native Editor operations → event-sourced recording → checkpoint replay → SDK SVG → Chromium raster → resumable FFmpeg H.264.

The semantic layer contains chapters, objectives, narration, worked examples, questions and pauses. It contains no DOM or encoder calls. The compiler accepts every typed action, creates real pressure-aware `draw` records, uses a virtual monotonic clock, and captures results through `Recorder`. Ordered tasks resolve ties with a stable insertion number. Stroke creation and incremental updates are distinct committed editor operations. Generation is deferred past the SDK onMount transaction, which would otherwise risk coalescing atomic store hooks.

`handwriting/engine` decodes licensed single-line paths and custom symbols. Variations are seeded, restrained and reproducible. Every pen-down subpath is a draw shape, with pen-up pauses. Reveals follow sampled arc length with minimum-jerk entry/exit velocity; camera and pen time are absolute, never integrated from rendered frames. `math-layout` composes expression trees into strokes and fraction bars; it does not invoke an outline font or typewriter.

`math/models` supplies polynomial and sine evaluation, analytic derivatives/integrals, secants and Riemann sums. `math/geometry` projects those values into axes, curves, points, slopes, triangles, hatching and rectangles. Arbitrary expression evaluation is intentionally absent. Use a typed model rather than JavaScript strings.

Camera framing computes a safe viewport around authored explanation bounds. The predictive guard plans a camera move before writing that would fall outside the current frame; authored context framing takes precedence. Chapter moves take 2.8 seconds, and the integral derivation moves to an adjacent workspace. `cameraAt` evaluates eased translation and logarithmic zoom at any requested time. No camera depends on animation-frame history.

Recordings retain schema v1 and SDK 5.5.2. Optional metadata adds lesson ID, seed and narration segment slots. Human recordings retain original pressure encoding and provenance. Store hooks capture actual undo/redo outcomes. Editing materializes clip initial states and emits document diffs between reordered segments. Existing draw records can be extracted for handwriting reuse. Static SDK editor snapshots can be imported through `loadSnapshot`; they cannot retrospectively recover missing pen timing.

TTS is a process adapter behind a TypeScript provider contract. Cache identity includes text, provider version, voice and rate. Every MP3 is FFprobed; word boundary range/order is checked, but word timestamp perceptual accuracy is not assumed. Narration windows expand if a clip plus safety margin is too long, and all affected visual timings follow the same piecewise time warp. This can extend the lesson; authoring rejects a flagship longer than ten minutes. FFmpeg mixes measured segments at aligned times, adds explicit silence, and normalizes loudness. Credentials are never needed by Edge TTS or exposed in the app.

The offline exporter steps every logical frame at 30 FPS. Completed ten-second H.264 chunks have frame-count metadata and content hashes. A cache signature rejects incompatible recordings. Restart reuses only hash-verified completed chunks; partial chunks are regenerated. FFmpeg concatenation copies compressed video without another lossy pass. The final timestamp may be rounded up by less than one frame when a measured audio timeline does not end on a frame boundary. Audio is padded to the same final duration. Repeated still frames during pauses are intentional; every logical event is folded before each requested frame.

Limitations: whole-shape native erasure, finite SDK zoom bounds, polynomial/sine analytic models, no general TeX parser, optional external TTS availability, editing of cut narration omits partially cut sentences until regenerated. The UI edits copies; it does not promise arbitrary audio waveform editing. Offline SVG antialiasing is Chromium-dependent, so SDK and browser versions must stay pinned for reproducibility.

## Native SVG fragment adapter

The flagship draw-only fast path uses the public `ShapeUtil.toSvg` method and `EditorProvider`, serializing the SDK's own pressure-aware renderer with React's static SVG serializer. This avoids mounting a second reactive export tree on every frame. Immutable fragments are cached by native record identity and theme; transforms and opacity come from the editor. Only unfilled top-level native draw shapes use this path. Other documents retain generic `Editor.getSvgString`. The browser QA compares rasterized results against the official generic exporter. This is an export adapter around the SDK renderer, not a custom freehand algorithm. Active strokes are regenerated from actual partial point records each frame; completed-stroke caching does not cache or mask whole words.

Offline rendering uses the supported `Canvas` component override to suppress the interactive React canvas tree while retaining the real Editor and native shape utilities. The normal application keeps the SDK canvas. Theme/option/component objects are stable references; recreating them can reinitialize the editor. A browser seek-equivalence test exposed this lifecycle bug during development and verifies the fix. Generated z-order indices are explicitly assigned deterministic valid fractional keys instead of relying on the SDK's jittered default index generation.

## Autonomous directing stack (4.0)

`math/ast` + `math/transform` add a semantic expression AST (stable term
ids, strict parser, structural expand/factor/simplify/substitute/balance/
solve/complete-square/cancel) and `math/verify` classifies every rewrite by
differential numeric testing over a deterministic sample grid:
`equivalent`, `conditional` (domain change), `implication` (one-way rules
such as squaring), `approximation`, `heuristic` (shortcuts valid only under
stated conditions), or `invalid`. `verifyTrick` checks mental-math shortcuts
against exact arithmetic on representative and edge cases. Rendering lowers
the AST to colored `MathExpr`, preserving per-node ink.

`director/plan` defines `LessonPlan`/`ScenePlan`/`Beat` (purpose, pattern,
palette, narration, equations, lines, graph/diagram specs, budget);
`director/templates` lowers scenes to timed actions with measured layout
(word-wrap, equation shrink-to-fit, adaptive heights, reason annotations,
per-pattern composition, budget scaling); `director/layout` measures real
text/equation bounds, checks ink contrast per theme, and reserves regions;
`director/inspect` statically reports overlap/clipping/contrast issues.

`audio/speech` holds Indonesian math reading rules (`x²` → "x kuadrat",
`√144`, `2³`, `∫ 2x dx`, `SPLDV`) and measured-vs-estimated cue alignment;
`audio/edge` is the reusable Edge TTS provider (`id-ID-GadisNeural`).
`tricks/` is the 50-technique flagship catalog plus chapter/showcase
assembly; `scripts/compile-tricks.ts`, `narrate-tricks.ts`, and
`export-tricks.ts` run the full pipeline from catalog to narrated MP4.
`src/mcp/math-tools.ts` + `director-tools.ts` expose all of this over MCP
(see [MCP tools](MCP_TOOLS.md)); `scripts/render-preview.ts` renders
deterministic preview frames through headless Chromium for visual QA.
