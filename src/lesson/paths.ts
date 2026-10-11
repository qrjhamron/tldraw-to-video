import { textLayout } from "../handwriting/engine";
export {
  length,
  resample,
  prefix,
  path,
  type Point,
  type InkPath,
} from "../handwriting/strokes";
import type { InkPath } from "../handwriting/strokes";
/** All production lettering uses authored pen strokes, including the intro lesson. */
export function lettering(
  text: string,
  x: number,
  y: number,
  height = 40,
  color: InkPath["color"] = "black",
): InkPath[] {
  return textLayout(text, x, y, {
    seed: 1,
    height,
    color,
    style: /[=+∫^]/.test(text)
      ? "math"
      : height >= 42
        ? "heading"
        : "explanation",
  }).paths;
}
