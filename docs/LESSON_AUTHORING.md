# Authoring lessons

Start with `examples/algebra.lesson.json`, or import a `Lesson` TypeScript object. JSON lessons are accepted by the application’s Import JSON button. `examples/calculus-flagship.lesson.json` is the full Indonesian content definition; the renderer contains no calculus-specific branch.

A lesson declares a stable ID, version, deterministic seed, total duration in milliseconds, and chapters. Chapters declare their own canvas origin, absolute start, local duration, objectives and actions. Action `at` and `duration` are local milliseconds; action IDs must be unique. Validation rejects overlapping chapter ranges, invalid durations and out-of-range actions.

Supported semantic actions: write, drawAxes, drawGraph, plotPoint, animateSecant, animateTangent, shadeArea, drawRiemannRectangles, draw, moveObject, erase, highlight, underline, crossOut, moveCamera, zoomCamera, pause, narrate, addImage, animateImage, annotateImage, setCanvas, setHandwriting. `group` associates multiple marks for later erasure. `erase.target` references that group or an earlier action ID. Keep erasure after all point updates of that group complete.

Lessons may set a default `canvasTheme` (`whiteboard`, `graph`, `notebook`, `darkboard`) and default `handwriting` (`role`, `font`). `setCanvas` switches themes mid-lesson without rebuilding visuals; `setHandwriting` changes chapter defaults for later actions. `addImage`/`place_asset` place registered assets from `assets/manifest.json` (PNG/JPEG/WebP/SVG with provenance); `animateImage` applies `reveal`/`fade`/`slide`/`zoom`/`mask`/`cameraFollow`; `annotateImage` layers handwritten captions and arrows above images. See [visual assets](VISUAL_ASSETS.md), [canvas themes](CANVAS_THEMES.md), and [MCP tools](MCP_TOOLS.md).

Use mathematical expression trees for layout:

```ts
row("f'(x) =", {
  type: 'limit', under: 'h → 0',
  body: fraction('f(x+h) - f(x)', 'h')
})
script('x', '2', 'i')
({ type: 'integral', lower: '0', upper: '2', body: 'x^2 dx' })
({ type: 'root', body: 'x+1' })
```

ASCII strings and authored Greek/math glyphs become ordered centerline strokes. `^` raises the next character only; use the script tree for multi-character exponents and subscripts. Multi-line strings use `\n`; separate aligned rows can share their x coordinate. The expression tree is not a symbolic algebra engine: author correct identities and test them against mathematical models.

For graphs, specify world-domain x/y limits and page rectangle coordinates. A polynomial uses ascending coefficients: `[0,0,1]` means x². Secants, tangents and moving point heights are calculated from the same function model. Midpoint Riemann rectangles are computed from their partition. All function and diagram marks are native strokes.

Recommended frame: 1640 × 920 page units with 64-pixel screen margin at 1080p. Headings around 42 units, equations 34–52, annotations at least 28. Predict camera moves before writing, keep derivations visible, and avoid zooming out to an unreadable whole document. `write.maxWidth` rejects oversized expressions instead of silently clipping. Use a new workspace for long derivations.

Narration is an action with text and an allocated slot. `visual` optionally identifies the associated visual action for authoring tools. Word boundaries are advisory. Speech length is measured and the complete visual/narration schedule is warped together when needed. Leave a deliberate thinking pause after questions. Avoid inserting unrelated application trivia; retain a single worked model through the conceptual sequence.

Compile with `window.studio.compile(lesson)` in the browser or import JSON. The CLI exports authored examples with `npm run lesson:compile`. Inspect native pressure/point data through the stroke inspector, then scrub through the timeline before exporting.

`write.handwritingStyle` selects `title`, `heading`, `explanation`, `annotation` or `math` explicitly; `write.handwritingFont` selects `stroke` (default) or `Patrick Hand`/`Kalam`/`Caveat` font mode. Otherwise the compiler selects a profile from expression structure, height and notation. Stroke mode uses authored pen-centerline glyphs with seeded variation, pressure and stroke timing; unsupported glyphs are errors, never silent text substitution — provide a supported symbol or extend `src/handwriting/glyphs.ts`. Font mode renders honestly labeled native text shapes (single-line text only; structured math stays in stroke mode). See [the handwriting audit and comparison](HANDWRITING.md) for construction and visual verification.

A `draw` action can also supply `strokes: InkPath[]` to retain existing native point pressure and weight (set `points: []` when using it). This is used by the comparison fixture to preserve the previous engine's geometry. Ordinary coordinate-only diagram actions continue to use `points`.

## Scene director and trick catalog (4.0)

For long-form lessons, author a `LessonPlan` (`src/director/plan.ts`) instead
of raw actions: objectives, scenes with a documented pedagogical purpose, one
of seven visual patterns (`derivation`, `compare`, `graph`, `diagram`,
`bars`, `factor`, `ask`), beats with narration + equations + lines, an
optional semantic palette, and optional `graph`/`diagram` specs. Equation
sources use the strict parser (`2x^2 + 3(x+1) = 14`, `sqrt(144)`,
`log(100, 10)`); `^` in equations builds real superscripts, while free lines
must stay within the glyph set (no `^` — write "kuadrat").

`directScene` lowers a scene deterministically: measured word-wrap and
equation shrink-to-fit keep every mark inside the 1640×920 safe frame,
adaptive heights fit tall scenes, reason annotations sit beside their
equations, and `budgetMs` compresses scenes that must fit a slot (the
60–90s showcase budgets each scene to ~20s). Layout QA reports overlaps,
clipping, and contrast as warnings; `run_visual_qa` fails on errors.

The 50-trick flagship (`src/tricks/ch1..ch5.ts`) shows the full pipeline:
each trick carries a verified worked example (every consecutive pair checks
`equivalent`/`conditional`/`implication`/`approximation`/`heuristic`, never
`invalid`), numeric shortcut checks against exact arithmetic, Indonesian
narration, and a visual strategy. `scripts/compile-tricks.ts` assembles the
opening, five chapters, and showcase; `scripts/narrate-tricks.ts`
synthesizes `id-ID-GadisNeural` audio and warps to measured durations;
`scripts/export-tricks.ts` renders MP4 and muxes narration. Run
`npx tsx --test tests/tricks.test.ts` to revalidate all 50 techniques.
