/** Scene director: lowers validated ScenePlans to timed lesson actions.
 *
 * Pure and deterministic: parses equation sources with a per-scene id scope,
 * applies the semantic palette, lays out regions with CanvasPlanner, and
 * schedules beats sequentially. Narration actions span their beats; the TTS
 * alignment pass later warps visual timings to measured audio.
 */
import {
  createScope,
  toMathExpr,
  children,
  type Expr,
} from "../math/ast";
import type { Color } from "../handwriting/engine";
import { parse } from "../math/transform";
import {
  CanvasPlanner,
  measureText,
  measureExpr,
  checkInkOnTheme,
  type Rect,
} from "./layout";
import { estimateBeatMs, type ScenePlan, type Beat, type EquationStep } from "./plan";
import type { Action } from "../story/types";
import type { CanvasThemeId } from "../story/canvas-themes";

export interface Cue {
  phrase: string;
  tMs: number;
  beatId: string;
  /** Always estimated at plan time; measured alignment comes from TTS words. */
  measured: false;
}
export interface Checkpoint {
  beatId: string;
  mode: string;
  purpose: string;
  tMs: number;
  durationMs: number;
}
export interface DirectedScene {
  actions: Action[];
  cues: Cue[];
  checkpoints: Checkpoint[];
  durationMs: number;
  warnings: string[];
}

interface Ctx {
  scene: ScenePlan;
  planner: CanvasPlanner;
  scope: ReturnType<typeof createScope>;
  actions: Action[];
  cues: Cue[];
  checkpoints: Checkpoint[];
  warnings: string[];
  serial: number;
  theme: CanvasThemeId;
}

function aid(ctx: Ctx, stem: string): string {
  return `${ctx.scene.id}-${stem}-${ctx.serial++}`;
}

/** Apply the semantic palette to AST symbol nodes (exact name match). */
function colorize(node: Expr, palette: Record<string, Color>): void {
  if (node.kind === "sym" && palette[node.name]) node.color = palette[node.name];
  for (const c of children(node)) colorize(c, palette);
}

/** Fractional span of a substring within a laid line (padded approximation). */
function spanRect(line: Rect, full: string, sub: string, pad = 10): Rect | null {
  const i = full.indexOf(sub);
  if (i < 0 || !full.length) return null;
  const x0 = line.x + (line.w * i) / full.length - pad;
  const x1 = line.x + (line.w * (i + sub.length)) / full.length + pad;
  return { x: Math.max(0, x0), y: line.y - 4, w: x1 - x0, h: line.h + 12 };
}

function writeEquation(
  ctx: Ctx,
  step: EquationStep,
  x: number,
  y: number,
  height: number,
  at: number,
  duration: number,
  group: string,
): Rect {
  let ast: Expr;
  try {
    ast = parse(step.source, ctx.scope);
  } catch (err) {
    throw Error(`Scene ${ctx.scene.id}: cannot parse ${JSON.stringify(step.source)}: ${(err as Error).message}`);
  }
  if (ctx.scene.palette) colorize(ast, ctx.scene.palette);
  if (step.colors)
    for (const [name, color] of Object.entries(step.colors)) {
      const paintSym = (n: Expr): void => {
        if (n.kind === "sym" && n.name === name) n.color = color;
        for (const c of children(n)) paintSym(c);
      };
      paintSym(ast);
    }
  const expr = toMathExpr(ast);
  const id = aid(ctx, "eq");
  ctx.actions.push({
    id,
    group,
    type: "write",
    content: expr,
    handwritingStyle: "math",
    x,
    y,
    height,
    at,
    duration,
  });
  // Region for emphasis/cancel/camera, measured with the real layout.
  const m = measureExpr(expr, height, 1);
  const line: Rect = { x, y, w: m.w, h: m.h };
  let cursor = at + duration;
  for (const sub of step.emphasize ?? []) {
    const r = spanRect(line, step.source, sub);
    if (!r) {
      ctx.warnings.push(`Scene ${ctx.scene.id}: emphasize target ${JSON.stringify(sub)} not found`);
      continue;
    }
    ctx.actions.push({
      id: aid(ctx, "hl"),
      group,
      type: "highlight",
      x: r.x,
      y: r.y,
      width: r.w,
      height: r.h,
      color: "orange",
      at: cursor,
      duration: 700,
    });
    cursor += 700;
  }
  for (const sub of step.cancel ?? []) {
    const r = spanRect(line, step.source, sub);
    if (!r) {
      ctx.warnings.push(`Scene ${ctx.scene.id}: cancel target ${JSON.stringify(sub)} not found`);
      continue;
    }
    ctx.actions.push({
      id: aid(ctx, "cx"),
      group,
      type: "crossOut",
      x: r.x,
      y: r.y + r.h / 2 - 6,
      width: r.w,
      height: 12,
      color: "red",
      at: cursor,
      duration: 700,
    });
    cursor += 700;
  }
  return line;
}

