# 2.0 verification report

Verified in this workspace on 2026-10-11 using tldraw 5.5.2, Node 24.21.0, Playwright 1.64.0 / its Chromium, and FFmpeg 6.1.1. The original 180-second recording/video and working recorder/replay were retained. The audit is in [AUDIT.md](AUDIT.md).

## Delivered media

| File | Video | Duration | Frames | Audio |
|---|---|---|---|---|
| `output/calculus_flagship_silent.mp4` | H.264, 1920×1080, 30 FPS, yuv420p, Rec.709 | 577.166667 s | 17,315 | None |
| `output/calculus_flagship_narrated.mp4` | Identical H.264 video stream | 577.166667 s | 17,315 | Indonesian Edge TTS, AAC |
| `output/algebra_demo.mp4` | H.264, 1920×1080, 30 FPS, Rec.709 | 25.000000 s | 750 | None |

The flagship logical timeline is 577,160 ms. Rounding to a complete 30 FPS frame extends the container by 6.667 ms. Narration is voice `id-ID-GadisNeural`, +15% provider speaking rate. Actual clip durations expanded the original 540-second lesson to fit speech. Each MP4 exists, was fully decoded with FFmpeg, and passed FFprobe checks. Every video PTS equals its frame index divided by 30. Silent/narrated elementary H.264 SHA256 hashes are equal, proving that muxing preserved the exact video.

[Media validation](../output/flagship-media-validation.json), [checksums](../output/artifact-checksums.json), [export manifest](../output/flagship-export-manifest.json), and [algebra validation](../output/algebra-media-validation.json) contain machine-readable evidence.

## Application and engine checks

`npm test`: **29 passed, zero failed**. `npm run build`: strict TypeScript and production Vite build passed. The SDK bundle produces a size advisory; no build errors occurred.

Real Chromium checks passed:

- `test:browser`: native pointer recording, consecutive commits, styles, pressure, transforms, erasure, undo/redo, cameras, checkpoint pixel equivalence and 24/30/60 FPS replay equivalence. Pointer fixtures are explicitly generated, despite their retained legacy `human-test` filename.
- `test:controls`: play/pause/resume, speed, restart, timeline/chapter seeking, recording/import and viewport-independent export.
- `test:v2:browser`: eight-chapter native generated recording, checkpoint document/pixel equivalence, progressive point paths, reusable non-calculus compilation, and recorded/replayed themes.
- `test:editing`: native inspection, materialized trimming, retiming, chapter reorder, semantic lesson import, native ink reuse with provenance and snapshot import with unknown acquisition provenance.

The flagship contains **24,071 ordered events**, eight chapters and 23 narration slots. Browser inspection found 2,341 growing encoded point-prefix updates. All handwritten lesson shapes are native `draw` records, with explicit generated provenance. The DrawShapeUtil SVG fragment adapter matches the SDK generic exporter: mean channel difference 0.001071/255, zero pixels above the comparison's significant-difference threshold.

Unit coverage includes b64 quantization bounds and preservation, seeded handwriting, mathematical layout, analytic derivatives/integrals, secants, Riemann partitions, affine transforms, optimization, camera framing/interpolation, seeking/ties/checkpoints, editing, narration time warping, malformed inputs and cache equivalence. The moving car follows the same quadratic model as its position graph. Cancellation marks come from the equation layout and cancel the two x² terms; intermediate finite quotients are labeled q(h).

Reports: [units](../output/unit-validation.json), [native browser](../output/browser-validation.json), [controls](../output/controls-validation.json), [2.0 browser](../output/v2-browser-validation.json), [editing](../output/editing-browser-validation.json).

## Progressive ink and visual review

Twenty representative decoded frames were extracted, including chapter interiors/ends and four consecutive frames at the beginning of handwriting. At 3.000, 3.033, 3.067 and 3.100 seconds, native point counts grew **2 → 15 → 20 → 33**, while decoded dark ink pixels grew **21 → 195 → 273 → 441**. The first two samples contain the same single native shape with a growing point path. This verifies actual progressive geometry in the delivered video, rather than static scene transitions or masked whole words.

Decoded frames from all eight chapter endings were visually inspected, along with Riemann refinement, derivative algebra, the final narrated recap, and a close-up of cancellation marks. Inspection checked legibility, formula spacing, clipping, colors and absence of application UI. Issues found during production—editor reinitialization from unstable React options, a stray earlier heading at the integration workspace boundary, cramped superscripts, car easing inconsistent with its mathematical model, and ambiguous algebra/cancellation placement—were corrected and the affected footage rebuilt.

Images are in [decoded frames](../output/flagship-inspection/decoded), with [derivative](../output/flagship-inspection/final-derivative.png), [Riemann rectangles](../output/flagship-inspection/final-riemann.png), [final recap](../output/flagship-inspection/final-summary.png), and [stroke inspector](../output/flagship-inspection/studio-inspector.png).

This is representative visual inspection, not a claim that every frame or every spoken word was manually reviewed. Smooth camera behavior is also checked through deterministic interpolation tests and framing inspection.

## Narration and rendering reliability

All 23 real MP3 clips were hash-verified and re-probed, fit their aligned windows, and have ordered/range-validated provider word boundaries. Measured normalized master loudness is **−16.06 LUFS integrated**, **−1.49 dBTP**. [Alignment evidence](../output/audio/alignment-validation.json) and [loudness evidence](../output/audio/loudness-validation.json) are retained. Word-level perceptual timestamp accuracy is not assumed; segment starts and measured audio durations drive synchronization.

A complete export restart reused **all 17,315 frames**, rendering zero new frames. Content changes were validated using canonical native state/event/camera inputs and chunk SHA256 hashes; affected chunks were rebuilt. SDK user profiles and camera sequence-number shifts are nonvisual and excluded from render-input comparisons. [Cache decisions](../output/cache-reuse-validation.json) retain the hashes and decisions. [First final render](../output/flagship-first-render-manifest.json) preserves the first-pass accounting; the main manifest records the full resume test.

## Scope boundaries

Native erasure is whole-shape; the pinned SDK does not supply partial-path erasure. No white paint overlays imitate it. Analytic models currently cover polynomials/sine, mathematical layout is a typed expression tree rather than general TeX, and imported static SDK snapshots cannot recover missing pen timing. Unverified imported acquisition provenance is `unknown`. Cut narration requires regeneration; timing edits do not promise arbitrary waveform editing. The infinite canvas has no project bounds, but the SDK retains practical zoom limits. TTS remains an external optional service. These boundaries are explicit in the README and architecture/authoring documentation.
