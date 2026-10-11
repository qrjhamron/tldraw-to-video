import { evaluate, type FunctionModel } from "../math/models";
import { penProgress } from "../handwriting/engine";
export interface MotionModel {
  fn: FunctionModel;
  from: number;
  to: number;
}
export function motionFraction(progress: number, model?: MotionModel) {
  const f = Math.max(0, Math.min(1, progress));
  if (!model) return penProgress(f);
  const start = evaluate(model.fn, model.from),
    end = evaluate(model.fn, model.to),
    value = evaluate(model.fn, model.from + (model.to - model.from) * f);
  if (!Number.isFinite(value) || end === start)
    throw Error("Motion needs finite displacement between its model endpoints");
  return (value - start) / (end - start);
}
