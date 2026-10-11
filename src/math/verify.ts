/** Mathematical correctness verification for AST transformations.
 *
 * Every rewrite is classified by differential numeric testing over
 * deterministic sample bindings (including edge values 0, ±1, fractions,
 * negatives):
 * - equivalent: same value/truth everywhere both sides are defined, same domain.
 * - conditional: equivalent where defined, but the domain changed; the step
 *   must carry explicit restrictions (e.g. x ≠ 0).
 * - implication: before ⇒ after (e.g. squaring both sides); the converse may
 *   fail. Never reported as equivalence.
 * - approximation: within tolerance, not exact (rounding, estimation).
 * - heuristic: a shortcut valid on stated cases/conditions, checked against
 *   exact arithmetic on representative + edge cases.
 * - invalid: counterexample found.
 */
import {
  evaluate,
  variables,
  type Expr,
} from "./ast";

export type VerdictKind =
  | "equivalent"
  | "conditional"
  | "implication"
  | "approximation"
  | "heuristic"
  | "invalid";

export interface Verdict {
  kind: VerdictKind;
  /** Human-readable Indonesian explanation. */
  detail: string;
  /** Domain conditions required for the step to hold. */
  conditions: string[];
  /** Failing bindings, when invalid. */
  counterexamples: Record<string, number>[];
  samples: number;
}

export interface RewriteOptions {
  rule: string;
  /** Declared conditions from the transform (must cover domain changes). */
  conditions?: string[];
  /** Tolerance for approximation rules. */
  tolerance?: number;
  /** Max sample bindings (deterministic subset when exceeded). */
  maxSamples?: number;
  /** Rules that are implications by construction. */
  implicationRules?: string[];
  /** Rules that are approximations by construction. */
  approximationRules?: string[];
  /** Rules that are heuristics by construction. */
  heuristicRules?: string[];
}

const EDGE_VALUES = [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3, 4, 5, 10];

/** Deterministic sample bindings for the given variables. */
export function sampleBindings(
  vars: string[],
  maxSamples = 400,
  seed = 0xC0DE,
): Record<string, number>[] {
  if (vars.length === 0) return [{}];
  // Full edge grid for ≤2 vars; deterministic LCG subset beyond that.
  const grid: Record<string, number>[] = [];
  if (vars.length <= 2) {
    const rec = (i: number, acc: Record<string, number>) => {
      if (i === vars.length) {
        grid.push({ ...acc });
        return;
      }
      for (const v of EDGE_VALUES) {
        acc[vars[i]] = v;
        rec(i + 1, acc);
      }
    };
    rec(0, {});
    return grid.slice(0, maxSamples);
  }
  let state = seed >>> 0;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const out: Record<string, number>[] = [];
  for (let k = 0; k < maxSamples; k++) {
    const b: Record<string, number> = {};
    for (const v of vars) {
      const pool = [...EDGE_VALUES, rand() * 20 - 10, rand() * 2 - 1];
      b[v] = pool[Math.floor(rand() * pool.length)];
    }
    out.push(b);
  }
  return out;
}

function isEq(e: Expr): e is Extract<Expr, { kind: "eq" }> {
  return e.kind === "eq";
}

/** Truth of an equation at a binding, or undefined when a side is undefined. */
function eqTruth(
  e: Extract<Expr, { kind: "eq" }>,
  env: Record<string, number>,
  tol: number,
): boolean | undefined {
  const l = evaluate(e.left, env),
    r = evaluate(e.right, env);
  if (!l.ok || !r.ok) return undefined;
  return Math.abs(l.value - r.value) <= tol;
}

