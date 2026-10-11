/** Strict expression parser + structural transforms over the math AST.
 *
 * The parser accepts a small, explicit grammar (no eval, no arbitrary text
 * replacement). Transforms are pure AST rewrites that preserve node identity
 * for retained subterms so correspondence stays exact.
 */
import {
  createScope,
  num,
  sym,
  add,
  mul,
  neg,
  div,
  pow,
  sqrt,
  func,
  eq,
  paren,
  cancel,
  sub,
  cloneExpr,
  shapeEqual,
  shape as shapeOf,
  toText,
  type Expr,
  type Scope,
  type FuncName,
} from "./ast";

export interface TransformStep {
  expr: Expr;
  rule: string;
  note: string;
  /** Domain conditions introduced by this step (Indonesian fragments). */
  conditions: string[];
}

// ---------- Parser ----------
type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "lp" | "rp" | "eq" | "comma" };

const FUNCS: Record<string, FuncName> = {
  sin: "sin",
  cos: "cos",
  tan: "tan",
  exp: "exp",
  ln: "ln",
  log: "log",
  abs: "abs",
};

function tokenize(input: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const fail = (): never => {
    throw Error(`Cannot parse expression near ${JSON.stringify(input.slice(i, i + 12))}`);
  };
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const numMatch = /^(\d+(?:\.\d+)?)/.exec(input.slice(i));
    if (numMatch) {
      out.push({ t: "num", v: Number(numMatch[1]) });
      i += numMatch[1].length;
      continue;
    }
    const idMatch = /^(\p{L}+)/u.exec(input.slice(i));
    if (idMatch) {
      out.push({ t: "id", v: idMatch[1] });
      i += idMatch[1].length;
      continue;
    }
    if (c === "(") {
      out.push({ t: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      out.push({ t: "rp" });
      i++;
      continue;
    }
    if (c === "=") {
      out.push({ t: "eq" });
      i++;
      continue;
    }
    if (c === ",") {
      out.push({ t: "comma" });
      i++;
      continue;
    }
    if ("+-*/^·×−".includes(c)) {
      out.push({
        t: "op",
        v: c === "·" || c === "×" || c === "*" ? "*" : c === "−" ? "-" : c,
      });
      i++;
      continue;
    }
    fail();
  }
  return out;
}

/** Parse `2x^2 + 3(x+1) = 14`, `sqrt(144)`, `log(100, 10)` (value, base). */
export function parse(input: string, s: Scope): Expr {
  const toks = tokenize(input);
  let pos = 0;
  const peek = (): Tok | undefined => toks[pos];
  const eat = (): Tok => {
    const t = toks[pos++];
    if (!t) throw Error(`Unexpected end in ${JSON.stringify(input)}`);
    return t;
  };
  const expect = (t: Tok["t"]): Tok => {
    const tok = eat();
    if (tok.t !== t) throw Error(`Expected ${t} in ${JSON.stringify(input)}`);
    return tok;
  };
  function parseEq(): Expr {
    let left = parseAdd();
    if (peek()?.t === "eq") {
      eat();
      const right = parseAdd();
      if (peek()?.t === "eq") throw Error("Only one = per expression");
      return eq(s, left, right);
    }
    return left;
  }
  function parseAdd(): Expr {
    const terms: Expr[] = [parseMul()];
    for (;;) {
      const t = peek();
      if (t?.t === "op" && (t.v === "+" || t.v === "-")) {
        eat();
        const rhs = parseMul();
        terms.push(t.v === "+" ? rhs : neg(s, rhs));
      } else break;
    }
    return terms.length === 1 ? terms[0] : add(s, terms);
  }
  function parseMul(): Expr {
    const factors: Expr[] = [parsePow()];
    for (;;) {
      const t = peek();
      if (t?.t === "op" && t.v === "*") {
        eat();
        factors.push(parsePow());
      } else if (t?.t === "op" && t.v === "/") {
        eat();
        const rhs = parsePow();
        const left = factors.length === 1 ? factors.pop()! : mul(s, factors.splice(0));
        factors.push(div(s, left, rhs));
        break; // a/b/c parses as (a/b)/c only with parens; keep strict
      } else if (t?.t === "num" || t?.t === "id" || t?.t === "lp") {
        // Implicit multiplication: 2x, 2(x+1); (a)(b). Never on +-/=.
        factors.push(parsePow());
      } else break;
    }
    return factors.length === 1 ? factors[0] : mul(s, factors);
  }
  function parsePow(): Expr {
    const base = parseUnary();
    if (peek()?.t === "op" && peek()!.t === "op" && (peek() as { v: string }).v === "^") {
      eat();
      return pow(s, base, parseUnary());
    }
    return base;
  }
  function parseUnary(): Expr {
    const t = peek();
    if (t?.t === "op" && t.v === "+") {
      eat();
      return parseUnary();
    }
    if (t?.t === "op" && t.v === "-") {
      eat();
      return neg(s, parseUnary());
    }
    return parseAtom();
  }
  function parseAtom(): Expr {
    const t = eat();
    if (t.t === "num") return num(s, t.v);
    if (t.t === "lp") {
      const inner = parseAdd();
      expect("rp");
      return paren(s, inner);
    }
    if (t.t === "id") {
      if (t.v === "sqrt" && peek()?.t === "lp") {
        eat();
        const arg = parseAdd();
        expect("rp");
        return sqrt(s, arg);
      }
      const f = FUNCS[t.v];
      if (f && peek()?.t === "lp") {
        eat();
        const arg = parseAdd();
        let base: number | undefined;
        if (peek()?.t === "comma") {
          eat();
          const b = eat();
          if (b.t !== "num" || !Number.isInteger(b.v))
            throw Error("log base must be an integer");
          base = b.v;
        }
        expect("rp");
        return func(s, f, arg, base);
      }
      // Unknown id before "(" is implicit multiplication (x(x+1)), not a call.
      return sym(s, t.v);
    }
    throw Error(`Unexpected token in ${JSON.stringify(input)}`);
  }
  const out = parseEq();
  if (pos < toks.length) throw Error(`Trailing input in ${JSON.stringify(input)}`);
  return out;
}

// ---------- Small structural helpers ----------
const numVal = (e: Expr): number | undefined =>
  e.kind === "num" ? e.value : undefined;
function stripParen(e: Expr): Expr {
  return e.kind === "paren" ? stripParen(e.arg) : e;
}

/** Numeric gcd for integer coefficients. */
function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a;
}

