/** Assemble + statically validate the 50-trick flagship lessons. */
import { mkdir, writeFile } from "node:fs/promises";
import { assembleChapter, assembleOpening, assembleShowcase } from "../src/tricks/assemble";
import { runVisualQa } from "../src/mcp/director-tools";

await mkdir("output/tricks", { recursive: true });
const manifest: Record<string, unknown> = { lessons: [] as unknown[] };
const lessons = manifest.lessons as unknown[];

const opening = assembleOpening();
await writeFile("output/tricks/opening.lesson.json", JSON.stringify(opening));
lessons.push({ id: opening.id, file: "output/tricks/opening.lesson.json", durationMs: opening.duration });

for (let c = 1; c <= 5; c++) {
  const { lesson, warnings, scenes } = assembleChapter(c);
  const qa = runVisualQa({ lesson });
  const file = `output/tricks/ch${c}.lesson.json`;
  await writeFile(file, JSON.stringify(lesson));
  lessons.push({
    id: lesson.id,
    file,
    durationMs: lesson.duration,
    scenes,
    directorWarnings: warnings,
    qa: { ok: qa.ok, errors: qa.errors, warnings: qa.warnings },
  });
  console.log(`ch${c}: ${(lesson.duration / 1000).toFixed(0)}s, QA ${qa.ok ? "OK" : "ERRORS: " + qa.errors.length}`);
  for (const e of qa.errors) console.log(`  ERROR ${e}`);
  const overlaps = qa.warnings.filter((w) => w.includes("overlap"));
  for (const w of overlaps) console.log(`  OVERLAP ${w}`);
  if (!qa.ok || overlaps.length) throw Error(`Chapter ${c} failed visual QA`);
}

const { lesson: showcase, scenes } = assembleShowcase();
await writeFile("output/tricks/showcase.lesson.json", JSON.stringify(showcase));
const sqa = runVisualQa({ lesson: showcase });
lessons.push({
  id: showcase.id,
  file: "output/tricks/showcase.lesson.json",
  durationMs: showcase.duration,
  scenes,
  qa: { ok: sqa.ok, errors: sqa.errors, warnings: sqa.warnings },
});
console.log(`showcase: ${(showcase.duration / 1000).toFixed(0)}s, QA ${sqa.ok ? "OK" : "ERRORS"}`);
{
  const overlaps = sqa.warnings.filter((w) => w.includes("overlap"));
  for (const w of overlaps) console.log(`  OVERLAP ${w}`);
  if (!sqa.ok || overlaps.length) throw Error("Showcase failed visual QA");
}
await writeFile("output/tricks/manifest.json", JSON.stringify(manifest, null, 2));