export function verifyRewrite(
  before: Expr,
  after: Expr,
  opts: RewriteOptions,
): Verdict {
  const tol = opts.tolerance ?? 1e-9;
  const vars = [...new Set([...variables(before), ...variables(after)])].sort();
  const samples = sampleBindings(vars, opts.maxSamples ?? 400);
  const counterexamples: Record<string, number>[] = [];
  let bothDefined = 0,
    shrunk = 0,
    grew = 0;
  const bothEq = isEq(before) && isEq(after);
  const neitherEq = !isEq(before) && !isEq(after);
  if (!bothEq && !neitherEq) {
    return {
      kind: "invalid",
      detail: "Perbandingan ekspresi dengan persamaan tidak valid",
      conditions: [],
      counterexamples: [],
      samples: 0,
    };
  }
  for (const env of samples) {
    if (bothEq) {
      const b = eqTruth(before as Extract<Expr, { kind: "eq" }>, env, tol);
      const a = eqTruth(after as Extract<Expr, { kind: "eq" }>, env, tol);
      if (b === undefined && a === undefined) continue;
      if (b === undefined) {
        grew++;
        continue;
      }
      if (a === undefined) {
        shrunk++;
        continue;
      }
      bothDefined++;
      if (b && !a) counterexamples.push(env);
    } else {
      const b = evaluate(before, env),
        a = evaluate(after, env);
      if (!b.ok && !a.ok) continue;
      if (!b.ok) {
        grew++;
        continue;
      }
      if (!a.ok) {
        shrunk++;
        continue;
      }
      bothDefined++;
      if (Math.abs(b.value - a.value) > tol) counterexamples.push(env);
    }
    if (counterexamples.length >= 5) break;
  }
  const declared = opts.conditions ?? [];
  if (counterexamples.length > 0) {
    return {
      kind: "invalid",
      detail: `Ditemukan ${counterexamples.length} contoh penyangkal (aturan: ${opts.rule})`,
      conditions: declared,
      counterexamples,
      samples: bothDefined,
    };
  }
  if ((opts.implicationRules ?? ["square-both-sides"]).includes(opts.rule)) {
    return {
      kind: "implication",
      detail:
        "Implikasi satu arah: setiap solusi sebelumnya memenuhi hasil, tetapi kebalikannya perlu pemeriksaan (contoh: solusi asing dari penguadratan).",
      conditions: declared,
      counterexamples: [],
      samples: bothDefined,
    };
  }
  if ((opts.approximationRules ?? ["approximate", "round", "estimate"]).includes(opts.rule)) {
    return {
      kind: "approximation",
      detail: `Hampiran dalam toleransi ${tol}; bukan kesetaraan eksak.`,
      conditions: declared,
      counterexamples: [],
      samples: bothDefined,
    };
  }
  if ((opts.heuristicRules ?? ["heuristic"]).includes(opts.rule)) {
    return {
      kind: "heuristic",
      detail:
        "Jalan pintas cocok pada kasus uji; hanya valid pada kondisi yang dinyatakan.",
      conditions: declared,
      counterexamples: [],
      samples: bothDefined,
    };
  }
  if (shrunk > 0 || grew > 0) {
    const parts: string[] = [];
    if (shrunk > 0) parts.push(`domain menyempit pada ${shrunk} sampel`);
    if (grew > 0) parts.push(`domain meluas pada ${grew} sampel`);
    return {
      kind: "conditional",
      detail: `Setara bila terdefinisi (${parts.join("; ")}); syarat domain wajib dicantumkan.`,
      conditions: declared,
      counterexamples: [],
      samples: bothDefined,
    };
  }
  return {
    kind: "equivalent",
    detail: `Setara pada ${bothDefined} sampel deterministik.`,
    conditions: declared,
    counterexamples: [],
    samples: bothDefined,
  };
}

export interface TrickCheck {
  /** Exact computation. */
  exact: (input: number[]) => number;
  /** Shortcut computation under test. */
  shortcut: (input: number[]) => number;
  /** Representative valid cases. */
  cases: number[][];
  /** Boundary/edge cases (still within stated conditions). */
  edgeCases: number[][];
  /** Inputs where the shortcut must NOT be applied (documents scope). */
  outOfScope?: number[][];
  /** Stated validity conditions (Indonesian). */
  conditions: string[];
  tolerance?: number;
}

/** Validate a mental-math shortcut against exact arithmetic. */
export function verifyTrick(name: string, check: TrickCheck): Verdict {
  const tol = check.tolerance ?? 1e-9;
  const counterexamples: Record<string, number>[] = [];
  const run = (inputs: number[][]) => {
    for (const input of inputs) {
      let e: number, s: number;
      try {
        e = check.exact(input);
        s = check.shortcut(input);
      } catch {
        counterexamples.push(Object.fromEntries(input.map((v, i) => [`x${i}`, v])));
        continue;
      }
      if (!Number.isFinite(e) || !Number.isFinite(s) || Math.abs(e - s) > tol)
        counterexamples.push(Object.fromEntries(input.map((v, i) => [`x${i}`, v])));
    }
  };
  run(check.cases);
  run(check.edgeCases);
  if (counterexamples.length > 0) {
    return {
      kind: "invalid",
      detail: `Trik "${name}" gagal pada ${counterexamples.length} kasus`,
      conditions: check.conditions,
      counterexamples,
      samples: check.cases.length + check.edgeCases.length,
    };
  }
  return {
    kind: "heuristic",
    detail:
      `Trik "${name}" cocok eksak pada ${check.cases.length} kasus + ${check.edgeCases.length} kasus tepi; ` +
      `berlaku hanya bila: ${check.conditions.join("; ")}.`,
    conditions: check.conditions,
    counterexamples: [],
    samples: check.cases.length + check.edgeCases.length,
  };
}
