/** Font-mode timing for honest text-shape handwriting.
 *
 * Font mode uses native tldraw `text` shapes with vendored handwriting
 * webfonts. Characters reveal progressively with deterministic seeded tempo
 * variation. This never claims pen-stroke construction: shapes carry
 * `generator: 'font-v1'` and `mode: 'font'`.
 */
import { random } from "./engine";

export interface FontRevealStep {
  /** Absolute offset in ms from action start. */
  t: number;
  /** Visible prefix (character count). */
  chars: number;
}

/** Compute deterministic per-character reveal times. Longer pauses after
 * spaces and punctuation mimic natural writing rhythm without faking
 * stroke geometry. */
export function fontRevealSteps(
  text: string,
  durationMs: number,
  seed: number,
): FontRevealStep[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0)
    throw Error("Invalid font reveal duration");
  const chars = [...text];
  if (!chars.length) return [];
  const rng = random(seed);
  const weights = chars.map((ch, i) => {
    let w = 1;
    if (ch === " ") w = 0.45;
    else if (/[.,;:!?]/.test(ch)) w = 1.5;
    else if (i > 0 && /[A-Z]/.test(ch) && chars[i - 1] === " ") w = 1.25;
    // Seeded tempo variation ±18%, deterministic per seed.
    w *= 0.82 + rng() * 0.36;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const steps: FontRevealStep[] = [];
  let cursor = 0;
  for (let i = 0; i < chars.length; i++) {
    cursor += (durationMs * weights[i]) / total;
    steps.push({ t: Math.min(durationMs, cursor), chars: i + 1 });
  }
  return steps;
}

/** Estimate text shape width for layout guards. Uses conservative
 * per-character advance so font-mode labels respect maxWidth without
 * requiring browser measurement at compile time. */
export function estimateFontWidth(text: string, height: number): number {
  // Average advance ~0.52em for handwriting fonts at nominal height.
  return [...text].length * height * 0.52;
}
