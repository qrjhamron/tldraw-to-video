/** Semantic mathematical expression AST with stable node identities.
 *
 * Every node carries a stable `id` so equation transformations can track term
 * correspondence (retained / modified / removed / introduced) across steps.
 * IDs come from a caller-provided Scope, keeping construction deterministic.
 * Rendering lowers to MathExpr (multi-color aware); evaluation is real
 * arithmetic with explicit domain failures (see verify.ts).
 */
import type { Color } from "../handwriting/engine";
import type { MathExpr } from "../handwriting/math-layout";
import { row, fraction, script, paint } from "../handwriting/math-layout";

export interface Scope {
  next: number;
}
export function createScope(start = 1): Scope {
  return { next: start };
}
function takeId(s: Scope, prefix = "t"): string {
  return `${prefix}${s.next++}`;
}

export type FuncName = "sin" | "cos" | "tan" | "exp" | "ln" | "log" | "abs";
export interface Span {
  id: string;
  color?: Color;
}
export type Expr =
  | ({ kind: "num"; value: number } & Span)
  | ({ kind: "sym"; name: string } & Span)
  | ({ kind: "add"; terms: Expr[] } & Span)
  | ({ kind: "mul"; factors: Expr[] } & Span)
  | ({ kind: "neg"; arg: Expr } & Span)
  | ({ kind: "div"; num: Expr; den: Expr } & Span)
  | ({ kind: "pow"; base: Expr; exp: Expr } & Span)
  | ({ kind: "sqrt"; arg: Expr; index?: Expr } & Span)
  | ({ kind: "func"; name: FuncName; arg: Expr; base?: number } & Span)
  | ({ kind: "eq"; left: Expr; right: Expr } & Span)
  | ({ kind: "cancel"; arg: Expr; style: "slash" | "cross" } & Span)
  | ({ kind: "paren"; arg: Expr } & Span);

// --- Builders (fresh ids unless a node is reused for correspondence) ---
export const num = (s: Scope, value: number, color?: Color): Expr => {
  if (!Number.isFinite(value)) throw Error("num requires a finite value");
  return { kind: "num", value, id: takeId(s), ...(color ? { color } : {}) };
};
export const sym = (s: Scope, name: string, color?: Color): Expr => {
  if (!/^(?:\p{L}|\d)+$/u.test(name) || !/\p{L}/u.test(name))
    throw Error(`Invalid symbol name: ${name}`);
  return { kind: "sym", name, id: takeId(s), ...(color ? { color } : {}) };
};
export const add = (s: Scope, terms: Expr[], color?: Color): Expr => {
  if (terms.length < 2) throw Error("add needs at least two terms");
  return { kind: "add", terms, id: takeId(s), ...(color ? { color } : {}) };
};
export const mul = (s: Scope, factors: Expr[], color?: Color): Expr => {
  if (factors.length < 2) throw Error("mul needs at least two factors");
  return { kind: "mul", factors, id: takeId(s), ...(color ? { color } : {}) };
};
export const sub = (s: Scope, a: Expr, b: Expr, color?: Color): Expr =>
  add(s, [a, neg(s, b)], color);
export const neg = (s: Scope, arg: Expr, color?: Color): Expr => ({
  kind: "neg",
  arg,
  id: takeId(s),
  ...(color ? { color } : {}),
});
export const div = (s: Scope, n: Expr, d: Expr, color?: Color): Expr => ({
  kind: "div",
  num: n,
  den: d,
  id: takeId(s),
  ...(color ? { color } : {}),
});
export const pow = (s: Scope, base: Expr, exp: Expr, color?: Color): Expr => ({
  kind: "pow",
  base,
  exp,
  id: takeId(s),
  ...(color ? { color } : {}),
});
export const sqrt = (s: Scope, arg: Expr, index?: Expr, color?: Color): Expr => ({
  kind: "sqrt",
  arg,
  ...(index ? { index } : {}),
  id: takeId(s),
  ...(color ? { color } : {}),
});
export const func = (
  s: Scope,
  name: FuncName,
  arg: Expr,
  base?: number,
  color?: Color,
): Expr => ({
  kind: "func",
  name,
  arg,
  ...(base !== undefined ? { base } : {}),
  id: takeId(s),
  ...(color ? { color } : {}),
});
export const eq = (s: Scope, left: Expr, right: Expr, color?: Color): Expr => ({
  kind: "eq",
  left,
  right,
  id: takeId(s),
  ...(color ? { color } : {}),
});
export const paren = (s: Scope, arg: Expr, color?: Color): Expr => ({
  kind: "paren",
  arg,
  id: takeId(s),
  ...(color ? { color } : {}),
});
export const cancel = (
  s: Scope,
  arg: Expr,
  style: "slash" | "cross" = "slash",
  color?: Color,
): Expr => ({
  kind: "cancel",
  arg,
  style,
  id: takeId(s),
  ...(color ? { color } : {}),
});

