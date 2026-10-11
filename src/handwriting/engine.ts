import { length, resample, type InkPath, type Point } from "./strokes";
import { handwritingGlyphs, mathGlyphs } from "./glyphs";
export { mathGlyphs } from "./glyphs";
export type Color = InkPath["color"];
export type HandwritingStyle =
  | "title"
  | "heading"
  | "explanation"
  | "annotation"
  | "math";
export interface PenStyle {
  seed: number;
  variation?: number;
  slant?: number;
  color?: Color;
  height?: number;
  style?: HandwritingStyle;
}
export interface Layout {
  paths: InkPath[];
  width: number;
  height: number;
  baseline?: number;
}
export const penStyles = {
  title: {
    slant: 0.01,
    width: 1.06,
    weight: 1.1,
    variation: 0.55,
    spacing: 0.07,
  },
  heading: {
    slant: 0.015,
    width: 1.04,
    weight: 1.02,
    variation: 0.65,
    spacing: 0.065,
  },
  explanation: {
    slant: 0.09,
    width: 0.96,
    weight: 0.77,
    variation: 1,
    spacing: 0.035,
  },
  annotation: {
    slant: 0.12,
    width: 0.94,
    weight: 0.72,
    variation: 1.1,
    spacing: 0.03,
  },
  math: {
    slant: 0.035,
    width: 1,
    weight: 0.8,
    variation: 0.45,
    spacing: 0.045,
  },
} as const;
export function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Sample authored Bézier centerlines. Separate M commands stay separate pen strokes.
 * Smooth variation deforms control points once, rather than shaking every sample. */
