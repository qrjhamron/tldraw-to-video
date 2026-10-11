/** MCP math tools: expression authoring, transformation, verification.
 *
 * Pure functions shared by the MCP server, scripts, and tests. All transforms
 * run through the structural AST layer; every step carries a differential
 * numeric verdict (never text replacement).
 */
import {
  createScope,
  toText,
  toMathExpr,
  diffExpr,
  variables,
  type Expr,
} from "../math/ast";
import {
  parse,
  expand,
  factorCommon,
  factorDiffSquares,
  factorTrinomial,
  simplify,
  substitute,
  balance,
  solveLinear,
  completeSquare,
  cancelFraction,
  type BalanceOp,
  type TransformStep,
} from "../math/transform";
import { verifyRewrite, type Verdict } from "../math/verify";

export interface MathStepResult {
  source: string;
  rule: string;
  note: string;
  conditions: string[];
  verdict: Verdict;
  correspondence: ReturnType<typeof diffExpr>;
}

function serializable(e: Expr): unknown {
  return JSON.parse(JSON.stringify(e));
}

export function createMathExpression(input: { source: string }): {
  ast: unknown;
  text: string;
  variables: string[];
} {
  if (typeof input.source !== "string" || !input.source.length)
    throw Error("create_math_expression needs a non-empty source");
  const s = createScope();
  const ast = parse(input.source, s);
  return { ast: serializable(ast), text: toText(ast), variables: [...variables(ast)] };
}

export type TransformOp =
  | "expand"
  | "factor-common"
  | "factor-diffsq"
  | "factor-trinomial"
  | "simplify"
  | "substitute"
  | "balance"
  | "solve-linear"
  | "complete-square"
  | "cancel";

export function transformMathExpression(input: {
  source: string;
  op: TransformOp;
  /** substitute: variable name; balance: BalanceOp. */
  arg?: string;
  /** substitute/balance operand expression. */
  operand?: string;
  /** Verify each step numerically (default true). */
  verify?: boolean;
}): { steps: MathStepResult[]; final: string } {
  if (typeof input.source !== "string" || !input.source.length)
    throw Error("transform_math_expression needs a source");
  const ops: TransformOp[] = [
    "expand",
    "factor-common",
    "factor-diffsq",
    "factor-trinomial",
    "simplify",
    "substitute",
    "balance",
    "solve-linear",
    "complete-square",
    "cancel",
  ];
  if (!ops.includes(input.op)) throw Error(`Unknown transform op: ${input.op}`);
  const s = createScope();
  const start = parse(input.source, s);
  let raws: TransformStep[];
  switch (input.op) {
    case "expand":
      raws = [expand(s, start)];
      break;
    case "factor-common":
      raws = [factorCommon(s, start)];
      break;
    case "factor-diffsq":
      raws = [factorDiffSquares(s, start)];
      break;
    case "factor-trinomial":
      raws = [factorTrinomial(s, start)];
      break;
    case "simplify":
      raws = [simplify(s, start)];
      break;
    case "substitute": {
      if (!input.arg || !input.operand) throw Error("substitute needs arg + operand");
      raws = [substitute(s, start, input.arg, parse(input.operand, s))];
      break;
    }
    case "balance": {
      if (!input.arg || !input.operand) throw Error("balance needs arg + operand");
      if (!["+", "-", "*", "/", "^2", "sqrt"].includes(input.arg))
        throw Error(`Unknown balance op: ${input.arg}`);
      raws = [balance(s, start, input.arg as BalanceOp, parse(input.operand, s))];
      break;
    }
    case "solve-linear":
      raws = solveLinear(s, start);
      break;
    case "complete-square":
      raws = [completeSquare(s, start)];
      break;
    case "cancel":
      raws = [cancelFraction(s, start)];
      break;
  }
  const verify = input.verify !== false;
  const steps: MathStepResult[] = [];
  let prev = start;
  for (const r of raws) {
    const verdict = verify
      ? verifyRewrite(prev, r.expr, { rule: r.rule, conditions: r.conditions })
      : ({ kind: "equivalent", detail: "unchecked", conditions: [], counterexamples: [], samples: 0 } as Verdict);
    steps.push({
      source: toText(r.expr),
      rule: r.rule,
      note: r.note,
      conditions: r.conditions,
      verdict,
      correspondence: diffExpr(prev, r.expr),
    });
    prev = r.expr;
  }
  return { steps, final: toText(prev) };
}

export function validateMathSteps(input: {
  steps: { source: string; rule?: string; conditions?: string[] }[];
}): { verdicts: (Verdict & { index: number; source: string })[]; ok: boolean } {
  if (!Array.isArray(input.steps) || input.steps.length < 2)
    throw Error("validate_math_steps needs at least two steps");
  const s = createScope();
  const parsed = input.steps.map((st, i) => {
    if (typeof st.source !== "string") throw Error(`Step ${i} needs a source`);
    return { expr: parse(st.source, s), rule: st.rule ?? "given", conditions: st.conditions ?? [] };
  });
  const verdicts = parsed.slice(1).map((cur, k) => {
    const v = verifyRewrite(parsed[k].expr, cur.expr, { rule: cur.rule, conditions: cur.conditions });
    return { ...v, index: k + 1, source: toText(cur.expr) };
  });
  return { verdicts, ok: verdicts.every((v) => v.kind !== "invalid") };
}

/** Lower an expression source to layout MathExpr JSON (for previews). */
export function expressionMathExpr(input: { source: string }): { mathexpr: unknown } {
  const s = createScope();
  return { mathexpr: JSON.parse(JSON.stringify(toMathExpr(parse(input.source, s)))) };
}