/** Deep clone with fresh ids (introduced nodes); original keeps its ids. */
export function cloneExpr(s: Scope, e: Expr): Expr {
  const c = (x: Expr): Expr => {
    const id = takeId(s);
    switch (x.kind) {
      case "num":
        return { ...x, id };
      case "sym":
        return { ...x, id };
      case "add":
        return { ...x, id, terms: x.terms.map(c) };
      case "mul":
        return { ...x, id, factors: x.factors.map(c) };
      case "neg":
        return { ...x, id, arg: c(x.arg) };
      case "div":
        return { ...x, id, num: c(x.num), den: c(x.den) };
      case "pow":
        return { ...x, id, base: c(x.base), exp: c(x.exp) };
      case "sqrt":
        return { ...x, id, arg: c(x.arg), ...(x.index ? { index: c(x.index) } : {}) };
      case "func":
        return { ...x, id, arg: c(x.arg) };
      case "eq":
        return { ...x, id, left: c(x.left), right: c(x.right) };
      case "cancel":
        return { ...x, id, arg: c(x.arg) };
      case "paren":
        return { ...x, id, arg: c(x.arg) };
    }
  };
  return c(e);
}

/** Structural hash ignoring ids/colors (for correspondence + equality). */
export function shape(e: Expr): string {
  switch (e.kind) {
    case "num":
      return `N${e.value}`;
    case "sym":
      return `S${e.name}`;
    case "add":
      return `A[${e.terms.map(shape).join(",")}]`;
    case "mul":
      return `M[${e.factors.map(shape).join(",")}]`;
    case "neg":
      return `-${shape(e.arg)}`;
    case "div":
      return `D(${shape(e.num)},${shape(e.den)})`;
    case "pow":
      return `P(${shape(e.base)},${shape(e.exp)})`;
    case "sqrt":
      return `R(${shape(e.arg)}${e.index ? `,${shape(e.index)}` : ""})`;
    case "func":
      return `F${e.name}${e.base ?? ""}(${shape(e.arg)})`;
    case "eq":
      return `E(${shape(e.left)},${shape(e.right)})`;
    case "cancel":
      return `X(${shape(e.arg)})`;
    case "paren":
      return `(${shape(e.arg)})`;
  }
}
export function shapeEqual(a: Expr, b: Expr): boolean {
  return shape(a) === shape(b);
}
export function collectIds(e: Expr, into = new Map<string, Expr>()): Map<string, Expr> {
  into.set(e.id, e);
  for (const child of children(e)) collectIds(child, into);
  return into;
}
export function children(e: Expr): Expr[] {
  switch (e.kind) {
    case "num":
    case "sym":
      return [];
    case "add":
      return e.terms;
    case "mul":
      return e.factors;
    case "neg":
    case "paren":
    case "cancel":
    case "sqrt":
      return e.kind === "sqrt" && e.index ? [e.arg, e.index] : [(e as { arg: Expr }).arg];
    case "func":
      return [e.arg];
    case "div":
      return [e.num, e.den];
    case "pow":
      return [e.base, e.exp];
    case "eq":
      return [e.left, e.right];
  }
}
export function findById(e: Expr, id: string): Expr | undefined {
  return collectIds(e).get(id);
}
export function variables(e: Expr, into = new Set<string>()): Set<string> {
  if (e.kind === "sym") into.add(e.name);
  for (const c of children(e)) variables(c, into);
  return into;
}

export interface Correspondence {
  retained: string[];
  modified: string[];
  removed: string[];
  introduced: string[];
}
/** Term correspondence between consecutive expressions, by stable id. */
export function diffExpr(before: Expr, after: Expr): Correspondence {
  const a = collectIds(before),
    b = collectIds(after);
  const retained: string[] = [],
    modified: string[] = [],
    removed: string[] = [],
    introduced: string[] = [];
  for (const [id, node] of a) {
    const other = b.get(id);
    if (!other) removed.push(id);
    else if (shape(node) === shape(other)) retained.push(id);
    else modified.push(id);
  }
  for (const id of b.keys()) if (!a.has(id)) introduced.push(id);
  const sort = (xs: string[]) =>
    xs.sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)));
  return {
    retained: sort(retained),
    modified: sort(modified),
    removed: sort(removed),
    introduced: sort(introduced),
  };
}

