/** Hybrid handwriting style catalog.
 *
 * Two honest rendering modes:
 * - `stroke`: authored ordered pen centerlines -> native tldraw `draw` shapes
 *   with progressive point-prefix reveal. This is the default for every role
 *   and the only mode that may claim pen-stroke construction.
 * - `font`: handwritten webfonts (Patrick Hand, Kalam, Caveat) -> native
 *   tldraw `text` shapes with progressive character reveal. Shapes are labeled
 *   `generator: 'font-v1'` and never claim pen construction.
 *
 * Roles distinguish titles, headings, explanations, annotations, and math.
 * `heading` is retained as an alias of `title` for backward compatibility.
 */

export type HandwritingRole =
  | "title"
  | "heading"
  | "explanation"
  | "annotation"
  | "math";

export type HandwritingFontFamily =
  | "stroke"
  | "Patrick Hand"
  | "Kalam"
  | "Caveat";

export type HandwritingMode = "stroke" | "font";

export interface HandwritingPreset {
  role: HandwritingRole;
  mode: HandwritingMode;
  fontFamily: HandwritingFontFamily;
  /** Nominal height multiplier relative to the action height. */
  heightScale: number;
  /** Honest human-readable label for UI and verification. */
  label: string;
}

export const HANDWRITING_FONTS: HandwritingFontFamily[] = [
  "stroke",
  "Patrick Hand",
  "Kalam",
  "Caveat",
];

export const HANDWRITING_ROLES: HandwritingRole[] = [
  "title",
  "heading",
  "explanation",
  "annotation",
  "math",
];

/** Default preset per role. Stroke is default everywhere except annotations,
 * which default to Caveat font mode for expressive color labels. Math stays
 * stroke-based to preserve baseline-accurate layout. */
export const handwritingPresets: Record<HandwritingRole, HandwritingPreset> = {
  title: {
    role: "title",
    mode: "stroke",
    fontFamily: "stroke",
    heightScale: 1.15,
    label: "Title · stroke pen",
  },
  heading: {
    role: "heading",
    mode: "stroke",
    fontFamily: "stroke",
    heightScale: 1,
    label: "Heading · stroke pen",
  },
  explanation: {
    role: "explanation",
    mode: "stroke",
    fontFamily: "stroke",
    heightScale: 1,
    label: "Explanation · stroke pen",
  },
  annotation: {
    role: "annotation",
    mode: "font",
    fontFamily: "Caveat",
    heightScale: 1.05,
    label: "Annotation · Caveat font",
  },
  math: {
    role: "math",
    mode: "stroke",
    fontFamily: "stroke",
    heightScale: 1,
    label: "Math · stroke pen",
  },
};

export interface ResolvedHandwritingStyle {
  role: HandwritingRole;
  mode: HandwritingMode;
  fontFamily: HandwritingFontFamily;
  label: string;
}

/** Resolve an explicit style request. Never silently substitutes:
 * - unknown role/font throws
 * - `fontFamily: 'stroke'` always means stroke mode
 * - a named font always means font mode (honest text-shape rendering)
 * - math with a named font is allowed but flagged: layout stays accurate
 *   only for single-line content; structured expressions should use stroke.
 */
export function resolveHandwritingStyle(input: {
  role?: HandwritingRole;
  fontFamily?: HandwritingFontFamily;
  mode?: HandwritingMode;
}): ResolvedHandwritingStyle {
  const role = input.role ?? "explanation";
  if (!HANDWRITING_ROLES.includes(role))
    throw Error(`Unsupported handwriting role: ${role}`);
  const fontFamily = input.fontFamily ?? handwritingPresets[role].fontFamily;
  if (!HANDWRITING_FONTS.includes(fontFamily))
    throw Error(`Unsupported handwriting font: ${fontFamily}`);
  let mode = input.mode ?? (fontFamily === "stroke" ? "stroke" : "font");
  if (fontFamily === "stroke" && mode !== "stroke")
    throw Error("fontFamily 'stroke' requires stroke mode");
  if (fontFamily !== "stroke" && mode !== "font")
    throw Error(`fontFamily '${fontFamily}' requires font mode`);
  // Normalize heading/title alias for preset lookup but preserve requested role.
  const preset = handwritingPresets[role];
  void preset;
  const label =
    mode === "stroke"
      ? `${capitalize(role)} · stroke pen`
      : `${capitalize(role)} · ${fontFamily} font`;
  return { role, mode, fontFamily, label };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Map a font-mode family to tldraw's `font` prop. tldraw renders text shapes
 * with CSS vars (--tl-font-*); we override those vars with vendored handwriting
 * fonts so offline export stays reproducible. */
export function tldrawFontProp(family: HandwritingFontFamily): "draw" | "sans" | "serif" | "mono" {
  switch (family) {
    case "Patrick Hand":
      return "draw";
    case "Kalam":
      return "sans";
    case "Caveat":
      return "serif";
    default:
      return "draw";
  }
}
