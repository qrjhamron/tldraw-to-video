/** MCP director tools: graphs, geometry, palettes, scenes, layout, QA.
 *
 * Pure lesson-editing functions (cloning inputs) plus validators. Async tools
 * that synthesize audio or render frames live here too; they shell to the same
 * scripts the repo gates use, with bounded timeouts and honest errors.
 */
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { EdgeNarration } from "../audio/edge";
import { alignNarration } from "../audio/timeline";
import { speakMath, DEFAULT_NARRATION } from "../audio/speech";
import {
  validateLessonPlan,
  validateScenePlan,
  estimateBeatMs,
  type LessonPlan,
  type ScenePlan,
} from "../director/plan";
import { directScene } from "../director/templates";
import { inspectChapter, actionBounds, type LayoutReport } from "../director/inspect";
import { checkInkOnTheme, union } from "../director/layout";
import { frameBounds } from "../story/camera";
import { validateLesson, type Action, type Lesson, type Chapter } from "../story/types";
import { validateFunction } from "../math/models";
import type { Color } from "../handwriting/engine";

function cloneLesson(raw: unknown): Lesson {
  return validateLesson(structuredClone(raw) as Lesson);
}
function findChapter(lesson: Lesson, id?: string): Chapter {
  if (!id) return lesson.chapters[0];
  const ch = lesson.chapters.find((c) => c.id === id);
  if (!ch) throw Error(`Unknown chapter: ${id}`);
  return ch;
}
function uniqueId(lesson: Lesson, base: string): string {
  const ids = new Set(lesson.chapters.flatMap((c) => c.actions.map((a) => a.id)));
  let id = base,
    n = 1;
  while (ids.has(id)) id = `${base}-${n++}`;
  return id;
}
function pushChecked(lesson: Lesson, ch: Chapter, action: Action): void {
  const probe = structuredClone(lesson);
  probe.chapters.find((c) => c.id === ch.id)!.actions.push(action as never);
  validateLesson(probe);
  ch.actions.push(action);
}

