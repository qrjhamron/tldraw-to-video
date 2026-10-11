import { mkdir, writeFile } from "node:fs/promises";
import { openStudio } from "./browser";
import { mathLayout as legacyLayout } from "./fixtures/legacy-math-layout";
import { translate } from "../src/handwriting/engine";
import {
  row,
  fraction,
  script,
  type MathExpr,
} from "../src/handwriting/math-layout";
import type { Lesson, Action } from "../src/story/types";
const samples: {
  content: MathExpr;
  x: number;
  y: number;
  at: number;
  duration: number;
  height: number;
  style: "heading" | "explanation" | "math";
}[] = [
  {
    content: "Memahami perubahan",
    x: 0,
    y: 145,
    at: 1000,
    duration: 4500,
    height: 38,
    style: "heading",
  },
  {
    content: "Turunan mengukur laju",
    x: 0,
    y: 230,
    at: 5500,
    duration: 4000,
    height: 30,
    style: "explanation",
  },
  {
    content: "perubahan sesaat.",
    x: 0,
    y: 282,
    at: 9500,
    duration: 3500,
    height: 30,
    style: "explanation",
  },
  {
    content: row("f'(x) =", {
      type: "limit",
      under: "h → 0",
      body: fraction("f(x+h) - f(x)", "h"),
    }),
    x: 0,
    y: 380,
    at: 13000,
    duration: 6000,
    height: 24,
    style: "math",
  },
  {
    content: row(
      { type: "integral", lower: "0", upper: "2", body: script("x", "2") },
      "dx =",
      fraction("8", "3"),
    ),
    x: 0,
    y: 550,
    at: 19000,
    duration: 5000,
    height: 30,
    style: "math",
  },
  {
    content: "α + β = π; θ → 0",
    x: 0,
    y: 735,
    at: 24000,
    duration: 3500,
    height: 30,
    style: "math",
  },
];
const actions: Action[] = [];
// Labels are deliberately handwritten too. Matched content starts at the same
// time; both sides use the same production native point-prefix compiler.
for (const [side, label] of [
  [0, "Sebelum: Hershey"],
  [1, "Sesudah: goresan pena"],
] as const)
  actions.push({
    id: `label-${side}`,
    type: "write",
    content: label,
    x: 65 + side * 800,
    y: 45,
    height: 30,
    color: "blue",
    handwritingStyle: "heading",
    at: 0,
    duration: 800,
  });
for (const [i, s] of samples.entries()) {
  const old = legacyLayout(s.content, { seed: 123 + i, height: s.height });
  actions.push({
    id: `before-${i}`,
    type: "draw",
    points: [],
    strokes: translate(old, 65, s.y).paths,
    at: s.at,
    duration: s.duration,
  });
  actions.push({
    id: `after-${i}`,
    type: "write",
    content: s.content,
    x: 865,
    y: s.y,
    height: s.height,
    handwritingStyle: s.style,
    at: s.at,
    duration: s.duration,
  });
}
const lesson: Lesson = {
  format: "stroke-lesson",
  version: 1,
  id: "handwriting-comparison",
  title: "Perbandingan tulisan tangan",
  language: "id",
  seed: 123,
  duration: 30000,
  chapters: [
    {
      id: "comparison",
      title: "Perbandingan",
      start: 0,
      duration: 30000,
      origin: { x: 0, y: 0 },
      objectives: ["Matched Indonesian and mathematical handwriting"],
      actions,
    },
  ],
};
await mkdir("output/handwriting-comparison.inspection", { recursive: true });
await writeFile(
  "examples/handwriting-comparison.lesson.json",
  JSON.stringify(lesson, null, 2),
);
const session = await openStudio("?export=1&offline=1");
try {
  const r = await session.page.evaluate(
    (l) => window.studio!.compile(l),
    lesson,
  );
  await writeFile(
    "output/handwriting-comparison.recording.json",
    JSON.stringify(r),
  );
  const evidence = [];
  for (const t of [
    1050, 1150, 1300, 3000, 5500, 10500, 15000, 20500, 27500, 29500,
  ]) {
    const jpeg = await session.page.evaluate(
      (t) => window.studio!.renderFrame(t),
      t,
    );
    await writeFile(
      `output/handwriting-comparison.inspection/${t}.jpg`,
      Buffer.from(jpeg.split(",")[1], "base64"),
    );
    evidence.push(
      await session.page.evaluate(async (t) => {
        const { b64Vecs } = await import(
          "/node_modules/.vite/deps/tldraw.js" as string
        );
        const shapes = window.studio!.editor.getCurrentPageShapes();
        return {
          t,
          nativeOnly: shapes.every((s) => s.type === "draw"),
          shapes: shapes.length,
          active: shapes
            .filter((s) => s.type === "draw" && !s.props.isComplete)
            .map((s) => ({
              id: s.id,
              points: b64Vecs.decodePoints((s as any).props.segments[0].path)
                .length,
              meta: s.meta,
            })),
          points: shapes.reduce(
            (n, s) =>
              n +
              (s.type === "draw"
                ? b64Vecs.decodePoints(s.props.segments[0].path).length
                : 0),
            0,
          ),
        };
      }, t),
    );
  }
  await writeFile(
    "output/handwriting-comparison.inspection/evidence.json",
    JSON.stringify(
      { samples, evidence, browserErrors: session.errors },
      null,
      2,
    ),
  );
  if (session.errors.length) throw Error(session.errors.join("\n"));
  console.log("Comparison recording and inspection frames ready");
} finally {
  await session.close();
}
