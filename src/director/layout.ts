/** Content-aware spatial layout for the infinite canvas.
 *
 * The planner measures real handwriting bounds (textLayout/mathLayout), packs
 * regions into a 1640×920 safe frame per chapter origin, detects overlaps and
 * clipping, and derives 16:9 camera framings from semantic content bounds.
 * Pure and deterministic: no editor, no randomness.
 */
import { textLayout, type Color } from "../handwriting/engine";
import { mathLayout, type MathExpr } from "../handwriting/math-layout";
import { frameBounds } from "../story/camera";
import { CANVAS_THEMES, type CanvasThemeId } from "../story/canvas-themes";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PlacedRegion extends Rect {
  id: string;
  purpose: string;
}

/** Teaching ink palette (must match src/story/theme.ts). */
export const INK_HEX: Record<Color, string> = {
  black: "#263238",
  blue: "#285d92",
  orange: "#b47a25",
  red: "#b84d46",
  grey: "#78817f",
  green: "#3e7869",
};

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg),
    b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/** Validate an ink color against a canvas theme background.
 * Default bar is 3.0 (WCAG large-text: all lesson handwriting is large
 * display lettering); pass 4.5 for strict body-text requirements. */
export function checkInkOnTheme(
  color: Color,
  theme: CanvasThemeId,
  minRatio = 3.0,
): { ok: boolean; ratio: number } {
  const ratio = contrastRatio(INK_HEX[color], CANVAS_THEMES[theme].background);
  return { ok: ratio >= minRatio, ratio };
}

export function measureText(
  text: string,
  height: number,
  seed = 1,
): { w: number; h: number } {
  const l = textLayout(text, 0, 0, { seed, height, style: "explanation" });
  return { w: l.width, h: l.height };
}
export function measureExpr(
  expr: MathExpr,
  height: number,
  seed = 1,
): { w: number; h: number } {
  const l = mathLayout(expr, { seed, height, style: "math" });
  return { w: l.width, h: l.height };
}

export function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return (
    a.x - pad < b.x + b.w + pad &&
    a.x + a.w + pad > b.x - pad &&
    a.y - pad < b.y + b.h + pad &&
    a.y + a.h + pad > b.y - pad
  );
}
export function union(rs: Rect[]): Rect {
  const x = Math.min(...rs.map((r) => r.x)),
    y = Math.min(...rs.map((r) => r.y));
  return {
    x,
    y,
    w: Math.max(...rs.map((r) => r.x + r.w)) - x,
    h: Math.max(...rs.map((r) => r.y + r.h)) - y,
  };
}