// ---------- animate_math_graph ----------
export interface GraphAnimationInput {
  chapterId?: string;
  at: number;
  duration?: number;
  graph: { x: number; y: number; width: number; height: number; xMin: number; xMax: number; yMin: number; yMax: number };
  axes?: boolean;
  curves?: { fn: Record<string, unknown>; color?: Color; drawMs?: number }[];
  morph?: { from: Record<string, unknown>; to: Record<string, unknown>; color?: Color; duration: number; pointX?: number };
  secant?: { curve: number; at: number; from: number; to: number; duration: number };
  tangent?: { curve: number; at: number; triangle?: number; duration?: number };
  shade?: { curve: number; a: number; b: number; duration?: number };
  riemann?: { curve: number; a: number; b: number; n: number; duration?: number };
  points?: { x: number; y: number; label?: string; at?: number }[];
}
export function animateMathGraph(
  lessonRaw: unknown,
  input: GraphAnimationInput,
): { lesson: Lesson; actionIds: string[] } {
  const lesson = cloneLesson(lessonRaw);
  const ch = findChapter(lesson, input.chapterId);
  const ids: string[] = [];
  const add = (a: Action): void => {
    pushChecked(lesson, ch, a);
    ids.push(a.id);
  };
  let t = input.at;
  if (input.axes !== false)
    add({ id: uniqueId(lesson, "axes"), type: "drawAxes", graph: input.graph, at: t, duration: 1500 });
  for (const c of input.curves ?? []) {
    validateFunction(c.fn as never);
    add({
      id: uniqueId(lesson, "curve"), type: "drawGraph", graph: input.graph,
      fn: c.fn as never, ...(c.color ? { color: c.color } : {}),
      at: t, duration: c.drawMs ?? 2200,
    });
    t += 800;
  }
  if (input.morph) {
    add({
      id: uniqueId(lesson, "morph"), type: "animateCurve", graph: input.graph,
      from: input.morph.from as never, to: input.morph.to as never,
      ...(input.morph.color ? { color: input.morph.color } : {}),
      ...(input.morph.pointX !== undefined ? { pointX: input.morph.pointX } : {}),
      at: t, duration: input.morph.duration,
    });
    t += input.morph.duration;
  }
  const curveFn = (i: number): never => {
    const c = (input.curves ?? [])[i];
    if (!c) throw Error(`animate_math_graph: curve ${i} not defined`);
    return c.fn as never;
  };
  if (input.secant)
    add({
      id: uniqueId(lesson, "secant"), type: "animateSecant", graph: input.graph,
      fn: curveFn(input.secant.curve), x: input.secant.at, from: input.secant.from, to: input.secant.to,
      at: t, duration: input.secant.duration,
    });
  if (input.tangent)
    add({
      id: uniqueId(lesson, "tangent"), type: "animateTangent", graph: input.graph,
      fn: curveFn(input.tangent.curve), x: input.tangent.at,
      ...(input.tangent.triangle !== undefined ? { triangle: input.tangent.triangle } : {}),
      at: t, duration: input.tangent.duration ?? 3000,
    });
  if (input.shade)
    add({
      id: uniqueId(lesson, "shade"), type: "shadeArea", graph: input.graph,
      fn: curveFn(input.shade.curve), a: input.shade.a, b: input.shade.b,
      at: t, duration: input.shade.duration ?? 2500,
    });
  if (input.riemann)
    add({
      id: uniqueId(lesson, "riemann"), type: "drawRiemannRectangles", graph: input.graph,
      fn: curveFn(input.riemann.curve), a: input.riemann.a, b: input.riemann.b, n: input.riemann.n,
      at: t, duration: input.riemann.duration ?? 3000,
    });
  for (const p of input.points ?? [])
    add({
      id: uniqueId(lesson, "pt"), type: "plotPoint", graph: input.graph, x: p.x, y: p.y,
      ...(p.label ? { label: p.label } : {}), at: p.at ?? t, duration: 1200,
    });
  return { lesson, actionIds: ids };
}

// ---------- animate_geometry ----------
export function animateGeometry(
  lessonRaw: unknown,
  input: {
    chapterId?: string;
    at: number;
    duration?: number;
    shapes: Extract<Action, { type: "diagram" }>["diagram"][];
  },
): { lesson: Lesson; actionIds: string[] } {
  const lesson = cloneLesson(lessonRaw);
  const ch = findChapter(lesson, input.chapterId);
  if (!Array.isArray(input.shapes) || !input.shapes.length)
    throw Error("animate_geometry needs at least one shape");
  const ids: string[] = [];
  let t = input.at;
  for (const d of input.shapes) {
    const a: Action = {
      id: uniqueId(lesson, "diagram"), type: "diagram", diagram: d, at: t, duration: input.duration ?? 1600,
    };
    pushChecked(lesson, ch, a);
    ids.push(a.id);
    t += 900;
  }
  return { lesson, actionIds: ids };
}