// ---------- simplify: constant folding + identities + like terms ----------
export function simplify(s: Scope, e: Expr): TransformStep {
  const simp = (x: Expr): Expr => {
    switch (x.kind) {
      case "num":
      case "sym":
        return x;
      case "paren": {
        const inner = simp(x.arg);
        // Keep explicit parens only around add/mul in non-atomic positions is a render concern; drop here.
        return inner;
      }
      case "neg": {
        const a = simp(x.arg);
        if (a.kind === "num") return num(s, -a.value);
        if (a.kind === "neg") return a.arg;
        if (a !== x.arg) return neg(s, a);
        return x;
      }
      case "add": {
        const terms = x.terms.map(simp);
        // Flatten nested adds, fold numbers, combine structurally-equal terms.
        const flat: Expr[] = [];
        for (const t of terms) {
          const st = stripParen(t);
          if (st.kind === "add") flat.push(...st.terms);
          else flat.push(t);
        }
        let constant = 0;
        const groups = new Map<string, { coeff: number; shape: Expr }>();
        const others: Expr[] = [];
        for (const t of flat) {
          if (t.kind === "num") {
            constant += t.value;
            continue;
          }
          const [coeff, rest] = splitCoeff(t);
          if (rest) {
            const key = shapeOf(rest);
            const g = groups.get(key);
            if (g) g.coeff += coeff;
            else groups.set(key, { coeff, shape: rest });
          } else others.push(t);
        }
        const out: Expr[] = [];
        for (const g of groups.values()) {
          if (Math.abs(g.coeff) < 1e-12) continue;
          out.push(
            g.coeff === 1
              ? g.shape
              : g.coeff === -1
                ? neg(s, g.shape)
                : mul(s, [num(s, g.coeff), g.shape]),
          );
        }
        out.push(...others);
        if (Math.abs(constant) >= 1e-12 || out.length === 0) {
          if (constant < 0 && out.length > 0) out.push(neg(s, num(s, -constant)));
          else out.push(num(s, constant));
        }
        if (out.length === 1) return out[0];
        return add(s, out);
      }
      case "mul": {
        const factors = x.factors.map(simp).flatMap((f) => {
          const st = stripParen(f);
          return st.kind === "mul" ? st.factors : [f];
        });
        let constant = 1,
          negations = 0;
        const rest: Expr[] = [];
        for (const f of factors) {
          if (f.kind === "num") constant *= f.value;
          else if (f.kind === "neg") {
            negations++;
            rest.push(f.arg);
          } else rest.push(f);
        }
        if (negations % 2 === 1) constant *= -1;
        if (constant === 0) return num(s, 0);
        // Combine repeated factors into powers: x·x → x², x²·x → x³.
        const baseOf = (f: Expr): { base: Expr; exp: number } =>
          f.kind === "pow" && f.exp.kind === "num"
            ? { base: f.base, exp: f.exp.value }
            : { base: f, exp: 1 };
        const grouped = new Map<string, { base: Expr; exp: number }>();
        for (const f of rest) {
          const { base, exp } = baseOf(f);
          const key = shapeOf(base);
          const g = grouped.get(key);
          if (g) g.exp += exp;
          else grouped.set(key, { base, exp });
        }
        const combined: Expr[] = [];
        for (const g of grouped.values()) {
          if (g.exp === 0) continue;
          combined.push(g.exp === 1 ? g.base : pow(s, g.base, num(s, g.exp)));
        }
        const out: Expr[] = [];
        if (constant === -1 && combined.length > 0)
          return neg(s, combined.length === 1 ? combined[0] : mul(s, combined));
        if (constant !== 1 || combined.length === 0) out.push(num(s, constant));
        out.push(...combined);
        if (out.length === 1) return out[0];
        return mul(s, out);
      }
      case "div": {
        const n = simp(x.num),
          d = simp(x.den);
        if (numVal(n) === 0) return num(s, 0);
        if (numVal(d) === 1) return n;
        if (numVal(n) !== undefined && numVal(d) !== undefined)
          return num(s, (n as Extract<Expr, { kind: "num" }>).value / (d as Extract<Expr, { kind: "num" }>).value);
        if (shapeEqual(n, d)) return num(s, 1); // restriction noted by verifier
        if (n !== x.num || d !== x.den) return div(s, n, d);
        return x;
      }
      case "pow": {
        const b = simp(x.base),
          p = simp(x.exp);
        if (numVal(p) === 0) return num(s, 1);
        if (numVal(p) === 1) return b;
        if (numVal(b) !== undefined && numVal(p) !== undefined) {
          const v = numVal(b)! ** numVal(p)!;
          if (Number.isFinite(v)) return num(s, v);
        }
        if (b !== x.base || p !== x.exp) return pow(s, b, p);
        return x;
      }
      case "sqrt": {
        const a = simp(x.arg);
        if (a.kind === "num" && a.value >= 0) {
          const r = Math.sqrt(a.value);
          if (Number.isInteger(r)) return num(s, r);
        }
        if (a !== x.arg) return sqrt(s, a, x.index);
        return x;
      }
      case "func": {
        const a = simp(x.arg);
        if (a !== x.arg) return func(s, x.name, a, x.base);
        return x;
      }
      case "eq": {
        const l = simp(x.left),
          r = simp(x.right);
        if (l !== x.left || r !== x.right) return eq(s, l, r);
        return x;
      }
      case "cancel":
        return cancel(s, simp(x.arg), x.style);
    }
  };
  return { expr: simp(e), rule: "simplify", note: "Sederhanakan", conditions: [] };
}