export interface PlannerOptions {
  frameW?: number;
  frameH?: number;
  margin?: number;
  seed?: number;
}
/** Flow planner: packs regions top-to-bottom in columns, tracks everything. */
export class CanvasPlanner {
  readonly frameW: number;
  readonly frameH: number;
  readonly margin: number;
  readonly regions = new Map<string, PlacedRegion>();
  private cursorY: number;
  private seed: number;
  constructor(opts: PlannerOptions = {}) {
    this.frameW = opts.frameW ?? 1640;
    this.frameH = opts.frameH ?? 920;
    this.margin = opts.margin ?? 80;
    this.cursorY = this.margin;
    this.seed = opts.seed ?? 1;
  }
  /** Reserve a block in the flow at column x with width w. */
  reserve(
    id: string,
    x: number,
    w: number,
    h: number,
    purpose: string,
    opts: { y?: number; gapAfter?: number } = {},
  ): PlacedRegion {
    if (this.regions.has(id)) throw Error(`Duplicate region ${id}`);
    if (!(w > 0 && h > 0)) throw Error(`Region ${id} needs positive size`);
    const y = opts.y ?? this.cursorY;
    const r: PlacedRegion = { id, x, y, w, h, purpose };
    this.regions.set(id, r);
    if (opts.y === undefined) this.cursorY = y + h + (opts.gapAfter ?? 36);
    return r;
  }
  /** Place a measured text line in the flow. */
  textLine(id: string, text: string, x: number, height: number, purpose: string): PlacedRegion {
    const m = measureText(text, height, this.seed++);
    return this.reserve(id, x, m.w, m.h, purpose);
  }
  /** Place a measured equation in the flow. */
  equation(id: string, expr: MathExpr, x: number, height: number, purpose: string): PlacedRegion {
    const m = measureExpr(expr, height, this.seed++);
    return this.reserve(id, x, m.w, m.h, purpose);
  }
  get(id: string): PlacedRegion {
    const r = this.regions.get(id);
    if (!r) throw Error(`Unknown region ${id}`);
    return r;
  }
  /** Ids overlapping the given rect (excluding `except`). */
  collisions(rect: Rect, except: string[] = [], pad = 8): string[] {
    const out: string[] = [];
    for (const [id, r] of this.regions)
      if (!except.includes(id) && overlaps(rect, r, pad)) out.push(id);
    return out;
  }
  /** All pairwise overlaps currently registered. */
  allOverlaps(pad = 8): [string, string][] {
    const ids = [...this.regions.keys()],
      out: [string, string][] = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = this.regions.get(ids[i])!,
          b = this.regions.get(ids[j])!;
        if (overlaps(a, b, pad)) out.push([ids[i], ids[j]]);
      }
    return out;
  }
  /** Regions sticking out of the safe frame. */
  outOfFrame(): string[] {
    const out: string[] = [];
    for (const [id, r] of this.regions)
      if (
        r.x < 0 ||
        r.y < 0 ||
        r.x + r.w > this.frameW ||
        r.y + r.h > this.frameH
      )
        out.push(id);
    return out;
  }
  /** Camera that frames regions with margin, clamped to sane zoom. */
  frameFor(ids: string[], margin = 90): { x: number; y: number; z: number } {
    if (!ids.length) throw Error("frameFor needs at least one region");
    const box = union(ids.map((id) => this.get(id)));
    // Never zoom tighter than 1.6x or wider than the full frame.
    const w = Math.min(Math.max(box.w, 500), this.frameW),
      h = Math.min(Math.max(box.h, 300), this.frameH);
    const cx = box.x + box.w / 2,
      cy = box.y + box.h / 2;
    return frameBounds(
      { x: cx - w / 2, y: cy - h / 2, w, h },
      { width: 1920, height: 1080 },
      margin,
    );
  }
}

// --- Layout primitives (pure rect math over measured sizes) ---
/** Vertical derivation: stacked equations with reason gutters. */
export function derivationColumn(
  x: number,
  y: number,
  rows: { w: number; h: number }[],
  gap = 44,
): Rect[] {
  const out: Rect[] = [];
  let cy = y;
  for (const r of rows) {
    out.push({ x, y: cy, w: r.w, h: r.h });
    cy += r.h + gap;
  }
  return out;
}
/** Side-by-side comparison within total width. */
export function sideBySide(
  x: number,
  y: number,
  totalW: number,
  leftW: number,
  h: number,
  gap = 60,
): { left: Rect; right: Rect } {
  const rightW = totalW - leftW - gap;
  if (rightW <= 0) throw Error("sideBySide needs positive right width");
  return {
    left: { x, y, w: leftW, h },
    right: { x: x + leftW + gap, y, w: rightW, h },
  };
}
/** Graph panel with adjacent explanation column. */
export function graphWithExplanation(
  x: number,
  y: number,
  totalW: number,
  h: number,
  graphW = 720,
  gap = 70,
): { graph: Rect; text: Rect } {
  const textW = totalW - graphW - gap;
  if (textW <= 0) throw Error("graphWithExplanation needs positive text width");
  return {
    graph: { x, y, w: graphW, h },
    text: { x: x + graphW + gap, y, w: textW, h },
  };
}
