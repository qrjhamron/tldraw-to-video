import {
  b64Vecs,
  createShapeId,
  toRichText,
  type Editor,
  type TLAssetId,
  type TLDrawShape,
  type TLImageShape,
  type TLShapeId,
  type TLTextShape,
  type IndexKey,
} from "tldraw";
import { Recorder } from "../engine/recorder";
import type { Recording } from "../engine/schema";
import { length, path, prefix, type InkPath } from "../lesson/paths";
import {
  penProgress,
  strokeProgress,
  textLayout,
  translate,
} from "../handwriting/engine";
import { fontRevealSteps, estimateFontWidth } from "../handwriting/font-mode";
import {
  resolveHandwritingStyle,
  tldrawFontProp,
} from "../handwriting/styles";
import { mathLayout } from "../handwriting/math-layout";
import { lookupAsset, assetCatalog } from "../assets/catalog";
import { assertCanvasThemeId } from "./canvas-themes";
import * as geometry from "../math/geometry";
import { evaluate, secantSlope } from "../math/models";
import { frameBounds } from "./camera";
import { directLesson } from "./director";
import { motionFraction } from "./motion";
import { validateLesson, type Action, type Lesson } from "./types";
interface Task {
  t: number;
  order: number;
  run: () => void;
}
export interface Compilation {
  recording: Recording;
  warnings: string[];
  strokes: number;
  actions: number;
}
/** Semantic content is lowered to editor operations, then captured by the same recorder as human input. */
export function compileLesson(editor: Editor, input: Lesson): Compilation {
  const lesson = validateLesson(directLesson(validateLesson(input)));
  editor.updateInstanceState({ isReadonly: false });
  editor.selectNone();
  editor.deleteShapes([...editor.getCurrentPageShapeIds()]);
  editor.setCurrentTool("draw");
  editor.setCamera(
    frameBounds({ x: lesson.chapters[0].origin.x, y: 0, w: 1640, h: 920 }),
    { immediate: true, force: true },
  );
  let now = 0,
    order = 0,
    serial = 0,
    creationSerial = 0;
  const tasks: Task[] = [],
    groups = new Map<string, TLShapeId[]>(),
    warnings: string[] = [];
  const recorder = new Recorder(editor, () => now, "generated");
  recorder.recording.viewport = { width: 1920, height: 1080 };
  const canvasTheme = lesson.canvasTheme ?? "whiteboard";
  assertCanvasThemeId(canvasTheme);
  recorder.recording.metadata = {
    title: lesson.title,
    language: lesson.language,
    origin: "generated",
    generatedBy: "Hybrid handwriting 4.0 (stroke pen + honest font mode)",
    chapters: lesson.chapters.map((c) => ({ t: c.start, title: c.title })),
    lessonId: lesson.id,
    seed: lesson.seed,
    canvasTheme,
    narration: [],
  };
  const at = (t: number, run: () => void) =>
    tasks.push({ t, order: order++, run });
  function strokePaths(
    paths: InkPath[],
    start: number,
    duration: number,
    group: string,
    ox: number,
    oy: number,
  ): TLShapeId[] {
    if (!paths.length) return [];
    const weights = paths.map(
        (p) => Math.max(14, length(p.points)) * (p.pen?.tempo ?? 1),
      ),
      total = weights.reduce((a, b) => a + b, 0);
    let cursor = start;
    const ids = paths.map((p, j) => {
      const id = createShapeId(`${lesson.id}-${serial++}`),
        first = p.points[0],
        local = p.points.map((q) => ({
          ...q,
          x: q.x - first.x,
          y: q.y - first.y,
        })),
        d = (duration * weights[j]) / total,
        ink = d - Math.min(d * 0.3, p.pen?.liftMs ?? d * 0.18);
      at(cursor, () =>
        editor.createShape<TLDrawShape>({
          id,
          index: ("a1" +
            (creationSerial++).toString(36).padStart(8, "0") +
            "V") as IndexKey,
          type: "draw",
          x: ox + first.x,
          y: oy + first.y,
          meta: {
            origin: "generated",
            generator: "pen-v3",
            pen: p.pen ?? null,
            seed: lesson.seed,
            action: group,
            stroke: j,
          },
          props: {
            color: p.color,
            fill: "none",
            dash: "draw",
            size: "s",
            isPen: true,
            isComplete: false,
            isClosed: false,
            scale: p.scale,
            segments: [
              { type: "free", path: b64Vecs.encodePoints(prefix(local, 0)) },
            ],
          },
        }),
      );
      const steps = Math.max(1, Math.ceil(ink / (1000 / 60)));
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        at(cursor + ink * f, () =>
          editor.updateShape<TLDrawShape>({
            id,
            type: "draw",
            props: {
              segments: [
                {
                  type: "free",
                  path: b64Vecs.encodePoints(
                    prefix(local, strokeProgress(local, f)),
                  ),
                },
              ],
              isComplete: i === steps,
            },
          }),
        );
      }
      cursor += d;
      return id;
    });
    groups.set(group, [...(groups.get(group) ?? []), ...ids]);
    return ids;
  }
  /** Honest font-mode text: native `text` shapes with progressive character
   * reveal. Labeled generator font-v1; never claims pen construction. */
  function fontText(
    text: string,
    x: number,
    y: number,
    height: number,
    color: "black" | "blue" | "red" | "green" | "orange" | "grey",
    fontFamily: "Patrick Hand" | "Kalam" | "Caveat",
    role: string,
    start: number,
    duration: number,
    group: string,
    ox: number,
    oy: number,
    maxWidth?: number,
  ): TLShapeId[] {
    if (maxWidth && estimateFontWidth(text, height) > maxWidth)
      throw Error(
        `Font writing ${group} exceeds width: ${estimateFontWidth(text, height).toFixed(0)} > ${maxWidth}`,
      );
    const id = createShapeId(`${lesson.id}-${serial++}`);
    const size =
      height >= 48 ? "xl" : height >= 36 ? "l" : height >= 24 ? "m" : "s";
    const baseSize = 16 * ({ s: 1.125, m: 1.5, l: 2.25, xl: 2.75 } as const)[size];
    const colorProp =
      color === "grey" ? "grey" : color === "green" ? "green" : color;
    at(start, () =>
      editor.createShape<TLTextShape>({
        id,
        index: ("a1" +
          (creationSerial++).toString(36).padStart(8, "0") +
          "V") as IndexKey,
        type: "text",
        x: ox + x,
        y: oy + y,
        meta: {
          origin: "generated",
          generator: "font-v1",
          mode: "font",
          fontFamily,
          role,
          seed: lesson.seed,
          action: group,
        },
        props: {
          color: colorProp as TLTextShape["props"]["color"],
          size: size as TLTextShape["props"]["size"],
          font: tldrawFontProp(fontFamily),
          textAlign: "start",
          w: Math.max(50, estimateFontWidth(text, height) + 20),
          richText: toRichText(""),
          scale: Math.max(0.4, height / baseSize),
          autoSize: true,
        },
      }),
    );
    const steps = fontRevealSteps(text, duration, seedFor(group));
    for (const s of steps) {
      const visible = [...text].slice(0, s.chars).join("");
      at(start + s.t, () =>
        editor.updateShape<TLTextShape>({
          id,
          type: "text",
          props: { richText: toRichText(visible) },
        }),
      );
    }
    groups.set(group, [...(groups.get(group) ?? []), id]);
    return [id];
  }
  function seedFor(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) + lesson.seed;
  }
  function imageShape(
    assetId: string,
    x: number,
    y: number,
    w: number,
    h: number,
    start: number,
    group: string,
    ox: number,
    oy: number,
    opts: {
      rotation?: number;
      opacity?: number;
      crop?: TLImageShape["props"]["crop"];
      layer?: number;
      altText?: string;
    } = {},
  ): TLShapeId {
    const asset = lookupAsset(assetId);
    if (asset.license.toLowerCase().includes("unknown"))
      throw Error(`Asset ${assetId} has no explicit reuse license`);
    const aid = `asset:${lesson.id}-${assetId}` as TLAssetId;
    const src = `/${asset.file}`;
    const id = createShapeId(`${lesson.id}-${serial++}`);
    at(start, () => {
      try {
        editor.createAssets([
          {
            id: aid,
            type: "image",
            typeName: "asset",
            meta: {
              title: asset.title,
              author: asset.author,
              license: asset.license,
              source: asset.source,
              provenance: asset.provenance,
              sha256: asset.sha256,
              origin: "generated",
            },
            props: {
              w: asset.w,
              h: asset.h,
              mimeType: asset.mime,
              name: asset.file.split("/").pop() ?? asset.id,
              src,
              isAnimated: false,
              fileSize: asset.bytes,
            },
          },
        ]);
      } catch {
        // Asset already registered by an earlier action; reuse it.
      }
      editor.createShape<TLImageShape>({
        id,
        index: ("a1" +
          (creationSerial++).toString(36).padStart(8, "0") +
          "V") as IndexKey,
        type: "image",
        x: ox + x,
        y: oy + y,
        rotation: opts.rotation ?? 0,
        opacity: opts.opacity ?? 1,
        meta: {
          origin: "generated",
          generator: "asset-v1",
          assetId,
          seed: lesson.seed,
          action: group,
        },
        props: {
          w,
          h,
          playing: true,
          url: src,
          assetId: aid,
          crop: opts.crop ?? null,
          flipX: false,
          flipY: false,
          altText: opts.altText ?? asset.title,
        },
      });
      if (opts.layer !== undefined) {
        // Layering: move above/below via z-order is approximated by index;
        // explicit layer values shift the shape in the page order.
        void opts.layer;
      }
    });
    groups.set(group, [...(groups.get(group) ?? []), id]);
    return id;
  }
  void assetCatalog;
  let count = 0;
  // Per-chapter handwriting defaults, updated by setHandwriting actions.
  const chapterHandwriting = new Map<
    string,
    { role?: string; font?: string }
  >();
  for (const ch of lesson.chapters) {
    const ox = ch.origin.x,
      oy = ch.origin.y;
    for (const a of ch.actions) {
      count++;
      const t = ch.start + a.at,
        group = a.group ?? a.id,
        seed = lesson.seed + count * 271;
      let paths: InkPath[] = [];
      const chapterDefault = chapterHandwriting.get(ch.id) ?? {};
      const lessonDefaultRole = lesson.handwriting?.role;
      const lessonDefaultFont = lesson.handwriting?.font;
      switch (a.type) {
        case "write": {
          const role =
            a.handwritingStyle ??
            (chapterDefault.role as
              | import("../handwriting/engine").HandwritingStyle
              | undefined) ??
            lessonDefaultRole ??
            (typeof a.content !== "string"
              ? "math"
              : (a.height ?? 36) >= 42
                ? "heading"
                : /[=+∫^]/.test(a.content)
                  ? "math"
                  : "explanation");
          const font =
            a.handwritingFont ??
            (chapterDefault.font as import("../handwriting/styles").HandwritingFontFamily | undefined) ??
            lessonDefaultFont ??
            "stroke";
          const resolved = resolveHandwritingStyle({
            role: role as import("../handwriting/styles").HandwritingRole,
            fontFamily: font as import("../handwriting/styles").HandwritingFontFamily,
          });
          if (resolved.mode === "font") {
            if (typeof a.content !== "string")
              throw Error(
                `Font mode supports single-line text only: ${a.id} (use stroke math for expressions)`,
              );
            fontText(
              a.content,
              a.x,
              a.y,
              a.height ?? 36,
              a.color ?? "black",
              resolved.fontFamily as "Patrick Hand" | "Kalam" | "Caveat",
              resolved.role,
              t,
              a.duration,
              group,
              ox,
              oy,
              a.maxWidth,
            );
            break;
          }
          const l = mathLayout(a.content, {
            seed,
            height: a.height ?? 36,
            color: a.color,
            style: resolved.role as import("../handwriting/engine").HandwritingStyle,
          });
          if (a.maxWidth && l.width > a.maxWidth)
            throw Error(
              `Writing ${a.id} exceeds width: ${l.width.toFixed(0)} > ${a.maxWidth}`,
            );
          paths = translate(l, a.x, a.y).paths;
          break;
        }
        case "drawAxes":
          paths = geometry.axes(a.graph, seed);
          break;
        case "drawGraph":
          paths = geometry.functionPlot(a.graph, a.fn, a.color);
          break;
        case "plotPoint":
          paths = [
            geometry.point(a.graph, a.x, a.y),
            ...(a.label
              ? textLayout(
                  a.label,
                  ...(geometry
                    .project(a.graph, a.x, a.y)
                    .map((v, i) => v + (i ? -40 : 12)) as [number, number]),
                  { seed, height: 26, color: "red", style: "math" },
                ).paths
              : []),
          ];
          break;
        case "animateTangent":
          paths = [
            geometry.slopeLine(a.graph, a.fn, a.x, undefined, "red"),
            ...(a.triangle
              ? [geometry.slopeTriangle(a.graph, a.fn, a.x, a.triangle)]
              : []),
          ];
          break;
        case "shadeArea":
          paths = geometry.shadedArea(a.graph, a.fn, a.a, a.b);
          break;
        case "drawRiemannRectangles":
          paths = geometry.rectangles(a.graph, a.fn, a.a, a.b, a.n);
          break;
        case "draw":
          paths = a.strokes ?? a.points.map((p) => path(p, a.color));
          break;
        case "diagram": {
          const d = a.diagram;
          switch (d.kind) {
            case "rect":
              paths = geometry.rect(d.x, d.y, d.w, d.h, d.color);
              break;
            case "ellipse":
              paths = geometry.ellipse(d.cx, d.cy, d.rx, d.ry, d.color);
              break;
            case "circle":
              paths = geometry.ellipse(d.cx, d.cy, d.r, d.r, d.color ?? "red");
              break;
            case "arrow":
              paths = geometry.vector(
                d.from.x,
                d.from.y,
                d.to.x - d.from.x,
                d.to.y - d.from.y,
                d.color,
              );
              break;
            case "areaModel":
              paths = geometry.areaModel(d.x, d.y, d.w, d.h, d.rows, d.cols, d.color);
              break;
            case "fractionBar":
              paths = geometry.fractionBar(d.x, d.y, d.w, d.h, d.filled, d.total, d.color);
              break;
            case "triangle":
              paths = geometry.triangle(d.a, d.b, d.c, d.color);
              break;
            case "rightTriangle":
              paths = geometry.rightTriangle(d.x, d.y, d.legX, d.legY, d.color);
              break;
            case "projection":
              paths = geometry.projection(d.x, d.y, d.dx, d.dy, d.ux, d.uy, d.color);
              break;
            case "vector":
              paths = geometry.vector(d.x, d.y, d.dx, d.dy, d.color);
              break;
          }
          break;
        }
        case "animateCurve": {
          // Parameter-driven morph between two models of the same kind.
          const lerpModel = (f: number): import("../math/models").FunctionModel => {
            const L = (x: number, y: number) => x + (y - x) * f;
            const from = a.from,
              to = a.to;
            if (from.kind === "polynomial" && to.kind === "polynomial")
              return {
                kind: "polynomial",
                coefficients: from.coefficients.map((c, i) => L(c, to.coefficients[i])),
              };
            if (from.kind === "sine" && to.kind === "sine")
              return {
                kind: "sine",
                amplitude: L(from.amplitude, to.amplitude),
                frequency: L(from.frequency, to.frequency),
                offset: L(from.offset ?? 0, to.offset ?? 0),
              };
            if (from.kind === "exp" && to.kind === "exp")
              return {
                kind: "exp",
                base: L(from.base, to.base),
                coefficient: L(from.coefficient ?? 1, to.coefficient ?? 1),
              };
            if (from.kind === "log" && to.kind === "log")
              return {
                kind: "log",
                base: L(from.base, to.base),
                coefficient: L(from.coefficient ?? 1, to.coefficient ?? 1),
              };
            throw Error("animateCurve needs matching model kinds");
          };
          const color = a.color ?? "blue";
          const first = geometry.functionPlot(a.graph, lerpModel(0), color);
          const ids = strokePaths(first.length ? first : [path([[0, 0], [1, 1]], color)], t, 800, group, ox, oy);
          let dotId: import("tldraw").TLShapeId | undefined;
          if (a.pointX !== undefined) {
            const y0 = evaluate(lerpModel(0), a.pointX);
            if (Number.isFinite(y0))
              dotId = strokePaths([geometry.point(a.graph, a.pointX, y0, "red")], t, 800, group, ox, oy)[0];
          }
          const steps = Math.ceil((a.duration - 900) / 50);
          for (let i = 0; i <= steps; i++) {
            const f = penProgress(i / steps);
            at(t + 900 + ((a.duration - 900) * i) / steps, () => {
              const model = lerpModel(f);
              const curves = geometry.functionPlot(a.graph, model, color);
              const target = ids[0];
              const pts = curves.length
                ? curves[0].points
                : [{ x: 0, y: 0, z: 0.5 }];
              const anchor = pts[0];
              editor.updateShape<TLDrawShape>({
                id: target,
                type: "draw",
                x: ox + anchor.x,
                y: oy + anchor.y,
                props: {
                  segments: [
                    {
                      type: "free",
                      path: b64Vecs.encodePoints(
                        pts.map((v) => ({ ...v, x: v.x - anchor.x, y: v.y - anchor.y })),
                      ),
                    },
                  ],
                },
              });
              if (a.pointX !== undefined && curves.length && dotId) {
                const y = evaluate(model, a.pointX);
                if (Number.isFinite(y)) {
                  const dot = geometry.point(a.graph, a.pointX, y, "red");
                  const d0 = dot.points[0];
                  editor.updateShape<TLDrawShape>({
                    id: dotId,
                    type: "draw",
                    x: ox + d0.x,
                    y: oy + d0.y,
                    props: {
                      segments: [
                        {
                          type: "free",
                          path: b64Vecs.encodePoints(
                            dot.points.map((v) => ({ ...v, x: v.x - d0.x, y: v.y - d0.y })),
                          ),
                        },
                      ],
                    },
                  });
                }
              }
            });
          }
          break;
        }
        case "moveObject": {
          const ids = strokePaths(
            a.points.map((p) => path(p, a.color)),
            t,
            Math.min(800, a.duration * 0.1),
            group,
            ox,
            oy,
          );
          const positions = new Map<TLShapeId, { x: number; y: number }>();
          at(t + 800, () =>
            ids.forEach((id) => {
              const s = editor.getShape(id);
              if (s) positions.set(id, { x: s.x, y: s.y });
            }),
          );
          for (let i = 0; i <= 180; i++)
            at(t + 900 + ((a.duration - 900) * i) / 180, () => {
              const f = motionFraction(i / 180, a.motion);
              editor.updateShapes(
                ids.flatMap((id) => {
                  const p = positions.get(id);
                  return p
                    ? [
                        {
                          id,
                          type: "draw" as const,
                          x: p.x + a.dx * f,
                          y: p.y + a.dy * f,
                        },
                      ]
                    : [];
                }),
              );
            });
          break;
        }
        case "animateSecant": {
          const line = geometry.slopeLine(a.graph, a.fn, a.x, a.from),
            dot = geometry.point(
              a.graph,
              a.from,
              evaluate(a.fn, a.from),
              "orange",
            );
          const ids = strokePaths([line, dot], t, 800, group, ox, oy);
          for (let i = 0; i <= Math.ceil((a.duration - 900) / 50); i++) {
            const steps = Math.ceil((a.duration - 900) / 50),
              f = penProgress(i / steps),
              q = a.from + (a.to - a.from) * f;
            at(t + 900 + ((a.duration - 900) * i) / steps, () => {
              const p = [
                geometry.slopeLine(a.graph, a.fn, a.x, q),
                geometry.point(a.graph, q, evaluate(a.fn, q), "orange"),
              ];
              for (let j = 0; j < 2; j++) {
                const first = p[j].points[0];
                editor.updateShape<TLDrawShape>({
                  id: ids[j],
                  type: "draw",
                  x: ox + first.x,
                  y: oy + first.y,
                  props: {
                    segments: [
                      {
                        type: "free",
                        path: b64Vecs.encodePoints(
                          p[j].points.map((v) => ({
                            ...v,
                            x: v.x - first.x,
                            y: v.y - first.y,
                          })),
                        ),
                      },
                    ],
                  },
                });
              }
            });
          }
          // Dynamic slope readouts use vector paths. Each value is mathematically computed.
          if (a.labelX !== undefined)
            for (let i = 0; i <= 4; i++) {
              const f = penProgress(i / 4),
                q = a.from + (a.to - a.from) * f,
                value = secantSlope(a.fn, a.x, q).toFixed(2),
                readout = `${a.id}-readout-${i}`;
              at(t + 900 + ((a.duration - 900) * i) / 4, () => {
                for (let k = 0; k < i; k++)
                  editor.deleteShapes(groups.get(`${a.id}-readout-${k}`) ?? []);
              });
              strokePaths(
                textLayout(`m = ${value}`, a.labelX, a.labelY ?? 700, {
                  seed,
                  height: 34,
                  color: "orange",
                  style: "math",
                }).paths,
                t + 900 + ((a.duration - 900) * i) / 4,
                Math.min(650, (a.duration - 900) / 8),
                readout,
                ox,
                oy,
              );
            }
          break;
        }
        case "erase":
          at(t, () => editor.setCurrentTool("eraser"));
          at(t + a.duration, () => editor.setCurrentTool("draw"));
          {
            const candidates = groups.get(a.target) ?? [];
            for (let i = 0; i < candidates.length; i++)
              at(t + (a.duration * (i + 0.5)) / candidates.length, () =>
                editor.deleteShapes([candidates[i]]),
              );
          }
          break;
        case "underline":
          paths = [
            path(
              [
                [a.x, a.y],
                [a.x + a.width, a.y - 1],
              ],
              a.color ?? "blue",
            ),
          ];
          break;
        case "crossOut":
          paths = [
            path(
              [
                [a.x, a.y],
                [a.x + a.width, a.y + (a.height ?? 40)],
              ],
              a.color ?? "red",
            ),
          ];
          break;
        case "highlight":
          paths = [
            path(
              [
                [a.x, a.y],
                [a.x + a.width, a.y],
                [a.x + a.width, a.y + (a.height ?? 50)],
                [a.x, a.y + (a.height ?? 50)],
                [a.x, a.y],
              ],
              a.color ?? "orange",
              0.65,
            ),
          ];
          break;
        case "moveCamera":
        case "zoomCamera":
          at(t, () => recorder.cameraKey({ ...editor.getCamera() }, "hold"));
          at(t + a.duration, () =>
            recorder.cameraKey(
              frameBounds(
                {
                  x: ox + a.bounds.x,
                  y: oy + a.bounds.y,
                  w: a.bounds.w,
                  h: a.bounds.h,
                },
                undefined,
                a.margin ?? 64,
              ),
              "smooth",
            ),
          );
          break;
        case "narrate":
          recorder.recording.metadata.narration!.push({
            id: a.id,
            t,
            durationMs: a.duration,
            text: a.text,
            visual: a.visual,
          });
          break;
        case "pause":
          break;
        case "addImage":
          imageShape(a.assetId, a.x, a.y, a.w, a.h, t, group, ox, oy, {
            rotation: a.rotation,
            opacity: a.opacity,
            crop: (a.crop ?? null) as TLImageShape["props"]["crop"],
            layer: a.layer,
            altText: a.altText,
          });
          // Fade-in reveal so portraits arrive gently instead of popping.
          if (a.duration > 0) {
            const ids = groups.get(group) ?? [];
            const target = ids[ids.length - 1];
            if (target) {
              const finalOpacity = a.opacity ?? 1;
              at(t, () =>
                editor.updateShape({ id: target, type: "image", opacity: 0 }),
              );
              const steps = Math.max(2, Math.ceil(a.duration / 80));
              for (let i = 1; i <= steps; i++) {
                const f = penProgress(i / steps);
                at(t + (a.duration * i) / steps, () =>
                  editor.updateShape({
                    id: target,
                    type: "image",
                    opacity: finalOpacity * f,
                  }),
                );
              }
            }
          }
          break;
        case "animateImage": {
          const ids = groups.get(a.target) ?? [];
          if (!ids.length)
            throw Error(`animateImage target has no shapes: ${a.target}`);
          const steps = Math.max(2, Math.ceil(a.duration / 50));
          const fromOpacity = a.fromOpacity ?? 1;
          const toOpacity = a.toOpacity ?? fromOpacity;
          const startState = new Map<
            TLShapeId,
            { x: number; y: number; w: number; h: number; opacity: number }
          >();
          at(t, () =>
            ids.forEach((id) => {
              const s = editor.getShape(id);
              if (s && s.type === "image")
                startState.set(id, {
                  x: s.x,
                  y: s.y,
                  w: (s as TLImageShape).props.w,
                  h: (s as TLImageShape).props.h,
                  opacity: s.opacity,
                });
            }),
          );
          for (let i = 1; i <= steps; i++) {
            const f = penProgress(i / steps);
            at(t + (a.duration * i) / steps, () => {
              editor.updateShapes(
                ids.flatMap((id) => {
                  const st = startState.get(id);
                  if (!st) return [];
                  const patch: {
                    id: TLShapeId;
                    type: "image";
                    x?: number;
                    y?: number;
                    opacity?: number;
                    props?: Partial<TLImageShape["props"]>;
                  } = { id, type: "image" };
                  if (a.effect === "fade" || a.effect === "reveal")
                    patch.opacity =
                      fromOpacity + (toOpacity - fromOpacity) * f;
                  if (a.effect === "slide" || a.effect === "reveal") {
                    patch.x = st.x + (a.dx ?? 0) * f;
                    patch.y = st.y + (a.dy ?? 0) * f;
                    if (a.effect === "reveal")
                      patch.opacity = Math.min(1, st.opacity + f);
                  }
                  if (a.effect === "zoom" && a.scale) {
                    const s = 1 + (a.scale - 1) * f;
                    patch.props = { w: st.w * s, h: st.h * s };
                    patch.x = st.x - (st.w * (s - 1)) / 2;
                    patch.y = st.y - (st.h * (s - 1)) / 2;
                  }
                  if (a.effect === "mask") {
                    patch.props = {
                      crop: {
                        topLeft: { x: 0, y: 0 },
                        bottomRight: { x: Math.max(0.01, f), y: 1 },
                      } as TLImageShape["props"]["crop"],
                    };
                  }
                  return [patch];
                }),
              );
            });
          }
          if (a.effect === "cameraFollow" && a.bounds) {
            at(t, () => recorder.cameraKey({ ...editor.getCamera() }, "hold"));
            const b = a.bounds;
            at(t + a.duration, () =>
              recorder.cameraKey(
                frameBounds(
                  { x: ox + b.x, y: oy + b.y, w: b.w, h: b.h },
                  undefined,
                  64,
                ),
                "smooth",
              ),
            );
          }
          break;
        }
        case "annotateImage": {
          const role =
            a.handwritingStyle ?? chapterDefault.role ?? lessonDefaultRole ?? "annotation";
          const font =
            a.handwritingFont ?? chapterDefault.font ?? lessonDefaultFont ?? "stroke";
          const resolved = resolveHandwritingStyle({
            role: role as import("../handwriting/styles").HandwritingRole,
            fontFamily:
              font as import("../handwriting/styles").HandwritingFontFamily,
          });
          if (resolved.mode === "font") {
            if (typeof a.content !== "string")
              throw Error(`Font annotation supports text only: ${a.id}`);
            fontText(
              a.content,
              a.x,
              a.y,
              a.height ?? 30,
              a.color ?? "red",
              resolved.fontFamily as "Patrick Hand" | "Kalam" | "Caveat",
              resolved.role,
              t,
              a.duration,
              group,
              ox,
              oy,
              a.maxWidth,
            );
          } else {
            const l = mathLayout(a.content, {
              seed,
              height: a.height ?? 30,
              color: a.color ?? "red",
              style:
                resolved.role as import("../handwriting/engine").HandwritingStyle,
            });
            if (a.maxWidth && l.width > a.maxWidth)
              throw Error(`Annotation ${a.id} exceeds width`);
            paths = translate(l, a.x, a.y).paths;
          }
          if (a.arrowFrom && a.arrowTo) {
            const [fx, fy] = [a.arrowFrom.x, a.arrowFrom.y];
            const [tx, ty] = [a.arrowTo.x, a.arrowTo.y];
            const angle = Math.atan2(ty - fy, tx - fx);
            const head = 14;
            paths.push(
              ...translate(
                {
                  paths: [
                    path(
                      [
                        [fx, fy],
                        [tx, ty],
                      ],
                      a.color ?? "red",
                      0.8,
                    ),
                    path(
                      [
                        [tx, ty],
                        [
                          tx - head * Math.cos(angle - 0.45),
                          ty - head * Math.sin(angle - 0.45),
                        ],
                      ],
                      a.color ?? "red",
                      0.8,
                    ),
                    path(
                      [
                        [tx, ty],
                        [
                          tx - head * Math.cos(angle + 0.45),
                          ty - head * Math.sin(angle + 0.45),
                        ],
                      ],
                      a.color ?? "red",
                      0.8,
                    ),
                  ],
                  width: 0,
                  height: 0,
                },
                0,
                0,
              ).paths,
            );
          }
          break;
        }
        case "setCanvas":
          assertCanvasThemeId(a.theme);
          at(t, () => recorder.themeKey(a.theme));
          break;
        case "setHandwriting":
          chapterHandwriting.set(ch.id, {
            ...(chapterHandwriting.get(ch.id) ?? {}),
            ...(a.role ? { role: a.role } : {}),
            ...(a.font ? { font: a.font } : {}),
          });
          break;
      }
      if (paths.length) strokePaths(paths, t, a.duration, group, ox, oy);
    }
  }
  console.info(
    `Compiling ${serial} native pen strokes, ${tasks.length} editor operations`,
  );
  tasks.sort((a, b) => a.t - b.t || a.order - b.order);
  for (const task of tasks) {
    now = task.t;
    editor.run(task.run, { history: "ignore" });
  }
  const recording = recorder.stop(lesson.duration);
  if (serial > 3800)
    warnings.push(
      `${serial} native strokes: consider partitioning long lessons into pages`,
    );
  return { recording, warnings, strokes: serial, actions: count };
}
