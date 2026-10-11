# Deterministic export

```sh
npm ci
npx playwright install chromium
# Install FFmpeg / FFprobe through your system package manager.
npm run test
npm run build
npm run tts                 # optional; silent export works without it
npm run lesson:compile
npm run export:flagship
npm run verify:flagship
```

Outputs: `output/calculus_flagship_silent.mp4`, plus `output/calculus_flagship_narrated.mp4` when narration generation and mux succeed. Resolution 1920×1080, 30 FPS, libx264 CRF17, yuv420p, Rec.709 tags, no application controls. The exported recording and manifests are alongside the videos. Assets for playback/download are copied to `public`.

The exporter connects to `STUDIO_URL` (default localhost:5173), starts Vite if absent, and opens real Chromium. Every frame time is `frame * 1000 / 30`. The native replay engine reconstructs shapes before SDK drawing-only SVG export, then Chromium antialiases vectors into a 1920×1080 raster and FFmpeg encodes. Handwritten geometry comes from points, never from screenshots. Still frames during narration/pauses are legitimate logical samples.

Rendering progress reports frame count, lesson time and elapsed time after each ten-second chunk. Restart the same command to resume. `output/render-cache-v3` contains completed chunks, SHA256 metadata and a signature tying them to the recording and render settings. Incomplete chunks are rebuilt. A changed signature causes an explicit failure; move the cache directory aside before rendering changed content. Do not reuse chunks from different recordings. Final concat uses `-c copy`, preserving encoded frames. Media verification fully decodes the final files and validates codec, duration, frame count, dimensions, FPS and audio presence.

The legacy pipeline remains `npm run export` / `npm run verify:media`, explicitly selecting `?lesson=intro`. The 180-second original lesson and its media remain available.

Chromium JPEG rasters use full-range YCbCr with an sRGB transfer function. The encoder explicitly uses FFmpeg `zscale` to convert transfer and matrix to limited-range Rec.709 before tagging H.264; tagging alone would not convert the colors. FFmpeg must include the `zscale` filter (`ffmpeg -filters`).

## Other lessons and recordings

```sh
npm run export:flagship -- --lesson examples/algebra.lesson.json --output output/algebra_demo.mp4 --cache output/render-cache-algebra-demo
npm run export:flagship -- --recording path/to/project.json --output output/custom.mp4 --cache output/render-cache-custom
```

`--lesson` compiles the semantic source through the real Editor; `--recording` imports a versioned project. These custom exports do not mux flagship narration. The command retains its flagship name for compatibility. Each custom output receives its own `.manifest.json`. A final event at the duration boundary receives a sampled frame and one frame of final hold, so it is never omitted.

Use a production preview (`npm run build`, then `npx vite preview --port 5174`) with `STUDIO_URL=http://localhost:5174` for long exports. Wait until the build finishes before opening Chromium. Editing source during a development-server export may reload its browser; completed chunks remain recoverable.

For validated cache reuse after a content edit, save the original recording before editing, then run `npx tsx scripts/rekey-render-cache.ts CACHE OLD_RECORDING NEW_RECORDING`. It checks the old signature and chunk bytes, canonically compares native state, effective events, all camera keys, theme and timing for every chunk, and moves affected chunks aside. SDK user profiles are excluded because the native renderer does not consume them. `output/cache-reuse-validation.json` records the decision and input hashes. Never change cache signatures by hand to bypass validation.
