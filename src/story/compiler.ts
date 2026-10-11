import {
  b64Vecs,
  createShapeId,
  type Editor,
  type TLDrawShape,
  type TLShapeId,
  type IndexKey,
} from "tldraw";
import { Recorder } from "../engine/recorder";
import type { Recording } from "../engine/schema";
import { length, path, prefix, type InkPath } from "../lesson/paths";
import { penProgress, textLayout, translate } from "../handwriting/engine";
import { mathLayout } from "../handwriting/math-layout";
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
  recorder.recording.metadata = {
    title: lesson.title,
    language: lesson.language,
    origin: "generated",
    generatedBy: "Seeded centerline pen engine 2.0",
    chapters: lesson.chapters.map((c) => ({ t: c.start, title: c.title })),
    lessonId: lesson.id,
    seed: lesson.seed,
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
    const weights = paths.map((p) => Math.max(14, length(p.points))),
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
        ink = d * 0.82;
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
            generator: "pen-v2",
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
                  path: b64Vecs.encodePoints(prefix(local, penProgress(f))),
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
  let count = 0;
  for (const ch of lesson.chapters) {
    const ox = ch.origin.x,
      oy = ch.origin.y;
    for (const a of ch.actions) {
      count++;
      const t = ch.start + a.at,
        group = a.group ?? a.id,
        seed = lesson.seed + count * 271;
      let paths: InkPath[] = [];
      switch (a.type) {
        case "write": {
          const l = mathLayout(a.content, {
            seed,
            height: a.height ?? 36,
            color: a.color,
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
                  { seed, height: 26, color: "red" },
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
          paths = a.points.map((p) => path(p, a.color));
          break;
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
                }).paths,
                t + 900 + ((a.duration - 900) * i) / 4,
                0,
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
