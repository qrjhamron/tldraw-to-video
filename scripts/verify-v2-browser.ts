import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { openStudio } from "./browser";
const session = await openStudio("?export=1"),
  { page } = session,
  checks: unknown[] = [];
const pass = (test: string, details?: unknown) => {
  checks.push({ test, passed: true, details });
  console.log("PASS", test);
};
try {
  const stats = await page.evaluate(() => {
    const r = window.studio!.recording;
    const shapes = r.events.flatMap((e) =>
      e.record?.typeName === "shape" ? [e.record] : [],
    );
    return {
      duration: r.durationMs,
      events: r.events.length,
      chapters: r.metadata.chapters?.length,
      narration: r.metadata.narration?.length,
      native: shapes.every((s) => s.type === "draw"),
      generated: shapes.every((s) => s.meta.origin === "generated"),
    };
  });
  assert.ok(stats.duration >= 480000 && stats.duration <= 600000);
  assert.equal(stats.chapters, 8);
  assert.ok(stats.native && stats.generated);
  assert.ok(stats.events > 10000);
  pass(
    "Eight-chapter flagship uses exclusively generated native draw records",
    stats,
  );
  const t = await page.evaluate(
    () => window.studio!.recording.metadata.chapters![3].t + 55000,
  );
  const snapshotDocument = () =>
    page.evaluate(() =>
      JSON.stringify(
        window
          .studio!.editor.store.allRecords()
          .filter((r) =>
            window.studio!.editor.store.scopedTypes.document.has(r.typeName),
          )
          .sort((a, b) => a.id.localeCompare(b.id)),
      ),
    );
  await page.evaluate((t) => window.studio!.seek(t), t);
  const expected = await snapshotDocument(),
    image = await page.evaluate((t) => window.studio!.renderFrame(t), t);
  for (const seek of [5000, stats.duration - 1000, 110000, t])
    await page.evaluate((t) => window.studio!.seek(t), seek);
  const actualRecords = JSON.parse(await snapshotDocument()),
    expectedRecords = JSON.parse(expected);
  assert.equal(actualRecords.length, expectedRecords.length);
  for (let i = 0; i < actualRecords.length; i++)
    assert.deepEqual(actualRecords[i], expectedRecords[i]);
  assert.equal(
    await page.evaluate((t) => window.studio!.renderFrame(t), t),
    image,
  );
  pass("Native flagship checkpoint seeking restores records and pixels");
  const parity = await page.evaluate(async () => {
    const s = window.studio!,
      t = 52000,
      fast = await s.renderFrame(t),
      official = await s.renderFrame(t, true);
    const buffers: Uint8ClampedArray[] = [];
    for (const src of [fast, official]) {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      buffers.push(ctx.getImageData(0, 0, 1920, 1080).data);
    }
    const [a, b] = buffers;
    let delta = 0,
      changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d =
        Math.abs(a[i] - b[i]) +
        Math.abs(a[i + 1] - b[i + 1]) +
        Math.abs(a[i + 2] - b[i + 2]);
      delta += d;
      if (d > 30) changed++;
    }
    return {
      meanChannelDifference: delta / (1920 * 1080 * 3),
      changedPixelFraction: changed / (1920 * 1080),
    };
  });
  assert.ok(
    parity.meanChannelDifference < 0.3 && parity.changedPixelFraction < 0.002,
  );
  pass(
    "Cached public DrawShapeUtil SVG adapter matches official SDK export",
    parity,
  );
  await page.evaluate(() => window.studio!.seek(0));
  const { prefixes, pressures } = await page.evaluate(() => {
    const r = window.studio!.recording;
    const url = "/node_modules/.vite/deps/tldraw.js",
      segs = new Map<string, number[]>();
    let pressure = false;
    for (const e of r.events) {
      const s = e.record;
      if (
        s?.typeName !== "shape" ||
        s.type !== "draw" ||
        s.meta.generator !== "pen-v2"
      )
        continue;
      const key = s.id;
      if (e.kind === "create" || e.kind === "update" || e.kind === "complete") {
        const n = s.props.segments[0].path.length;
        segs.set(key, [...(segs.get(key) ?? []), n]);
        if (s.props.isPen) pressure = true;
      }
    }
    return {
      prefixes: [...segs.values()].filter(
        (a) => a.length > 3 && a.at(-1)! > a[0],
      ).length,
      pressures: pressure,
    };
  });
  assert.ok(prefixes > 500 && pressures);
  pass("Progressive native point paths and pressure are present", {
    prefixes,
    pressures,
  });
  // Small non-calculus lesson proves compiler is reusable and deterministic without an expensive full regeneration.
  const generated = await page.evaluate(async () => {
    const url = "/src/story/example.ts",
      { algebraExample } = await import(url);
    const s = window.studio!,
      r = s.compile(algebraExample);
    const geometry = r.events.map((e) => ({
      t: e.t,
      kind: e.kind,
      record:
        e.record?.typeName === "shape"
          ? {
              id: e.record.id,
              index: e.record.index,
              type: e.record.type,
              props: e.record.props,
              x: e.record.x,
              y: e.record.y,
            }
          : undefined,
    }));
    const b = s.compile(algebraExample);
    return {
      a: JSON.stringify(geometry),
      b: JSON.stringify(
        b.events.map((e) => ({
          t: e.t,
          kind: e.kind,
          record:
            e.record?.typeName === "shape"
              ? {
                  id: e.record.id,
                  index: e.record.index,
                  type: e.record.type,
                  props: e.record.props,
                  x: e.record.x,
                  y: e.record.y,
                }
              : undefined,
        })),
      ),
    };
  });
  assert.equal(generated.a, generated.b);
  pass("Non-calculus lesson compiles reproducibly through the real Editor");
  await page.evaluate(() => window.studio!.seek(25000));
  await page.screenshot({
    path: "output/flagship-inspection/algebra-example.png",
  });
  const theme = await page.evaluate(async () => {
    const s = window.studio!,
      ed = s.editor;
    ed.setCurrentTheme("teaching");
    const url = "/src/engine/recorder.ts",
      { Recorder } = await import(url),
      recorder = new Recorder(ed, () => performance.now(), "generated");
    const r = recorder.stop(1000);
    s.load(r);
    return { recorded: r.metadata.theme, replayed: ed.getCurrentThemeId() };
  });
  assert.equal(theme.recorded, "teaching");
  assert.equal(theme.replayed, "teaching");
  pass("Manual recorder preserves the active native palette", theme);
  assert.deepEqual(session.errors, []);
  await mkdir("output", { recursive: true });
  await writeFile(
    "output/v2-browser-validation.json",
    JSON.stringify({ checks, browserErrors: session.errors }, null, 2),
  );
} finally {
  await session.close();
}
