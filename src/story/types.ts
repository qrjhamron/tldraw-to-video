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
        handwritingStyle?: import("../handwriting/engine").HandwritingStyle;
        handwritingFont?: import("../handwriting/styles").HandwritingFontFamily;
        x: number;
        y: number;
        height?: number;
        color?: Color;
        maxWidth?: number;
      }
    | {
        type: "addImage";
        assetId: string;
        x: number;
        y: number;
        w: number;
        h: number;
        rotation?: number;
        opacity?: number;
        crop?: { topLeft: { x: number; y: number }; bottomRight: { x: number; y: number } } | null;
        layer?: number;
        altText?: string;
      }
    | {
        type: "animateImage";
        target: string;
        effect: "reveal" | "fade" | "slide" | "zoom" | "mask" | "cameraFollow";
        dx?: number;
        dy?: number;
        scale?: number;
        fromOpacity?: number;
        toOpacity?: number;
        bounds?: { x: number; y: number; w: number; h: number };
      }
    | {
        type: "annotateImage";
        content: MathExpr;
        x: number;
        y: number;
        height?: number;
        color?: Color;
        handwritingStyle?: import("../handwriting/engine").HandwritingStyle;
        handwritingFont?: import("../handwriting/styles").HandwritingFontFamily;
        maxWidth?: number;
        arrowFrom?: { x: number; y: number };
        arrowTo?: { x: number; y: number };
      }
    | {
        type: "setCanvas";
        theme: import("./canvas-themes").CanvasThemeId;
      }
    | {
        type: "setHandwriting";
        role?: import("../handwriting/engine").HandwritingStyle;
        font?: import("../handwriting/styles").HandwritingFontFamily;
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
    | {
        type: "draw";
        points: number[][][];
        color?: Color;
        strokes?: import("../lesson/paths").InkPath[];
      }
    | {
        type: "diagram";
        diagram:
          | { kind: "rect"; x: number; y: number; w: number; h: number; color?: Color }
          | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; color?: Color }
          | { kind: "circle"; cx: number; cy: number; r: number; color?: Color }
          | { kind: "arrow"; from: { x: number; y: number }; to: { x: number; y: number }; color?: Color }
          | { kind: "areaModel"; x: number; y: number; w: number; h: number; rows: number; cols: number; color?: Color }
          | { kind: "fractionBar"; x: number; y: number; w: number; h: number; filled: number; total: number; color?: Color }
          | { kind: "triangle"; a: [number, number]; b: [number, number]; c: [number, number]; color?: Color }
          | { kind: "rightTriangle"; x: number; y: number; legX: number; legY: number; color?: Color }
          | { kind: "projection"; x: number; y: number; dx: number; dy: number; ux: number; uy: number; color?: Color }
          | { kind: "vector"; x: number; y: number; dx: number; dy: number; color?: Color };
      }
    | {
        type: "animateCurve";
        graph: Graph;
        from: FunctionModel;
        to: FunctionModel;
        color?: Color;
        pointX?: number;
      }
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
  canvasTheme?: import("./canvas-themes").CanvasThemeId;
  handwriting?: {
    role?: import("../handwriting/engine").HandwritingStyle;
    font?: import("../handwriting/styles").HandwritingFontFamily;
  };
}
export function validateDiagram(
  d: Extract<Action, { type: "diagram" }>["diagram"],
) {
  const fin = (vs: unknown[]) => vs.every((v) => Number.isFinite(v));
  const colors = ["black", "blue", "red", "green", "orange", "grey"];
  if (!d || typeof d.kind !== "string") throw Error("Invalid diagram");
  if (d.color !== undefined && !colors.includes(d.color))
    throw Error("Invalid diagram color");
  switch (d.kind) {
    case "rect":
      if (!fin([d.x, d.y, d.w, d.h]) || d.w <= 0 || d.h <= 0)
        throw Error("Invalid rect diagram");
      break;
    case "ellipse":
      if (!fin([d.cx, d.cy, d.rx, d.ry]) || d.rx <= 0 || d.ry <= 0)
        throw Error("Invalid ellipse diagram");
      break;
    case "circle":
      if (!fin([d.cx, d.cy, d.r]) || d.r <= 0)
        throw Error("Invalid circle diagram");
      break;
    case "arrow":
      if (!fin([d.from.x, d.from.y, d.to.x, d.to.y]))
        throw Error("Invalid arrow diagram");
      break;
    case "areaModel":
      if (
        !fin([d.x, d.y, d.w, d.h]) ||
        d.w <= 0 ||
        d.h <= 0 ||
        !Number.isInteger(d.rows) ||
        !Number.isInteger(d.cols) ||
        d.rows < 1 ||
        d.cols < 1
      )
        throw Error("Invalid areaModel diagram");
      break;
    case "fractionBar":
      if (
        !fin([d.x, d.y, d.w, d.h]) ||
        d.w <= 0 ||
        d.h <= 0 ||
        !Number.isInteger(d.total) ||
        d.total < 1 ||
        d.filled < 0 ||
        d.filled > d.total
      )
        throw Error("Invalid fractionBar diagram");
      break;
    case "triangle":
      if (![d.a, d.b, d.c].every((p) => Array.isArray(p) && fin(p)))
        throw Error("Invalid triangle diagram");
      break;
    case "rightTriangle":
      if (!fin([d.x, d.y, d.legX, d.legY]) || d.legX <= 0 || d.legY <= 0)
        throw Error("Invalid rightTriangle diagram");
      break;
    case "projection":
      if (!fin([d.x, d.y, d.dx, d.dy, d.ux, d.uy]))
        throw Error("Invalid projection diagram");
      break;
    case "vector":
      if (!fin([d.x, d.y, d.dx, d.dy])) throw Error("Invalid vector diagram");
      break;
    default:
      throw Error("Unsupported diagram kind");
  }
  return d;
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
  if (
    lesson.canvasTheme !== undefined &&
    !["whiteboard", "graph", "notebook", "darkboard"].includes(lesson.canvasTheme)
  )
    throw Error("Unsupported canvas theme");
  if (
    lesson.handwriting !== undefined &&
    ((lesson.handwriting.role &&
      !["title", "heading", "explanation", "annotation", "math"].includes(
        lesson.handwriting.role,
      )) ||
      (lesson.handwriting.font &&
        !["stroke", "Patrick Hand", "Kalam", "Caveat"].includes(
          lesson.handwriting.font,
        )))
  )
    throw Error("Unsupported lesson handwriting preset");
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
    "diagram",
    "animateCurve",
    "moveObject",
    "erase",
    "highlight",
    "underline",
    "crossOut",
    "moveCamera",
    "zoomCamera",
    "pause",
    "narrate",
    "addImage",
    "animateImage",
    "annotateImage",
    "setCanvas",
    "setHandwriting",
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
      if (a.type === "animateCurve") {
        if (a.duration <= 900) throw Error("Curve animation needs > 900ms");
        validateFunction(a.from);
        validateFunction(a.to);
        if (a.from.kind !== a.to.kind)
          throw Error("animateCurve needs matching model kinds");
        if (
          a.from.kind === "polynomial" &&
          a.to.kind === "polynomial" &&
          a.from.coefficients.length !== a.to.coefficients.length
        )
          throw Error("animateCurve needs matching coefficient counts");
        if (a.pointX !== undefined && !Number.isFinite(a.pointX))
          throw Error("Invalid animateCurve point");
      }
      if (a.type === "diagram") validateDiagram(a.diagram);
      if (
        (a.type === "write" || a.type === "annotateImage") &&
        a.handwritingStyle &&
        !["title", "heading", "explanation", "annotation", "math"].includes(
          a.handwritingStyle,
        )
      )
        throw Error("Unsupported handwriting style");
      if (
        (a.type === "write" || a.type === "annotateImage") &&
        a.handwritingFont &&
        !["stroke", "Patrick Hand", "Kalam", "Caveat"].includes(a.handwritingFont)
      )
        throw Error("Unsupported handwriting font");
      if (
        a.type === "addImage" &&
        (!a.assetId ||
          ![a.x, a.y, a.w, a.h].every(Number.isFinite) ||
          a.w <= 0 ||
          a.h <= 0 ||
          (a.opacity !== undefined && (a.opacity < 0 || a.opacity > 1)) ||
          (a.rotation !== undefined && !Number.isFinite(a.rotation)))
      )
        throw Error("Invalid image placement");
      if (
        a.type === "animateImage" &&
        !["reveal", "fade", "slide", "zoom", "mask", "cameraFollow"].includes(
          a.effect,
        )
      )
        throw Error("Unsupported image effect");
      if (
        a.type === "setCanvas" &&
        !["whiteboard", "graph", "notebook", "darkboard"].includes(a.theme)
      )
        throw Error("Unsupported canvas theme");
      if (
        a.type === "setHandwriting" &&
        ((a.role &&
          !["title", "heading", "explanation", "annotation", "math"].includes(
            a.role,
          )) ||
          (a.font &&
            !["stroke", "Patrick Hand", "Kalam", "Caveat"].includes(a.font)))
      )
        throw Error("Unsupported handwriting preset");
      if (
        a.type === "draw" &&
        a.strokes &&
        a.strokes.some(
          (p) =>
            !Number.isFinite(p.scale) ||
            p.scale <= 0 ||
            !p.points.length ||
            !["black", "blue", "red", "green", "orange", "grey"].includes(
              p.color,
            ) ||
            p.points.some(
              (q) =>
                !Number.isFinite(q.x) ||
                !Number.isFinite(q.y) ||
                !Number.isFinite(q.z) ||
                q.z < 0 ||
                q.z > 1,
            ),
        )
      )
        throw Error("Invalid native ink paths");
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
