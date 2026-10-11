/** MCP tool implementations: pure lesson/asset operations.
 *
 * Each tool validates inputs, mutates a lesson JSON structure or reads the
 * asset registry, and returns a JSON-serializable result. The stdio server
 * in `scripts/mcp-server.ts` exposes these over MCP; the same functions back
 * `scripts/mcp-cli.ts` for shell use and unit tests.
 */
import type { Lesson, Action } from "../story/types";
import { validateLesson } from "../story/types";
import { assertCanvasThemeId } from "../story/canvas-themes";
import { resolveHandwritingStyle } from "../handwriting/styles";
import {
  assertWorkspaceSafeAssetPath,
  loadManifest,
  listAssets,
  inspectAsset,
} from "../assets/registry";
import { lookupAsset } from "../assets/catalog";

export interface ToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

function loadLessonJson(raw: unknown): Lesson {
  return validateLesson(raw as Lesson);
}

function findChapter(lesson: Lesson, chapterId?: string) {
  if (!chapterId) return lesson.chapters[0];
  const ch = lesson.chapters.find((c) => c.id === chapterId);
  if (!ch) throw Error(`Unknown chapter: ${chapterId}`);
  return ch;
}

function uniqueId(lesson: Lesson, base: string): string {
  const ids = new Set(lesson.chapters.flatMap((c) => c.actions.map((a) => a.id)));
  let id = base,
    n = 1;
  while (ids.has(id)) id = `${base}-${n++}`;
  return id;
}

/** add_image: place a registered asset on the canvas. */
export function addImage(
  lessonRaw: unknown,
  input: {
    assetId: string;
    x: number;
    y: number;
    w: number;
    h: number;
    at?: number;
    duration?: number;
    rotation?: number;
    opacity?: number;
    chapterId?: string;
    altText?: string;
  },
): { lesson: Lesson; actionId: string } {
  const lesson = loadLessonJson(structuredClone(lessonRaw));
  const asset = lookupAsset(input.assetId);
  assertWorkspaceSafeAssetPath(asset.file);
  const ch = findChapter(lesson, input.chapterId);
  const actionId = uniqueId(lesson, `img-${input.assetId}`);
  const action: Action = {
    id: actionId,
    type: "addImage",
    assetId: input.assetId,
    x: input.x,
    y: input.y,
    w: input.w,
    h: input.h,
    rotation: input.rotation,
    opacity: input.opacity,
    altText: input.altText,
    at: input.at ?? 0,
    duration: input.duration ?? 1200,
  };
  ch.actions.push(validateActionIn(lesson, ch.id, action));
  return { lesson, actionId };
}

/** add_portrait: convenience for Newton/Leibniz with attribution caption. */
export function addPortrait(
  lessonRaw: unknown,
  input: {
    who: "newton" | "leibniz";
    x: number;
    y: number;
    w?: number;
    at?: number;
    duration?: number;
    chapterId?: string;
    withCaption?: boolean;
  },
): { lesson: Lesson; actionId: string; captionId?: string } {
  const assetId =
    input.who === "newton" ? "newton-portrait" : "leibniz-portrait";
  const asset = lookupAsset(assetId);
  const w = input.w ?? 260;
  const h = Math.round((w * asset.h) / asset.w);
  const { lesson, actionId } = addImage(lessonRaw, {
    assetId,
    x: input.x,
    y: input.y,
    w,
    h,
    at: input.at,
    duration: input.duration,
    chapterId: input.chapterId,
  });
  let captionId: string | undefined;
  if (input.withCaption !== false) {
    const ch = findChapter(lesson, input.chapterId);
    captionId = uniqueId(lesson, `caption-${input.who}`);
    const name =
      input.who === "newton" ? "Isaac Newton (1643-1727)" : "G. W. Leibniz (1646-1716)";
    const caption: Action = {
      id: captionId,
      type: "annotateImage",
      content: name,
      x: input.x,
      y: input.y + h + 12,
      height: 26,
      color: "grey",
      handwritingStyle: "annotation",
      maxWidth: w + 120,
      at: (input.at ?? 0) + (input.duration ?? 1200),
      duration: 2500,
    };
    ch.actions.push(validateActionIn(lesson, ch.id, caption));
  }
  return { lesson, actionId, captionId };
}

