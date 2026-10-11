/** 60-second visual proof-of-concept: stroke + font handwriting, portraits,
 * math notation, animated diagrams, theme transition (notebook -> graph).
 *
 * Compiles in Chromium, saves the recording + inspection frames. Export the
 * MP4 with:
 *   tsx scripts/export-flagship.ts \
 *     --recording output/visual-poc.recording.json \
 *     --output output/visual-poc.mp4
 */
import { mkdir, writeFile } from "node:fs/promises";
import { openStudio } from "./browser";
import {
  row,
  fraction,
  script,
} from "../src/handwriting/math-layout";
import type { Lesson } from "../src/story/types";

const lesson: Lesson = {
  format: "stroke-lesson",
  version: 1,
  id: "visual-poc",
  title: "Bukti konsep visual 60 detik",
  language: "id",
  seed: 2027,
  duration: 60000,
  canvasTheme: "notebook",
  chapters: [
    {
      id: "sejarah",
      title: "Sejarah singkat",
      start: 0,
      duration: 30000,
      origin: { x: 0, y: 0 },
      objectives: ["Portraits, font annotations, notebook theme"],
      actions: [
        { id: "cam-0", type: "moveCamera", bounds: { x: 0, y: 0, w: 1640, h: 920 }, at: 0, duration: 1500 },
        {
          id: "title",
          type: "write",
          content: "Kalkulus: Gerak dan Luas",
          x: 80,
          y: 60,
          height: 46,
          color: "blue",
          handwritingStyle: "title",
          maxWidth: 1480,
          at: 1500,
          duration: 4000,
        },
        {
          id: "subtitle",
          type: "write",
          content: "Dua pemikir, satu bahasa perubahan.",
          x: 80,
          y: 150,
          height: 32,
          handwritingStyle: "explanation",
          maxWidth: 1480,
          at: 5500,
          duration: 4000,
        },
        {
          id: "newton",
          type: "addImage",
          assetId: "newton-portrait",
          x: 120,
          y: 250,
          w: 260,
          h: 365,
          at: 9500,
          duration: 1500,
          altText: "Portrait of Isaac Newton",
        },
        {
          id: "leibniz",
          type: "addImage",
          assetId: "leibniz-portrait",
          x: 560,
          y: 250,
          w: 260,
          h: 321,
          at: 11500,
          duration: 1500,
          altText: "Portrait of Gottfried Wilhelm Leibniz",
        },
        {
          id: "note-newton",
          type: "annotateImage",
          content: "Newton: gerak dan fluksi",
          x: 100,
          y: 660,
          height: 30,
          color: "red",
          handwritingStyle: "annotation",
          handwritingFont: "Caveat",
          maxWidth: 500,
          arrowFrom: { x: 250, y: 652 },
          arrowTo: { x: 250, y: 620 },
          at: 13500,
          duration: 3000,
        },
        {
          id: "note-leibniz",
          type: "annotateImage",
          content: "Leibniz: notasi dy/dx",
          x: 560,
          y: 620,
          height: 30,
          color: "blue",
          handwritingStyle: "annotation",
          handwritingFont: "Caveat",
          maxWidth: 500,
          arrowFrom: { x: 690, y: 612 },
          arrowTo: { x: 690, y: 576 },
          at: 17000,
          duration: 3000,
        },
        {
          id: "zoom-leibniz",
          type: "animateImage",
          target: "leibniz",
          effect: "zoom",
          scale: 1.12,
          at: 20500,
          duration: 2500,
        },
        {
          id: "closing-history",
          type: "write",
          content: "Fondasi para pendahulu: Fermat, Cavalieri, Barrow.",
          x: 80,
          y: 760,
          height: 28,
          handwritingStyle: "explanation",
          handwritingFont: "Patrick Hand",
          maxWidth: 1480,
          at: 23500,
          duration: 4500,
        },
      ],
    },
    {
      id: "matematika",
      title: "Matematika",
      start: 30000,
      duration: 30000,
      origin: { x: 1900, y: 0 },
      objectives: ["Stroke math, animated diagram, graph theme"],
      actions: [
        { id: "theme-graph", type: "setCanvas", theme: "graph", at: 0, duration: 0 },
        { id: "cam-1", type: "moveCamera", bounds: { x: 0, y: 0, w: 1640, h: 920 }, at: 0, duration: 1500 },
        {
          id: "m-title",
          type: "write",
          content: "Turunan dan luas",
          x: 80,
          y: 60,
          height: 44,
          color: "blue",
          handwritingStyle: "title",
          maxWidth: 1480,
          at: 1500,
          duration: 3500,
        },
        {
          id: "m-explain",
          type: "write",
          content: "Turunan mengukur laju perubahan sesaat.",
          x: 80,
          y: 150,
          height: 30,
          handwritingStyle: "explanation",
          maxWidth: 1480,
          at: 5000,
          duration: 4000,
        },
        {
          id: "m-limit",
          type: "write",
          content: row("f'(x) =", {
            type: "limit",
            under: "h → 0",
            body: fraction("f(x+h) - f(x)", "h"),
          }),
          x: 80,
          y: 240,
          height: 30,
          handwritingStyle: "math",
          maxWidth: 1480,
          at: 9000,
          duration: 6000,
        },
        {
          id: "m-integral",
          type: "write",
          content: row(
            { type: "integral", lower: "0", upper: "2", body: script("x", "2") },
            "dx =",
            fraction("8", "3"),
          ),
          x: 80,
          y: 430,
          height: 32,
          handwritingStyle: "math",
          maxWidth: 700,
          at: 15000,
          duration: 5000,
        },
        {
          id: "diagram",
          type: "addImage",
          assetId: "secant-tangent-diagram",
          x: 860,
          y: 240,
          w: 640,
          h: 420,
          at: 15000,
          duration: 1200,
        },
        {
          id: "diagram-mask",
          type: "animateImage",
          target: "diagram",
          effect: "mask",
          at: 16500,
          duration: 2500,
        },
        {
          id: "diagram-note",
          type: "annotateImage",
          content: "sekan menjadi tangen saat Q mendekati P",
          x: 860,
          y: 690,
          height: 28,
          color: "orange",
          handwritingStyle: "annotation",
          handwritingFont: "Kalam",
          maxWidth: 700,
          at: 19500,
          duration: 4000,
        },
        {
          id: "follow",
          type: "animateImage",
          target: "diagram",
          effect: "cameraFollow",
          bounds: { x: 780, y: 180, w: 800, h: 620 },
          at: 24000,
          duration: 2500,
        },
      ],
    },
  ],
};

await mkdir("output/visual-poc.inspection", { recursive: true });
await writeFile("examples/visual-poc.lesson.json", JSON.stringify(lesson, null, 2));
const session = await openStudio("?export=1&offline=1");
try {
  const recording = await session.page.evaluate(
    (l) => window.studio!.compile(l),
    lesson,
  );
  await writeFile("output/visual-poc.recording.json", JSON.stringify(recording));
  for (const t of [3000, 12000, 16000, 22000, 28000, 33000, 42000, 48000, 54000, 59000]) {
    const jpeg = await session.page.evaluate(
      (t) => window.studio!.renderFrame(t),
      t,
    );
    await writeFile(
      `output/visual-poc.inspection/${t}.jpg`,
      Buffer.from(jpeg.split(",")[1], "base64"),
    );
  }
  if (session.errors.length) throw Error(session.errors.join("\n"));
  console.log("PoC recording and inspection frames ready");
} finally {
  await session.close();
}
