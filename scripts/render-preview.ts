/** Compile a lesson and render preview frames through the real browser pipeline.
 *
 * Contract (driven by `renderLessonPreview` in src/mcp/director-tools.ts):
 *   npx tsx scripts/render-preview.ts <job.json>
 * where job.json is `{ lesson, timesMs, outDir }`. Writes PNG frames plus
 * `manifest.json` (`{ frames, width, height }`) into outDir.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { openStudio } from "./browser";

const jobPath = process.argv[2];
if (!jobPath) throw Error("Usage: render-preview.ts <job.json>");
const job = JSON.parse(await readFile(jobPath, "utf8")) as {
  lesson: unknown;
  timesMs: number[];
  outDir: string;
};
await mkdir(job.outDir, { recursive: true });
const session = await openStudio("?export=1&lesson=intro");
try {
  const recording = await session.page.evaluate(
    (l) => JSON.stringify(window.studio!.compile(l)),
    job.lesson as never,
  );
  const r = JSON.parse(recording as string) as { durationMs: number };
  const frames: string[] = [];
  for (const t of job.timesMs) {
    const jpeg = (await session.page.evaluate((ms) => window.studio!.renderFrame(ms), t)) as string;
    const buffer = Buffer.from(jpeg.slice(jpeg.indexOf(",") + 1), "base64");
    const file = `${job.outDir}/t${String(t).padStart(6, "0")}.jpg`;
    await writeFile(file, buffer);
    frames.push(file);
  }
  await writeFile(
    `${job.outDir}/manifest.json`,
    JSON.stringify({ frames, width: 1920, height: 1080, durationMs: r.durationMs, browserErrors: session.errors }, null, 2),
  );
  console.log(JSON.stringify({ frames: frames.length, durationMs: r.durationMs }));
} finally {
  await session.close();
}
