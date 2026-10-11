/** Static layout QA over lesson chapters (no browser needed).
 *
 * Measures write/diagram/image bounds with the real layout functions and
 * reports overlaps, safe-frame escapes, and ink contrast problems. Used by
 * validate_scene_layout / run_visual_qa MCP tools and the tricks builder.
 */
import { textLayout } from "../handwriting/engine";
import { mathLayout } from "../handwriting/math-layout";
import { checkInkOnTheme, overlaps, type Rect } from "./layout";
import { validateLesson, type Action, type Lesson } from "../story/types";
import type { CanvasThemeId } from "../story/canvas-themes";

export interface LayoutIssue {
  severity: "error" | "warning";
  message: string;
  actionIds: string[];
}
export interface LayoutReport {
  chapterId: string;
  regions: { id: string; rect: Rect }[];
  overlaps: [string, string][];
  outOfFrame: string[];
  contrast: { actionId: string; color: string; ratio: number; ok: boolean }[];
  issues: LayoutIssue[];
}

/** Approximate bounds of an action in chapter coordinates (null if unknown). */
export function actionBounds(a: Action): Rect | null {
  switch (a.type) {
    case "write": {
      const style =
        a.handwritingStyle ??
        (typeof a.content !== "string" ? "math" : (a.height ?? 36) >= 42 ? "heading" : "explanation");
      const l =
        typeof a.content === "string"
          ? textLayout(a.content, 0, 0, { seed: 1, height: a.height ?? 36, style })
          : mathLayout(a.content, { seed: 1, height: a.height ?? 36, style });
      return { x: a.x, y: a.y, w: l.width, h: l.height };
    }
    case "annotateImage": {
      if (typeof a.content !== "string") return null;
      const l = textLayout(a.content, 0, 0, { seed: 1, height: a.height ?? 30, style: "annotation" });
      return { x: a.x, y: a.y, w: l.width, h: l.height };
    }
    case "highlight":
    case "underline":
    case "crossOut":
      return { x: a.x, y: a.y, w: a.width, h: a.height ?? 12 };
    case "addImage":
      return { x: a.x, y: a.y, w: a.w, h: a.h };
    case "diagram": {
      const d = a.diagram;
      switch (d.kind) {
        case "rect":
        case "areaModel":
        case "fractionBar":
          return { x: d.x, y: d.y, w: d.w, h: d.h };
        case "ellipse":
          return { x: d.cx - d.rx, y: d.cy - d.ry, w: d.rx * 2, h: d.ry * 2 };
        case "circle":
          return { x: d.cx - d.r, y: d.cy - d.r, w: d.r * 2, h: d.r * 2 };
        case "arrow":
        case "vector": {
          const x0 = d.kind === "arrow" ? d.from.x : d.x,
            y0 = d.kind === "arrow" ? d.from.y : d.y,
            x1 = d.kind === "arrow" ? d.to.x : d.x + d.dx,
            y1 = d.kind === "arrow" ? d.to.y : d.y + d.dy;
          return { x: Math.min(x0, x1) - 8, y: Math.min(y0, y1) - 8, w: Math.abs(x1 - x0) + 16, h: Math.abs(y1 - y0) + 16 };
        }
        case "triangle": {
          const xs = [d.a[0], d.b[0], d.c[0]],
            ys = [d.a[1], d.b[1], d.c[1]];
          return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        }
        case "rightTriangle":
          return { x: d.x, y: d.y - d.legY, w: d.legX, h: d.legY };
        case "projection": {
          const x1 = d.x + d.dx,
            y1 = d.y + d.dy;
          return { x: Math.min(d.x, x1) - 8, y: Math.min(d.y, y1) - 8, w: Math.abs(x1 - d.x) + 16, h: Math.abs(y1 - d.y) + 16 };
        }
      }
      break;
    }
    case "drawAxes":
    case "drawGraph":
    case "animateCurve":
      return { x: a.graph.x, y: a.graph.y, w: a.graph.width, h: a.graph.height };
    default:
      return null;
  }
  return null;
}