// ---------- set_semantic_colors ----------
export function setSemanticColors(
  lessonRaw: unknown,
  input: {
    chapterId?: string;
    actionId: string;
    /** Symbol substring → ink color. */
    colors: Record<string, Color>;
    /** Whole-action fallback color. */
    color?: Color;
  },
): { lesson: Lesson; warnings: string[] } {
  const lesson = cloneLesson(lessonRaw);
  const ch = findChapter(lesson, input.chapterId);
  const a = ch.actions.find((x) => x.id === input.actionId);
  if (!a) throw Error(`Unknown action: ${input.actionId}`);
  if (a.type !== "write" || typeof a.content !== "string")
    throw Error("set_semantic_colors targets string write actions");
  const theme = lesson.canvasTheme ?? "whiteboard";
  const warnings: string[] = [];
  // Split the content by symbol keys (longest first) into painted row items.
  const keys = Object.keys(input.colors).sort((x, y) => y.length - x.length);
  for (const k of keys) {
    if (!k.length) throw Error("Empty symbol key");
    const { ratio, ok } = checkInkOnTheme(input.colors[k], theme);
    if (!ok) warnings.push(`Ink ${input.colors[k]} on ${theme} is low contrast (${ratio.toFixed(2)})`);
  }
  const items: import("../handwriting/math-layout").MathExpr[] = [];
  let rest = a.content;
  outer: while (rest.length) {
    for (const k of keys) {
      if (rest.startsWith(k)) {
        items.push({ type: "row", items: [k], color: input.colors[k] });
        rest = rest.slice(k.length);
        continue outer;
      }
    }
    items.push(rest[0]);
    rest = rest.slice(1);
  }
  // Merge adjacent plain chars.
  const merged: import("../handwriting/math-layout").MathExpr[] = [];
  for (const it of items) {
    const last = merged[merged.length - 1];
    if (typeof it === "string" && typeof last === "string") merged[merged.length - 1] = last + it;
    else merged.push(it);
  }
  a.content = { type: "row", items: merged };
  if (input.color) a.color = input.color;
  validateLesson(lesson);
  return { lesson, warnings };
}

// ---------- plan_lesson_scenes / direct_scene ----------
export function planLessonScenes(input: { plan: unknown }): {
  plan: LessonPlan;
  scenes: { id: string; title: string; beats: number; estimatedMs: number }[];
  totalEstimatedMs: number;
} {
  const plan = validateLessonPlan(input.plan);
  const scenes = plan.scenes.map((s) => {
    const beats = s.beats.length;
    const estimatedMs =
      s.budgetMs ?? 1300 + 2400 + s.beats.reduce((t, b) => t + estimateBeatMs(b), 0);
    return { id: s.id, title: s.title, beats, estimatedMs };
  });
  return { plan, scenes, totalEstimatedMs: scenes.reduce((t, s) => t + s.estimatedMs, 0) };
}

export function directSceneTool(input: { scene: unknown; seed?: number }): {
  actions: Action[];
  cues: unknown[];
  checkpoints: unknown[];
  durationMs: number;
  warnings: string[];
} {
  const scene: ScenePlan = validateScenePlan(input.scene);
  const d = directScene(scene, input.seed ?? 1);
  return { actions: d.actions, cues: d.cues, checkpoints: d.checkpoints, durationMs: d.durationMs, warnings: d.warnings };
}

// ---------- auto_layout_scene / validate_scene_layout / reframe_camera ----------
export function autoLayoutScene(input: { scene: unknown; seed?: number }): {
  durationMs: number;
  warnings: string[];
  overlaps: [string, string][];
  outOfFrame: string[];
  frames: { beatId: string; bounds: { x: number; y: number; w: number; h: number } }[];
} {
  const scene = validateScenePlan(input.scene);
  const d = directScene(scene, input.seed ?? 1);
  // Frames per checkpoint from the actions scheduled inside each beat window.
  const frames = d.checkpoints.map((c) => {
    const inBeat = d.actions.filter(
      (a) => a.at >= c.tMs - 2500 && a.at < c.tMs + c.durationMs,
    );
    const rects = inBeat.flatMap((a) => {
      const r = actionBounds(a);
      return r ? [r] : [];
    });
    const box =
      rects.length > 0
        ? union(rects)
        : { x: 0, y: 0, w: 1640, h: 920 };
    return { beatId: c.beatId, bounds: box };
  });
  const overlaps: [string, string][] = [];
  for (const w of d.warnings) {
    const m = /Regions (\S+) and (\S+) overlap/.exec(w);
    if (m) overlaps.push([m[1], m[2]]);
  }
  const outOfFrame = d.warnings
    .map((w) => /Region (\S+) leaves/.exec(w)?.[1])
    .filter((x): x is string => !!x);
  return { durationMs: d.durationMs, warnings: d.warnings, overlaps, outOfFrame, frames };
}

