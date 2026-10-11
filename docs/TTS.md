# Indonesian narration

Optional dependency, isolated from the TypeScript app:

```sh
python3 -m venv .venv
.venv/bin/pip install edge-tts==7.2.8
TTS_PYTHON=.venv/bin/python npm run tts
npm run lesson:compile
npm run export:flagship
```

Initial provider: Edge TTS, voice `id-ID-GadisNeural`. The flagship uses +15% provider speaking rate; this is not a claim about timestamp accuracy. No API key is required. The adapter can be replaced by Azure, Google, ElevenLabs or recorded audio by implementing `NarrationProvider.synthesize` with file, actual duration, hash and optional word boundaries. Do not put credentials into lesson metadata or Vite environment variables.

Each narration action is cached separately under `output/audio/cache` using SHA256 of text, provider version, voice and speaking rate. Remove a particular cache pair to regenerate one segment; `npm run tts -- --regenerate` regenerates all. Regeneration reuses all other cached segments. Provider-process errors include a meaningful stderr tail. FFprobe measures each real MP3 duration; the provider’s word offsets are checked for order and containment, rather than assumed accurate. Per-segment starts and silence are authoritative.

`output/audio/aligned.lesson.json` and `public/flagship.lesson.json` contain the resulting time-warped lesson. `output/audio/narration-manifest.json` records status, actual clip durations, schedule and normalization. `output/audio/calculus_flagship.wav` is the mixed 48kHz normalized master (ignored by Git); the narrated MP4 is AAC 192kbps with identical video framing/timing to the silent MP4.

The exporter uses the aligned lesson only after successful generation and compilation. A mismatch between audio and recording duration prevents a misleading mux. TTS failures write an unavailable manifest, and silent export can proceed from the unaligned lesson. There is no placeholder speech or fabricated successful service response.

To regenerate one segment explicitly: `TTS_PYTHON=.venv/bin/python npm run tts -- --segment motion-4`. Other segments retain their content-hash cache.