/** Split t into [numeric coefficient, rest-shape]. Returns rest null if pure number. */
function splitCoeff(t: Expr): [number, Expr | null] {
  if (t.kind === "num") return [t.value, null];
  if (t.kind === "neg") {
    const [c, r] = splitCoeff(t.arg);
    return [-c, r];
  }
  if (t.kind === "mul" && t.factors.length > 0 && t.factors[0].kind === "num") {
    const [head, ...tail] = t.factors;
    if (tail.length === 0) return [(head as Extract<Expr, { kind: "num" }>).value, null];
    return [
      (head as Extract<Expr, { kind: "num" }>).value,
      tail.length === 1 ? tail[0] : { ...t, factors: tail },
    ];
  }
  return [1, t];
}

// ---------- expand: distribute products over sums (fixpoint) ----------
export function expand(s: Scope, e: Expr): TransformStep {
  const distribute = (x: Expr): Expr => {
    if (x.kind === "mul") {
      const factors = x.factors.map(distribute);
      const idx = factors.findIndex((f) => stripParen(f).kind === "add");
      if (idx >= 0) {
        const addNode = stripParen(factors[idx]) as Extract<Expr, { kind: "add" }>;
        const rest = [...factors.slice(0, idx), ...factors.slice(idx + 1)];
        const terms = addNode.terms.map((t) =>
          distribute(rest.length ? mul(s, [...rest.map((r) => cloneExpr(s, r)), t]) : t),
        );
        return distribute(add(s, terms));
      }
      const changed = factors.some((f, i) => f !== x.factors[i]);
      return changed ? mul(s, factors) : x;
    }
    if (x.kind === "pow" && x.exp.kind === "num" && Number.isInteger(x.exp.value)) {
      const n = x.exp.value;
      if (n >= 2 && n <= 6 && stripParen(x.base).kind === "add") {
        const base = stripParen(x.base);
        let acc: Expr = cloneExpr(s, base);
        for (let i = 1; i < n; i++) acc = mul(s, [acc, cloneExpr(s, base)]);
        return distribute(acc);
      }
    }
    if (x.kind === "add") {
      const terms = x.terms.map(distribute);
      return terms.some((t, i) => t !== x.terms[i]) ? add(s, terms) : x;
    }
    if (x.kind === "neg") {
      const a = distribute(x.arg);
      return a !== x.arg ? neg(s, a) : x;
    }
    if (x.kind === "div") {
      const n = distribute(x.num),
        d = distribute(x.den);
      return n !== x.num || d !== x.den ? div(s, n, d) : x;
    }
    if (x.kind === "pow") {
      const b = distribute(x.base),
        p = distribute(x.exp);
      return b !== x.base || p !== x.exp ? pow(s, b, p) : x;
    }
    if (x.kind === "sqrt") {
      const a = distribute(x.arg);
      return a !== x.arg ? sqrt(s, a, x.index) : x;
    }
    if (x.kind === "func") {
      const a = distribute(x.arg);
      return a !== x.arg ? func(s, x.name, a, x.base) : x;
    }
    if (x.kind === "eq") {
      const l = distribute(x.left),
        r = distribute(x.right);
      return l !== x.left || r !== x.right ? eq(s, l, r) : x;
    }
    if (x.kind === "paren") {
      const a = distribute(x.arg);
      return paren(s, a);
    }
    return x;
  };
  const out = simplify(s, distribute(e)).expr;
  return { expr: out, rule: "expand", note: "Jabarkan (distributif)", conditions: [] };
}

