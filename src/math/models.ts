export type FunctionModel =
  | { kind: "polynomial"; coefficients: number[] }
  | { kind: "sine"; amplitude: number; frequency: number; offset?: number }
  | { kind: "exp"; base: number; coefficient?: number }
  | { kind: "log"; base: number; coefficient?: number };
export function validateFunction(f: FunctionModel) {
  if (
    !f ||
    (f.kind !== "polynomial" &&
      f.kind !== "sine" &&
      f.kind !== "exp" &&
      f.kind !== "log")
  )
    throw Error("Unsupported function model");
  if (f.kind === "exp" || f.kind === "log") {
    if (!(f.base > 0) || f.base === 1 || !Number.isFinite(f.base))
      throw Error("exp/log base must be positive and ≠ 1");
    if (f.coefficient !== undefined && !Number.isFinite(f.coefficient))
      throw Error("Invalid exp/log coefficient");
    return f;
  }
  const values =
    f.kind === "polynomial"
      ? f.coefficients
      : [f.amplitude, f.frequency, f.offset ?? 0];
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.length > 100 ||
    values.some((v) => !Number.isFinite(v))
  )
    throw Error("Invalid function coefficients");
  return f;
}
export function evaluate(f: FunctionModel, x: number): number {
  switch (f.kind) {
    case "polynomial":
      return f.coefficients.reduceRight((v, c) => v * x + c, 0);
    case "sine":
      return f.amplitude * Math.sin(f.frequency * x) + (f.offset ?? 0);
    case "exp":
      return (f.coefficient ?? 1) * f.base ** x;
    case "log":
      return x <= 0
        ? NaN
        : ((f.coefficient ?? 1) * Math.log(x)) / Math.log(f.base);
  }
}
export function derivative(f: FunctionModel, x: number): number {
  switch (f.kind) {
    case "polynomial":
      return f.coefficients
        .slice(1)
        .reduceRight((v, c, i) => v * x + c * (i + 1), 0);
    case "sine":
      return f.amplitude * f.frequency * Math.cos(f.frequency * x);
    case "exp":
      return (f.coefficient ?? 1) * Math.log(f.base) * f.base ** x;
    case "log":
      return x <= 0 ? NaN : (f.coefficient ?? 1) / (x * Math.log(f.base));
  }
}
export function integral(f: FunctionModel, a: number, b: number): number {
  const primitive = (x: number) => {
    switch (f.kind) {
      case "polynomial":
        return f.coefficients.reduce(
          (v, c, i) => v + (c * x ** (i + 1)) / (i + 1),
          0,
        );
      case "sine":
        return f.frequency === 0
          ? (f.offset ?? 0) * x
          : (-f.amplitude * Math.cos(f.frequency * x)) / f.frequency +
              (f.offset ?? 0) * x;
      case "exp":
        return ((f.coefficient ?? 1) * f.base ** x) / Math.log(f.base);
      case "log":
        return x <= 0
          ? NaN
          : ((f.coefficient ?? 1) * (x * Math.log(x) - x)) / Math.log(f.base);
    }
  };
  return primitive(b) - primitive(a);
}
export function secantSlope(f: FunctionModel, a: number, b: number) {
  return a === b
    ? derivative(f, a)
    : (evaluate(f, b) - evaluate(f, a)) / (b - a);
}
export function riemann(
  f: FunctionModel,
  a: number,
  b: number,
  n: number,
  method: "left" | "right" | "midpoint" = "midpoint",
) {
  if (!Number.isInteger(n) || n <= 0 || b <= a)
    throw Error("Riemann partition requires n > 0 and b > a");
  const dx = (b - a) / n;
  return Array.from({ length: n }, (_, i) => {
    const x = a + i * dx;
    return {
      x,
      width: dx,
      height: evaluate(
        f,
        x + dx * (method === "left" ? 0 : method === "right" ? 1 : 0.5),
      ),
    };
  });
}
export function riemannSum(
  f: FunctionModel,
  a: number,
  b: number,
  n: number,
  method: "left" | "right" | "midpoint" = "midpoint",
) {
  return riemann(f, a, b, n, method).reduce(
    (s, r) => s + r.width * r.height,
    0,
  );
}
export function ticks(min: number, max: number, target = 6) {
  if (
    ![min, max, target].every(Number.isFinite) ||
    max <= min ||
    target <= 0 ||
    target > 1000
  )
    throw Error("Invalid tick range");
  const raw = (max - min) / target,
    p = 10 ** Math.floor(Math.log10(raw)),
    m = raw / p,
    step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  const out: number[] = [];
  for (let x = Math.ceil(min / step) * step; x <= max + step * 1e-8; x += step)
    out.push(Number(x.toPrecision(10)));
  return out;
}
export function transformPoint(
  p: { x: number; y: number },
  matrix: [number, number, number, number, number, number],
) {
  const [a, b, c, d, e, f] = matrix;
  return { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f };
}
/** Real roots of ax²+bx+c=0 (a≠0), ascending. Empty when discriminant < 0. */
export function quadraticRoots(a: number, b: number, c: number): number[] {
  if (![a, b, c].every(Number.isFinite) || a === 0)
    throw Error("quadraticRoots needs finite a≠0, b, c");
  const d = b * b - 4 * a * c;
  if (d < 0) return [];
  if (d === 0) return [-b / (2 * a)];
  const r = Math.sqrt(d);
  return [(-b - r) / (2 * a), (-b + r) / (2 * a)].sort((x, y) => x - y);
}
/** Intersection of y=m1x+b1 and y=m2x+b2; null when parallel. */
export function intersectLines(
  m1: number,
  b1: number,
  m2: number,
  b2: number,
): { x: number; y: number } | null {
  if (![m1, b1, m2, b2].every(Number.isFinite)) throw Error("Invalid lines");
  if (m1 === m2) return null;
  const x = (b2 - b1) / (m1 - m2);
  return { x, y: m1 * x + b1 };
}
/** Bisection root of f(x)=target on [a,b] (requires a sign change). */
export function bisectRoot(
  f: FunctionModel,
  a: number,
  b: number,
  target = 0,
  tolerance = 1e-9,
): number {
  let lo = a,
    hi = b,
    flo = evaluate(f, lo) - target;
  const fhi = evaluate(f, hi) - target;
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0)
    throw Error("bisectRoot needs a finite sign change on [a,b]");
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2,
      fm = evaluate(f, mid) - target;
    if (!Number.isFinite(fm)) throw Error("bisectRoot hit a non-finite value");
    if (Math.abs(fm) <= tolerance || hi - lo <= tolerance) return mid;
    if (flo * fm <= 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}
export function optimizeQuadratic(f: FunctionModel) {
  if (
    f.kind !== "polynomial" ||
    f.coefficients.length !== 3 ||
    f.coefficients[2] === 0
  )
    throw Error("Requires a quadratic");
  const x = -f.coefficients[1] / (2 * f.coefficients[2]);
  return {
    x,
    y: evaluate(f, x),
    kind: f.coefficients[2] < 0 ? "maximum" : "minimum",
  };
}