export function validateSceneLayout(input: {
  lesson: unknown;
  chapterId?: string;
}): { reports: LayoutReport[]; ok: boolean } {
  const lesson = cloneLesson(lessonRaw(input.lesson));
  const ids = input.chapterId ? [input.chapterId] : lesson.chapters.map((c) => c.id);
  const reports = ids.map((id) => inspectChapter(lesson, id));
  return { reports, ok: reports.every((r) => !r.issues.some((i) => i.severity === "error")) };
}
function lessonRaw(v: unknown): unknown {
  return v;
}

export function reframeCamera(
  lessonRawInput: unknown,
  input: {
    chapterId?: string;
    at: number;
    duration?: number;
    bounds?: { x: number; y: number; w: number; h: number };
    actionIds?: string[];
    margin?: number;
  },
): { lesson: Lesson; actionId: string; camera: { x: number; y: number; z: number } } {
  const lesson = cloneLesson(lessonRawInput);
  const ch = findChapter(lesson, input.chapterId);
  let bounds = input.bounds;
  if (!bounds && input.actionIds?.length) {
    const rects = input.actionIds.map((id) => {
      const a = ch.actions.find((x) => x.id === id);
      if (!a) throw Error(`Unknown action: ${id}`);
      const r = actionBounds(a);
      if (!r) throw Error(`Action ${id} has no measurable bounds`);
      return r;
    });
    const u = union(rects);
    bounds = { x: u.x - 60, y: u.y - 60, w: u.w + 120, h: u.h + 120 };
  }
  if (!bounds) throw Error("reframe_camera needs bounds or actionIds");
  const camera = frameBounds(bounds, { width: 1920, height: 1080 }, input.margin ?? 64);
  const action: Action = {
    id: uniqueId(lesson, "reframe"),
    type: "moveCamera",
    bounds,
    at: input.at,
    duration: input.duration ?? 1500,
  };
  pushChecked(lesson, ch, action);
  return { lesson, actionId: action.id, camera };
}

// ---------- inspect_timeline / run_visual_qa ----------
export function inspectTimeline(input: { lesson: unknown }): {
  id: string;
  durationMs: number;
  chapters: {
    id: string;
    title: string;
    start: number;
    duration: number;
    actions: number;
    byType: Record<string, number>;
    narrationMs: number;
    narrationIds: string[];
  }[];
} {
  const lesson = cloneLesson(input.lesson);
  return {
    id: lesson.id,
    durationMs: lesson.duration,
    chapters: lesson.chapters.map((c) => {
      const byType: Record<string, number> = {};
      let narrationMs = 0;
      const narrationIds: string[] = [];
      for (const a of c.actions) {
        byType[a.type] = (byType[a.type] ?? 0) + 1;
        if (a.type === "narrate") {
          narrationMs += a.duration;
          narrationIds.push(a.id);
        }
      }
      return { id: c.id, title: c.title, start: c.start, duration: c.duration, actions: c.actions.length, byType, narrationMs, narrationIds };
    }),
  };
}

export function runVisualQa(input: {
  lesson: unknown;
  chapterId?: string;
  minContrast?: number;
}): {
  ok: boolean;
  errors: string[];
  warnings: string[];
  chapters: string[];
} {
  const lesson = cloneLesson(input.lesson);
  const ids = input.chapterId ? [input.chapterId] : lesson.chapters.map((c) => c.id);
  const errors: string[] = [],
    warnings: string[] = [];
  for (const id of ids) {
    const rep = inspectChapter(lesson, id, { minContrast: input.minContrast });
    for (const i of rep.issues)
      (i.severity === "error" ? errors : warnings).push(`[${id}] ${i.message}`);
    const ch = lesson.chapters.find((c) => c.id === id)!;
    // Narration coverage: every narrate must reference an existing visual or be scene-level.
    for (const a of ch.actions) {
      if (a.type === "narrate" && a.visual && !ch.actions.some((x) => x.id === a.visual || x.group === a.visual))
        warnings.push(`[${id}] narration ${a.id} references missing visual ${a.visual}`);
      // Write actions should fit the chapter (validateLesson guarantees) and carry ids.
      if ((a.type === "write" || a.type === "diagram") && a.duration <= 0)
        errors.push(`[${id}] action ${a.id} has no draw time`);
    }
    // Camera coverage: at least one framing per chapter.
    if (!ch.actions.some((a) => a.type === "moveCamera" || a.type === "zoomCamera"))
      warnings.push(`[${id}] no camera framing; static default view`);
  }
  return { ok: errors.length === 0, errors, warnings, chapters: ids };
}