function writeLine(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  height: number,
  color: Color,
  at: number,
  duration: number,
  group: string,
  style: "heading" | "explanation" | "annotation" = "explanation",
): Rect {
  ctx.actions.push({
    id: aid(ctx, "tx"),
    group,
    type: "write",
    content: text,
    handwritingStyle: style,
    x,
    y,
    height,
    color,
    at,
    duration,
  });
  const m = measureText(text, height, 1);
  return { x, y, w: m.w, h: m.h };
}

function narrate(
  ctx: Ctx,
  id: string,
  text: string,
  at: number,
  duration: number,
  visual?: string,
): void {
  ctx.actions.push({ id, type: "narrate", text, visual, at, duration });
}

function diagram(
  ctx: Ctx,
  group: string,
  spec: Extract<Action, { type: "diagram" }>["diagram"],
  at: number,
  duration: number,
): void {
  ctx.actions.push({ id: aid(ctx, "dg"), group, type: "diagram", diagram: spec, at, duration });
}

/** Schedule one beat's narration + cues; returns beat timing. */
function beatTiming(beat: Beat, startMs: number): { at: number; duration: number } {
  return { at: startMs, duration: estimateBeatMs(beat) };
}

function directDerivation(ctx: Ctx, beats: Beat[], startMs: number): number {
  let t = startMs;
  const group = `${ctx.scene.id}-deriv`;
  // Title.
  writeLine(ctx, ctx.scene.title, 80, 60, 44, "blue", t, 2200, group, "heading");
  t += 2400;
  for (const beat of beats) {
    const { duration } = beatTiming(beat, t);
    const end = t + duration;
    let cursor = t;
    // Narration spans the beat.
    const ntext = beat.narration.join(" ");
    if (ntext) narrate(ctx, aid(ctx, "nar"), ntext, t, duration, beat.id);
    for (const [ci, cue] of (beat.cues ?? []).entries()) {
      const idx = ntext.indexOf(cue);
      ctx.cues.push({
        phrase: cue,
        tMs: Math.round(idx < 0 ? t : t + (duration * idx) / Math.max(1, ntext.length)),
        beatId: beat.id,
        measured: false,
      });
      void ci;
    }
    for (const line of beat.lines ?? []) {
      const r = ctx.planner.textLine(aid(ctx, "rg"), line, 80, 30, beat.id);
      writeLine(ctx, line, r.x, r.y, 30, "black", cursor, Math.min(2500, duration / 2), group);
      cursor += 1200;
    }
    for (const step of beat.equations ?? []) {
      const slot = Math.min(3500, Math.max(1400, (end - cursor) / ((beat.equations ?? []).length + 1)));
      const r = ctx.planner.reserve(aid(ctx, "rg"), 80, 1100, 64, beat.id);
      writeEquation(ctx, step, r.x, r.y, 36, cursor, slot, group);
      // Reason annotation to the right.
      const rx = 1230;
      writeLine(ctx, step.reason, rx, r.y + 8, 24, "grey", cursor + slot * 0.4, 1400, group, "annotation");
      if (step.conditions?.length)
        writeLine(ctx, `syarat: ${step.conditions.join(", ")}`, rx, r.y + 38, 22, "orange", cursor + slot * 0.6, 1400, group, "annotation");
      cursor += slot + 500;
    }
    if (beat.mode === "pause" || beat.mode === "ask") {
      ctx.actions.push({ id: aid(ctx, "pa"), type: "pause", reason: beat.purpose.slice(0, 120), at: end - 1500, duration: 1500 });
    }
    ctx.checkpoints.push({ beatId: beat.id, mode: beat.mode, purpose: beat.purpose, tMs: t, durationMs: duration });
    t = end;
  }
  return t;
}

