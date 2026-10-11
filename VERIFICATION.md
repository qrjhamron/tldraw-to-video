# Verification report

The delivered artifact is [calculus_intro_180s.mp4](output/calculus_intro_180s.mp4). It was rendered from the supplied native tldraw recording, fully decoded, validated and visually inspected. No drawing geometry was sourced from screenshots. No audio, typewriter text, slideshow images or AI video are used.

## Media validation

| Check | Result |
|---|---|
| Resolution | 1920 × 1080 |
| Codec / pixel format | H.264 / yuv420p |
| Frame rate | 30/1, both nominal and average |
| Duration | Exactly 180 seconds, stream and container |
| Decoded frames | 5,400 |
| Audio / other streams | None |
| Presentation timestamps | All 5,400 unique times equal i/30 within container rounding |
| Full FFmpeg decode | Passed without errors |
| File size | 3,992,302 bytes |
| Video SHA-256 | `fe68da1bb9362e002e2a678a3d59a6d70ceda1f05e8beec4295e261a18d82092` |

The final video frame starts at 179.9667s. The recording's last event occurs at 179.1456s, so every lesson event is included before the final sampled frame. The export evaluated explicit times with backpressure, rather than using real-time capture. Rendering took 412.2 seconds; encoding time never defined lesson timing.

## Native geometry and events

SDK 5.5.2, recording schema v1. The initial document includes the native SDK schema and session. The event stream contains **9,222** ordered events: 1,264 creates, 6,521 updates, 1,264 completions, 16 camera keys, 18 other deletions and 139 eraser deletions. Every lesson shape is a native `draw` shape. All lesson events and shape metadata explicitly declare generated provenance. Pressure in the lesson is synthetic, not claimed to come from a human stylus.

Recording SHA-256: `09eac988331d3b3c467cd94052028bb5be7dd0bda1c9fc7026b3d395296e9ef8`.

The supported recorder hooks capture committed native records synchronously, preserving compressed paths, point dimensions, pressure, styles and transforms. The browser test uses actual pointer events through the native draw and eraser tools. Its separate pressure fixture writes a known pressure sequence programmatically to test exact preservation; that fixture is not a claim of physical pen capture.

## Automated checks

- **8 engine tests passed:** version/order validation, native point and pressure preservation, incremental geometry prefixes, checkpoint equality and boundary ordering, erasure, camera interpolation, frame-independent event folding, and vector path reveal.
- **4 browser verification groups passed:** identical native documents and exported pixels after scrubbing; editor replay equivalence at 24/30/60 FPS; native pointer input and multiple same-frame commits; recorder/replay equality for pressure, styling, transformations, native erasing, undo/redo and camera changes.
- **8 control scenarios passed:** play/pause/resume, 4× speed, restart, timeline end seek, chapter navigation, viewport-independent drawing export, start/stop pointer recording and JSON import.
- **Media checks passed:** full decode, codec, dimensions, both frame rates, exact duration, no audio, unique presentation timestamps and all logical event times before the final frame.
- **Export reproducibility passed:** the final source reproduced all 16 sampled export JPEG SHA-256 values exactly from the same recording.
- **Production browser check passed:** the built application reproduced all 16 export frame hashes exactly, and its MP4 download returned HTTP 200 with the correct 3,992,302-byte video.
- **Build passed:** TypeScript checking and Vite production build. Vite reports the expected large SDK bundle advisory; this is not a build failure.
- **Browser errors:** none in successful recording, control, export or reproducibility runs.

Machine evidence is in `output/browser-validation.json`, `output/controls-validation.json`, `output/media-validation.json`, `output/progressive-stroke-validation.json`, `output/export-reproducibility.json` and `output/export-manifest.json`.

## Proof of progressive strokes in the MP4

Exact decoded video frames 0, 1, 2 and 3 show one growing opening stroke, while the matching native record has point counts **2, 8, 14 and 21**. Decoded ink-pixel counts increase **44 → 160 → 302 → 434**. At frame 6, the path has 27 points and 826 ink pixels. This checks the encoded movie, not just a DOM preview or event plan. The first four samples are selected by exact frame number.

## Visual inspection

Native exports were inspected while authoring, and PNGs decoded from the finished MP4 were inspected at multiple timestamps. Representative decoded files are in `output/inspection/decoded`.

| Timestamp | Observed content |
|---|---|
| 19.5s | Legible introduction contrasting rate and accumulation |
| 34s | Coordinate axes and progressively drawn parabola |
| 50s | Q moving toward P and the rotating orange secant |
| 59.6s | Red tangent and instantaneous rate 2 at x=1 |
| 96s | Correct difference quotient, expansion and derivative 2x |
| 114.5s | Correct worked derivative value 7 at x=2 |
| 118s / 120s | Work removed stroke by stroke, then a clear board |
| 146.5s | Refined native rectangles approaching the area under y=x |
| 157s | Green hatched area over [0,2] and definite-integral notation |
| 172.5s | Integral equals 2, checked using triangle area |
| 179.5s | Complete concise Indonesian visual summary |

These inspections caught and corrected overlapping introductory/derivation labels, misplaced integral evaluation bounds, and a Q annotation that needed to follow the moving marker. Final decoded frames show readable composition without application controls. Board regions are connected by continuous pans, with a modest smooth zoom in the secant demonstration.

## Explicit SDK limits

The native eraser removes entire shapes. Partial path erasure is not supported by SDK 5.5.2 and is not simulated. The generated sweep schedules equivalent native deletions with the eraser active; cursor and temporary selection/erase previews are excluded from document-only output. Input coalesced inside native atomic transactions cannot be recovered. The recorder captures every committed record state. Camera interpolation between observed human samples is an estimate. Canvas panning is unbounded; zoom retains the SDK's standard finite range to avoid its oversized hatch-pattern texture allocation at extreme min/max ratios.

A valid tldraw SDK license is required for production deployment as described in the README. The local editor's default license notice is preserved. The MP4 uses the official SVG export API for drawing-only output.
