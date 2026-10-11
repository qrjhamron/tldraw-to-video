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
/** Baselines are explicit. Fractions align their bar to the math axis; nested
 * structures retain real extents, rather than centering by nominal height. */
export function mathLayout(expr: MathExpr, style: PenStyle): Layout {
  style = { ...style, style: style.style ?? "math" };
  const h = style.height ?? 40,
    c = style.color ?? "black",
    small = { ...style, height: h * 0.62, seed: style.seed + 31 },
    child = (e: MathExpr) => mathLayout(e, style),
    paths: Layout["paths"] = [],
    baseline = (l: Layout) => l.baseline ?? (h * 20) / 21;
  if (typeof expr === "string") return textLayout(expr, 0, 0, style);
  if (expr.type === "row") {
    const children = expr.items.map((e, i) =>
      mathLayout(e, { ...style, seed: style.seed + i * 197 }),
    );
    const base = Math.max(0, ...children.map(baseline));
    let x = 0,
      height = 0;
    for (const a of children) {
      const y = base - baseline(a);
      paths.push(...translate(a, x, y).paths);
      height = Math.max(height, y + a.height);
      x += a.width + h * 0.22;
    }
    return { paths, width: Math.max(0, x - h * 0.22), height, baseline: base };
  }
  if (expr.type === "fraction") {
    const a = child(expr.numerator),
      b = child(expr.denominator),
      w = Math.max(a.width, b.width) + h * 0.45,
      bar = a.height + h * 0.1,
      by = bar + h * 0.28;
    paths.push(
      ...translate(a, (w - a.width) / 2, 0).paths,
      path(
        [
          [0, bar],
          [w * 0.5, bar - h * 0.007],
          [w, bar],
        ],
        c,
        0.68,
      ),
      ...translate(b, (w - b.width) / 2, by).paths,
    );
    return { paths, width: w, height: by + b.height, baseline: bar + h * 0.32 };
  }
  if (expr.type === "script") {
    const a = child(expr.base),
      sup = expr.sup ? mathLayout(expr.sup, small) : undefined,
      sub = expr.sub
        ? mathLayout(expr.sub, { ...small, seed: small.seed + 17 })
        : undefined,
      top = sup ? h * 0.48 : 0;
    paths.push(...translate(a, 0, top).paths);
    if (sup) paths.push(...translate(sup, a.width + h * 0.02, 0).paths);
    if (sub)
      paths.push(...translate(sub, a.width + h * 0.02, top + h * 0.67).paths);
    return {
      paths,
      width:
        a.width +
        (sup || sub ? h * 0.02 : 0) +
        Math.max(sup?.width ?? 0, sub?.width ?? 0),
      height: Math.max(top + a.height, sub ? top + h * 0.67 + sub.height : 0),
      baseline: top + baseline(a),
    };
  }
  if (expr.type === "root") {
    const a = child(expr.body),
      top = h * 0.25,
      w = a.width + h * 0.85;
    paths.push(
      path(
        [
          [0, top + h * 0.6],
          [h * 0.18, top + h * 0.5],
          [h * 0.35, top + h],
          [h * 0.65, h * 0.04],
          [w, h * 0.04],
        ],
        c,
        0.75,
      ),
      ...translate(a, h * 0.8, top).paths,
    );
    return {
      paths,
      width: w,
      height: top + a.height,
      baseline: top + baseline(a),
    };
  }
  const a = textLayout(
      expr.type === "limit" ? "lim" : expr.type === "integral" ? "∫" : "Σ",
      0,
      0,
      style,
    ),
    b = child(expr.body),
    under =
      expr.type === "limit"
        ? mathLayout(expr.under, small)
        : expr.lower
          ? mathLayout(expr.lower, small)
          : undefined,
    upper =
      expr.type !== "limit" && expr.upper
        ? mathLayout(expr.upper, { ...small, seed: small.seed + 17 })
        : undefined,
    base = Math.max(baseline(a) + (upper ? h * 0.72 : 0), baseline(b)),
    ay = base - baseline(a),
    by = base - baseline(b),
    w = Math.max(a.width, under?.width ?? 0, upper?.width ?? 0),
    underY = ay + h * (expr.type === "integral" ? 1.52 : 1.38);
  if (upper)
    paths.push(...translate(upper, (w - upper.width) / 2, ay - h * 0.72).paths);
  paths.push(...translate(a, (w - a.width) / 2, ay).paths);
  if (under)
    paths.push(...translate(under, (w - under.width) / 2, underY).paths);
  paths.push(...translate(b, w + h * 0.32, by).paths);
  return {
    paths,
    width: w + h * 0.32 + b.width,
    height: Math.max(
      by + b.height,
      ay + a.height,
      under ? underY + under.height : 0,
    ),
    baseline: base,
  };
}
