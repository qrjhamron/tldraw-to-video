import type { Recording } from "./schema";
import { applyRecordEvent } from "./state";
/** Render input fingerprint for reusing a VIDEO chunk after a project edit.
 * Excludes SDK user profiles (not consumed by native draw rendering). Includes native initial records and effective events; no screenshot comparison. */
export function segmentInput(
  r: Recording,
  firstFrame: number,
  frameCount: number,
  fps = 30,
) {
  const first = (firstFrame * 1000) / fps,
    last = ((firstFrame + frameCount - 1) * 1000) / fps;
  const records = new Map(
    Object.values(r.initial.document.store)
      .filter((v) => v.typeName !== "user")
      .map((v) => [v.id as string, v]),
  );
  let page = r.initial.session.currentPageId;
  for (const e of r.events) {
    if (e.t >= first) break;
    applyRecordEvent(records, e);
    if (e.kind === "page") page = e.pageId as typeof page;
  }
  return {
    sdk: r.sdkVersion,
    viewport: r.viewport,
    theme: r.metadata.theme ?? (r.metadata.lessonId ? "teaching" : "default"),
    firstFrame,
    frameCount,
    fps,
    page,
    initialCamera: r.initialCamera,
    cameras: r.events
      .filter((e) => e.kind === "camera")
      .map((e) => ({
        t: e.t,
        camera: e.camera,
        pageId: e.pageId,
        easing: e.easing,
      })),
    records: [...records].sort(([a], [b]) => a.localeCompare(b)),
    events: r.events
      .filter((e) => e.t >= first && e.t <= last)
      .map((e) => ({
        t: e.t,
        kind: e.kind,
        id: e.id,
        record: e.record,
        camera: e.camera,
        pageId: e.pageId,
        easing: e.easing,
      })),
    clampedDuration: last > r.durationMs ? r.durationMs : undefined,
  };
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