function directCompare(ctx: Ctx, beats: Beat[], startMs: number): number {
  let t = startMs;
  const group = `${ctx.scene.id}-cmp`;
  writeLine(ctx, ctx.scene.title, 80, 60, 44, "blue", t, 2200, group, "heading");
  t += 2400;
  // Divider between columns.
  diagram(ctx, group, { kind: "rect", x: 810, y: 140, w: 2, h: 740, color: "grey" }, t, 800);
  const steps = beats.flatMap((b) => (b.equations ?? []).map((e) => ({ beat: b, step: e })));
  const rows: { left?: { beat: Beat; step: EquationStep }; right?: { beat: Beat; step: EquationStep } }[] = [];
  for (let i = 0; i < steps.length; i += 2)
    rows.push({ left: steps[i], right: steps[i + 1] });
  let y = 160;
  for (const beat of beats) {
    const { duration } = beatTiming(beat, t);
    const ntext = beat.narration.join(" ");
    if (ntext) narrate(ctx, aid(ctx, "nar"), ntext, t, duration, beat.id);
    ctx.checkpoints.push({ beatId: beat.id, mode: beat.mode, purpose: beat.purpose, tMs: t, durationMs: duration });
    t += duration;
  }
  // Equations laid in pairs; timed across the scene span.
  let cursor = startMs + 2400;
  const perRow = rows.length ? (t - cursor - 500) / rows.length : 0;
  for (const r of rows) {
    if (r.left) {
      const reg = ctx.planner.reserve(aid(ctx, "rg"), 80, 680, 64, r.left.beat.id, { y });
      writeEquation(ctx, r.left.step, reg.x, reg.y, 32, cursor, Math.min(3000, perRow * 0.8), group);
    }
    if (r.right) {
      const reg = ctx.planner.reserve(aid(ctx, "rg"), 880, 680, 64, r.right.beat.id, { y });
      writeEquation(ctx, r.right.step, reg.x, reg.y, 32, cursor + 400, Math.min(3000, perRow * 0.8), group);
    }
    y += 120;
    cursor += perRow;
  }
  return t;
}

function directGraph(ctx: Ctx, beats: Beat[], startMs: number): number {
  let t = startMs;
  const group = `${ctx.scene.id}-grf`;
  const spec = ctx.scene.graph;
  if (!spec) throw Error(`Scene ${ctx.scene.id}: graph pattern needs a graph spec`);
  writeLine(ctx, ctx.scene.title, 80, 60, 44, "blue", t, 2200, group, "heading");
  t += 2400;
  const graph = { x: 80, y: 220, width: 640, height: 560, xMin: spec.xMin, xMax: spec.xMax, yMin: spec.yMin, yMax: spec.yMax };
  ctx.actions.push({ id: aid(ctx, "ax"), group, type: "drawAxes", graph, at: t, duration: 1800 });
  t += 1400;
  for (const [i, c] of spec.curves.entries()) {
    ctx.actions.push({
      id: aid(ctx, "cv"),
      group,
      type: "drawGraph",
      graph,
      fn: c.fn as never,
      color: c.color ?? "blue",
      at: t + i * 1200,
      duration: 2200,
    });
  }
  t += spec.curves.length * 1200 + 1200;
  for (const beat of beats) {
    const { duration } = beatTiming(beat, t);
    const end = t + duration;
    const ntext = beat.narration.join(" ");
    if (ntext) narrate(ctx, aid(ctx, "nar"), ntext, t, duration, beat.id);
    let cursor = t;
    for (const line of beat.lines ?? []) {
      const r = ctx.planner.textLine(aid(ctx, "rg"), line, 800, 30, beat.id);
      writeLine(ctx, line, Math.max(800, r.x), r.y, 30, "black", cursor, 2000, group);
      cursor += 1400;
    }
    for (const step of beat.equations ?? []) {
      const r = ctx.planner.reserve(aid(ctx, "rg"), 800, 700, 60, beat.id);
      writeEquation(ctx, step, r.x, Math.max(220, r.y), 32, cursor, 2500, group);
      cursor += 2200;
    }
    ctx.checkpoints.push({ beatId: beat.id, mode: beat.mode, purpose: beat.purpose, tMs: t, durationMs: duration });
    t = end;
  }
  // Parameter-driven elements after the explanation scaffold.
  if (spec.secant && spec.curves[0]) {
    ctx.actions.push({
      id: aid(ctx, "sec"), group, type: "animateSecant", graph,
      fn: spec.curves[0].fn as never, x: spec.secant.at, from: spec.secant.from, to: spec.secant.to,
      at: startMs + 6000, duration: 6000,
    });
  }
  if (spec.tangent && spec.curves[0]) {
    ctx.actions.push({
      id: aid(ctx, "tan"), group, type: "animateTangent", graph,
      fn: spec.curves[0].fn as never, x: spec.tangent.at,
      ...(spec.tangent.triangle ? { triangle: spec.tangent.triangle } : {}),
      at: startMs + 12000, duration: 4000,
    });
  }
  if (spec.shade && spec.curves[0]) {
    ctx.actions.push({
      id: aid(ctx, "sh"), group, type: "shadeArea", graph,
      fn: spec.curves[0].fn as never, a: spec.shade[0], b: spec.shade[1],
      at: t - 6000, duration: 3000,
    });
  }
  if (spec.riemann && spec.curves[0]) {
    ctx.actions.push({
      id: aid(ctx, "rm"), group, type: "drawRiemannRectangles", graph,
      fn: spec.curves[0].fn as never, a: spec.riemann.a, b: spec.riemann.b, n: spec.riemann.n,
      at: t - 9000, duration: 3000,
    });
  }
  for (const [i, p] of (spec.points ?? []).entries()) {
    ctx.actions.push({
      id: aid(ctx, "pt"), group, type: "plotPoint", graph, x: p.x, y: p.y ?? 0,
      ...(p.label ? { label: p.label } : {}),
      at: startMs + 4000 + i * 1500, duration: 1200,
    });
  }
  return t;
}

