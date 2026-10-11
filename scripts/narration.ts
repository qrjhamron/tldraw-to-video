import { writeFile, mkdir } from "node:fs/promises";
import { flagshipLesson } from "../src/story/flagship";
import {
  alignNarration,
  narrationSchedule,
  type AudioClip,
} from "../src/audio/timeline";
import { EdgeNarration, command } from "../src/audio/edge";
export { EdgeNarration };
const lesson = flagshipLesson(),
  provider = new EdgeNarration({
    regenerate:
      process.argv.includes("--regenerate") || process.argv.includes("--segment"),
  }),
  clips: AudioClip[] = [];
await mkdir("output/audio", { recursive: true });
try {
  for (const c of lesson.chapters)
    for (const a of c.actions) {
      if (a.type !== "narrate") continue;
      console.log(`Narration ${a.id}: ${a.text.slice(0, 65)}…`);
      clips.push(
        await provider.synthesize({
          id: a.id,
          text: a.text,
          voice: "id-ID-GadisNeural",
          rate: "+15%",
          outputDir: "output/audio/cache",
        }),
      );
    }
  const aligned = alignNarration(lesson, clips),
    schedule = narrationSchedule(aligned, clips);
  if (aligned.duration > 600000)
    throw Error(
      `Narration requires ${(aligned.duration / 1000).toFixed(1)}s; revise content to stay under 10 minutes`,
    );
  await writeFile(
    "output/audio/aligned.lesson.json",
    JSON.stringify(aligned, null, 2),
  );
  await writeFile("public/flagship.lesson.json", JSON.stringify(aligned));
  const filters =
    schedule
      .map(
        (s, i) =>
          `[${i}:a]aresample=48000,atrim=duration=${s.durationMs / 1000},asetpts=PTS-STARTPTS,adelay=${Math.round(s.t)}:all=1[a${i}]`,
      )
      .join(";") +
    `;${schedule.map((_, i) => `[a${i}]`).join("")}amix=inputs=${schedule.length}:normalize=0,apad,atrim=duration=${aligned.duration / 1000},loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
  await command("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...schedule.flatMap((s) => ["-i", s.file]),
    "-filter_complex",
    filters,
    "-map",
    "[out]",
    "-ar",
    "48000",
    "-c:a",
    "pcm_s16le",
    "output/audio/calculus_flagship.wav",
  ]);
  await writeFile(
    "output/audio/narration-manifest.json",
    JSON.stringify(
      {
        status: "available",
        provider: provider.id,
        voice: "id-ID-GadisNeural",
        durationMs: aligned.duration,
        originalDurationMs: lesson.duration,
        schedule,
        timestampValidation:
          "Boundaries validated for monotonicity and within decoded clip duration; word-level perceptual accuracy is not assumed. Segment starts align to actual audio duration.",
        normalization: "FFmpeg loudnorm I=-16 TP=-1.5 LRA=11",
      },
      null,
      2,
    ),
  );
  console.log(`Narration ready: ${(aligned.duration / 1000).toFixed(3)}s`);
} catch (e) {
  await writeFile(
    "output/audio/narration-manifest.json",
    JSON.stringify(
      {
        status: "unavailable",
        reason: String(e),
        completedSegments: clips.length,
      },
      null,
      2,
    ),
  );
  console.error("Narration unavailable; silent export remains independent:", e);
  process.exitCode = 1;
}