/** place_asset: alias of add_image with explicit layer/crop support. */
export function placeAsset(
  lessonRaw: unknown,
  input: {
    assetId: string;
    x: number;
    y: number;
    w: number;
    h: number;
    at?: number;
    duration?: number;
    rotation?: number;
    opacity?: number;
    crop?: { topLeft: { x: number; y: number }; bottomRight: { x: number; y: number } } | null;
    layer?: number;
    chapterId?: string;
  },
): { lesson: Lesson; actionId: string } {
  const lesson = loadLessonJson(structuredClone(lessonRaw));
  const asset = lookupAsset(input.assetId);
  assertWorkspaceSafeAssetPath(asset.file);
  const ch = findChapter(lesson, input.chapterId);
  const actionId = uniqueId(lesson, `asset-${input.assetId}`);
  const action: Action = {
    id: actionId,
    type: "addImage",
    assetId: input.assetId,
    x: input.x,
    y: input.y,
    w: input.w,
    h: input.h,
    rotation: input.rotation,
    opacity: input.opacity,
    crop: input.crop,
    layer: input.layer,
    at: input.at ?? 0,
    duration: input.duration ?? 1200,
  };
  ch.actions.push(validateActionIn(lesson, ch.id, action));
  return { lesson, actionId };
}

/** animate_image: add an effect to a previously placed image group. */
export function animateImage(
  lessonRaw: unknown,
  input: {
    target: string;
    effect: "reveal" | "fade" | "slide" | "zoom" | "mask" | "cameraFollow";
    at: number;
    duration: number;
    dx?: number;
    dy?: number;
    scale?: number;
    fromOpacity?: number;
    toOpacity?: number;
    bounds?: { x: number; y: number; w: number; h: number };
    chapterId?: string;
  },
): { lesson: Lesson; actionId: string } {
  const lesson = loadLessonJson(structuredClone(lessonRaw));
  const ch = findChapter(lesson, input.chapterId);
  if (!ch.actions.some((a) => a.id === input.target || a.group === input.target))
    throw Error(`Animation target not found in chapter: ${input.target}`);
  const actionId = uniqueId(lesson, `anim-${input.target}`);
  const action: Action = {
    id: actionId,
    type: "animateImage",
    target: input.target,
    effect: input.effect,
    dx: input.dx,
    dy: input.dy,
    scale: input.scale,
    fromOpacity: input.fromOpacity,
    toOpacity: input.toOpacity,
    bounds: input.bounds,
    at: input.at,
    duration: input.duration,
  };
  ch.actions.push(validateActionIn(lesson, ch.id, action));
  return { lesson, actionId };
}

/** annotate_image: handwritten caption/label/arrow on top of an image. */
export function annotateImage(
  lessonRaw: unknown,
  input: {
    content: string;
    x: number;
    y: number;
    height?: number;
    color?: "black" | "blue" | "red" | "green" | "orange" | "grey";
    at: number;
    duration: number;
    chapterId?: string;
    arrowFrom?: { x: number; y: number };
    arrowTo?: { x: number; y: number };
    font?: "stroke" | "Patrick Hand" | "Kalam" | "Caveat";
  },
): { lesson: Lesson; actionId: string } {
  const lesson = loadLessonJson(structuredClone(lessonRaw));
  const ch = findChapter(lesson, input.chapterId);
  const actionId = uniqueId(lesson, "annotation");
  const action: Action = {
    id: actionId,
    type: "annotateImage",
    content: input.content,
    x: input.x,
    y: input.y,
    height: input.height ?? 30,
    color: input.color ?? "red",
    handwritingStyle: "annotation",
    handwritingFont: input.font,
    arrowFrom: input.arrowFrom,
    arrowTo: input.arrowTo,
    at: input.at,
    duration: input.duration,
  };
  ch.actions.push(validateActionIn(lesson, ch.id, action));
  return { lesson, actionId };
}

/** set_handwriting_style: lesson default or chapter action. */
export function setHandwritingStyle(
  lessonRaw: unknown,
  input: {
    role?: "title" | "heading" | "explanation" | "annotation" | "math";
    font?: "stroke" | "Patrick Hand" | "Kalam" | "Caveat";
    chapterId?: string;
    at?: number;
  },
): { lesson: Lesson; label: string } {
  const lesson = loadLessonJson(structuredClone(lessonRaw));
  const resolved = resolveHandwritingStyle({
    role: input.role,
    fontFamily: input.font,
  });
  if (input.chapterId || input.at !== undefined) {
    const ch = findChapter(lesson, input.chapterId);
    const action: Action = {
      id: uniqueId(lesson, "handwriting"),
      type: "setHandwriting",
      role: input.role,
      font: input.font,
      at: input.at ?? 0,
      duration: 0,
    };
    ch.actions.push(validateActionIn(lesson, ch.id, action));
  } else {
    lesson.handwriting = {
      ...(input.role ? { role: input.role } : {}),
      ...(input.font ? { font: input.font } : {}),
    };
  }
  validateLesson(lesson);
  return { lesson, label: resolved.label };
}

/** set_canvas_style: theme switch without rebuilding the lesson. Appends a
 * theme action at the given time, or sets the lesson default theme. */