function directTextColumn(
  ctx: Ctx,
  beats: Beat[],
  startMs: number,
  x: number,
  group: string,
): number {
  let t = startMs;
  for (const beat of beats) {
    const { duration } = beatTiming(beat, t);
    const end = t + duration;
    const ntext = beat.narration.join(" ");
    if (ntext) narrate(ctx, aid(ctx, "nar"), ntext, t, duration, beat.id);
    let cursor = t;
    for (const line of beat.lines ?? []) {
      const r = ctx.planner.textLine(aid(ctx, "rg"), line, x, 30, beat.id);
      writeLine(ctx, line, r.x, r.y, 30, "black", cursor, 2000, group);
      cursor += 1300;
    }
    for (const step of beat.equations ?? []) {
      const r = ctx.planner.reserve(aid(ctx, "rg"), x, 600, 60, beat.id);
      writeEquation(ctx, step, r.x, r.y, 32, cursor, 2400, group);
      cursor += 2100;
    }
    if (beat.mode === "pause" || beat.mode === "ask") {
      ctx.actions.push({ id: aid(ctx, "pa"), type: "pause", reason: beat.purpose.slice(0, 120), at: end - 1500, duration: 1500 });
    }
    ctx.checkpoints.push({ beatId: beat.id, mode: beat.mode, purpose: beat.purpose, tMs: t, durationMs: duration });
    t = end;
  }
  return t;
}

function directDiagram(ctx: Ctx, beats: Beat[], startMs: number): number {
  let t = startMs;
  const group = `${ctx.scene.id}-dia`;
  const spec = ctx.scene.diagram;
  if (!spec) throw Error(`Scene ${ctx.scene.id}: diagram pattern needs a diagram spec`);
  writeLine(ctx, ctx.scene.title, 80, 60, 44, "blue", t, 2200, group, "heading");
  t += 2400;
  diagram(ctx, group, { kind: spec.kind, ...spec.params } as never, t, 2500);
  for (const [i, l] of (spec.labels ?? []).entries()) {
    writeLine(ctx, l.text, l.x, l.y, l.height ?? 26, l.color ?? "black", t + 1500 + i * 900, 1500, group, "annotation");
  }
  t += 2500;
  return directTextColumn(ctx, beats, t, 980, group);
}

