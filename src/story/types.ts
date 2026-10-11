import type { Color } from "../handwriting/engine";
import type { MathExpr } from "../handwriting/math-layout";
import type { Graph } from "../math/geometry";
import type { MotionModel } from "./motion";
import { validateFunction, type FunctionModel } from "../math/models";
export interface Timing {
  id: string;
  at: number;
  duration: number;
  group?: string;
}
export type Action = Timing &
  (
    | {
        type: "write";
        content: MathExpr;
        x: number;
        y: number;
        height?: number;
        color?: Color;
        maxWidth?: number;
      }
    | { type: "drawAxes"; graph: Graph }
    | { type: "drawGraph"; graph: Graph; fn: FunctionModel; color?: Color }
    | { type: "plotPoint"; graph: Graph; x: number; y: number; label?: string }
    | {
        type: "animateSecant";
        graph: Graph;
        fn: FunctionModel;
        x: number;
        from: number;
        to: number;
        labelX?: number;
        labelY?: number;
      }
    | {
        type: "animateTangent";
        graph: Graph;
        fn: FunctionModel;
        x: number;
        triangle?: number;
      }
    | {
        type: "shadeArea";
        graph: Graph;
        fn: FunctionModel;
        a: number;
        b: number;
      }
    | {
        type: "drawRiemannRectangles";
        graph: Graph;
        fn: FunctionModel;
        a: number;
        b: number;
        n: number;
      }
    | { type: "draw"; points: number[][][]; color?: Color }
    | {
        type: "moveObject";
        points: number[][][];
        dx: number;
        dy: number;
        color?: Color;
        motion?: MotionModel;
      }
    | { type: "erase"; target: string }
    | {
        type: "highlight" | "underline" | "crossOut";
        x: number;
        y: number;
        width: number;
        height?: number;
        color?: Color;
      }
    | {
        type: "moveCamera" | "zoomCamera";
        bounds: { x: number; y: number; w: number; h: number };
        margin?: number;
      }
    | { type: "pause"; reason: string }
    | { type: "narrate"; text: string; visual?: string }
  );
export interface Chapter {
  id: string;
  title: string;
  start: number;
  duration: number;
  origin: { x: number; y: number };
  objectives: string[];
  actions: Action[];
}
export interface Lesson {
  format: "stroke-lesson";
  version: 1;
  id: string;
  title: string;
  language: "id";
  seed: number;
  duration: number;
  chapters: Chapter[];
  sources?: { title: string; url: string }[];
}
export function validateLesson(lesson: Lesson) {
  if (
    lesson.format !== "stroke-lesson" ||
    lesson.version !== 1 ||
    !Number.isFinite(lesson.duration) ||
    lesson.duration <= 0
  )
    throw Error("Unsupported lesson");
  if (
    !Array.isArray(lesson.chapters) ||
    !lesson.chapters.length ||
    !Number.isInteger(lesson.seed) ||
    typeof lesson.id !== "string" ||
    typeof lesson.title !== "string" ||
    lesson.language !== "id"
  )
    throw Error("Invalid lesson metadata");
  const chapterIds = new Set<string>();
  const supported = new Set([
    "write",
    "drawAxes",
    "drawGraph",
    "plotPoint",
    "animateSecant",
    "animateTangent",
    "shadeArea",
    "drawRiemannRectangles",
    "draw",
    "moveObject",
    "erase",
    "highlight",
    "underline",
    "crossOut",
    "moveCamera",
    "zoomCamera",
    "pause",
    "narrate",
  ]);
  const ids = new Set<string>();
  let end = 0;
  for (const ch of lesson.chapters) {
    if (
      !Number.isFinite(ch.start) ||
      !Number.isFinite(ch.duration) ||
      ch.start < end ||
      ch.duration <= 0
    )
      throw Error("Invalid chapter timing");
    if (
      !ch.origin ||
      !Number.isFinite(ch.origin.x) ||
      !Number.isFinite(ch.origin.y) ||
      typeof ch.id !== "string" ||
      chapterIds.has(ch.id) ||
      !Array.isArray(ch.actions)
    )
      throw Error("Invalid chapter");
    chapterIds.add(ch.id);
    end = ch.start + ch.duration;
    if (end > lesson.duration) throw Error("Chapter exceeds lesson");
    for (const a of ch.actions) {
      if (!supported.has(a.type) || typeof a.id !== "string")
        throw Error("Unsupported semantic action");
      if ("fn" in a) validateFunction(a.fn);
      if ("graph" in a) {
        const g = a.graph;
        if (
          !g ||
          Object.values(g).some((v) => !Number.isFinite(v)) ||
          g.width <= 0 ||
          g.height <= 0 ||
          g.xMax <= g.xMin ||
          g.yMax <= g.yMin
        )
          throw Error("Invalid graph bounds");
      }
      if (
        (a.type === "moveCamera" || a.type === "zoomCamera") &&
        (!a.bounds ||
          Object.values(a.bounds).some((v) => !Number.isFinite(v)) ||
          a.bounds.w <= 0 ||
          a.bounds.h <= 0)
      )
        throw Error("Invalid camera bounds");
      if (a.type === "animateSecant" && a.duration <= 900)
        throw Error("Secant animation needs > 900ms");
      if (a.type === "moveObject" && a.duration <= 900)
        throw Error("Object animation needs > 900ms");
      if (ids.has(a.id)) throw Error(`Duplicate action ${a.id}`);
      ids.add(a.id);
      if (
        !Number.isFinite(a.at) ||
        !Number.isFinite(a.duration) ||
        a.at < 0 ||
        a.duration < 0 ||
        a.at + a.duration > ch.duration
      )
        throw Error(`Action outside chapter: ${a.id}`);
    }
  }
  return lesson;
}
