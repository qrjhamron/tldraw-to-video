/** Concatenate opening + chapters into the combined flagship with markers. */
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const parts = ["opening", "ch1", "ch2", "ch3", "ch4", "ch5"];
const files = parts.map((p) => `output/tricks/${p}.mp4`);
await writeFile("output/tricks/concat.txt", files.map((f) => `file '${f.replace("output/tricks/", "")}'`).join("\n"));
const probe = (f: string): number =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", f], { encoding: "utf8" }));
const markers = [];
let t = 0;
for (const [i, f] of files.entries()) {
  const d = probe(f);
  markers.push({ id: parts[i], file: f, startS: t, durationS: d });
  t += d;
}
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "warning", "-y", "-f", "concat", "-safe", "0", "-i", "output/tricks/concat.txt", "-c", "copy", "-movflags", "+faststart", "output/tricks/full.mp4"]);
await writeFile("output/tricks/full-manifest.json", JSON.stringify({ output: "output/tricks/full.mp4", totalS: t, markers }, null, 2));
console.log(`Combined flagship: ${t.toFixed(1)}s`);