function directBars(ctx: Ctx, beats: Beat[], startMs: number): number {
  let t = startMs;
  const group = `${ctx.scene.id}-bar`;
  writeLine(ctx, ctx.scene.title, 80, 60, 44, "blue", t, 2200, group, "heading");
  t += 2400;
  const bars = ((ctx.scene.diagram?.params as { bars?: { filled: number; total: number; label: string }[] } | undefined)?.bars) ?? [];
  let y = 200;
  for (const [i, b] of bars.entries()) {
    diagram(ctx, group, { kind: "fractionBar", x: 80, y, w: 560, h: 44, filled: b.filled, total: b.total, color: "green" }, t + i * 1400, 1600);
    writeLine(ctx, b.label, 660, y + 4, 28, "black", t + i * 1400 + 700, 1400, group);
    y += 90;
  }
  t += Math.max(2000, bars.length * 1400);
  return directTextColumn(ctx, beats, t, 980, group);
}

function directFactor(ctx: Ctx, beats: Beat[], startMs: number): number {
  // Derivation layout with automatic circles around composite refactored factors.
  const t0 = startMs;
  const group = `${ctx.scene.id}-fac`;
  writeLine(ctx, ctx.scene.title, 80, 60, 44, "blue", t0, 2200, group, "heading");
  const end = directDerivationSub(ctx, beats, t0 + 2400, group, true);
  return end;
}

function directDerivationSub(
  ctx: Ctx,
  beats: Beat[],
  startMs: number,
  group: string,
  circleFactors: boolean,
): number {
  let t = startMs;
  for (const beat of beats) {
    const { duration } = beatTiming(beat, t);
    const end = t + duration;
    const ntext = beat.narration.join(" ");
    if (ntext) narrate(ctx, aid(ctx, "nar"), ntext, t, duration, beat.id);
    let cursor = t;
    for (const step of beat.equations ?? []) {
      const slot = Math.min(3200, Math.max(1400, (end - cursor) / ((beat.equations ?? []).length + 1)));
      const r = ctx.planner.reserve(aid(ctx, "rg"), 140, 1000, 64, beat.id);
      const line = writeEquation(ctx, step, r.x, r.y, 36, cursor, slot, group);
      if (circleFactors) {
        // Circle the whole factor line's composite part (heuristic: after "=").
        const idx = step.source.indexOf("=");
        if (idx >= 0) {
          const frac = idx / step.source.length;
          diagram(
            ctx,
            group,
            { kind: "ellipse", cx: line.x + line.w * (0.5 + frac / 2), cy: line.y + line.h / 2, rx: line.w * (0.5 - frac / 2) + 14, ry: line.h / 2 + 14, color: "orange" },
            cursor + slot,
            900,
          );
        }
      }
      const rx = 1230;
      writeLine(ctx, step.reason, rx, r.y + 8, 24, "grey", cursor + slot * 0.4, 1400, group, "annotation");
      cursor += slot + 600;
    }
    for (const line of beat.lines ?? []) {
      const r = ctx.planner.textLine(aid(ctx, "rg"), line, 140, 30, beat.id);
      writeLine(ctx, line, r.x, r.y, 30, "black", cursor, 1800, group);
      cursor += 1200;
    }
    ctx.checkpoints.push({ beatId: beat.id, mode: beat.mode, purpose: beat.purpose, tMs: t, durationMs: duration });
    t = end;
  }
  return t;
}

function directAsk(ctx: Ctx, beats: Beat[], startMs: number): number {
  let t = startMs;
  const group = `${ctx.scene.id}-ask`;
  writeLine(ctx, ctx.scene.title, 80, 60, 40, "blue", t, 2000, group, "heading");
  t += 2200;
  for (const beat of beats) {
    const { duration } = beatTiming(beat, t);
    const end = t + duration;
    const ntext = beat.narration.join(" ");
    if (ntext) narrate(ctx, aid(ctx, "nar"), ntext, t, duration, beat.id);
    let cursor = t;
    const big = beat.mode === "ask" ? 40 : 34;
    for (const line of beat.lines ?? []) {
      const r = ctx.planner.textLine(aid(ctx, "rg"), line, 140, big, beat.id);
      writeLine(ctx, line, r.x, r.y, big, beat.mode === "ask" ? "blue" : "black", cursor, 2400, group);
      cursor += 1800;
    }
    for (const step of beat.equations ?? []) {
      const r = ctx.planner.reserve(aid(ctx, "rg"), 140, 1000, 70, beat.id);
      writeEquation(ctx, step, r.x, r.y, 38, cursor, 2600, group);
      cursor += 2200;
    }
    if (beat.mode === "ask" || beat.mode === "pause") {
      ctx.actions.push({ id: aid(ctx, "pa"), type: "pause", reason: beat.purpose.slice(0, 120), at: end - 1800, duration: 1800 });
    }
    ctx.checkpoints.push({ beatId: beat.id, mode: beat.mode, purpose: beat.purpose, tMs: t, durationMs: duration });
    t = end;
  }
  return t;
}

