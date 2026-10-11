import type { Color } from "../handwriting/engine";
import type {
  VisualPattern,
  EquationStep,
  GraphSpec,
  DiagramSpec,
  ScenePlan,
  Beat,
} from "../director/plan";
import type { CanvasThemeId } from "../story/canvas-themes";
import type { TrickCheck } from "../math/verify";

/** One of the 50 fast-calculation techniques. */
export interface Trick {
  id: string;
  chapter: 1 | 2 | 3 | 4 | 5;
  title: string;
  /** Concise statement of the trick (Indonesian). */
  statement: string;
  /** Why it works (Indonesian). */
  why: string;
  /** Validity conditions (Indonesian). */
  conditions: string[];
  /** Short mental challenge (Indonesian). */
  challenge: string;
  /** Narration sentences (Indonesian). */
  narration: string[];
  pattern: VisualPattern;
  palette?: Record<string, Color>;
  theme?: CanvasThemeId;
  /** Worked example: verified pairwise (equivalent/conditional/implication/approximation/heuristic). */
  steps: EquationStep[];
  /** Numeric shortcut validation against exact arithmetic (when applicable). */
  check?: TrickCheck;
  /** Extra handwritten explanation lines (glyph-safe). */
  lines?: string[];
  graph?: GraphSpec;
  diagram?: DiagramSpec;
}

/** Lower a trick into a three-beat scene plan (introduce → demonstrate → ask). */
export function trickToScene(t: Trick): ScenePlan {
  const mid = Math.max(1, Math.ceil(t.narration.length / 2));
  const beats: Beat[] = [
    {
      id: `${t.id}-b1`,
      mode: "introduce",
      purpose: `Menyatakan trik: ${t.title}`,
      narration: t.narration.slice(0, mid),
      lines: [t.statement],
    },
    {
      id: `${t.id}-b2`,
      mode: "demonstrate",
      purpose: `Contoh langkah demi langkah: ${t.title}`,
      narration: t.narration.slice(mid),
      equations: t.steps,
      ...(t.lines ? { lines: t.lines } : {}),
    },
    {
      id: `${t.id}-b3`,
      mode: "ask",
      purpose: `Tantangan mental: ${t.title}`,
      narration: [`Sekarang giliranmu. ${t.challenge}`],
      lines: [t.challenge],
    },
  ];
  return {
    id: t.id,
    title: t.title,
    purpose: t.why,
    concept: t.id,
    pattern: t.pattern,
    beats,
    ...(t.palette ? { palette: t.palette } : {}),
    ...(t.theme ? { theme: t.theme } : {}),
    ...(t.graph ? { graph: t.graph } : {}),
    ...(t.diagram ? { diagram: t.diagram } : {}),
  };
}
