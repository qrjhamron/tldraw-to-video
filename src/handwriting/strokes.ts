/** Shared native ink primitives; independent of lettering and lesson authoring. */
export interface Point {
  x: number;
  y: number;
  z: number;
}
export interface InkPath {
  points: Point[];
  color: "black" | "blue" | "red" | "green" | "orange" | "grey";
  scale: number;
  pen?: {
    glyph: string;
    stroke: number;
    style: string;
    tempo: number;
    liftMs: number;
  };
}
export function length(points: Point[]) {
  let sum = 0;
  for (let i = 1; i < points.length; i++)
    sum += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
  return sum;
}
export function resample(input: Point[]): Point[] {
  const out: Point[] = [input[0]];
  for (let i = 1; i < input.length; i++) {
    const a = input[i - 1],
      b = input[i],
      n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2.5));
    for (let j = 1; j <= n; j++) {
      const f = j / n;
      out.push({
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        z: 0.52 + 0.12 * Math.sin((out.length + 1) * 0.09),
      });
    }
  }
  if (out.length === 1) out.push({ ...out[0], x: out[0].x + 0.15 });
  return out;
}
export function prefix(points: Point[], fraction: number): Point[] {
  if (fraction >= 1) return points;
  const target = length(points) * Math.max(0, fraction);
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      d = Math.hypot(b.x - a.x, b.y - a.y);
    if (travelled + d >= target) {
      const f = (target - travelled) / (d || 1);
      return [
        ...points.slice(0, i),
        {
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          z: a.z + (b.z - a.z) * f,
        },
      ];
    }
    travelled += d;
  }
  return points;
}
export function path(
  coords: number[][],
  color: InkPath["color"] = "black",
  scale = 0.85,
): InkPath {
  return {
    points: resample(coords.map(([x, y]) => ({ x, y, z: 0.55 }))),
    color,
    scale,
  };
}