// ---------- factor: common factor, difference of squares, trinomials ----------
export function factorCommon(s: Scope, e: Expr): TransformStep {
  const target = stripParen(e);
  if (target.kind !== "add") return { expr: e, rule: "factor-common", note: "Tak ada faktor persekutuan", conditions: [] };
  const terms = target.terms;
  // Numeric gcd of leading coefficients.
  const coeffs = terms.map((t) => splitCoeff(t)[0]);
  if (!coeffs.every(Number.isInteger)) return { expr: e, rule: "factor-common", note: "Tak ada faktor persekutuan", conditions: [] };
  let g = 0;
  for (const c of coeffs) g = gcd(g, c);
  if (g <= 1) return { expr: e, rule: "factor-common", note: "Tak ada faktor persekutuan", conditions: [] };
  const divided = terms.map((t) => {
    const [c, rest] = splitCoeff(t);
    const q = c / g;
    if (!rest) return num(s, q);
    if (q === 1) return cloneExpr(s, rest);
    if (q === -1) return neg(s, cloneExpr(s, rest));
    return mul(s, [num(s, q), cloneExpr(s, rest)]);
  });
  return {
    expr: mul(s, [num(s, g), paren(s, add(s, divided))]),
    rule: "factor-common",
    note: `Keluarkan faktor ${g}`,
    conditions: [],
  };
}

