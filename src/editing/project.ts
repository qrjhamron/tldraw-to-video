import type { TLRecord } from "tldraw";
import {
  parseRecording,
  type Recording,
  type StrokeEvent,
} from "../engine/schema";
import { applyRecordEvent, cameraAt } from "../engine/state";
export function retime(r: Recording, speed: number): Recording {
  if (!Number.isFinite(speed) || speed <= 0)
    throw Error("Speed must be positive");
  const out = structuredClone(r);
  out.durationMs /= speed;
  out.events.forEach((e) => (e.t /= speed));
  out.metadata.chapters?.forEach((c) => (c.t /= speed));
  out.metadata.narration?.forEach((n) => {
    n.t /= speed;
    n.durationMs /= speed;
  });
  return parseRecording(out);
}
export function trim(r: Recording, start: number, end: number): Recording {
  if (start < 0 || end > r.durationMs || end <= start)
    throw Error("Invalid trim range");
  const out = structuredClone(r),
    records = new Map(
      Object.values(out.initial.document.store).map((v) => [v.id as string, v]),
    );
  for (const e of out.events) {
    if (e.t >= start) break;
    applyRecordEvent(records, e);
    if (e.kind === "page")
      out.initial.session.currentPageId =
        e.pageId as typeof out.initial.session.currentPageId;
  }
  out.initial.document.store = Object.fromEntries(
    records,
  ) as typeof out.initial.document.store;
  out.initialCamera = cameraAt(r, start);
  out.durationMs = end - start;
  out.events = out.events
    .filter((e) => e.t >= start && e.t < end)
    .map((e, seq) => ({ ...e, seq, t: e.t - start }));
  out.metadata.chapters = out.metadata.chapters
    ?.filter((c) => c.t >= start && c.t < end)
    .map((c) => ({ ...c, t: c.t - start }));
  // Trim partial narration accurately only when audio exists; omit cut sentences in raw projects.
  out.metadata.narration = out.metadata.narration
    ?.filter((n) => n.t >= start && n.t + n.durationMs <= end)
    .map((n) => ({ ...n, t: n.t - start }));
  return parseRecording(out);
}
/** Join clips with explicit document diffs at boundaries. No hidden replay state carries over. */
export function concatenate(clips: Recording[]): Recording {
  if (!clips.length) throw Error("No clips");
  const out = structuredClone(clips[0]);
  out.events = [];
  out.metadata.chapters = [];
  out.metadata.narration = [];
  const records = new Map<string, TLRecord>(
    Object.values(out.initial.document.store).map((v) => [v.id, v]),
  );
  let offset = 0;
  const append = (e: Omit<StrokeEvent, "seq">) => {
    const event = { ...e, seq: out.events.length };
    out.events.push(event);
    applyRecordEvent(records, event);
  };
  for (const [index, clip] of clips.entries()) {
    if (
      (clip.metadata.theme ??
        (clip.metadata.lessonId ? "teaching" : "default")) !==
        (out.metadata.theme ??
          (out.metadata.lessonId ? "teaching" : "default")) ||
      clip.sdkVersion !== out.sdkVersion ||
      JSON.stringify(clip.viewport) !== JSON.stringify(out.viewport)
    )
      throw Error("Clip SDK, theme and viewport must match");
    if (index) {
      const desired = new Map<string, TLRecord>(
        Object.values(clip.initial.document.store).map((v) => [v.id, v]),
      );
      const base = {
        t: offset,
        origin: clip.metadata.origin,
        source: "remote" as const,
        tool: "segment-edit",
      };
      for (const [id, before] of records)
        if (!desired.has(id)) append({ ...base, kind: "delete", id, before });
      for (const [id, record] of desired)
        append({
          ...base,
          kind: records.has(id) ? "update" : "create",
          id,
          record,
        });
      append({
        ...base,
        kind: "camera",
        id: "camera:edit",
        camera: clip.initialCamera,
        easing: "hold",
        pageId: clip.initial.session.currentPageId,
      });
      if (clip.initial.session.currentPageId)
        append({
          ...base,
          kind: "page",
          id: "instance:edit",
          pageId: clip.initial.session.currentPageId,
        });
    }
    clip.events.forEach((e) =>
      append({ ...structuredClone(e), t: e.t + offset }),
    );
    out.metadata.chapters!.push(
      ...(clip.metadata.chapters ?? [{ t: 0, title: clip.metadata.title }]).map(
        (c) => ({ ...c, t: c.t + offset }),
      ),
    );
    out.metadata.narration!.push(
      ...(clip.metadata.narration ?? []).map((n) => ({
        ...n,
        id: `clip-${index}-${n.id}`,
        t: n.t + offset,
      })),
    );
    offset += clip.durationMs;
  }
  out.durationMs = offset;
  return parseRecording(out);
}
export function reorderChapters(r: Recording, order: number[]) {
  const chapters = r.metadata.chapters;
  if (!chapters || order.some((i) => !chapters[i]))
    throw Error("Invalid chapter order");
  return concatenate(
    order.map((i) =>
      trim(r, chapters[i].t, chapters[i + 1]?.t ?? r.durationMs),
    ),
  );
}
export function reusableStrokes(r: Recording) {
  const records = new Map<string, TLRecord>(
    Object.values(r.initial.document.store).map((v) => [v.id, v]),
  );
  r.events.forEach((e) => applyRecordEvent(records, e));
  return [...records.values()].filter(
    (v) => v.typeName === "shape" && v.type === "draw",
  );
}
