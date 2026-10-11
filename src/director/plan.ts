/** Scene plans: deterministic, inspectable lesson direction.
 *
 * A LessonPlan is pure JSON: learning objectives, concepts, narration, visual
 * requirements, timing constraints, assets, and creative preferences. The
 * director (templates.ts) lowers it to timed lesson actions; rendering never
 * depends on LLM calls. Every scene documents its pedagogical purpose.
 */
import type { Color } from "../handwriting/engine";
import type { CanvasThemeId } from "../story/canvas-themes";

export type BeatMode =
  | "introduce"
  | "demonstrate"
  | "compare"
  | "transform"
  | "emphasize"
  | "pause"
  | "ask"
  | "reveal"
  | "summarize"
  | "transition";

export const BEAT_MODES: BeatMode[] = [
  "introduce",
  "demonstrate",
  "compare",
  "transform",
  "emphasize",
  "pause",
  "ask",
  "reveal",
  "summarize",
  "transition",
];

export type VisualPattern =
  | "derivation"
  | "compare"
  | "graph"
  | "diagram"
  | "bars"
  | "factor"
  | "ask";

export const VISUAL_PATTERNS: VisualPattern[] = [
  "derivation",
  "compare",
  "graph",
  "diagram",
  "bars",
  "factor",
  "ask",
];

/** One equation step: expression source + reason + optional emphasis. */
export interface EquationStep {
  /** Expression source (parsed strictly; `=` allowed for equations). */
  source: string;
  /** Why this step follows (shown + narrated). */
  reason: string;
  /** Transform rule applied from the previous step (for verification). */
  rule?: string;
  /** Domain conditions introduced here. */
  conditions?: string[];
  /** Symbol → ink color overrides for this step. */
  colors?: Record<string, Color>;
  /** Substrings to emphasize after writing. */
  emphasize?: string[];
  /** Substrings to strike through (cancellation). */
  cancel?: string[];
}

/** A narrated visual beat inside a scene. */
export interface Beat {
  id: string;
  mode: BeatMode;
  /** Documented pedagogical purpose (required). */
  purpose: string;
  /** Narration sentences for this beat (Indonesian). */
  narration: string[];
  /** Phrases that must align with visual events. */
  cues?: string[];
  /** Equation steps shown in this beat. */
  equations?: EquationStep[];
  /** Free explanation lines (handwritten). */
  lines?: string[];
  /** Minimum screen time in ms (default by content). */
  minDurationMs?: number;
}

export interface GraphSpec {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Function plot specs: { fn, color }. */
  curves: { fn: Record<string, unknown>; color?: Color }[];
  /** Moving/static points: { x, y?, label? }. */
  points?: { x: number; y?: number; label?: string }[];
  /** Secant animation { at, from, to } or tangent { at }. */
  secant?: { at: number; from: number; to: number };
  tangent?: { at: number; triangle?: number };
  /** Shaded area [a,b], Riemann {a,b,n}. */
  shade?: [number, number];
  riemann?: { a: number; b: number; n: number };
}

export interface DiagramSpec {
  kind: string;
  params: Record<string, unknown>;
  labels?: { text: string; x: number; y: number; height?: number; color?: Color }[];
}

export interface ScenePlan {
  id: string;
  title: string;
  /** Documented pedagogical purpose (required). */
  purpose: string;
  concept: string;
  pattern: VisualPattern;
  beats: Beat[];
  /** Semantic palette: quantity name → ink color (consistent per scene). */
  palette?: Record<string, Color>;
  theme?: CanvasThemeId;
  assets?: string[];
  graph?: GraphSpec;
  diagram?: DiagramSpec;
  /** Total scene budget in ms (default: sum of beat estimates). */
  budgetMs?: number;
}

export interface LessonPlan {
  id: string;
  title: string;
  seed: number;
  /** Learning objectives for the whole lesson. */
  objectives: string[];
  scenes: ScenePlan[];
}

