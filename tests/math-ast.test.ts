import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createScope,
  toText,
  toMathExpr,
  diffExpr,
  evaluate,
  variables,
  shape,
  cloneExpr,
} from "../src/math/ast";
import {
  parse,
  simplify,
  expand,
  factorCommon,
  factorDiffSquares,
  factorTrinomial,
  substitute,
  balance,
  solveLinear,
  completeSquare,
  cancelFraction,
} from "../src/math/transform";
import { verifyRewrite, verifyTrick, sampleBindings } from "../src/math/verify";

test("parser handles equations, implicit multiplication, functions", () => {
  const s = createScope();
  assert.equal(toText(parse("2x + 3 = 14", s)), "2·x + 3 = 14");
  assert.equal(toText(parse("3(x+1)", s)), "3·(x + 1)");
  assert.equal(toText(parse("x^2 - 4", s)), "x^2 - 4");
  assert.equal(toText(parse("sqrt(144)", s)), "sqrt(144)");
  assert.equal(toText(parse("(a+b)(c+d)", s)), "(a + b)·(c + d)");
  assert.throws(() => parse("2 +", s), /Unexpected end/);
  assert.throws(() => parse("x = 1 = 2", s), /Only one/);
  assert.equal(toText(parse("x(x+1)", s)), "x·(x + 1)");
  assert.throws(() => parse("2 $ 3", s), /Cannot parse/);
});

test("expand distributes products and powers structurally", () => {
  const s = createScope();
  assert.equal(toText(expand(s, parse("3(x+1)", s)).expr), "3·x + 3");
  assert.equal(
    toText(expand(s, parse("(x+1)(x+2)", s)).expr),
    "x^2 + 3·x + 2",
  );
  assert.equal(
    toText(expand(s, parse("(a-b)(a+b)", s)).expr),
    "a^2 + a·b - b·a - b^2",
  );
  assert.equal(toText(expand(s, parse("(a+b)^2", s)).expr), "a^2 + a·b + b·a + b^2");
});

test("factor inverts expansion on exact cases", () => {
  const s = createScope();
  assert.equal(
    toText(factorDiffSquares(s, parse("x^2 - 4", s)).expr),
    "(x - 2)·(x + 2)",
  );
  assert.equal(
    toText(factorTrinomial(s, parse("x^2 + 5x + 6", s)).expr),
    "(x + 2)·(x + 3)",
  );
  assert.equal(
    toText(factorTrinomial(s, parse("2x^2 + 7x + 3", s)).expr),
    "(2·x + 1)·(x + 3)",
  );
  assert.equal(
    toText(factorCommon(s, parse("6x + 9", s)).expr),
    "3·(2·x + 3)",
  );
  // Non-factorable input returns unchanged with a note.
  const prime = parse("x^2 + x + 1", s);
  assert.equal(factorTrinomial(s, prime).note, "Tak dapat difaktorkan bulat");
});

test("simplify folds constants and collects like terms", () => {
  const s = createScope();
  assert.equal(toText(simplify(s, parse("2x + 3x", s)).expr), "5·x");
  assert.equal(toText(simplify(s, parse("x*0 + 7", s)).expr), "7");
  assert.equal(toText(simplify(s, parse("(2+3)*x", s)).expr), "5·x");
  assert.equal(toText(simplify(s, parse("x/x", s)).expr), "1");
});

test("substitute, balance, solveLinear produce stepped equations", () => {
  const s = createScope();
  assert.equal(
    toText(substitute(s, parse("t^2 + t", s), "t", parse("2^x", s)).expr),
    "(2^x)^2 + 2^x",
  );
  const bal = balance(s, parse("2x + 6 = 14", s), "-", parse("6", s));
  assert.equal(toText(bal.expr), "2·x = 8");
  const steps = solveLinear(s, parse("2x + 6 = 14", s));
  assert.equal(steps.length, 4);
  assert.equal(toText(steps[steps.length - 1].expr), "x = 4");
  assert.equal(toText(completeSquare(s, parse("x^2 + 6x + 5", s)).expr), "(x + 3)^2 - 4");
  const c = cancelFraction(s, parse("(x(x+1))/(x)", s));
  assert.deepEqual(c.conditions, ["x ≠ 0"]);
});

