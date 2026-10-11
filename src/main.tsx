import { getAssetUrls } from "@tldraw/assets/selfHosted";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Box,
  Tldraw,
  b64Vecs,
  loadSnapshot,
  getSnapshot,
  createShapeId,
  type Editor,
  type TLDrawShape,
} from "tldraw";
import "tldraw/tldraw.css";
import "./style.css";
import { Recorder } from "./engine/recorder";
import { Replay } from "./engine/replay";
import { cameraAt } from "./engine/state";
import { parseRecording, type Recording } from "./engine/schema";
import { createCalculusLesson } from "./lesson/calculus";
import { compileLesson } from "./story/compiler";
import { flagshipLesson } from "./story/flagship";
import { algebraExample } from "./story/example";
import { teachingTheme } from "./story/theme";
import {
  trim,
  retime,
  reorderChapters,
  reusableStrokes,
} from "./editing/project";
import type { Lesson } from "./story/types";
import { NativeDrawSvg } from "./engine/native-svg";

export interface StudioAPI {
  editor: Editor;
  recording: Recording;
  replay: Replay;
  seek(t: number): void;
  renderFrame(t: number, generic?: boolean): Promise<string>;
  load(r: Recording): void;
  compile(lesson: Lesson): Recording;
}
declare global {
  interface Window {
    studio?: StudioAPI;
  }
}
const offlineComponents = { Canvas: () => null };
const studioThemes = { teaching: teachingTheme };
const studioOptions = { maxShapesPerPage: 20000 };
const assetUrls = getAssetUrls({ baseUrl: "/tldraw/" });
const stamp = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(
      2,
      "0",
    )}:${Math.floor(ms / 1000) % 60 < 10 ? "0" : ""}${Math.floor(ms / 1000) % 60}`;
function App() {
  const exporting = new URLSearchParams(location.search).has("export");
  const offline = new URLSearchParams(location.search).has("offline");
  const [recording, setRecording] = useState<Recording>();
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<"lesson" | "record">("lesson"),
    [capturing, setCapturing] = useState(false);
  const [inspect, setInspect] = useState(false),
    [inspectData, setInspectData] = useState(""),
    [editing, setEditing] = useState(false),
    [cutStart, setCutStart] = useState(0),
    [cutEnd, setCutEnd] = useState(540),
    [order, setOrder] = useState("1,2,3,4,5,6,7,8");
  const [status, setStatus] = useState("Preparing the native document"),
    [error, setError] = useState("");
  const editorRef = useRef<Editor>(null),
    replayRef = useRef<Replay>(null),
    recorderRef = useRef<Recorder>(null);
  const frame = useRef(0),
    currentTime = useRef(0),
    file = useRef<HTMLInputElement>(null);
  function seek(t: number) {
    replayRef.current?.seek(t);
    currentTime.current = t;
    setTime(t);
  }
  function load(r: Recording) {
    setPlaying(false);
    recorderRef.current?.stop();
    recorderRef.current = null;
    setCapturing(false);
    const ed = editorRef.current!;
    ed.setCurrentTheme(
      r.metadata.theme ?? (r.metadata.lessonId ? "teaching" : "default"),
    );
    replayRef.current = new Replay(ed, r);
    ed.updateInstanceState({ isReadonly: true });
    ed.setCurrentTool("select");
    setRecording(r);
    setCutEnd(r.durationMs / 1000);
    setMode("lesson");
    seek(0);
    setStatus(
      r.metadata.origin === "generated"
        ? "Generated vector strokes · native tldraw"
        : "Human input · native tldraw",
    );
    if (window.studio) {
      window.studio.recording = r;
      window.studio.replay = replayRef.current;
    }
  }
  async function mounted(editor: Editor) {
    editorRef.current = editor;
    editor.user.updateUserPreferences({
      colorScheme: "light",
      isSnapMode: false,
    });
    editor.setCameraOptions({ constraints: undefined, isLocked: false });
    // Leave the SDK onMount transaction before authoring; each stroke update must commit independently.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      let r: Recording;
      const params = new URLSearchParams(location.search),
        intro = params.get("lesson") === "intro";
      if (params.has("generate")) {
        let lesson = flagshipLesson();
        if (params.has("aligned")) {
          const response = await fetch("/flagship.lesson.json");
          if (!response.ok)
            throw Error("Aligned lesson missing; run npm run tts");
          lesson = await response.json();
        }
        r = intro
          ? createCalculusLesson(editor)
          : compileLesson(editor, lesson).recording;
      } else {
        const response = await fetch(
          intro ? "/lesson.recording.json" : "/flagship.recording.json",
        );
        r =
          response.ok &&
          response.headers.get("content-type")?.includes("application/json")
            ? parseRecording(await response.json())
            : intro
              ? createCalculusLesson(editor)
              : compileLesson(editor, flagshipLesson()).recording;
      }
      load(r);
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;
      const drawSvg = new NativeDrawSvg(editor);
      let lastKey = "",
        lastFrame = "",
        lastRecording: Recording | undefined;
      window.studio = {
        editor,
        recording: r,
        replay: replayRef.current!,
        seek,
        load,
        compile(lesson) {
          const result = compileLesson(editor, lesson);
          load(result.recording);
          return result.recording;
        },
        async renderFrame(t, generic = false) {
          const api = window.studio!;
          api.replay.seek(t);
          const c = cameraAt(api.recording, t),
            rv = api.recording.viewport;
          const fit = Math.min(1920 / rv.width, 1080 / rv.height);
          c.z *= fit;
          c.x += (1920 - rv.width * fit) / (2 * c.z);
          c.y += (1080 - rv.height * fit) / (2 * c.z);
          const bounds = new Box(-c.x, -c.y, 1920 / c.z, 1080 / c.z);
          const events = api.recording.events;
          let lo = 0,
            hi = events.length;
          while (lo < hi) {
            const m = (lo + hi) >>> 1;
            if (events[m].t <= t) lo = m + 1;
            else hi = m;
          }
          const key = `${lo}:${c.x}:${c.y}:${c.z}:${generic}`;
          if (key === lastKey && lastRecording === api.recording)
            return lastFrame;
          const shapes = editor.getCurrentPageShapesSorted().filter((s) => {
            const b = editor.getShapePageBounds(s);
            return b && bounds.collides(b);
          });
          // Official SDK SVG exporter reconstructs each native draw shape at time t.
          const fast =
            api.recording.metadata.lessonId &&
            !generic &&
            shapes.every(
              (s) =>
                s.type === "draw" &&
                s.props.fill === "none" &&
                s.parentId === editor.getCurrentPageId(),
            );
          const result = shapes.length
            ? fast
              ? { svg: drawSvg.render(shapes as TLDrawShape[], c) }
              : await editor.getSvgString(shapes, {
                  bounds,
                  scale: c.z,
                  padding: 0,
                  background: false,
                  darkMode: false,
                })
            : undefined;
          ctx.fillStyle =
            api.recording.metadata.lessonId ||
            api.recording.metadata.theme === "teaching"
              ? "#faf8f2"
              : "white";
          ctx.fillRect(0, 0, 1920, 1080);
          if (result) {
            const url = URL.createObjectURL(
              new Blob([result.svg], { type: "image/svg+xml" }),
            );
            const img = new Image();
            try {
              img.src = url;
              await img.decode();
              ctx.drawImage(img, 0, 0, 1920, 1080);
            } finally {
              URL.revokeObjectURL(url);
            }
          }
          lastKey = key;
          lastRecording = api.recording;
          lastFrame = canvas.toDataURL("image/jpeg", 0.95);
          return lastFrame;
        },
      };
    } catch (e) {
      setError(String(e));
      console.error(e);
    }
  }
  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    const tick = (now: number) => {
      const next = Math.min(
        recording?.durationMs ?? 0,
        currentTime.current + (now - previous) * speed,
      );
      previous = now;
      seek(next);
      if (next >= (recording?.durationMs ?? 0)) {
        setPlaying(false);
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, speed, recording]);
  function startRecord() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setPlaying(false);
    const ed = editorRef.current!;
    ed.updateInstanceState({ isReadonly: false });
    ed.selectNone();
    ed.deleteShapes([...ed.getCurrentPageShapeIds()]);
    ed.setCamera({ x: 0, y: 0, z: 1 }, { immediate: true });
    ed.setCurrentTool("draw");
    setMode("record");
    setTime(0);
    recorderRef.current = new Recorder(ed);
    setCapturing(true);
    setStatus("Recording human editor input");
  }
  function reuseInk() {
    if (!recording) return;
    const records = reusableStrokes(recording);
    startRecord();
    const ed = editorRef.current!;
    ed.run(() => {
      ed.createShapes(
        records.flatMap((s) => {
          if (s.typeName !== "shape" || s.type !== "draw") return [];
          return [
            {
              type: "draw" as const,
              id: createShapeId(),
              x: s.x,
              y: s.y,
              rotation: s.rotation,
              opacity: s.opacity,
              props: structuredClone(s.props),
              meta: {
                ...s.meta,
                origin: s.meta.origin ?? recording.metadata.origin,
                reusedFrom: s.id,
              },
            },
          ];
        }),
      );
    });
    ed.zoomToFit();
  }
  function stopRecord() {
    if (recorderRef.current) {
      const r = recorderRef.current.stop();
      recorderRef.current = null;
      load(r);
    }
  }
  function save() {
    if (!recording) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(recording)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "native-strokes.v1.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function inspectStroke() {
    const ed = editorRef.current!;
    const selected = ed.getSelectedShapes().find((s) => s.type === "draw"),
      shape =
        selected ??
        ed
          .getCurrentPageShapes()
          .filter((s) => s.type === "draw")
          .at(-1);
    if (shape?.type === "draw") {
      ed.select(shape.id);
      setInspectData(
        JSON.stringify(
          {
            id: shape.id,
            meta: shape.meta,
            props: shape.props,
            decoded: shape.props.segments.map((seg) =>
              b64Vecs.decodePoints(seg.path, seg.dim),
            ),
          },
          null,
          2,
        ),
      );
    } else setInspectData("No native draw shapes at this time.");
  }
  function edit(action: () => Recording) {
    try {
      load(action());
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  const chapter = recording?.metadata.chapters
    ?.filter((c) => c.t <= time)
    .at(-1);
  return (
    <div className={exporting ? "studio exporting" : "studio"}>
      {!exporting && (
        <aside>
          <div className="brand">
            <span className="brand-icon">∿</span>
            <div>
              Stroke Studio 2<small>LESSON ENGINE 2.0</small>
            </div>
          </div>
          <div className="nav-label">WORKSPACE</div>
          <button
            className={mode === "lesson" ? "nav active" : "nav"}
            onClick={() => {
              if (capturing) stopRecord();
              else if (window.studio) load(window.studio.recording);
            }}
          >
            ◷ &nbsp; Playback room
          </button>
          <button
            className={mode === "record" ? "nav active" : "nav"}
            onClick={startRecord}
          >
            ✎ &nbsp; Record a whiteboard
          </button>
          <button
            className="nav"
            onClick={() => edit(() => window.studio!.compile(flagshipLesson()))}
          >
            Flagship calculus · 9 min
          </button>
          <button
            className="nav"
            onClick={() => edit(() => window.studio!.compile(algebraExample))}
          >
            Example: algebra
          </button>
          <button className="nav" onClick={reuseInk}>
            Reuse recording ink
          </button>
          <button className="nav" onClick={() => setEditing(!editing)}>
            Edit project timing
          </button>
          <button
            className="nav"
            onClick={() => {
              setInspect(!inspect);
              inspectStroke();
            }}
          >
            Inspect native strokes
          </button>
          <div className="nav-label">LESSON CHAPTERS</div>
          <div className="chapters">
            {recording?.metadata.chapters?.map((c, i) => (
              <button
                key={c.t}
                className={chapter === c ? "chapter selected" : "chapter"}
                onClick={() => {
                  setPlaying(false);
                  seek(c.t);
                }}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  {c.title}
                  <small>{stamp(c.t)}</small>
                </div>
              </button>
            ))}
          </div>
          <div className="sidebar-note">
            <span className="green-dot" /> REAL GEOMETRY
            <p>
              Every mark is a native tldraw stroke. Point data, pressure and
              editor changes travel with the recording.
            </p>
          </div>
        </aside>
      )}
      <main>
        {!exporting && (
          <header>
            <div>
              <span className="eyebrow">THE WHITEBOARD LAB</span>
              <h1>
                {mode === "record"
                  ? "Your next explanation"
                  : (recording?.metadata.title ?? "Kalkulus")}
              </h1>
            </div>
            <div className="header-actions">
              <button onClick={() => file.current?.click()}>Import JSON</button>
              <button onClick={save} disabled={!recording}>
                Save recording
              </button>
              <a
                className="export-link"
                href={
                  recording?.metadata.lessonId
                    ? "/output/calculus_flagship_silent.mp4"
                    : "/output/calculus_intro_180s.mp4"
                }
                download
              >
                ↓ MP4
              </a>
            </div>
          </header>
        )}
        {!exporting && (
          <div className="board-heading">
            <span className="green-dot" />
            {status}
            <span className="board-spec">
              {mode === "record"
                ? "Draw · erase · pan · zoom"
                : "INDONESIAN · DETERMINISTIC · 1920 × 1080"}
            </span>
          </div>
        )}
        <div className="board-wrap">
          <div className="board">
            <Tldraw
              licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
              assetUrls={assetUrls}
              components={offline ? offlineComponents : undefined}
              themes={studioThemes}
              options={studioOptions}
              hideUi={exporting || mode === "lesson"}
              onMount={(editor) => {
                void mounted(editor);
              }}
            />
          </div>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
        </div>
        {!exporting && editing && recording && (
          <div className="edit-panel">
            <label>
              Start (s){" "}
              <input
                aria-label="Trim start"
                type="number"
                value={cutStart}
                onChange={(e) => setCutStart(+e.target.value)}
              />
            </label>
            <label>
              End (s){" "}
              <input
                aria-label="Trim end"
                type="number"
                value={cutEnd}
                onChange={(e) => setCutEnd(+e.target.value)}
              />
            </label>
            <button
              onClick={() =>
                edit(() => trim(recording, cutStart * 1000, cutEnd * 1000))
              }
            >
              Trim copy
            </button>
            <button onClick={() => edit(() => retime(recording, 1.25))}>
              Retime to 1.25×
            </button>
            <label>
              Chapter order{" "}
              <input
                aria-label="Chapter order"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              />
            </label>
            <button
              onClick={() =>
                edit(() =>
                  reorderChapters(
                    recording,
                    order.split(",").map((n) => +n - 1),
                  ),
                )
              }
            >
              Reorder copy
            </button>
          </div>
        )}
        {!exporting && inspect && (
          <div className="inspector">
            <button onClick={inspectStroke}>
              Inspect selected / latest stroke
            </button>
            <button onClick={() => setInspect(false)}>Close</button>
            <pre>{inspectData}</pre>
          </div>
        )}
        {!exporting && (
          <footer>
            {capturing ? (
              <div className="record-panel">
                <span className="record-dot" /> Recording editor events{" "}
                <button className="primary" onClick={stopRecord}>
                  Stop & replay
                </button>
                <span>
                  Use tldraw’s pen, eraser, selection, undo and camera tools.
                </span>
              </div>
            ) : (
              <>
                <div className="transport">
                  <button
                    className="restart"
                    title="Restart"
                    onClick={() => {
                      setPlaying(false);
                      seek(0);
                    }}
                  >
                    ↺
                  </button>
                  <button
                    className="play primary"
                    disabled={!recording}
                    onClick={() => {
                      if (time === (recording?.durationMs ?? 0)) seek(0);
                      setPlaying(!playing);
                    }}
                  >
                    {playing ? "Ⅱ Pause" : "▶ Play"}
                  </button>
                  <span className="time">
                    {stamp(time)}{" "}
                    <span>/ {stamp(recording?.durationMs ?? 180000)}</span>
                  </span>
                  <span className="transport-chapter">
                    {chapter?.title ?? "Native stroke recording"}
                  </span>
                  <select
                    aria-label="Playback speed"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  >
                    {[0.25, 0.5, 1, 1.5, 2, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}× speed
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  aria-label="Timeline"
                  className="timeline"
                  type="range"
                  min={0}
                  max={recording?.durationMs ?? 180000}
                  step={1}
                  value={time}
                  onChange={(e) => {
                    setPlaying(false);
                    seek(Number(e.target.value));
                  }}
                />
                <div className="footer-note">
                  <span>
                    {recording?.events.length.toLocaleString() ?? "…"} ordered
                    events · schema v1 · SDK 5.5.2
                  </span>
                  <span>
                    Seek freely. The document rebuilds from native records.
                  </span>
                </div>
              </>
            )}
          </footer>
        )}
      </main>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          try {
            const f = e.target.files?.[0];
            if (f) {
              const value = JSON.parse(await f.text());
              if (value.format === "stroke-lesson")
                window.studio!.compile(value);
              else if (value.document?.store) {
                const ed = editorRef.current!;
                ed.updateInstanceState({ isReadonly: false });
                loadSnapshot(ed.store, value);
                const snap = getSnapshot(ed.store),
                  camera = ed.getCamera();
                load({
                  format: "tldraw-stroke-recording",
                  version: 1,
                  sdkVersion: "5.5.2",
                  durationMs: 1000,
                  viewport: { width: 1920, height: 1080 },
                  initial: snap,
                  initialCamera: { x: camera.x, y: camera.y, z: camera.z },
                  events: [],
                  metadata: {
                    title: "Imported tldraw snapshot",
                    language: "id",
                    origin: "unknown",
                    theme: ed.getCurrentThemeId(),
                  },
                });
              } else load(parseRecording(value));
            }
          } catch (err) {
            setError(String(err));
          } finally {
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
