import font from "../lesson/hershey.json";
import { length, resample, type InkPath, type Point } from "../lesson/paths";
export type Color = InkPath["color"];
export interface PenStyle {
  seed: number;
  variation?: number;
  slant?: number;
  color?: Color;
  height?: number;
}
export interface Layout {
  paths: InkPath[];
  width: number;
  height: number;
}
// Custom centerline glyphs: ordered pen-down paths, authored for this project.
export const mathGlyphs: Record<string, { d: string; advance: number }> = {
  "·": { d: "M5,11 L6,12 5,13 4,12 5,11", advance: 12 },
  "≤": { d: "M20,3 L2,11 20,19 M2,23 L20,23", advance: 25 },
  "≥": { d: "M2,3 L20,11 2,19 M2,23 L20,23", advance: 25 },
  "∫": {
    d: "M18,1 L15,0 12,1 10,4 9,9 8,16 7,23 5,28 2,30 -1,29",
    advance: 23,
  },
  Σ: { d: "M22,1 L1,1 12,11 1,22 22,22", advance: 26 },
  "√": { d: "M0,13 L4,12 8,22 14,0 27,0", advance: 29 },
  π: { d: "M1,7 L23,7 M7,7 L6,22 M18,7 L17,19 19,22 22,21", advance: 26 },
  θ: {
    d: "M12,1 L7,2 3,7 2,14 5,20 10,22 16,20 20,14 19,7 16,2 12,1 M3,11 L19,11",
    advance: 25,
  },
  α: {
    d: "M19,7 L14,6 9,8 5,13 5,18 8,22 13,21 18,16 21,7 M18,16 L21,22 24,21",
    advance: 27,
  },
  β: {
    d: "M3,29 L5,7 8,2 12,0 17,2 18,6 15,10 7,12 M7,12 L15,12 19,15 18,19 14,22 5,22",
    advance: 24,
  },
  Δ: { d: "M12,1 L1,22 23,22 12,1", advance: 26 },
  "→": { d: "M1,12 L23,12 M17,6 L23,12 17,18", advance: 27 },
  "↔": { d: "M1,12 L23,12 M17,6 L23,12 17,18 M7,6 L1,12 7,18", advance: 27 },
  "≠": { d: "M2,9 L22,9 M2,16 L22,16 M17,2 L7,23", advance: 26 },
  "≈": {
    d: "M1,9 L5,6 10,7 16,11 21,10 24,7 M1,17 L5,14 10,15 16,19 21,18 24,15",
    advance: 28,
  },
  "×": { d: "M3,4 L19,20 M19,4 L3,20", advance: 25 },
  "∞": {
    d: "M12,12 L9,7 5,6 1,8 0,12 2,16 6,17 10,14 15,8 19,6 23,8 24,12 22,16 18,17 14,14 12,12",
    advance: 28,
  },
};
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
export function textLayout(
  text: string,
  x = 0,
  y = 0,
  style: PenStyle = { seed: 1 },
): Layout {
  const rng = random(style.seed),
    h = style.height ?? 40,
    v = style.variation ?? 0.35,
    color = style.color ?? "black";
  const paths: InkPath[] = [];
  let cursor = x,
    baseline = y,
    maxWidth = 0;
  let superscript = false;
  for (const ch of text) {
    if (ch === "\n") {
      maxWidth = Math.max(maxWidth, cursor - x);
      cursor = x;
      baseline += h * 2;
      continue;
    }
    if (ch === "^") {
      superscript = true;
      continue;
    }
    if (ch === " ") {
      cursor += h * (0.4 + (rng() - 0.5) * 0.04 * v);
      continue;
    }
    const glyph = font.chars[ch.charCodeAt(0) - 33],
      special = mathGlyphs[ch];
    const d = special?.d ?? glyph?.d;
    if (!d) throw Error(`Unsupported stroke glyph: ${ch}`);
    const s =
      (h / 21) * (superscript ? 0.62 : 1) * (1 + (rng() - 0.5) * 0.025 * v);
    const dy = (superscript ? -h * 0.44 : 0) + (rng() - 0.5) * h * 0.045 * v;
    const slant = (style.slant ?? 0.045) + (rng() - 0.5) * 0.04 * v;
    for (const segment of d.split("M").filter(Boolean)) {
      const nums = segment
        .replace(/L/g, " ")
        .match(/-?\d+(?:\.\d+)?/g)!
        .map(Number);
      const vertices: Point[] = [];
      for (let i = 0; i < nums.length; i += 2)
        vertices.push({
          x: cursor + (nums[i] + slant * (22 - nums[i + 1])) * s,
          y: baseline + (nums[i + 1] - 1) * s + dy,
          z: 0.5,
        });
      const dense = resample(vertices),
        phase = rng() * 6.28;
      // Pressure tapers at pen entry/exit; restrained deterministic microvariation.
      const points = dense.map((p, i) => {
        const f = i / Math.max(1, dense.length - 1),
          taper = Math.sin(Math.PI * f) ** 0.3;
        return {
          ...p,
          x: p.x + Math.sin(i * 0.19 + phase) * 0.12 * v,
          y: p.y + Math.cos(i * 0.17 + phase) * 0.12 * v,
          z: 0.25 + 0.35 * taper + 0.035 * Math.sin(f * 9 + phase),
        };
      });
      paths.push({ points, color, scale: h >= 48 ? 1.05 : 0.85 });
    }
    cursor +=
      (special?.advance ?? glyph.o * 2 + 2) * s +
      h * (0.025 + (rng() - 0.5) * 0.04 * v);
    superscript = false;
  }
  return {
    paths,
    width: Math.max(maxWidth, cursor - x),
    height: baseline - y + h * 1.4,
  };
}
/** Minimum-jerk velocity profile: entry/exit slow down with no frame integration. */
export function penProgress(t: number) {
  t = Math.max(0, Math.min(1, t));
  return t * t * t * (10 + t * (-15 + 6 * t));
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
