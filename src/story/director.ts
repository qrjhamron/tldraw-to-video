import { frameBounds, screenPoint } from "./camera";
import type { Lesson, Action } from "./types";
import { mathLayout } from "../handwriting/math-layout";
import { estimateFontWidth } from "../handwriting/font-mode";
/** Predictive guard: authored context frames win; off-frame writing gets a pre-roll camera move.
 * Keeps readable height by moving the camera instead of fitting an entire infinite document. */
export function directLesson(input: Lesson): Lesson {
  const lesson = structuredClone(input);
  for (const ch of lesson.chapters) {
    let camera = frameBounds({ x: 0, y: 0, w: 1640, h: 920 });
    const added: Action[] = [];
    for (const a of [...ch.actions].sort((a, b) => a.at - b.at)) {
      if (a.type === "moveCamera" || a.type === "zoomCamera") {
        camera = frameBounds(a.bounds, undefined, a.margin);
        continue;
      }
      if (a.type !== "write" && a.type !== "annotateImage") continue;
      const fontMode =
        (a.type === "write" || a.type === "annotateImage") &&
        a.handwritingFont &&
        a.handwritingFont !== "stroke";
      const l =
        fontMode && typeof a.content === "string"
          ? {
              width: estimateFontWidth(a.content, a.height ?? 36),
              height: (a.height ?? 36) * 1.4,
            }
          : mathLayout(a.content, {
              seed: lesson.seed,
              height: a.height ?? 36,
              style:
                a.handwritingStyle ??
                (typeof a.content !== "string"
                  ? "math"
                  : (a.height ?? 36) >= 42
                    ? "heading"
                    : /[=+∫^]/.test(a.content)
                      ? "math"
                      : "explanation"),
            });
      const ax = a.x,
        ay = a.y;
      const start = screenPoint(camera, { x: ax, y: ay - 24 }),
        end = screenPoint(camera, { x: ax + l.width, y: ay + l.height });
      if (start.x >= 48 && start.y >= 32 && end.x <= 1872 && end.y <= 1048)
        continue;
      // Only direct content outside its current frame. Avoid moving when a recent authored move is active.
      if (
        ch.actions.some(
          (m) =>
            (m.type === "moveCamera" || m.type === "zoomCamera") &&
            m.at <= a.at &&
            m.at + m.duration >= a.at,
        )
      )
        continue;
      const bounds = {
          x: ax - 80,
          y: Math.max(0, ay - 230),
          w: Math.max(1400, l.width + 160),
          h: 920,
        },
        duration = Math.min(2800, a.at);
      if (duration < 600) continue;
      added.push({
        id: `auto-camera-${a.id}`,
        type: "moveCamera",
        at: a.at - duration,
        duration,
        bounds,
        margin: 64,
      });
      camera = frameBounds(bounds);
    }
    ch.actions.push(...added);
  }
  return lesson;
}
