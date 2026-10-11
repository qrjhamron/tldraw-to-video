export type FunctionModel =
  | { kind: "polynomial"; coefficients: number[] }
  | { kind: "sine"; amplitude: number; frequency: number; offset?: number };
export function validateFunction(f: FunctionModel) {
  if (!f || (f.kind !== "polynomial" && f.kind !== "sine"))
    throw Error("Unsupported function model");
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
  return f.kind === "polynomial"
    ? f.coefficients.reduceRight((v, c) => v * x + c, 0)
    : f.amplitude * Math.sin(f.frequency * x) + (f.offset ?? 0);
}
export function derivative(f: FunctionModel, x: number): number {
  return f.kind === "polynomial"
    ? f.coefficients.slice(1).reduceRight((v, c, i) => v * x + c * (i + 1), 0)
    : f.amplitude * f.frequency * Math.cos(f.frequency * x);
}
export function integral(f: FunctionModel, a: number, b: number): number {
  const primitive = (x: number) =>
    f.kind === "polynomial"
      ? f.coefficients.reduce((v, c, i) => v + (c * x ** (i + 1)) / (i + 1), 0)
      : f.frequency === 0
        ? (f.offset ?? 0) * x
        : (-f.amplitude * Math.cos(f.frequency * x)) / f.frequency +
          (f.offset ?? 0) * x;
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
