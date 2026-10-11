import type { Lesson } from "../story/types";
export interface WordBoundary {
  offsetMs: number;
  durationMs: number;
  text: string;
}
export interface AudioClip {
  id: string;
  provider: string;
  voice: string;
  file: string;
  durationMs: number;
  sha256: string;
  words?: WordBoundary[];
}
export interface NarrationProvider {
  readonly id: string;
  synthesize(request: {
    id: string;
    text: string;
    voice: string;
    rate: string;
    outputDir: string;
  }): Promise<AudioClip>;
}
export function validateClip(clip: AudioClip) {
  if (!Number.isFinite(clip.durationMs) || clip.durationMs <= 0)
    throw Error(`Invalid audio duration: ${clip.id}`);
  let previous = -1;
  for (const w of clip.words ?? []) {
    if (
      !Number.isFinite(w.offsetMs) ||
      !Number.isFinite(w.durationMs) ||
      w.offsetMs < 0 ||
      w.offsetMs < previous ||
      w.durationMs < 0 ||
      w.offsetMs + w.durationMs > clip.durationMs + 150
    )
      throw Error(`Provider timestamps outside probed audio: ${clip.id}`);
    previous = w.offsetMs;
  }
  return clip;
}
/** Expand only undersized narration windows. Every visual boundary is warped with the same map. */
export function alignNarration(lesson: Lesson, clips: AudioClip[]): Lesson {
  const out = structuredClone(lesson),
    byId = new Map(clips.map((c) => [c.id, validateClip(c)]));
  let offset = 0;
  for (const chapter of out.chapters) {
    const narrations = chapter.actions
      .filter((a) => a.type === "narrate")
      .sort((a, b) => a.at - b.at);
    const intervals = narrations.map((n) => ({
      start: n.at,
      end: n.at + n.duration,
      extra: Math.max(0, (byId.get(n.id)?.durationMs ?? 0) + 400 - n.duration),
    }));
    for (let i = 1; i < intervals.length; i++)
      if (intervals[i].start < intervals[i - 1].end)
        throw Error("Narration windows overlap");
    const warp = (time: number) =>
      time +
      intervals.reduce(
        (s, v) =>
          s +
          v.extra *
            Math.max(0, Math.min(1, (time - v.start) / (v.end - v.start || 1))),
        0,
      );
    for (const a of chapter.actions) {
      const end = warp(a.at + a.duration);
      a.at = warp(a.at);
      a.duration = end - a.at;
    }
    const old = chapter.duration;
    chapter.start += offset;
    chapter.duration = warp(old);
    offset += chapter.duration - old;
  }
  out.duration += offset;
  return out;
}
export function narrationSchedule(lesson: Lesson, clips: AudioClip[]) {
  const byId = new Map(clips.map((c) => [c.id, validateClip(c)]));
  return lesson.chapters
    .flatMap((c) =>
      c.actions.flatMap((a) => {
        if (a.type !== "narrate") return [];
        const clip = byId.get(a.id);
        if (!clip) throw Error(`Missing audio ${a.id}`);
        if (clip.durationMs > a.duration)
          throw Error(`Audio exceeds aligned slot ${a.id}`);
        return [{ ...clip, t: c.start + a.at, slotMs: a.duration }];
      }),
    )
    .sort((a, b) => a.t - b.t);
}