function actionInks(a: Action): string[] {
  if ("color" in a && typeof a.color === "string") return [a.color];
  if (a.type === "diagram" && a.diagram.color) return [a.diagram.color];
  if (a.type === "write" || a.type === "annotateImage") return [a.color ?? "black"];
  return [];
}

export function inspectChapter(
  lesson: Lesson,
  chapterId: string,
  opts: { frameW?: number; frameH?: number; minContrast?: number } = {},
): LayoutReport {
  validateLesson(lesson);
  const ch = lesson.chapters.find((c) => c.id === chapterId);
  if (!ch) throw Error(`Unknown chapter: ${chapterId}`);
  const frameW = opts.frameW ?? 1640,
    frameH = opts.frameH ?? 920;
  const theme: CanvasThemeId = lesson.canvasTheme ?? "whiteboard";
  const regions: { id: string; rect: Rect }[] = [];
  for (const a of ch.actions) {
    const r = actionBounds(a);
    if (r) regions.push({ id: a.id, rect: r });
  }
  const overlapsOut: [string, string][] = [];
  for (let i = 0; i < regions.length; i++)
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i],
        b = regions[j];
      if (!overlaps(a.rect, b.rect, 4)) continue;
      // Emphasis marks intentionally overlap their target; skip highlight-like pairs.
      // Graph family marks (curves on shared axes) intentionally coincide too.
      const meta = new Map(ch.actions.map((x) => [x.id, { type: x.type, group: (x as { group?: string }).group }]));
      const ma = meta.get(a.id),
        mb = meta.get(b.id);
      const emphatic = (t: string | undefined) =>
        t === "highlight" || t === "underline" || t === "crossOut" || t === "diagram";
      if (emphatic(ma?.type) || emphatic(mb?.type)) continue;
      const graphFamily = (t: string | undefined) =>
        t === "drawAxes" || t === "drawGraph" || t === "animateCurve" || t === "animateSecant" ||
        t === "animateTangent" || t === "shadeArea" || t === "drawRiemannRectangles" || t === "plotPoint";
      if (graphFamily(ma?.type) && graphFamily(mb?.type) && ma?.group === mb?.group) continue;
      overlapsOut.push([a.id, b.id]);
    }
  const outOfFrame = regions
    .filter(
      ({ rect }) =>
        rect.x < -40 || rect.y < -40 || rect.x + rect.w > frameW + 40 || rect.y + rect.h > frameH + 40,
    )
    .map((r) => r.id);
  const contrast = regions.flatMap(({ id }) => {
    const a = ch.actions.find((x) => x.id === id)!;
    return actionInks(a).map((color) => {
      const r = checkInkOnTheme(color as Parameters<typeof checkInkOnTheme>[0], theme, opts.minContrast ?? 3.0);
      return { actionId: id, color, ratio: r.ratio, ok: r.ok };
    });
  });
  const issues: LayoutIssue[] = [
    ...overlapsOut.map(([a, b]): LayoutIssue => ({
      severity: "warning",
      message: `Actions ${a} and ${b} overlap; verify intentional layering`,
      actionIds: [a, b],
    })),
    ...outOfFrame.map(
      (id): LayoutIssue => ({
        severity: "error",
        message: `Action ${id} leaves the 1640×920 safe frame`,
        actionIds: [id],
      }),
    ),
    ...contrast
      .filter((c) => !c.ok)
      .map(
        (c): LayoutIssue => ({
          severity: "error",
          message: `Ink ${c.color} on ${theme} is unreadable (${c.ratio.toFixed(2)})`,
          actionIds: [c.actionId],
        }),
      ),
  ];
  return { chapterId, regions, overlaps: overlapsOut, outOfFrame, contrast, issues };
}
