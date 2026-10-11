import { getSnapshot, type Editor, type TLRecord } from 'tldraw'
import type { Origin, Recording, StrokeEvent } from './schema'

/** Synchronous supported store side effects retain each committed atomic change,
 * including separate transactions in one animation frame. A batched RAF store.listen alone could coalesce those samples. */
export class Recorder {
  readonly recording: Recording
  private cleanup: (() => void)[] = []
  private start: number
  private running = true
  private easing: StrokeEvent['easing'] = 'linear'
  constructor(private editor: Editor, private clock = () => performance.now(), origin: Origin = 'human') {
    this.start = clock()
    const c = editor.getCamera()
    this.recording = {
      format: 'tldraw-stroke-recording', version: 1, sdkVersion: '5.5.2', durationMs: 0,
      viewport: { width: editor.getViewportScreenBounds().w, height: editor.getViewportScreenBounds().h },
      initial: structuredClone(getSnapshot(editor.store)), initialCamera: { x: c.x, y: c.y, z: c.z }, events: [],
      metadata: { title: 'Human recording', language: 'id', origin },
    }
    const effects = editor.store.sideEffects
    const add = (kind: StrokeEvent['kind'], r: TLRecord, source: 'user'|'remote', before?: TLRecord) => {
      this.append({ kind, id: r.id, record: kind === 'delete' || kind === 'erase' ? undefined : r, before, origin, source, tool: editor.getCurrentToolId() })
    }
    for (const type of ['shape', 'page', 'binding', 'asset', 'document'] as const) {
      this.cleanup.push(effects.registerAfterCreateHandler(type, (r, source) => add('create', r, source)))
      this.cleanup.push(effects.registerAfterChangeHandler(type, (prev, next, source) => {
        const completed = next.typeName === 'shape' && next.type === 'draw' && prev.typeName === 'shape' && prev.type === 'draw' && !prev.props.isComplete && next.props.isComplete
        add(completed ? 'complete' : 'update', next, source, prev)
      }))
      this.cleanup.push(effects.registerAfterDeleteHandler(type, (r, source) => add(editor.getCurrentToolId() === 'eraser' ? 'erase' : 'delete', r, source, r)))
    }
    this.cleanup.push(effects.registerAfterChangeHandler('camera', (_prev, next, source) => {
      if (next.id !== editor.getCamera().id) return
      this.append({ kind: 'camera', id: next.id, camera: { x: next.x, y: next.y, z: next.z }, easing: this.easing, pageId: editor.getCurrentPageId(), origin, source, tool: editor.getCurrentToolId() })
    }))
    this.cleanup.push(effects.registerAfterChangeHandler('instance', (prev, next, source) => {
      if (prev.currentPageId !== next.currentPageId) this.append({ kind: 'page', id: next.id, pageId: next.currentPageId, origin, source, tool: editor.getCurrentToolId() })
    }))
  }
  private append(e: Omit<StrokeEvent,'seq'|'t'>) {
    if (!this.running) return
    const events = this.recording.events
    events.push(structuredClone({ ...e, seq: events.length, t: Math.max(0, this.clock() - this.start, events.at(-1)?.t ?? 0) }))
  }
  /** Explicit identical camera keys delimit holds before a directed camera move. */
  cameraKey(camera: {x:number;y:number;z:number}, easing: StrokeEvent['easing'] = 'smooth') {
    camera={x:camera.x,y:camera.y,z:camera.z}
    this.easing = easing
    const before = this.recording.events.length
    this.editor.setCamera(camera, { immediate: true, force: true })
    if (this.recording.events.length === before) this.append({ kind:'camera', id:this.editor.getCamera().id, camera, easing, pageId:this.editor.getCurrentPageId(), origin:this.recording.metadata.origin, source:'user', tool:this.editor.getCurrentToolId() })
    this.easing = 'linear'
  }
  stop(durationMs = this.clock() - this.start): Recording {
    this.running = false
    this.cleanup.splice(0).forEach(fn => fn())
    this.recording.durationMs = Math.max(durationMs, this.recording.events.at(-1)?.t ?? 0)
    return this.recording
  }
}
