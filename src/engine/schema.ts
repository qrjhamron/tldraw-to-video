import type { TLEditorSnapshot, TLRecord } from 'tldraw'
export type Camera = { x: number; y: number; z: number }
export type Origin = 'human' | 'generated'
export type EventKind = 'create' | 'update' | 'complete' | 'erase' | 'delete' | 'camera' | 'page'
export interface StrokeEvent {
  seq: number
  t: number // milliseconds, monotonic clock; equal times are ordered by seq
  kind: EventKind
  origin: Origin
  source: 'user' | 'remote'
  tool: string
  id: string
  record?: TLRecord
  before?: TLRecord
  camera?: Camera
  pageId?: string
  easing?: 'hold' | 'linear' | 'smooth'
}
export interface Recording {
  format: 'tldraw-stroke-recording'
  version: 1
  sdkVersion: string
  durationMs: number
  viewport: { width: number; height: number }
  initial: TLEditorSnapshot
  initialCamera: Camera
  events: StrokeEvent[]
  metadata: { title: string; language: string; origin: Origin; generatedBy?: string; chapters?: { t: number; title: string }[] }
}
export function parseRecording(value: unknown): Recording {
  const r = value as Recording
  if (!r || r.format !== 'tldraw-stroke-recording' || r.version !== 1) throw Error('Unsupported recording format/version')
  if(r.sdkVersion!=='5.5.2') throw Error('This reader requires SDK 5.5.2; event records need an explicit migration for other SDK versions')
  if (!r.initial?.document?.store || !r.initial.session || !Array.isArray(r.events) || !r.metadata || !r.viewport || !r.initialCamera) throw Error('Missing initial document, session, viewport, camera, or events')
  if(!Number.isFinite(r.viewport.width)||!Number.isFinite(r.viewport.height)||r.viewport.width<=0||r.viewport.height<=0)throw Error('Invalid viewport')
  if (!Number.isFinite(r.durationMs) || r.durationMs < 0) throw Error('Invalid duration')
  const cameraOK = (c: Camera) => Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z) && c.z > 0
  if (!cameraOK(r.initialCamera)) throw Error('Invalid initial camera')
  if(typeof r.metadata.title!=='string'||typeof r.metadata.language!=='string'||!['human','generated'].includes(r.metadata.origin))throw Error('Invalid recording metadata')
  let last = -1
  for (let i = 0; i < r.events.length; i++) {
    const e = r.events[i]
    if(!e||typeof e.id!=='string'||typeof e.tool!=='string'||!['user','remote'].includes(e.source))throw Error(`Invalid event fields at ${i}`)
    if(e.easing!==undefined&&!['hold','linear','smooth'].includes(e.easing))throw Error('Invalid camera easing')
    if (e.seq !== i || !Number.isFinite(e.t) || e.t < last || e.t > r.durationMs) throw Error(`Invalid event order at ${i}`)
    if (!['create','update','complete','erase','delete','camera','page'].includes(e.kind)) throw Error(`Invalid event kind at ${i}`)
    if (!['human','generated'].includes(e.origin)) throw Error('Invalid provenance')
    if (e.kind === 'camera' && (!e.camera || !cameraOK(e.camera))) throw Error('Invalid camera')
    if (['create','update','complete'].includes(e.kind) && (!e.record || e.record.id !== e.id)) throw Error('Missing record')
    if (e.kind === 'page' && !e.pageId) throw Error('Missing page')
    last = e.t
  }
  return r
}
