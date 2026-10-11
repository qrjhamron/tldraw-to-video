# MCP tools

Stdio server: `npm run mcp` (`scripts/mcp-server.ts`, package
`tldraw-visual-studio` 4.0.0). Pure implementations in `src/mcp/tools.ts` are
shared by the server and unit tests.

Lesson tools take a `stroke-lesson` JSON object plus params and return the
updated lesson (inputs are cloned; originals are untouched). All tools validate
through `validateLesson`, so invalid placements, unknown assets, bad themes, or
actions outside chapter bounds fail with an error instead of corrupt output.

| Tool | Purpose |
| ---- | ------- |
| `add_image` | Place a registered asset (`assetId`, `x/y/w/h`, `rotation`, `opacity`, `at`, `duration`, `chapterId`, `altText`). |
| `add_portrait` | Place `newton`/`leibniz` at natural aspect ratio plus a dated attribution caption (disable with `withCaption: false`). |
| `place_asset` | `add_image` with explicit `crop` and `layer`. |
| `animate_image` | `reveal`/`fade`/`slide`/`zoom`/`mask`/`cameraFollow` on a placed group id. Target must exist in the chapter. |
| `annotate_image` | Handwritten caption/label with optional arrow (`arrowFrom`/`arrowTo`), stroke or `font`. |
| `set_handwriting_style` | Lesson default (`role`, `font`) or chapter action when `chapterId`/`at` is given. Returns the honest style label. |
| `set_canvas_style` | Lesson default theme or `setCanvas` chapter action; switches backgrounds without rebuilding visuals. |
| `create_visual_comparison` | Side-by-side lesson over identical Indonesian content with configurable left/right presets and theme. |
| `list_assets` | Registry records with sha256 and provenance. |
| `inspect_asset` | One record by id or file path. |

Example (via any MCP client): call `add_portrait` with the flagship lesson,
`who: "newton"`, `x: 150`, `y: 375`, `w: 200`, `chapterId: "history"`, then
compile the returned lesson in the studio to preview.

## Math engine and director tools (4.0)

Pure implementations in `src/mcp/math-tools.ts` and
`src/mcp/director-tools.ts`. Math tools parse into the semantic AST
(`src/math/ast.ts`) with stable term ids; every transform is numerically
verified and reported as `equivalent`, `conditional`, `implication`,
`approximation`, `heuristic`, or `invalid` — never silently upgraded.

| Tool | Purpose |
| ---- | ------- |
| `create_math_expression` | Parse `source` into the AST; returns text + variables. |
| `transform_math_expression` | Apply `expand`, `factor-common`, `factor-diffsq`, `factor-trinomial`, `simplify`, `substitute`, `balance`, `solve-linear`, `complete-square`, or `cancel` (`arg`/`operand` for the binary ops); each step carries a verdict + term correspondence. |
| `validate_math_steps` | Verify a chain of `{source, rule?, conditions?}`; `ok` is false if any step is `invalid`. |
| `math_expression_layout` | Lower a source to `MathExpr` layout JSON (fractions, scripts, roots). |
| `animate_math_graph` | Append `drawAxes`/`drawGraph`/`animateCurve`/`animateSecant`/`animateTangent`/`shadeArea`/`drawRiemannRectangles`/`plotPoint` actions from one graph spec. |
| `animate_geometry` | Append `diagram` construction steps (`rect`, `ellipse`, `circle`, `arrow`, `areaModel`, `fractionBar`, `triangle`, `rightTriangle`, `projection`, `vector`). |
| `set_semantic_colors` | Split a string `write` action into per-symbol painted `MathExpr` colors; warns on low contrast. |
| `plan_lesson_scenes` | Validate a `LessonPlan` (ids, beats, budgets) and report per-scene estimates. |
| `direct_scene` | Lower a `ScenePlan` to timed actions, cues, checkpoints, and QA warnings (`seed` for determinism). |
| `auto_layout_scene` | Direct a scene and report overlaps, out-of-frame regions, and per-beat camera frames. |
| `validate_scene_layout` | Static QA over a compiled lesson (overlap, clipping, contrast, reading order). |
| `reframe_camera` | Append a `moveCamera` framing explicit `bounds` or measured `actionIds`. |
| `align_narration` | Synthesize Indonesian narration (`id-ID-GadisNeural`), then warp visuals to measured clip durations. Returns `measured: true` clips. |
| `inspect_timeline` | Summarize chapters, action counts by type, and narration coverage. |
| `run_visual_qa` | Layout QA plus narration-reference and camera-coverage checks. |
| `render_lesson_preview` | Compile the lesson in headless Chromium and render 1–12 frames at `timesMs` (`scripts/render-preview.ts`). |

`align_narration` and `render_lesson_preview` shell to the same scripts the
repo gates use, with bounded timeouts and `output/`-contained paths.