/** a² − b² → (a−b)(a+b); a, b may be symbols, numbers², or simple powers. */
export function factorDiffSquares(s: Scope, e: Expr): TransformStep {
  const target = stripParen(e);
  const fail = { expr: e, rule: "factor-diffsq", note: "Bukan selisih kuadrat", conditions: [] };
  if (target.kind !== "add" || target.terms.length !== 2) return fail;
  const [t1, t2] = target.terms;
  if (t2.kind !== "neg") return fail;
  const rootOf = (x: Expr): Expr | null => {
    const st = stripParen(x);
    if (st.kind === "pow" && st.exp.kind === "num" && st.exp.value === 2)
      return cloneExpr(s, st.base);
    if (st.kind === "num" && st.value > 0) {
      const r = Math.sqrt(st.value);
      if (Number.isInteger(r)) return num(s, r);
    }
    return null;
  };
  const a = rootOf(t1),
    b = rootOf(t2.arg);
  if (!a || !b) return fail;
  return {
    expr: mul(s, [
      paren(s, sub(s, a, cloneExpr(s, b))),
      paren(s, add(s, [cloneExpr(s, a), cloneExpr(s, b)])),
    ]),
    rule: "factor-diffsq",
    note: "Selisih kuadrat",
    conditions: [],
  };
}

interface Trinomial {
  a: number;
  b: number;
  c: number;
  variable: string;
}
/** Match ax²+bx+c with numeric a,b,c over one variable. */
export function matchTrinomial(e: Expr): Trinomial | null {
  const target = stripParen(e);
  if (target.kind !== "add") return null;
  let a = 0,
    b = 0,
    c = 0,
    variable: string | null = null;
  for (const t of target.terms) {
    const [coeff, rest] = splitCoeff(t);
    if (!rest) {
      c += coeff;
      continue;
    }
    const st = stripParen(rest);
    if (st.kind === "sym") {
      if (variable && variable !== st.name) return null;
      variable = st.name;
      b += coeff;
    } else if (
      st.kind === "pow" &&
      st.exp.kind === "num" &&
      st.exp.value === 2 &&
      st.base.kind === "sym"
    ) {
      if (variable && variable !== st.base.name) return null;
      variable = st.base.name;
      a += coeff;
    } else return null;
  }
  if (!variable || a === 0) return null;
  return { a, b, c, variable };
}

export function factorTrinomial(s: Scope, e: Expr): TransformStep {
  const fail = { expr: e, rule: "factor-trinomial", note: "Tak dapat difaktorkan bulat", conditions: [] };
  const m = matchTrinomial(e);
  if (!m) return fail;
  const { a, b, c, variable } = m;
  const x = (color?: undefined) => sym(s, variable);
  void x;
  // Integer root pairs: find p,q with p+q=b/a... use ac-method over integers.
  const ac = a * c;
  for (let p = -Math.abs(ac) - Math.abs(b) - 2; p <= Math.abs(ac) + Math.abs(b) + 2; p++) {
    const q = b - p;
    if (p * q !== ac) continue;
    // (ax+p)(ax+q)/a → reduce by gcds.
    const g1 = gcd(a, p),
      g2 = gcd(a, q);
    const f1a = a / g1,
      f1c = p / g1,
      f2a = a / g2,
      f2c = q / g2;
    const outer = (g1 * g2) / a;
    if (!Number.isInteger(outer) || outer === 0) continue;
    if (f1a * f2a * outer !== a * outer || outer !== 1) {
      // General case: verify by expansion below; keep only exact factorizations.
    }
    const mk = (ca: number, cc: number): Expr => {
      const terms: Expr[] = [];
      if (ca === 1) terms.push(sym(s, variable));
      else if (ca === -1) terms.push(neg(s, sym(s, variable)));
      else terms.push(mul(s, [num(s, ca), sym(s, variable)]));
      if (cc > 0) terms.push(num(s, cc));
      else if (cc < 0) terms.push(neg(s, num(s, -cc)));
      return paren(s, terms.length === 1 ? terms[0] : add(s, terms));
    };
    const candidate: Expr =
      outer === 1 ? mul(s, [mk(f1a, f1c), mk(f2a, f2c)]) : div(s, mul(s, [mk(f1a * outer, f1c * outer), mk(f2a, f2c)]), num(s, outer));
    // Verify by expansion: candidate must equal input structurally after simplify.
    const check = simplify(s, expand(s, candidate).expr).expr;
    const want = simplify(s, cloneExpr(s, e)).expr;
    if (shapeOf(check) === shapeOf(want) && candidate.kind === "mul") {
      return { expr: candidate, rule: "factor-trinomial", note: "Faktorkan trinomial", conditions: [] };
    }
  }
  return fail;
}

