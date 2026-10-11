import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { openStudio } from "./browser";
const session = await openStudio("?export=1&offline=1&lesson=intro&generate=1");
try {
  const stats = await session.page.evaluate(() => {
    const r = window.studio!.recording,
      shapes = r.events.flatMap((e) =>
        e.record?.typeName === "shape" ? [e.record] : [],
      );
    return {
      duration: r.durationMs,
      nativeOnly: shapes.every((s) => s.type === "draw"),
      glyphEvents: shapes.filter((s) => s.meta.pen).length,
      generatedBy: r.metadata.generatedBy,
    };
  });
  assert.equal(stats.duration, 180000);
  assert.ok(stats.nativeOnly && stats.glyphEvents > 1000);
  for (const t of [18000, 169000]) {
    const image = await session.page.evaluate(
      (t) => window.studio!.renderFrame(t),
      t,
    );
    await writeFile(
      `output/handwriting-intro-${t}.jpg`,
      Buffer.from(image.split(",")[1], "base64"),
    );
  }
  assert.deepEqual(session.errors, []);
  await writeFile(
    "output/handwriting-intro-validation.json",
    JSON.stringify(
      { passed: true, ...stats, browserErrors: session.errors },
      null,
      2,
    ),
  );
  console.log(
    "PASS: regenerated intro uses authored native glyphs and shared pen motion",
  );
} finally {
  await session.close();
}