/** Synthesize narration clips (measured durations) and warp visuals to fit. */
export async function alignNarrationTool(input: {
  lesson: unknown;
  outputDir?: string;
  voice?: string;
  rate?: string;
  /** Apply mathematical reading rules before synthesis (default false: speak authored text). */
  applySpeechRules?: boolean;
  regenerate?: boolean;
}): Promise<{
  lesson: Lesson;
  clips: { id: string; durationMs: number; words: number; spokenText: string }[];
  measured: true;
}> {
  const lesson = cloneLesson(input.lesson);
  const outputDir = input.outputDir ?? "output/audio/cache";
  if (!/^output\/[\w\-./]*$/.test(outputDir) || outputDir.includes(".."))
    throw Error("outputDir must stay under output/");
  const provider = new EdgeNarration({ regenerate: input.regenerate });
  const voice = input.voice ?? DEFAULT_NARRATION.voice,
    rate = input.rate ?? DEFAULT_NARRATION.rate;
  const full: import("../audio/timeline").AudioClip[] = [];
  const spoken = new Map<string, string>();
  for (const c of lesson.chapters)
    for (const a of c.actions) {
      if (a.type !== "narrate") continue;
      const spokenText = input.applySpeechRules ? speakMath(a.text) : a.text;
      full.push(await provider.synthesize({ id: a.id, text: spokenText, voice, rate, outputDir }));
      spoken.set(a.id, spokenText);
    }
  const aligned = alignNarration(lesson, full);
  return {
    lesson: aligned,
    clips: full.map((clip) => ({
      id: clip.id,
      durationMs: clip.durationMs,
      words: clip.words?.length ?? 0,
      spokenText: spoken.get(clip.id) ?? "",
    })),
    measured: true as const,
  };
}

function runCmd(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) =>
      err ? reject(Error(`${cmd} failed: ${String(stderr ?? err.message).slice(-1500)}`)) : resolve(stdout),
    );
    void child;
  });
}

/** Compile + render K preview frames through the real browser pipeline. */
export async function renderLessonPreview(input: {
  lesson: unknown;
  timesMs: number[];
  outDir?: string;
  timeoutMs?: number;
}): Promise<{ frames: string[]; width: number; height: number }> {
  const lesson = cloneLesson(input.lesson);
  if (!Array.isArray(input.timesMs) || !input.timesMs.length || input.timesMs.length > 12)
    throw Error("render_lesson_preview needs 1–12 timesMs");
  for (const t of input.timesMs) {
    if (!Number.isFinite(t) || t < 0 || t > lesson.duration)
      throw Error(`Preview time ${t} outside lesson 0–${lesson.duration}`);
  }
  const outDir = input.outDir ?? "output/preview";
  if (!/^output\/[\w\-./]*$/.test(outDir) || outDir.includes(".."))
    throw Error("outDir must stay under output/");
  await mkdir(outDir, { recursive: true });
  const job = `${outDir}/job.json`;
  await writeFile(job, JSON.stringify({ lesson, timesMs: input.timesMs, outDir }));
  await runCmd("npx", ["tsx", "scripts/render-preview.ts", job], input.timeoutMs ?? 240000);
  const { readFile } = await import("node:fs/promises");
  const manifest = JSON.parse(await readFile(`${outDir}/manifest.json`, "utf8")) as {
    frames: string[];
    width: number;
    height: number;
  };
  return manifest;
}
