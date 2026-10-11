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
