import { CHAPTERS, trickToScene, type Trick } from "./catalog";
import { directScene } from "../director/templates";
import { validateLesson, type Action, type Chapter, type Lesson } from "../story/types";

const GAP_MS = 1200;
const ORIGIN_DX = 2400;

/** Pan to the next origin during each chapter's trailing gap, so the next
 * scene opens already framed instead of mid-travel over blank canvas. */
function addTransitionPans(chapters: Chapter[]): void {
  for (let i = 0; i + 1 < chapters.length; i++) {
    const next = chapters[i + 1];
    chapters[i].actions.push({
      id: `${chapters[i].id}-txpan`,
      type: "moveCamera",
      bounds: { x: next.origin.x, y: next.origin.y, w: 1640, h: 920 },
      at: chapters[i].duration - GAP_MS,
      duration: GAP_MS,
    });
  }
}

/** Lower one trick scene into a lesson chapter at the given start/origin.
 * Action times stay scene-relative (validator requires at+duration <= chapter
 * duration); ids already carry the scene prefix from directScene. */
export function trickChapter(
  trick: Trick,
  start: number,
  originX: number,
  seed: number,
  budgetMs?: number,
): { chapter: Chapter; warnings: string[] } {
  const scene = trickToScene(trick);
  if (budgetMs !== undefined) scene.budgetMs = budgetMs;
  const d = directScene(scene, seed);
  const actions: Action[] = d.actions;
  const chapter: Chapter = {
    id: trick.id,
    title: trick.title,
    objectives: [trick.statement],
    start,
    duration: d.durationMs + GAP_MS,
    origin: { x: originX, y: 0 },
    actions,
  };
  return { chapter, warnings: d.warnings.map((w) => `[${trick.id}] ${w}`) };
}

export interface AssembledChapter {
  lesson: Lesson;
  warnings: string[];
  /** Per-trick scene durations (ms, without gap). */
  scenes: { id: string; title: string; durationMs: number }[];
}

/** Assemble one flagship chapter (10 tricks) into a renderable lesson. */
export function assembleChapter(chapterNo: number, seed = 1000): AssembledChapter {
  const entry = CHAPTERS.find((c) => c.chapter === chapterNo);
  if (!entry) throw Error(`Unknown chapter: ${chapterNo}`);
  const chapters: Chapter[] = [];
  const warnings: string[] = [];
  const scenes: AssembledChapter["scenes"] = [];
  let t = 0;
  entry.tricks.forEach((trick, i) => {
    const { chapter, warnings: w } = trickChapter(trick, t, i * ORIGIN_DX, seed + i);
    chapters.push(chapter);
    warnings.push(...w);
    scenes.push({ id: trick.id, title: trick.title, durationMs: chapter.duration - GAP_MS });
    t += chapter.duration;
  });
  addTransitionPans(chapters);
  const lesson: Lesson = {
    format: "stroke-lesson",
    version: 1,
    id: `trik-${chapterNo}`,
    title: `Bab ${chapterNo}: ${entry.title}`,
    language: "id",
    seed,
    duration: t,
    canvasTheme: "whiteboard",
    chapters,
  };
  return { lesson: validateLesson(lesson), warnings, scenes };
}

/** Short opening lesson: title + premise + chapter map. */
export function assembleOpening(seed = 7): Lesson {
  const chapters: Chapter[] = [
    {
      id: "opening",
      title: "Pembuka",
      objectives: ["Menarik perhatian dan memetakan lima bab."],
      start: 0,
      duration: 24000,
      origin: { x: 0, y: 0 },
      actions: [
        { id: "cam-0", type: "moveCamera", bounds: { x: 0, y: 0, w: 1640, h: 920 }, at: 0, duration: 1500 },
        { id: "title", type: "write", content: "50 Trik Hitung Cepat", x: 180, y: 150, height: 88, at: 1200, duration: 4500, color: "black" },
        { id: "subtitle", type: "write", content: "Dari Akar sampai Integral", x: 220, y: 290, height: 64, at: 6000, duration: 4000, color: "blue" },
        { id: "bab1", type: "write", content: "1. Aritmetika kilat", x: 220, y: 420, height: 48, at: 10500, duration: 2200, color: "black" },
        { id: "bab2", type: "write", content: "2. Pecahan, akar, pangkat", x: 220, y: 508, height: 48, at: 13000, duration: 2200, color: "black" },
        { id: "bab3", type: "write", content: "3. Aljabar dan persamaan", x: 220, y: 596, height: 48, at: 15500, duration: 2200, color: "black" },
        { id: "bab4", type: "write", content: "4. Pola dan geometri", x: 220, y: 684, height: 48, at: 18000, duration: 2200, color: "black" },
        { id: "bab5", type: "write", content: "5. Fungsi dan kalkulus", x: 220, y: 772, height: 48, at: 20500, duration: 2200, color: "black" },
        { id: "n1", type: "narrate", text: "Lima puluh trik hitung cepat, dari akar sampai integral.", at: 1200, duration: 4500 },
        { id: "n2", type: "narrate", text: "Setiap trik dibuktikan langkah demi langkah, lalu kamu yang mencoba.", at: 6000, duration: 5500 },
        { id: "n3", type: "narrate", text: "Siapkan pensil dan kertas. Kita mulai dari aritmetika kilat.", at: 17000, duration: 5500 },
      ],
    },
  ];
  return validateLesson({
    format: "stroke-lesson",
    version: 1,
    id: "trik-opening",
    title: "Pembuka: 50 Trik Hitung Cepat Matematika",
    language: "id",
    seed,
    duration: 24000,
    canvasTheme: "whiteboard",
    chapters,
  });
}

/** 60–90s showcase: the strongest scenes across chapters, budgeted to ~20s each. */
export function assembleShowcase(seed = 500): AssembledChapter {
  const picks: [number, string][] = [
    [3, "t24"],
    [4, "t38"],
    [5, "t50"],
  ];
  const tricks = picks.map(([c, id]) => {
    const t = CHAPTERS.find((x) => x.chapter === c)!.tricks.find((x) => x.id === id)!;
    if (!t) throw Error(`Unknown trick ${id}`);
    return t;
  });
  const chapters: Chapter[] = [];
  const warnings: string[] = [];
  const scenes: AssembledChapter["scenes"] = [];
  let t = 0;
  tricks.forEach((trick, i) => {
    const { chapter, warnings: w } = trickChapter(trick, t, i * ORIGIN_DX, seed + i, 20000);
    chapters.push(chapter);
    warnings.push(...w);
    scenes.push({ id: trick.id, title: trick.title, durationMs: chapter.duration - GAP_MS });
    t += chapter.duration;
  });
  addTransitionPans(chapters);
  const lesson: Lesson = {
    format: "stroke-lesson",
    version: 1,
    id: "trik-showcase",
    title: "Sorotan: 50 Trik Hitung Cepat",
    language: "id",
    seed,
    duration: t,
    canvasTheme: "whiteboard",
    chapters,
  };
  return { lesson: validateLesson(lesson), warnings, scenes };
}
