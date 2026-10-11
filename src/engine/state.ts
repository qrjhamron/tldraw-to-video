import type { TLRecord } from 'tldraw'
import type { Camera, Recording, StrokeEvent } from './schema'
export interface Checkpoint { t: number; index: number; records: Map<string, TLRecord>; pageId: string }
export function applyRecordEvent(records: Map<string, TLRecord>, e: StrokeEvent) {
  if (e.kind === 'delete' || e.kind === 'erase') records.delete(e.id)
  else if (e.record) records.set(e.id, e.record)
}
export function buildCheckpoints(r: Recording, interval = 5000): Checkpoint[] {
  const records = new Map(Object.values(r.initial.document.store).map(v => [v.id as string, v]))
  let pageId: string = r.initial.session.currentPageId ?? Object.values(r.initial.document.store).find(v=>v.typeName==='page')!.id
  const out: Checkpoint[] = [{ t: -1, index: 0, records: new Map(records), pageId }]
  let next = interval
  for (let i=0; i<r.events.length; i++) {
    const e = r.events[i]
    // A checkpoint stores the state BEFORE events at the boundary, preserving ties.
    while (e.t >= next) { out.push({t:next, index:i, records:new Map(records),pageId}); next += interval }
    applyRecordEvent(records,e)
    if(e.kind === 'page') pageId = e.pageId!
  }
  return out
}
export function cameraAt(r: Recording, time: number, keys = r.events.filter(e => e.kind === 'camera')): Camera {
  let lo=0, hi=keys.length
  while(lo<hi) {const mid=(lo+hi)>>>1; if(keys[mid].t<=time) lo=mid+1; else hi=mid}
  const prev = keys[lo-1], next = keys[lo]
  const a = prev?.camera ?? r.initialCamera
  if (!next || next.easing === 'hold' || (prev && prev.pageId !== next.pageId)) return {...a}
  const start=prev?.t ?? 0
  let f=Math.max(0,Math.min(1,(time-start)/(next.t-start || 1)))
  if(next.easing === 'smooth') f=f*f*(3-2*f)
  return {x:a.x+(next.camera!.x-a.x)*f,y:a.y+(next.camera!.y-a.y)*f,z:Math.exp(Math.log(a.z)+(Math.log(next.camera!.z)-Math.log(a.z))*f)}
}