/** Lower one scene plan to timed actions (chapter-relative coordinates). */
export function directScene(scene: ScenePlan, seed = 1): DirectedScene {
  const ctx: Ctx = {
    scene,
    planner: new CanvasPlanner({ seed }),
    scope: createScope(1),
    actions: [],
    cues: [],
    checkpoints: [],
    warnings: [],
    serial: 0,
    theme: scene.theme ?? "whiteboard",
  };
  // Contrast gate: palette + emphasis colors must read on the scene theme.
  const inks = new Set<Color>(["black", "blue", "orange", "red", "grey", "green"]);
  for (const c of Object.values(scene.palette ?? {})) inks.add(c);
  for (const c of inks) {
    const { ok, ratio } = checkInkOnTheme(c, ctx.theme);
    if (!ok) ctx.warnings.push(`Ink ${c} on ${ctx.theme} has low contrast (${ratio.toFixed(2)} < 4.5)`);
  }
  if (scene.theme && scene.theme !== "whiteboard") {
    ctx.actions.push({ id: aid(ctx, "th"), type: "setCanvas", theme: scene.theme, at: 0, duration: 0 });
  }
  // Opening full-scene frame for a calm establish.
  ctx.actions.push({
    id: aid(ctx, "cam"),
    type: "moveCamera",
    bounds: { x: 0, y: 0, w: 1640, h: 920 },
    at: 0,
    duration: 1200,
  });
  const beats = scene.beats;
  let end: number;
  switch (scene.pattern) {
    case "derivation":
      end = directDerivation(ctx, beats, 1300);
      break;
    case "compare":
      end = directCompare(ctx, beats, 1300);
      break;
    case "graph":
      end = directGraph(ctx, beats, 1300);
      break;
    case "diagram":
      end = directDiagram(ctx, beats, 1300);
      break;
    case "bars":
      end = directBars(ctx, beats, 1300);
      break;
    case "factor":
      end = directFactor(ctx, beats, 1300);
      break;
    case "ask":
      end = directAsk(ctx, beats, 1300);
      break;
  }
  // Layout QA: overlaps and clipping become warnings (validate_scene_layout surfaces them too).
  for (const [a, b] of ctx.planner.allOverlaps()) {
    // Reason annotations intentionally sit near equations; only flag big overlaps.
    const ra = ctx.planner.get(a),
      rb = ctx.planner.get(b);
    const ox = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
    const oy = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y);
    if (ox > 60 && oy > 24)
      ctx.warnings.push(`Regions ${a} and ${b} overlap (${Math.round(ox)}×${Math.round(oy)})`);
  }
  for (const id of ctx.planner.outOfFrame()) ctx.warnings.push(`Region ${id} leaves the safe frame`);
  // Fit to budget by scaling beat timings (never below 800ms/beat).
  let durationMs = end;
  if (scene.budgetMs !== undefined && end > scene.budgetMs) {
    const beatsOnly = ctx.checkpoints.reduce((s, c) => s + c.durationMs, 0);
    const fixed = end - beatsOnly;
    const target = Math.max(scene.budgetMs - fixed, ctx.checkpoints.length * 800);
    const f = target / beatsOnly;
    for (const a of ctx.actions) {
      if (a.type === "narrate" || a.type === "pause") continue;
      a.at = Math.round(a.at * (a.at < 1300 ? 1 : f));
      a.duration = Math.round(a.duration * f);
    }
    durationMs = Math.round(fixed + target);
  }
  // Deterministic order: time, then creation.
  ctx.actions.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  return { actions: ctx.actions, cues: ctx.cues, checkpoints: ctx.checkpoints, durationMs, warnings: ctx.warnings };
}

export { estimateBeatMs };