test("stable ids track term correspondence across transforms", () => {
  const s = createScope();
  const before = parse("3(x+1)", s);
  const after = expand(s, before).expr;
  const d = diffExpr(before, after);
  // The literal 3 node is retained; distribution introduces new nodes.
  assert.ok(d.retained.length >= 1);
  assert.ok(d.introduced.length >= 1);
  const c2 = cloneExpr(createScope(1000), before);
  assert.equal(shape(before), shape(c2));
  assert.notDeepEqual(
    [...variables(before)],
    [...variables(parse("y+z", createScope()))],
  );
});

test("evaluator enforces real domains explicitly", () => {
  const s = createScope();
  assert.equal(evaluate(parse("2*3+4", s)).ok, true);
  assert.equal(evaluate(parse("1/0", s)).ok, false);
  assert.equal(evaluate(parse("sqrt(0-4)", s)).ok, false);
  const ln = evaluate(parse("ln(x)", s), { x: -1 });
  assert.equal(ln.ok, false);
  assert.equal((evaluate(parse("x^2", s), { x: 3 }) as { value: number }).value, 9);
});

test("verifier distinguishes equivalence, conditions, implication, invalid", () => {
  const s = createScope();
  const vEq = verifyRewrite(parse("(x+1)^2", s), expand(s, parse("(x+1)^2", s)).expr, {
    rule: "expand",
  });
  assert.equal(vEq.kind, "equivalent");
  const vCond = verifyRewrite(parse("x/x", s), parse("1", s), {
    rule: "cancel",
    conditions: ["x ≠ 0"],
  });
  assert.equal(vCond.kind, "conditional");
  const vImpl = verifyRewrite(parse("x = 2", s), parse("x^2 = 4", s), {
    rule: "square-both-sides",
  });
  assert.equal(vImpl.kind, "implication");
  const vBad = verifyRewrite(parse("sqrt(a+b)", s), parse("sqrt(a)+sqrt(b)", s), {
    rule: "bad-distribute",
  });
  assert.equal(vBad.kind, "invalid");
  assert.ok(vBad.counterexamples.length > 0);
  // Deterministic: same verdict and samples on repeat.
  const again = verifyRewrite(parse("(x+1)^2", s), expand(s, parse("(x+1)^2", s)).expr, {
    rule: "expand",
  });
  assert.deepEqual({ kind: again.kind, samples: again.samples }, { kind: vEq.kind, samples: vEq.samples });
});

test("trick checker validates shortcuts against exact arithmetic", () => {
  const by11 = (n: number) => {
    const a = Math.floor(n / 10),
      b = n % 10,
      s = a + b;
    return s < 10 ? a * 100 + s * 10 + b : (a + 1) * 100 + ((s % 10) * 10 + b);
  };
  const v = verifyTrick("kali 11", {
    exact: ([n]) => n * 11,
    shortcut: ([n]) => by11(n),
    cases: [[23], [45], [12], [80], [34]],
    edgeCases: [[10], [99], [29], [19]],
    conditions: ["bilangan bulat dua digit"],
  });
  assert.equal(v.kind, "heuristic");
  const bad = verifyTrick("salah", {
    exact: ([n]) => n * 11,
    shortcut: ([n]) => n * 10,
    cases: [[23]],
    edgeCases: [],
    conditions: ["—"],
  });
  assert.equal(bad.kind, "invalid");
});

test("sampling is deterministic and bounded", () => {
  const a = sampleBindings(["x", "y"], 400);
  const b = sampleBindings(["x", "y"], 400);
  assert.deepEqual(a, b);
  assert.ok(a.length <= 400 && a.length > 100);
  assert.deepEqual(sampleBindings([], 10), [{}]);
});

test("AST renders to multi-color layout expressions", () => {
  const s = createScope();
  const m = toMathExpr(parse("2x + 3 = 7", s));
  assert.equal(typeof m, "object");
  assert.ok(JSON.stringify(m).includes("="));
});

test("toMathExpr applies painted colors without recursing", () => {
  const s = createScope();
  const ast = parse("x + h = 3", s);
  const paintSym = (e: (typeof ast)): void => {
    if (e.kind === "sym" && e.name === "x") (e as { color?: string }).color = "blue";
    for (const k of ["terms", "factors"] as const) {
      const kids = (e as unknown as Record<string, unknown>)[k];
      if (Array.isArray(kids)) kids.forEach((c) => paintSym(c as typeof ast));
    }
    for (const k of ["left", "right", "arg", "num", "den", "base", "exp"] as const) {
      const c = (e as unknown as Record<string, unknown>)[k];
      if (c && typeof c === "object") paintSym(c as typeof ast);
    }
  };
  paintSym(ast);
  const m = toMathExpr(ast);
  assert.ok(JSON.stringify(m).includes("blue"));
});