const COLORS: Color[] = ["black", "blue", "red", "green", "orange", "grey"];
const THEMES: CanvasThemeId[] = ["whiteboard", "graph", "notebook", "darkboard"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function reqStr(v: unknown, what: string): string {
  if (typeof v !== "string" || !v.length) throw Error(`Scene plan: ${what} must be a non-empty string`);
  return v;
}

export function validateEquationStep(v: unknown, what: string): EquationStep {
  if (!isRecord(v)) throw Error(`Scene plan: ${what} must be an object`);
  const out: EquationStep = {
    source: reqStr(v.source, `${what}.source`),
    reason: reqStr(v.reason, `${what}.reason`),
  };
  if (v.rule !== undefined) out.rule = reqStr(v.rule, `${what}.rule`);
  if (v.conditions !== undefined) {
    if (!Array.isArray(v.conditions) || !v.conditions.every((c) => typeof c === "string"))
      throw Error(`Scene plan: ${what}.conditions must be string[]`);
    out.conditions = v.conditions as string[];
  }
  if (v.colors !== undefined) {
    if (!isRecord(v.colors)) throw Error(`Scene plan: ${what}.colors must be an object`);
    for (const [k, c] of Object.entries(v.colors)) {
      if (!COLORS.includes(c as Color)) throw Error(`Scene plan: ${what}.colors.${k} invalid`);
      if (!k.length) throw Error(`Scene plan: ${what}.colors has empty key`);
    }
    out.colors = v.colors as Record<string, Color>;
  }
  for (const key of ["emphasize", "cancel"] as const) {
    if (v[key] !== undefined) {
      if (!Array.isArray(v[key]) || !(v[key] as unknown[]).every((e) => typeof e === "string"))
        throw Error(`Scene plan: ${what}.${key} must be string[]`);
      (out as unknown as Record<string, unknown>)[key] = v[key];
    }
  }
  return out;
}

export function validateBeat(v: unknown, what: string): Beat {
  if (!isRecord(v)) throw Error(`Scene plan: ${what} must be an object`);
  const mode = v.mode as BeatMode;
  if (!BEAT_MODES.includes(mode)) throw Error(`Scene plan: ${what}.mode invalid`);
  const out: Beat = {
    id: reqStr(v.id, `${what}.id`),
    mode,
    purpose: reqStr(v.purpose, `${what}.purpose`),
    narration: [],
  };
  if (!Array.isArray(v.narration) || !v.narration.every((n) => typeof n === "string"))
    throw Error(`Scene plan: ${what}.narration must be string[]`);
  out.narration = v.narration as string[];
  if (v.cues !== undefined) {
    if (!Array.isArray(v.cues) || !v.cues.every((c) => typeof c === "string"))
      throw Error(`Scene plan: ${what}.cues must be string[]`);
    out.cues = v.cues as string[];
  }
  if (v.equations !== undefined) {
    if (!Array.isArray(v.equations)) throw Error(`Scene plan: ${what}.equations must be an array`);
    out.equations = v.equations.map((e, i) => validateEquationStep(e, `${what}.equations[${i}]`));
  }
  if (v.lines !== undefined) {
    if (!Array.isArray(v.lines) || !v.lines.every((l) => typeof l === "string"))
      throw Error(`Scene plan: ${what}.lines must be string[]`);
    out.lines = v.lines as string[];
  }
  if (v.minDurationMs !== undefined) {
    if (!Number.isFinite(v.minDurationMs) || (v.minDurationMs as number) < 0)
      throw Error(`Scene plan: ${what}.minDurationMs invalid`);
    out.minDurationMs = v.minDurationMs as number;
  }
  return out;
}

export function validateScenePlan(v: unknown): ScenePlan {
  if (!isRecord(v)) throw Error("Scene plan must be an object");
  if (!VISUAL_PATTERNS.includes(v.pattern as VisualPattern))
    throw Error(`Scene plan ${(v as { id?: unknown }).id}: pattern invalid`);
  const out: ScenePlan = {
    id: reqStr(v.id, "scene.id"),
    title: reqStr(v.title, "scene.title"),
    purpose: reqStr(v.purpose, "scene.purpose"),
    concept: reqStr(v.concept, "scene.concept"),
    pattern: v.pattern as VisualPattern,
    beats: [],
  };
  if (!Array.isArray(v.beats) || v.beats.length === 0)
    throw Error(`Scene ${out.id}: beats must be a non-empty array`);
  out.beats = v.beats.map((b, i) => validateBeat(b, `scene ${out.id} beat[${i}]`));
  const ids = new Set(out.beats.map((b) => b.id));
  if (ids.size !== out.beats.length) throw Error(`Scene ${out.id}: duplicate beat ids`);
  if (v.palette !== undefined) {
    if (!isRecord(v.palette)) throw Error(`Scene ${out.id}: palette must be an object`);
    for (const [k, c] of Object.entries(v.palette)) {
      if (!COLORS.includes(c as Color)) throw Error(`Scene ${out.id}: palette.${k} invalid`);
      if (!k.length) throw Error(`Scene ${out.id}: palette has empty key`);
    }
    out.palette = v.palette as Record<string, Color>;
  }
  if (v.theme !== undefined) {
    if (!THEMES.includes(v.theme as CanvasThemeId)) throw Error(`Scene ${out.id}: theme invalid`);
    out.theme = v.theme as CanvasThemeId;
  }
  if (v.assets !== undefined) {
    if (!Array.isArray(v.assets) || !v.assets.every((a) => typeof a === "string"))
      throw Error(`Scene ${out.id}: assets must be string[]`);
    out.assets = v.assets as string[];
  }
  if (v.graph !== undefined) {
    if (!isRecord(v.graph)) throw Error(`Scene ${out.id}: graph must be an object`);
    out.graph = v.graph as unknown as GraphSpec;
  }
  if (v.diagram !== undefined) {
    if (!isRecord(v.diagram) || typeof v.diagram.kind !== "string")
      throw Error(`Scene ${out.id}: diagram invalid`);
    out.diagram = v.diagram as unknown as DiagramSpec;
  }
  if (v.budgetMs !== undefined) {
    if (!Number.isFinite(v.budgetMs) || (v.budgetMs as number) <= 0)
      throw Error(`Scene ${out.id}: budgetMs invalid`);
    out.budgetMs = v.budgetMs as number;
  }
  return out;
}

export function validateLessonPlan(v: unknown): LessonPlan {
  if (!isRecord(v)) throw Error("Lesson plan must be an object");
  const out: LessonPlan = {
    id: reqStr(v.id, "plan.id"),
    title: reqStr(v.title, "plan.title"),
    seed: 1,
    objectives: [],
    scenes: [],
  };
  if (!Number.isInteger(v.seed)) throw Error("Lesson plan seed must be an integer");
  out.seed = v.seed as number;
  if (!Array.isArray(v.objectives) || !v.objectives.every((o) => typeof o === "string"))
    throw Error("Lesson plan objectives must be string[]");
  out.objectives = v.objectives as string[];
  if (!Array.isArray(v.scenes) || v.scenes.length === 0)
    throw Error("Lesson plan scenes must be a non-empty array");
  out.scenes = v.scenes.map((s) => validateScenePlan(s));
  const ids = new Set(out.scenes.map((s) => s.id));
  if (ids.size !== out.scenes.length) throw Error("Lesson plan: duplicate scene ids");
  return out;
}

/** Deterministic narration-time estimate (marked estimated, never measured). */
export function estimateNarrationMs(text: string): number {
  // ~14 chars/sec Indonesian + 350ms breathing room per sentence.
  const sentences = text.split(/[.!?…]+/).filter((s) => s.trim().length > 0).length;
  return Math.round((text.length / 14) * 1000 + Math.max(1, sentences) * 350);
}

/** Default beat budget from content size (deterministic estimate). */
export function estimateBeatMs(beat: Beat): number {
  let ms = 1200; // beat floor: reveal + settle
  for (const n of beat.narration) ms += estimateNarrationMs(n);
  for (const e of beat.equations ?? []) ms += 900 + e.source.length * 55;
  for (const l of beat.lines ?? []) ms += 700 + l.length * 45;
  if (beat.mode === "pause" || beat.mode === "ask") ms += 1800;
  return Math.max(ms, beat.minDurationMs ?? 0);
}
