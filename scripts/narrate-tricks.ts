/** Synthesize Indonesian narration for a tricks lesson and warp it to measured audio.
 *
 * Usage: narrate-tricks.ts <lesson.json> <outPrefix>
 * Writes <outPrefix>.aligned.json, <outPrefix>.wav, <outPrefix>.narr.json.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { validateLesson } from "../src/story/types";
import { alignNarration, narrationSchedule } from "../src/audio/timeline";
import { EdgeNarration, command } from "../src/audio/edge";

const [lessonPath, outPrefix] = process.argv.slice(2);
if (!lessonPath || !outPrefix) throw Error("Usage: narrate-tricks.ts <lesson.json> <outPrefix>");
const lesson = validateLesson(JSON.parse(await readFile(lessonPath, "utf8")));
const provider = new EdgeNarration({ regenerate: process.argv.includes("--regenerate") });
await mkdir("output/audio/cache", { recursive: true });

const clips = [];
for (const c of lesson.chapters)
  for (const a of c.actions) {
    if (a.type !== "narrate") continue;
    console.log(`TTS ${a.id}: ${a.text.slice(0, 60)}…`);
    clips.push(
      await provider.synthesize({
        id: `${lesson.id}-${a.id}`,
        text: a.text,
        voice: "id-ID-GadisNeural",
        rate: "+15%",
        outputDir: "output/audio/cache",
      }).then((clip) => ({ ...clip, id: a.id })),
    );
  }

const aligned = alignNarration(lesson, clips);
const schedule = narrationSchedule(aligned, clips);
await writeFile(`${outPrefix}.aligned.json`, JSON.stringify(aligned));
const filters =
  schedule.map((s, i) => `[${i}:a]aresample=48000,atrim=duration=${s.durationMs / 1000},asetpts=PTS-STARTPTS,adelay=${Math.round(s.t)}:all=1[a${i}]`).join(";") +
  `;${schedule.map((_, i) => `[a${i}]`).join("")}amix=inputs=${schedule.length}:normalize=0,apad,atrim=duration=${aligned.duration / 1000},loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
await command("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  ...schedule.flatMap((s) => ["-i", s.file]),
  "-filter_complex", filters, "-map", "[out]", "-ar", "48000", "-c:a", "pcm_s16le",
  `${outPrefix}.wav`,
]);
await writeFile(
  `${outPrefix}.narr.json`,
  JSON.stringify({ status: "available", voice: "id-ID-GadisNeural", durationMs: aligned.duration, originalDurationMs: lesson.duration, clips: clips.length, schedule }, null, 2),
);
console.log(`Narrated ${outPrefix}: ${(aligned.duration / 1000).toFixed(1)}s from ${(lesson.duration / 1000).toFixed(1)}s silent`);
