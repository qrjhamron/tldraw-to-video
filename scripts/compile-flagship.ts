import { mkdir, writeFile, readFile } from "node:fs/promises";
import { openStudio } from "./browser";
import { flagshipLesson } from "../src/story/flagship";
import { algebraExample } from "../src/story/example";
await mkdir("output/flagship-inspection", { recursive: true });
await mkdir("examples", { recursive: true });
await writeFile(
  "examples/calculus-flagship.lesson.json",
  JSON.stringify(flagshipLesson(), null, 2),
);
await writeFile(
  "examples/algebra.lesson.json",
  JSON.stringify(algebraExample, null, 2),
);
let aligned = false;
try {
  const manifest = JSON.parse(
    await readFile("output/audio/narration-manifest.json", "utf8"),
  );
  aligned = manifest.status === "available";
} catch {}
const session = await openStudio(
  "?export=1&offline=1&generate=1" + (aligned ? "&aligned=1" : ""),
);
try {
  const r = await session.page.evaluate(() =>
    JSON.stringify(window.studio!.recording),
  );
  await writeFile("public/flagship.recording.json", r);
  await writeFile("output/calculus_flagship.recording.json", r);
  console.log(
    "Compiled:",
    JSON.parse(r).events.length,
    "events",
    r.length,
    "bytes",
  );
  // Public asset writes trigger Vite reload. Navigate explicitly to the saved project before inspection.
  await session.page.goto(
    new URL(session.page.url()).origin + "/?export=1&offline=1",
  );
  await session.page.waitForFunction(() => !!window.studio, undefined, {
    timeout: 120000,
  });
  const parsed = JSON.parse(r),
    chapters = parsed.metadata.chapters as { t: number }[];
  for (const t of chapters.map(
    (_, i) => (chapters[i + 1]?.t ?? parsed.durationMs) - 1500,
  )) {
    const image = await session.page.evaluate(
      (t) => window.studio!.renderFrame(t),
      t,
    );
    await writeFile(
      `output/flagship-inspection/${Math.round(t)}.jpg`,
      Buffer.from(image.split(",")[1], "base64"),
    );
    console.log("Inspected frame", Math.round(t));
  }
  if (session.errors.length) throw Error(session.errors.join("\n"));
} finally {
  await session.close();
}