// ---------- substitute / balance / cancel ----------
export function substitute(s: Scope, e: Expr, name: string, replacement: Expr): TransformStep {
  const sub = (x: Expr): Expr => {
    if (x.kind === "sym" && x.name === name) return cloneExpr(s, replacement);
    switch (x.kind) {
      case "num":
      case "sym":
        return x;
      case "add": {
        const t = x.terms.map(sub);
        return t.some((v, i) => v !== x.terms[i]) ? add(s, t) : x;
      }
      case "mul": {
        const f = x.factors.map(sub);
        return f.some((v, i) => v !== x.factors[i]) ? mul(s, f) : x;
      }
      case "neg": {
        const a = sub(x.arg);
        return a !== x.arg ? neg(s, a) : x;
      }
      case "div": {
        const n = sub(x.num),
          d = sub(x.den);
        return n !== x.num || d !== x.den ? div(s, n, d) : x;
      }
      case "pow": {
        const b = sub(x.base),
          p = sub(x.exp);
        return b !== x.base || p !== x.exp ? pow(s, b, p) : x;
      }
      case "sqrt": {
        const a = sub(x.arg);
        return a !== x.arg ? sqrt(s, a, x.index) : x;
      }
      case "func": {
        const a = sub(x.arg);
        return a !== x.arg ? func(s, x.name, a, x.base) : x;
      }
      case "eq": {
        const l = sub(x.left),
          r = sub(x.right);
        return l !== x.left || r !== x.right ? eq(s, l, r) : x;
      }
      case "paren": {
        const a = sub(x.arg);
        return a !== x.arg ? paren(s, a) : x;
      }
      case "cancel": {
        const a = sub(x.arg);
        return a !== x.arg ? { ...x, arg: a } : x;
      }
    }
  };
  return { expr: sub(e), rule: "substitute", note: `Substitusi ${name}`, conditions: [] };
}

export type BalanceOp = "+" | "-" | "*" | "/" | "^2" | "sqrt";
/** Apply an operation to both sides of an equation. */
export function balance(s: Scope, e: Expr, op: BalanceOp, operand?: Expr): TransformStep {
  const target = stripParen(e);
  if (target.kind !== "eq") throw Error("balance needs an equation");
  const conditions: string[] = [];
  let rule = "balance";
  const apply = (side: Expr): Expr => {
    const c = cloneExpr(s, side);
    const o = operand ? cloneExpr(s, operand) : undefined;
    switch (op) {
      case "+":
        return add(s, [c, o!]);
      case "-":
        return add(s, [c, neg(s, o!)]);
      case "*":
        return mul(s, [c, o!]);
      case "/":
        conditions.push("pembagi ≠ 0");
        return div(s, c, o!);
      case "^2":
        rule = "square-both-sides";
        return pow(s, paren(s, c), num(s, 2));
      case "sqrt":
        rule = "sqrt-both-sides";
        conditions.push("kedua sisi ≥ 0");
        return sqrt(s, c);
    }
  };
  const out = eq(s, apply(target.left), apply(target.right));
  const names: Record<BalanceOp, string> = {
    "+": "Tambah kedua sisi",
    "-": "Kurang kedua sisi",
    "*": "Kali kedua sisi",
    "/": "Bagi kedua sisi",
    "^2": "Kuadratkan kedua sisi",
    sqrt: "Akarkan kedua sisi",
  };
  return { expr: simplify(s, out).expr, rule, note: names[op], conditions };
}