export function setCanvasStyle(
  lessonRaw: unknown,
  input: { theme: string; chapterId?: string; at?: number },
): { lesson: Lesson; theme: string } {
  const lesson = loadLessonJson(structuredClone(lessonRaw));
  const theme = assertCanvasThemeId(input.theme);
  if (input.chapterId || input.at !== undefined) {
    const ch = findChapter(lesson, input.chapterId);
    const action: Action = {
      id: uniqueId(lesson, "canvas"),
      type: "setCanvas",
      theme,
      at: input.at ?? 0,
      duration: 0,
    };
    ch.actions.push(validateActionIn(lesson, ch.id, action));
  } else {
    lesson.canvasTheme = theme;
  }
  validateLesson(lesson);
  return { lesson, theme };
}

/** list_assets / inspect_asset read the on-disk manifest. */
export async function listAssetsTool() {
  const manifest = await loadManifest();
  return listAssets(manifest);
}

export async function inspectAssetTool(idOrFile: string) {
  const manifest = await loadManifest();
  return inspectAsset(manifest, idOrFile);
}

/** create_visual_comparison: build a side-by-side lesson comparing two
 * handwriting presets over identical Indonesian content. */
export function createVisualComparison(input: {
  id?: string;
  title?: string;
  seed?: number;
  left?: { role?: "title" | "heading" | "explanation" | "annotation" | "math"; font?: "stroke" | "Patrick Hand" | "Kalam" | "Caveat"; label?: string };
  right?: { role?: "title" | "heading" | "explanation" | "annotation" | "math"; font?: "stroke" | "Patrick Hand" | "Kalam" | "Caveat"; label?: string };
  theme?: string;
}): { lesson: Lesson } {
  const left = {
    role: (input.left?.role ?? "explanation") as "explanation",
    font: (input.left?.font ?? "stroke") as "stroke",
    label: input.left?.label ?? "Kiri: pena stroke",
  };
  const right = {
    role: (input.right?.role ?? "annotation") as "annotation",
    font: (input.right?.font ?? "Caveat") as "Caveat",
    label: input.right?.label ?? "Kanan: font Caveat",
  };
  resolveHandwritingStyle({ role: left.role, fontFamily: left.font });
  resolveHandwritingStyle({ role: right.role, fontFamily: right.font });
  const theme = input.theme ? assertCanvasThemeId(input.theme) : "whiteboard";
  const samples: { content: string; y: number; at: number; duration: number; height: number }[] = [
    { content: "Memahami perubahan", y: 145, at: 1000, duration: 4500, height: 38 },
    { content: "Turunan mengukur laju", y: 230, at: 5500, duration: 4000, height: 30 },
    { content: "perubahan sesaat.", y: 282, at: 9500, duration: 3500, height: 30 },
  ];
  const actions: Action[] = [
    {
      id: "label-left",
      type: "write",
      content: left.label,
      x: 65,
      y: 45,
      height: 30,
      color: "blue",
      handwritingStyle: "heading",
      at: 0,
      duration: 800,
    },
    {
      id: "label-right",
      type: "write",
      content: right.label,
      x: 865,
      y: 45,
      height: 30,
      color: "blue",
      handwritingStyle: "heading",
      at: 0,
      duration: 800,
    },
  ];
  samples.forEach((s, i) => {
    actions.push({
      id: `left-${i}`,
      type: "write",
      content: s.content,
      x: 65,
      y: s.y,
      height: s.height,
      handwritingStyle: left.role as "explanation",
      handwritingFont: left.font as "stroke",
      at: s.at,
      duration: s.duration,
    });
    actions.push({
      id: `right-${i}`,
      type: "write",
      content: s.content,
      x: 865,
      y: s.y,
      height: s.height,
      handwritingStyle: right.role as "annotation",
      handwritingFont: right.font as "Caveat",
      at: s.at,
      duration: s.duration,
    });
  });
  const lesson: Lesson = {
    format: "stroke-lesson",
    version: 1,
    id: input.id ?? "visual-comparison",
    title: input.title ?? "Perbandingan visual",
    language: "id",
    seed: input.seed ?? 123,
    duration: 30000,
    canvasTheme: theme,
    chapters: [
      {
        id: "comparison",
        title: "Perbandingan",
        start: 0,
        duration: 30000,
        origin: { x: 0, y: 0 },
        objectives: ["Matched visual comparison"],
        actions,
      },
    ],
  };
  return { lesson: validateLesson(lesson) };
}

function validateActionIn(lesson: Lesson, chapterId: string, action: Action): Action {
  const probe = structuredClone(lesson);
  const ch = probe.chapters.find((c) => c.id === chapterId)!;
  ch.actions.push(action as never);
  validateLesson(probe);
  return action;
}
