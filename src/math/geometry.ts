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
/** Axis-aligned rectangle outline in canvas coordinates. */
export function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  color: InkPath["color"] = "black",
  weight = 1,
): InkPath[] {
  if (!(w > 0 && h > 0)) throw Error("rect needs positive w/h");
  return [
    path(
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x, y],
      ],
      color,
      weight,
    ),
  ];
}
/** Ellipse outline (64 samples) in canvas coordinates. */
export function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: InkPath["color"] = "red",
  weight = 1,
): InkPath[] {
  if (!(rx > 0 && ry > 0)) throw Error("ellipse needs positive radii");
  const pts: number[][] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return [path(pts, color, weight)];
}
/** Area-model grid: rows×cols cells over (x,y,w,h) with optional fills. */
export function areaModel(
  x: number,
  y: number,
  w: number,
  h: number,
  rows: number,
  cols: number,
  color: InkPath["color"] = "blue",
): InkPath[] {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1)
    throw Error("areaModel needs positive integer rows/cols");
  const out = rect(x, y, w, h, color);
  for (let r = 1; r < rows; r++)
    out.push(path([[x, y + (h * r) / rows], [x + w, y + (h * r) / rows]], color, 0.8));
  for (let c = 1; c < cols; c++)
    out.push(path([[x + (w * c) / cols, y], [x + (w * c) / cols, y + h]], color, 0.8));
  return out;
}
/** Fraction bar: `filled` of `total` segments shaded with hatch strokes. */
export function fractionBar(
  x: number,
  y: number,
  w: number,
  h: number,
  filled: number,
  total: number,
  color: InkPath["color"] = "green",
): InkPath[] {
  if (!Number.isInteger(total) || total < 1 || filled < 0 || filled > total)
    throw Error("fractionBar needs 0 ≤ filled ≤ total, total ≥ 1");
  const out = rect(x, y, w, h, "black");
  const sw = w / total;
  for (let i = 1; i < total; i++)
    out.push(path([[x + sw * i, y], [x + sw * i, y + h]], "black", 0.7));
  for (let f = 0; f < filled; f++) {
    const x0 = x + sw * f;
    for (let k = 1; k < 6; k++) {
      const t = (k / 6) * sw;
      out.push(path([[x0 + t, y + 2], [x0 + t, y + h - 2]], color, 2.2));
    }
  }
  return out;
}
/** Triangle through three canvas points. */
export function triangle(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  color: InkPath["color"] = "black",
  weight = 1,
): InkPath[] {
  return [path([a, b, c, a], color, weight)];
}
/** Right-triangle legs with the right-angle square at the corner. */
export function rightTriangle(
  x: number,
  y: number,
  legX: number,
  legY: number,
  color: InkPath["color"] = "black",
): InkPath[] {
  if (!(legX > 0 && legY > 0)) throw Error("rightTriangle needs positive legs");
  const s = Math.min(18, legX / 4, legY / 4);
  return [
    ...triangle([x, y], [x + legX, y], [x, y - legY], color),
    path(
      [
        [x + s, y],
        [x + s, y - s],
        [x, y - s],
      ],
      color,
      0.8,
    ),
  ];
}
/** Projection of vector (dx,dy) onto direction (ux,uy), drawn dashed. */
export function projection(
  x: number,
  y: number,
  dx: number,
  dy: number,
  ux: number,
  uy: number,
  color: InkPath["color"] = "orange",
): InkPath[] {
  const len = Math.hypot(ux, uy);
  if (!(len > 0)) throw Error("projection needs a nonzero direction");
  const t = (dx * ux + dy * uy) / (len * len),
    px = ux * t,
    py = uy * t,
    pts: number[][] = [];
  for (let i = 0; i <= 20; i += 2) {
    pts.push([x + (px * i) / 20, y + (py * i) / 20]);
    pts.push([x + (px * (i + 1)) / 20, y + (py * (i + 1)) / 20]);
  }
  return [
    path(pts, color, 1),
    path(
      [
        [x + dx, y + dy],
        [x + px, y + py],
      ],
      color,
      0.7,
    ),
  ];
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
