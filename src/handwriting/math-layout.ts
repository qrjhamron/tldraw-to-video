import { path } from "../lesson/paths";
import { textLayout, translate, type Layout, type PenStyle } from "./engine";
export type MathExpr =
  | string
  | { type: "row"; items: MathExpr[] }
  | { type: "fraction"; numerator: MathExpr; denominator: MathExpr }
  | { type: "script"; base: MathExpr; sup?: MathExpr; sub?: MathExpr }
  | { type: "root"; body: MathExpr }
  | { type: "limit"; under: MathExpr; body: MathExpr }
  | {
      type: "integral" | "sum";
      lower?: MathExpr;
      upper?: MathExpr;
      body: MathExpr;
    };
export const row = (...items: MathExpr[]): MathExpr => ({ type: "row", items });
export const fraction = (
  numerator: MathExpr,
  denominator: MathExpr,
): MathExpr => ({ type: "fraction", numerator, denominator });
export const script = (
  base: MathExpr,
  sup?: MathExpr,
  sub?: MathExpr,
): MathExpr => ({ type: "script", base, sup, sub });
export function mathLayout(expr: MathExpr, style: PenStyle): Layout {
  const h = style.height ?? 40,
    c = style.color ?? "black",
    small = { ...style, height: h * 0.62, seed: style.seed + 31 };
  if (typeof expr === "string") return textLayout(expr, 0, 0, style);
  const child = (e: MathExpr) => mathLayout(e, style),
    paths: Layout["paths"] = [];
  if (expr.type === "row") {
    const children = expr.items.map((item, i) =>
      mathLayout(item, { ...style, seed: style.seed + i * 197 }),
    );
    const max = Math.max(...children.map((a) => a.height));
    let x = 0;
    for (const a of children) {
      paths.push(...translate(a, x, (max - a.height) / 2).paths);
      x += a.width + h * 0.28;
    }
    return { paths, width: x, height: max };
  }
  if (expr.type === "fraction") {
    const a = child(expr.numerator),
      b = child(expr.denominator),
      w = Math.max(a.width, b.width) + h * 0.5;
    paths.push(
      ...translate(a, (w - a.width) / 2, 0).paths,
      path(
        [
          [0, h * 1.48],
          [w, h * 1.48],
        ],
        c,
        0.8,
      ),
      ...translate(b, (w - b.width) / 2, h * 1.85).paths,
    );
    return { paths, width: w, height: h * 1.85 + b.height };
  }
  if (expr.type === "script") {
    const a = child(expr.base);
    paths.push(...a.paths);
    let extra = 0;
    if (expr.sup) {
      const b = mathLayout(expr.sup, small);
      paths.push(...translate(b, a.width, -h * 0.48).paths);
      extra = Math.max(extra, b.width);
    }
    if (expr.sub) {
      const b = mathLayout(expr.sub, small);
      paths.push(...translate(b, a.width, h * 0.62).paths);
      extra = Math.max(extra, b.width);
    }
    return {
      paths,
      width: a.width + extra,
      height: a.height + (expr.sub ? h * 0.5 : 0),
    };
  }
  if (expr.type === "root") {
    const a = child(expr.body),
      w = a.width + h * 0.85;
    paths.push(
      path(
        [
          [0, h * 0.6],
          [h * 0.18, h * 0.5],
          [h * 0.35, h],
          [h * 0.65, -h * 0.18],
          [w, -h * 0.18],
        ],
        c,
        0.9,
      ),
      ...translate(a, h * 0.8, 0).paths,
    );
    return { paths, width: w, height: a.height };
  }
  const symbol =
    expr.type === "limit" ? "lim" : expr.type === "integral" ? "∫" : "Σ";
  const a = textLayout(symbol, 0, 0, style),
    b = child(expr.body);
  let w = a.width;
  if (expr.type === "limit") {
    const u = mathLayout(expr.under, small);
    paths.push(...translate(u, 0, h * 1.2).paths);
    w = Math.max(w, u.width);
  } else {
    if (expr.lower) {
      const l = mathLayout(expr.lower, small);
      paths.push(...translate(l, a.width * 0.35, h * 1.4).paths);
      w = Math.max(w, a.width * 0.35 + l.width);
    }
    if (expr.upper) {
      const u = mathLayout(expr.upper, small);
      paths.push(...translate(u, a.width * 0.55, -h * 0.5).paths);
      w = Math.max(w, a.width * 0.55 + u.width);
    }
  }
  paths.push(...a.paths, ...translate(b, w + h * 0.35, 0).paths);
  return {
    paths,
    width: w + h * 0.35 + b.width,
    height: Math.max(b.height, h * 2.2),
  };
}
