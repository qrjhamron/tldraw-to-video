# Visual asset system

Placed images are native tldraw `image` shapes backed by `asset` records on the
infinite canvas. Supported formats: PNG, JPEG, WebP, SVG.

## Registry and provenance

- Source files live under `assets/`; served offline from `public/assets/`.
- `assets/manifest.json` pins bytes, sha256, dimensions, and provenance
  (title, author, license, source URL) for every asset.
- `src/assets/catalog.ts` embeds the same records for the synchronous browser
  compiler; `tests/visual.test.ts` fails if the two drift apart.
- Online images are never assumed free to reuse. Every asset needs an explicit
  license; `loadManifest` and the compiler refuse `unknown` licenses.
- Portraits: Newton (Kneller 1689) and Leibniz (Francke ca. 1695) paintings are
  public domain; photographic reproductions via Wikimedia Commons (see manifest
  for file pages). Diagrams in `assets/*.svg` are authored for this repository
  (CC0-1.0).

## Safety

- `assertWorkspaceSafeAssetPath` accepts only `assets/<name>.<ext>` with safe
  filenames and supported extensions. Absolute paths, `..`, backslashes, URL
  schemes, and data URLs are rejected.
- `sanitizeSvg` strips scripts, event handlers, foreign objects, embedded
  frames, and external references from untrusted SVGs, throwing when it cannot
  make the input safe. Authored diagrams are sanitized atverify time.

## Placement and effects

`addImage`/`placeAsset` map to shape `x/y/w/h`, `rotation`, `opacity`, `crop`,
and page order (layering); `altText` defaults to the asset title. Asset ids and
shape ids derive deterministically from lesson + action ids, so compilation is
reproducible.

`animateImage` effects, all deterministic and seekable:

- `reveal`: fade plus small slide-in.
- `fade`: opacity interpolation between `fromOpacity`/`toOpacity`.
- `slide`: translate by `dx/dy`.
- `zoom`: scale around the shape center.
- `mask`: wipe reveal via animated `crop`.
- `cameraFollow`: smooth camera move to `bounds` after the effect.

`annotateImage` writes a handwritten caption/label (stroke or font mode) plus an
optional three-stroke arrow, layered above the image by creation order.

## Export

tldraw already inlines same-origin images as data URLs in `getSvgString`, so
offline `<img>` rasterization stays faithful. `src/engine/svg-inline.ts`
additionally resolves any remaining `/assets/*` hrefs and handwriting font
vars; failures throw rather than silently dropping the image.
