import { path, type InkPath } from "../lesson/paths";
import { textLayout } from "../handwriting/engine";
import {
  evaluate,
  derivative,
  secantSlope,
  ticks,
  riemann,
  type FunctionModel,
} from "./models";
export interface Graph {
  x: number;
  y: number;
  width: number;
  height: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}
export function project(g: Graph, x: number, y: number) {
  return [
    g.x + ((x - g.xMin) / (g.xMax - g.xMin)) * g.width,
    g.y + g.height - ((y - g.yMin) / (g.yMax - g.yMin)) * g.height,
  ];
}
export function axes(g: Graph, seed = 1): InkPath[] {
  const out: InkPath[] = [];
  const y = Math.max(g.yMin, Math.min(g.yMax, 0)),
    x = Math.max(g.xMin, Math.min(g.xMax, 0));
  out.push(
    path([project(g, g.xMin, y), project(g, g.xMax, y)]),
    path([project(g, x, g.yMin), project(g, x, g.yMax)]),
  );
  for (const t of ticks(g.xMin, g.xMax)) {
    const [px, py] = project(g, t, y);
    out.push(
      path([
        [px, py - 5],
        [px, py + 5],
      ]),
      ...textLayout(String(t), px - 10, py + 18, {
        seed: seed++,
        height: 22,
        style: "math",
      }).paths,
    );
  }
  for (const t of ticks(g.yMin, g.yMax)) {
    if (t === 0) continue;
    const [px, py] = project(g, x, t);
    out.push(
      path([
        [px - 5, py],
        [px + 5, py],
      ]),
      ...textLayout(String(t), px - 55, py - 12, {
        seed: seed++,
        height: 22,
        style: "math",
      }).paths,
    );
  }
  return out;
}
export function functionPlot(
  g: Graph,
  f: FunctionModel,
  color: InkPath["color"] = "blue",
): InkPath[] {
  // Split at discontinuities and clip by mathematical range; no connecting across invalid samples.
  const out: InkPath[] = [];
  let coords: number[][] = [];
  const flush = () => {
    if (coords.length > 1) out.push(path(coords, color, 1.1));
    coords = [];
  };
  for (let i = 0; i <= 320; i++) {
    const x = g.xMin + ((g.xMax - g.xMin) * i) / 320,
      y = evaluate(f, x);
    if (Number.isFinite(y) && y >= g.yMin && y <= g.yMax)
      coords.push(project(g, x, y));
    else flush();
  }
  flush();
  return out;
}
export function point(
  g: Graph,
  x: number,
  y: number,
  color: InkPath["color"] = "red",
) {
  const [px, py] = project(g, x, y);
  return path(
    Array.from({ length: 21 }, (_, i) => [
      px + 4 * Math.cos((i * Math.PI) / 10),
      py + 4 * Math.sin((i * Math.PI) / 10),
    ]),
    color,
    1.7,
  );
}
export function slopeLine(
  g: Graph,
  f: FunctionModel,
  x: number,
  q?: number,
  color: InkPath["color"] = "orange",
) {
  const m = q === undefined ? derivative(f, x) : secantSlope(f, x, q),
    y = evaluate(f, x);
  const coords: number[][] = [];
  for (let i = 0; i <= 120; i++) {
    const t = g.xMin + ((g.xMax - g.xMin) * i) / 120,
      v = y + m * (t - x);
    if (v >= g.yMin && v <= g.yMax) coords.push(project(g, t, v));
  }
  return path(coords, color, 1.1);
}
export function slopeTriangle(g: Graph, f: FunctionModel, x: number, dx = 1) {
  const y = evaluate(f, x),
    dy = derivative(f, x) * dx;
  return path(
    [project(g, x, y), project(g, x + dx, y), project(g, x + dx, y + dy)],
    "red",
  );
}
export function rectangles(
  g: Graph,
  f: FunctionModel,
  a: number,
  b: number,
  n: number,
): InkPath[] {
  return riemann(f, a, b, n).map((r) =>
    path(
      [
        project(g, r.x, 0),
        project(g, r.x, r.height),
        project(g, r.x + r.width, r.height),
        project(g, r.x + r.width, 0),
      ],
      "orange",
      0.65,
    ),
  );
}
export function shadedArea(
  g: Graph,
  f: FunctionModel,
  a: number,
  b: number,
): InkPath[] {
  return Array.from({ length: 45 }, (_, i) => {
    const x = a + ((b - a) * (i + 0.5)) / 45;
    return path(
      [project(g, x, 0), project(g, x, evaluate(f, x))],
      "orange",
      0.6,
    );
  });
}
export function numberLine(
  x: number,
  y: number,
  width: number,
  min: number,
  max: number,
): InkPath[] {
  const g: Graph = {
    x,
    y: y - 1,
    width,
    height: 1,
    xMin: min,
    xMax: max,
    yMin: 0,
    yMax: 1,
  };
  return axes(g);
}
export function vector(
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: InkPath["color"] = "blue",
): InkPath[] {
  const angle = Math.atan2(dy, dx),
    tip = [x + dx, y + dy];
  return [
    path([[x, y], tip], color),
    path(
      [
        [
          tip[0] - 14 * Math.cos(angle - 0.45),
          tip[1] - 14 * Math.sin(angle - 0.45),
        ],
        tip,
        [
          tip[0] - 14 * Math.cos(angle + 0.45),
          tip[1] - 14 * Math.sin(angle + 0.45),
        ],
      ],
      color,
    ),
  ];
}