/** Solve a linear equation, returning every intermediate equation. */
export function solveLinear(s: Scope, e: Expr): TransformStep[] {
  const target = stripParen(e);
  if (target.kind !== "eq") throw Error("solveLinear needs an equation");
  // Collect: (aL - aR)x + (cL - cR) = 0 via numeric probing of linear form.
  const steps: TransformStep[] = [{ expr: e, rule: "given", note: "Diketahui", conditions: [] }];
  const coeffsOf = (x: Expr): { variable: string; a: number; c: number } => {
    const sx = simplify(s, cloneExpr(s, x)).expr;
    const st = stripParen(sx);
    if (st.kind === "num") return { variable: "", a: 0, c: st.value };
    const terms = st.kind === "add" ? st.terms : [st];
    let a = 0,
      c = 0,
      variable = "";
    for (const t of terms) {
      const [coeff, rest] = splitCoeff(t);
      if (!rest) c += coeff;
      else if (stripParen(rest).kind === "sym") {
        const nm = (stripParen(rest) as Extract<Expr, { kind: "sym" }>).name;
        if (variable && variable !== nm) throw Error("solveLinear needs one variable");
        variable = nm;
        a += coeff;
      } else throw Error("solveLinear needs a linear equation");
    }
    return { variable, a, c };
  };
  const L = coeffsOf(target.left),
    R = coeffsOf(target.right);
  const variable = L.variable || R.variable;
  if (!variable) throw Error("solveLinear found no variable");
  const a = L.a - R.a,
    c = L.c - R.c;
  if (Math.abs(a) < 1e-12) throw Error("Not a linear equation in " + variable);
  const x = sym(s, variable);
  if (Math.abs(c) >= 1e-12) {
    steps.push({
      expr: eq(s, add(s, [mul(s, [num(s, a), cloneExpr(s, x)]), num(s, c)]), num(s, 0)),
      rule: "balance",
      note: "Kumpulkan ke satu sisi",
      conditions: [],
    });
    steps.push({
      expr: eq(s, mul(s, [num(s, a), cloneExpr(s, x)]), num(s, -c)),
      rule: "balance",
      note: c > 0 ? `Kurang ${fmt(c)} kedua sisi` : `Tambah ${fmt(-c)} kedua sisi`,
      conditions: [],
    });
  } else {
    steps.push({
      expr: eq(s, mul(s, [num(s, a), cloneExpr(s, x)]), num(s, 0)),
      rule: "given",
      note: "Bentuk sederhana",
      conditions: [],
    });
  }
  steps.push({
    expr: eq(s, cloneExpr(s, x), num(s, -c / a)),
    rule: "balance",
    note: `Bagi kedua sisi dengan ${fmt(a)}`,
    conditions: [],
  });
  return steps;
}
function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6)));
}

/** Complete the square for numeric ax²+bx+c (a≠0). */
export function completeSquare(s: Scope, e: Expr): TransformStep {
  const m = matchTrinomial(e);
  const fail = { expr: e, rule: "complete-square", note: "Bukan trinomial numerik", conditions: [] };
  if (!m) return fail;
  const { a, b, c, variable } = m;
  const x = sym(s, variable);
  const k = b / (2 * a),
    rest = c - (b * b) / (4 * a);
  const inner: Expr =
    k === 0
      ? cloneExpr(s, x)
      : k > 0
        ? add(s, [cloneExpr(s, x), num(s, k)])
        : add(s, [cloneExpr(s, x), neg(s, num(s, -k))]);
  const sq: Expr = pow(s, paren(s, inner), num(s, 2));
  const scaled: Expr = a === 1 ? sq : mul(s, [num(s, a), sq]);
  const out: Expr =
    rest === 0
      ? scaled
      : rest > 0
        ? add(s, [scaled, num(s, rest)])
        : add(s, [scaled, neg(s, num(s, -rest))]);
  return { expr: out, rule: "complete-square", note: "Lengkapi kuadrat", conditions: [] };
}

/** Cancel an identical factor in numerator/denominator (records restriction). */
export function cancelFraction(s: Scope, e: Expr): TransformStep {
  const target = stripParen(e);
  const fail = { expr: e, rule: "cancel", note: "Tak ada faktor sama", conditions: [] };
  if (target.kind !== "div") return fail;
  const numFactors = stripParen(target.num).kind === "mul" ? (stripParen(target.num) as Extract<Expr, { kind: "mul" }>).factors : [target.num];
  const denFactors = stripParen(target.den).kind === "mul" ? (stripParen(target.den) as Extract<Expr, { kind: "mul" }>).factors : [target.den];
  for (let i = 0; i < numFactors.length; i++) {
    for (let j = 0; j < denFactors.length; j++) {
      const a = stripParen(numFactors[i]),
        b = stripParen(denFactors[j]);
      if (shapeEqual(a, b) && a.kind !== "num") {
        const rest = stripParen(denFactors[j]);
        const nn = numFactors.filter((_, k) => k !== i),
          dd = denFactors.filter((_, k) => k !== j);
        const nExpr = nn.length === 0 ? num(s, 1) : nn.length === 1 ? nn[0] : mul(s, nn);
        const dExpr = dd.length === 0 ? num(s, 1) : dd.length === 1 ? dd[0] : mul(s, dd);
        const out = dd.length === 0 ? nExpr : div(s, nExpr, dExpr);
        return {
          expr: out,
          rule: "cancel",
          note: "Coret faktor sama",
          conditions: [`${toText(rest)} ≠ 0`],
        };
      }
    }
  }
  return fail;
}

export { createScope };
