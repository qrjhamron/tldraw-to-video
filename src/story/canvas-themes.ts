/** Canvas themes: whiteboard, graph paper, notebook, darkboard.
 *
 * Themes change the page background and ink guidance without rebuilding the
 * lesson: the compiler emits `theme` events, `themeAt()` evaluates them at
 * any time, and the offline renderer paints the background deterministically
 * in screen space so seeking and export stay reproducible.
 */
import type { Recording } from "../engine/schema";

export type CanvasThemeId = "whiteboard" | "graph" | "notebook" | "darkboard";

export interface CanvasTheme {
  id: CanvasThemeId;
  name: string;
  /** Page background fill. */
  background: string;
  /** Minor/major grid spacing in screen px (graph), or line step (notebook). */
  gridMinor?: number;
  gridMajor?: number;
  gridMinorColor?: string;
  gridMajorColor?: string;
  ruleStep?: number;
  ruleColor?: string;
  marginColor?: string;
  /** Default ink color for UI labels (shapes keep their own colors). */
  ink: string;
}

export const CANVAS_THEMES: Record<CanvasThemeId, CanvasTheme> = {
  whiteboard: {
    id: "whiteboard",
    name: "Clean whiteboard",
    background: "#fbfaf7",
    ink: "#263238",
  },
  graph: {
    id: "graph",
    name: "Academic graph paper",
    background: "#f7f5ec",
    gridMinor: 24,
    gridMajor: 120,
    gridMinorColor: "rgba(40,93,146,0.10)",
    gridMajorColor: "rgba(40,93,146,0.22)",
    ink: "#263238",
  },
  notebook: {
    id: "notebook",
    name: "Handwritten notebook",
    background: "#fbf7ec",
    ruleStep: 44,
    ruleColor: "rgba(180,122,37,0.28)",
    marginColor: "rgba(184,77,70,0.45)",
    ink: "#263238",
  },
  darkboard: {
    id: "darkboard",
    name: "Minimal darkboard",
    background: "#1b262c",
    gridMinor: 32,
    gridMajor: 160,
    gridMinorColor: "rgba(255,255,255,0.05)",
    gridMajorColor: "rgba(255,255,255,0.10)",
    ink: "#eef3f1",
  },
};

export const CANVAS_THEME_IDS: CanvasThemeId[] = [
  "whiteboard",
  "graph",
  "notebook",
  "darkboard",
];

export function assertCanvasThemeId(value: unknown): CanvasThemeId {
  if (
    value === "whiteboard" ||
    value === "graph" ||
    value === "notebook" ||
    value === "darkboard"
  )
    return value;
  throw Error(`Unsupported canvas theme: ${String(value)}`);
}

/** Evaluate the active theme at time t. Defaults to whiteboard for lessons
 * without theme events; legacy `teaching` recordings map to whiteboard. */
export function themeAt(recording: Recording, time: number): CanvasTheme {
  const legacy = (recording.metadata as { theme?: string }).theme;
  let id: CanvasThemeId =
    legacy === "teaching" || legacy === "default" ? "whiteboard" : "whiteboard";
  const initial = (recording.metadata as { canvasTheme?: unknown }).canvasTheme;
  if (typeof initial === "string") {
    try {
      id = assertCanvasThemeId(initial);
    } catch {
      // Keep default; validation of new recordings rejects bad ids.
    }
  }
  for (const e of recording.events) {
    if (e.t > time) break;
    if (e.kind === "theme" && e.theme) id = e.theme;
  }
  return CANVAS_THEMES[id];
}

/** Paint a theme background onto a 2D context. Camera-anchored so the grid
 * moves with the infinite canvas and stays stable under seeking. */
export function paintCanvasTheme(
  ctx: CanvasRenderingContext2D,
  theme: CanvasTheme,
  width: number,
  height: number,
  camera: { x: number; y: number; z: number },
): void {
  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);
  const ox = (camera.x * camera.z) % 1;
  const oy = (camera.y * camera.z) % 1;
  if (theme.gridMinor && theme.gridMinorColor) {
    ctx.strokeStyle = theme.gridMinorColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = theme.gridMinor;
    const startX = ((camera.x * camera.z) % step + step) % step;
    const startY = ((camera.y * camera.z) % step + step) % step;
    for (let x = startX + 0.5; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = startY + 0.5; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }
  if (theme.gridMajor && theme.gridMajorColor) {
    ctx.strokeStyle = theme.gridMajorColor;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    const step = theme.gridMajor;
    const startX = ((camera.x * camera.z) % step + step) % step;
    const startY = ((camera.y * camera.z) % step + step) % step;
    for (let x = startX + 0.5; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = startY + 0.5; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }
  if (theme.ruleStep && theme.ruleColor) {
    ctx.strokeStyle = theme.ruleColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = theme.ruleStep;
    const startY = ((camera.y * camera.z) % step + step) % step;
    for (let y = startY + 0.5; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    if (theme.marginColor) {
      ctx.strokeStyle = theme.marginColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const mx = 180 + ox;
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, height);
      ctx.stroke();
    }
  }
  void oy;
  ctx.restore();
}