// --- Evaluation with explicit domain failures ---
export interface EvalOk {
  ok: true;
  value: number;
  restrictions: string[];
}
export interface EvalFail {
  ok: false;
  reason: string;
  restrictions: string[];
}
export type EvalResult = EvalOk | EvalFail;
const fail = (reason: string, restrictions: string[] = []): EvalFail => ({
  ok: false,
  reason,
  restrictions,
});

export function evaluate(
  e: Expr,
  env: Record<string, number> = {},
): EvalResult {
  const R: string[] = [];
  const val = (x: Expr): number => {
    switch (x.kind) {
      case "num":
        return x.value;
      case "sym": {
        const v = env[x.name];
        if (v === undefined || !Number.isFinite(v))
          throw fail(`unbound variable ${x.name}`);
        return v;
      }
      case "add":
        return x.terms.reduce((s, t) => s + val(t), 0);
      case "mul":
        return x.factors.reduce((s, t) => s * val(t), 1);
      case "neg":
        return -val(x.arg);
      case "div": {
        const d = val(x.den);
        R.push(`penyebut ≠ 0`);
        if (d === 0) throw fail("division by zero");
        return val(x.num) / d;
      }
      case "pow": {
        const b = val(x.base),
          p = val(x.exp);
        if (b === 0 && p === 0) throw fail("0^0 undefined");
        const v = b ** p;
        if (!Number.isFinite(v) || Number.isNaN(v))
          throw fail(`(${b})^(${p}) not real`);
        // Negative base with fractional exponent is not real (JS gives NaN, caught above).
        return v;
      }
      case "sqrt": {
        const idx = x.index ? val(x.index) : 2;
        const v = val(x.arg);
        if (idx === 2 && v < 0) throw fail("even root of negative");
        R.push(idx === 2 ? `radikan ≥ 0` : `domain of root ${idx}`);
        const r = v < 0 ? -((-v) ** (1 / idx)) : v ** (1 / idx);
        if (!Number.isFinite(r)) throw fail("root not real");
        return r;
      }
      case "func": {
        const v = val(x.arg);
        switch (x.name) {
          case "sin":
            return Math.sin(v);
          case "cos":
            return Math.cos(v);
          case "tan":
            return Math.tan(v);
          case "exp":
            return Math.exp(v);
          case "ln":
            R.push("argumen ln > 0");
            if (v <= 0) throw fail("ln of non-positive");
            return Math.log(v);
          case "log": {
            const base = x.base ?? 10;
            R.push(`argumen log > 0, basis > 0 ≠ 1`);
            if (v <= 0 || base <= 0 || base === 1) throw fail("log domain");
            return Math.log(v) / Math.log(base);
          }
          case "abs":
            return Math.abs(v);
        }
        break;
      }
      case "eq":
        throw fail("equations evaluate to truth, use verifyEquation");
      case "cancel":
      case "paren":
        return val(x.arg);
    }
  };
  try {
    const value = val(e);
    if (!Number.isFinite(value)) return fail("non-finite result", R);
    return { ok: true, value, restrictions: [...new Set(R)] };
  } catch (err) {
    if (err && typeof err === "object" && "reason" in (err as object))
      return { ...(err as EvalFail), restrictions: [...new Set(R)] };
    throw err;
  }
}

/** Numeric formatting for handwriting (exact integers, trimmed decimals). */
export function formatNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const s = String(Number(v.toPrecision(10)));
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

// --- Rendering to multi-color MathExpr ---
function needsParen(child: Expr, parentKind: string): boolean {
  if (child.kind === "paren" || child.kind === "num" || child.kind === "sym")
    return false;
  if (child.kind === "neg") return parentKind === "pow-base" || parentKind === "mul";
  if (child.kind === "add") return true;
  if (child.kind === "mul" || child.kind === "div")
    return parentKind === "pow-base" || parentKind === "pow-exp";
  if (child.kind === "pow") return parentKind === "pow-base";
  return false;
}
function wrap(e: Expr, parentKind: string, self: (x: Expr) => MathExpr): MathExpr {
  const inner = self(e);
  if (!needsParen(e, parentKind)) return inner;
  return row("(", inner, ")");
}