export function sampleGlyph(
  d: string,
  deform = (x: number, y: number): Point => ({ x, y, z: 0.5 }),
): Point[][] {
  const tokens = d.match(/[MLQC]|-?\d+(?:\.\d+)?/g);
  if (!tokens || tokens.join("") !== d.replace(/[\s,]/g, ""))
    throw Error("Invalid authored stroke path");
  const strokes: Point[][] = [];
  let i = 0,
    command = "",
    current: Point = { x: 0, y: 0, z: 0.5 },
    out: Point[] = [];
  const point = () => deform(Number(tokens[i++]), Number(tokens[i++]));
  while (i < tokens.length) {
    if (/^[MLQC]$/.test(tokens[i])) command = tokens[i++];
    if (command === "M") {
      current = point();
      out = [current];
      strokes.push(out);
      command = "L";
      continue;
    }
    const a = current;
    if (command === "L") {
      current = point();
      out.push(current);
      continue;
    }
    if (command !== "Q" && command !== "C")
      throw Error("Invalid stroke command");
    const b = point(),
      c = point(),
      end = command === "C" ? point() : c;
    const polygonLength =
      Math.hypot(b.x - a.x, b.y - a.y) +
      Math.hypot(c.x - b.x, c.y - b.y) +
      (command === "C" ? Math.hypot(end.x - c.x, end.y - c.y) : 0);
    const steps = Math.max(4, Math.ceil(polygonLength / 1.2));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps,
        u = 1 - t;
      out.push(
        command === "Q"
          ? {
              x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
              y: u * u * a.y + 2 * u * t * b.y + t * t * c.y,
              z: 0.5,
            }
          : {
              x:
                u * u * u * a.x +
                3 * u * u * t * b.x +
                3 * u * t * t * c.x +
                t * t * t * end.x,
              y:
                u * u * u * a.y +
                3 * u * u * t * b.y +
                3 * u * t * t * c.y +
                t * t * t * end.y,
              z: 0.5,
            },
      );
    }
    current = end;
  }
  return strokes.map(resample);
}
export function textLayout(
  text: string,
  x = 0,
  y = 0,
  style: PenStyle = { seed: 1 },
): Layout {
  const rng = random(style.seed),
    h = style.height ?? 40,
    profile = penStyles[style.style ?? "explanation"],
    v = Math.max(0, Math.min(1.5, style.variation ?? profile.variation)),
    color = style.color ?? "black";
  const paths: InkPath[] = [];
  let cursor = x,
    line = y,
    maxWidth = 0,
    superscript = false,
    drift = 0;
  for (const ch of text.normalize("NFC")) {
    if (ch === "\n") {
      maxWidth = Math.max(maxWidth, cursor - x);
      cursor = x;
      line += h * 1.65;
      drift = 0;
      continue;
    }
    if (ch === "^") {
      if (superscript) throw Error("Empty superscript");
      superscript = true;
      continue;
    }
    if (ch === " ") {
      cursor += h * (0.32 + (rng() - 0.5) * 0.045 * v);
      continue;
    }
    const glyph = mathGlyphs[ch] ?? handwritingGlyphs[ch];
    if (!glyph) throw Error(`Unsupported stroke glyph: ${ch}`);
    const s = (h / 21) * (superscript ? 0.62 : 1),
      sx = s * profile.width * (1 + (rng() - 0.5) * 0.065 * v),
      sy = s * (1 + (rng() - 0.5) * 0.06 * v),
      slant = (style.slant ?? profile.slant) + (rng() - 0.5) * 0.09 * v,
      bend = (rng() - 0.5) * 0.8 * v,
      bow = (rng() - 0.5) * 0.65 * v;
    drift = drift * 0.72 + (rng() - 0.5) * h * 0.027 * v;
    const dy =
      drift + (rng() - 0.5) * h * 0.035 * v - (superscript ? h * 0.44 : 0);
    const strokes = sampleGlyph(glyph.d, (gx, gy) => ({
      x:
        cursor +
        gx * sx +
        slant * (21 - gy) * s +
        Math.sin((gy / 21) * Math.PI) * bend * s,
      y: line + (gy - 1) * sy + dy + Math.sin((gx / 24) * Math.PI) * bow * s,
      z: 0.5,
    }));
    for (let j = 0; j < strokes.length; j++) {
      const dense = strokes[j],
        phase = rng() * Math.PI * 2,
        bias = (rng() - 0.5) * 0.07 * v;
      let travelled = 0;
      const total = length(dense);
      const points = dense.map((p, i) => {
        if (i)
          travelled += Math.hypot(p.x - dense[i - 1].x, p.y - dense[i - 1].y);
        const f = travelled / (total || 1),
          taper = Math.sin(Math.PI * f) ** 0.35;
        return {
          ...p,
          z: Math.max(
            0.21,
            Math.min(
              0.64,
              0.24 + 0.32 * taper + bias + 0.025 * v * Math.sin(f * 6 + phase),
            ),
          ),
        };
      });
      paths.push({
        points,
        color,
        scale: profile.weight * Math.max(0.72, Math.min(1.15, h / 40)),
        pen: {
          glyph: ch,
          stroke: j,
          style: style.style ?? "explanation",
          tempo: 0.93 + rng() * 0.14,
          liftMs: 25 + rng() * 35 + (j === strokes.length - 1 ? 20 : 0),
        },
      });
    }
    cursor +=
      glyph.advance * sx + h * (profile.spacing + (rng() - 0.5) * 0.045 * v);
    superscript = false;
  }
  if (superscript) throw Error("Empty superscript");
  return {
    paths,
    width: Math.max(maxWidth, cursor - x),
    height: line - y + h * 1.4,
    baseline: (h * 20) / 21,
  };
}
/** Minimum-jerk velocity profile; absolute time makes seeks reproducible. */
export function penProgress(t: number) {
  t = Math.max(0, Math.min(1, t));
  return t * t * t * (10 + t * (-15 + 6 * t));
}
/** Curvature adds a small time cost at turns. Distance remains monotonic and
 * the end points remain exact; this also avoids racing through tight bowls. */
export function strokeProgress(points: Point[], t: number) {
  const f = penProgress(t);
  if (f === 0 || f === 1 || points.length < 3) return f;
  const distances: number[] = [0],
    costs: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      d = Math.hypot(b.x - a.x, b.y - a.y);
    let turn = 0;
    if (i < points.length - 1) {
      const c = points[i + 1];
      turn = Math.abs(
        Math.atan2(
          (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x),
          (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y),
        ),
      );
    }
    distances.push(distances[i - 1] + d);
    costs.push(costs[i - 1] + d * (1 + turn * 1.8));
  }
  const target = f * costs.at(-1)!;
  const i = costs.findIndex((c) => c >= target);
  const q = (target - costs[i - 1]) / (costs[i] - costs[i - 1] || 1);
  return (
    (distances[i - 1] + q * (distances[i] - distances[i - 1])) /
    (distances.at(-1) || 1)
  );
}
export function strokeDuration(points: Point[], speed = 210) {
  return 1000 * Math.max(0.08, length(points) / speed);
}
export function translate(layout: Layout, x: number, y: number): Layout {
  return {
    ...layout,
    paths: layout.paths.map((p) => ({
      ...p,
      points: p.points.map((q) => ({ ...q, x: q.x + x, y: q.y + y })),
    })),
  };
}
