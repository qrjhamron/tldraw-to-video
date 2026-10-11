# Authoring lessons

Start with `examples/algebra.lesson.json`, or import a `Lesson` TypeScript object. JSON lessons are accepted by the application’s Import JSON button. `examples/calculus-flagship.lesson.json` is the full Indonesian content definition; the renderer contains no calculus-specific branch.

A lesson declares a stable ID, version, deterministic seed, total duration in milliseconds, and chapters. Chapters declare their own canvas origin, absolute start, local duration, objectives and actions. Action `at` and `duration` are local milliseconds; action IDs must be unique. Validation rejects overlapping chapter ranges, invalid durations and out-of-range actions.

Supported semantic actions: write, drawAxes, drawGraph, plotPoint, animateSecant, animateTangent, shadeArea, drawRiemannRectangles, draw, moveObject, erase, highlight, underline, crossOut, moveCamera, zoomCamera, pause, narrate. `group` associates multiple marks for later erasure. `erase.target` references that group or an earlier action ID. Keep erasure after all point updates of that group complete.

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