/** Lower an AST to layout-ready MathExpr, preserving per-node colors. */
export function toMathExpr(e: Expr): MathExpr {
  const tint = (m: MathExpr, color: Color | undefined): MathExpr =>
    color ? paint(m, color) : m;
  const self = (x: Expr): MathExpr => {
    switch (x.kind) {
      case "num":
        return tint(formatNumber(x.value), x.color);
      case "sym":
        return tint(x.name, x.color);
      case "add": {
        const items: MathExpr[] = [];
        x.terms.forEach((t, i) => {
          if (t.kind === "neg") {
            if (i > 0) items.push(tint("−", x.color));
            items.push(wrapNeg(t.arg, self));
          } else {
            if (i > 0) items.push(tint("+", x.color));
            items.push(self(t));
          }
        });
        return tint(row(...items), x.color);
      }
      case "mul": {
        const items: MathExpr[] = [];
        x.factors.forEach((f, i) => {
          if (i > 0 && needsTimes(x.factors[i - 1], f)) items.push(tint("×", x.color));
          items.push(wrap(f, "mul", self));
        });
        return tint(row(...items), x.color);
      }
      case "neg":
        return tint(row("−", wrapNeg(x.arg, self)), x.color);
      case "div":
        return tint(fraction(self(x.num), self(x.den)), x.color);
      case "pow":
        return tint(
          script(wrap(x.base, "pow-base", self), wrap(x.exp, "pow-exp", self)),
          x.color,
        );
      case "sqrt":
        return tint(
          x.index
            ? row(script(" ", self(x.index)), { type: "root", body: self(x.arg) })
            : { type: "root", body: self(x.arg) },
          x.color,
        );
      case "func": {
        const head =
          x.name === "log" && x.base !== undefined && x.base !== 10
            ? row("log", script(" ", String(x.base)))
            : x.name;
        return tint(row(head, "(", self(x.arg), ")"), x.color);
      }
      case "eq":
        return tint(row(self(x.left), "=", self(x.right)), x.color);
      case "paren":
        return tint(row("(", self(x.arg), ")"), x.color);
      case "cancel":
        // Rendered plainly; the lowering adds a real strike stroke on top.
        return self({ ...x.arg, color: x.arg.color ?? x.color });
    }
  };
  return self(e);
}
function wrapNeg(arg: Expr, self: (x: Expr) => MathExpr): MathExpr {
  if (arg.kind === "add" || arg.kind === "neg") return row("(", self(arg), ")");
  return self(arg);
}
function needsTimes(a: Expr, b: Expr): boolean {
  // Juxtapose coefficient·symbol, symbol·symbol, anything·paren; else ×.
  const simple = (x: Expr) =>
    x.kind === "num" || x.kind === "sym" || x.kind === "paren" || x.kind === "sqrt" || x.kind === "func";
  if (simple(a) && simple(b)) {
    if (a.kind === "num" && b.kind === "num") return true;
    return false;
  }
  return !(b.kind === "paren" || b.kind === "sqrt");
}

/** One-line debug rendering (ASCII-ish, for logs and tests). */
export function toText(e: Expr): string {
  switch (e.kind) {
    case "num":
      return formatNumber(e.value);
    case "sym":
      return e.name;
    case "add":
      return e.terms
        .map((t, i) =>
          t.kind === "neg"
            ? `${i > 0 ? " - " : "-"}${toText(t.arg)}`
            : `${i > 0 ? " + " : ""}${toText(t)}`,
        )
        .join("");
    case "mul":
      return e.factors.map((f) => parenText(f, "mul")).join("·");
    case "neg":
      return `-${parenText(e.arg, "neg")}`;
    case "div":
      return `(${toText(e.num)})/(${toText(e.den)})`;
    case "pow":
      return `${parenText(e.base, "pow-base")}^${parenText(e.exp, "pow-exp")}`;
    case "sqrt":
      return e.index ? `root(${toText(e.arg)},${toText(e.index)})` : `sqrt(${toText(e.arg)})`;
    case "func":
      return `${e.name}(${toText(e.arg)})`;
    case "eq":
      return `${toText(e.left)} = ${toText(e.right)}`;
    case "cancel":
      return `cancel(${toText(e.arg)})`;
    case "paren":
      return `(${toText(e.arg)})`;
  }
}
function parenText(e: Expr, parent: string): string {
  const t = toText(e);
  if (e.kind === "num" || e.kind === "sym" || e.kind === "paren" || e.kind === "func" || e.kind === "sqrt")
    return t;
  if (parent === "mul" && (e.kind === "mul" || e.kind === "pow")) return t;
  return `(${t})`;
}
