import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { openStudio } from "./browser";
const s = await openStudio(""),
  { page } = s,
  checks: string[] = [];
try {
  await page.evaluate(() => window.studio!.seek(283156));
  await page
    .getByRole("button", { name: "Inspect native strokes", exact: true })
    .click();
  assert.ok(
    (await page.locator(".inspector pre").innerText()).includes("decoded"),
  );
  await page.screenshot({
    path: "output/flagship-inspection/studio-inspector.png",
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  checks.push("Native pressure/point inspector");
  await page
    .getByRole("button", { name: "Edit project timing", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Trim start", exact: true })
    .fill("180");
  await page
    .getByRole("spinbutton", { name: "Trim end", exact: true })
    .fill("280");
  await page.getByRole("button", { name: "Trim copy", exact: true }).click();
  assert.equal(
    await page.evaluate(() => window.studio!.recording.durationMs),
    100000,
  );
  assert.ok(
    (await page.evaluate(
      () => window.studio!.editor.getCurrentPageShapes().length,
    )) > 0,
  );
  checks.push("Trim copy materializes native boundary state");
  await page
    .getByRole("button", { name: "Retime to 1.25×", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => window.studio!.recording.durationMs),
    80000,
  );
  checks.push("Writing speed adjustment");
  const algebra = await readFile("examples/algebra.lesson.json");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "algebra.lesson.json",
      mimeType: "application/json",
      buffer: algebra,
    });
  await page.waitForFunction(
    () => window.studio!.recording.metadata.lessonId === "algebra-example",
  );
  checks.push("Import and compile a non-calculus semantic lesson");
  await page
    .getByRole("textbox", { name: "Chapter order", exact: true })
    .fill("1");
  await page.getByRole("button", { name: "Reorder copy", exact: true }).click();
  assert.equal(await page.locator("[role=alert]").count(), 0);
  checks.push("Chapter reorder copy");
  await page
    .getByRole("button", { name: "Reuse recording ink", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Stop & replay", exact: true })
    .click();
  assert.ok(
    await page.evaluate(() =>
      window.studio!.recording.events.some(
        (e) =>
          e.kind === "create" &&
          e.origin === "generated" &&
          e.record?.typeName === "shape" &&
          typeof e.record.meta.reusedFrom === "string",
      ),
    ),
  );
  checks.push("Reused native geometry retains generated provenance");
  const snapshot = await page.evaluate(() => window.studio!.recording.initial);
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "snapshot.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(snapshot)),
    });
  await page.waitForFunction(
    () =>
      window.studio!.recording.metadata.title === "Imported tldraw snapshot",
  );
  assert.equal(
    await page.evaluate(() => window.studio!.recording.metadata.origin),
    "unknown",
  );
  checks.push("Snapshot import makes no unsupported human provenance claim");
  assert.deepEqual(s.errors, []);
  await writeFile(
    "output/editing-browser-validation.json",
    JSON.stringify({ passed: true, checks, browserErrors: s.errors }, null, 2),
  );
  console.log("PASS", checks);
} finally {
  await s.close();
}
