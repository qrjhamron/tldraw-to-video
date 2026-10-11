import { loadSnapshot, type Editor, type TLRecord, type TLPageId } from 'tldraw'
import { parseRecording, type Camera, type Recording, type StrokeEvent } from './schema'
import { buildCheckpoints, cameraAt, type Checkpoint } from './state'
export { applyRecordEvent, buildCheckpoints, cameraAt } from './state'
export class Replay {
  readonly checkpoints: Checkpoint[]
  readonly recording: Recording
  private cameraKeys: StrokeEvent[]
  private index=0
  time=-1
  constructor(private editor: Editor, recording: Recording) {
    this.recording=parseRecording(recording)
    this.checkpoints=buildCheckpoints(recording)
    this.cameraKeys=recording.events.filter(e=>e.kind==='camera')
    loadSnapshot(editor.store,structuredClone(recording.initial))
    editor.selectNone()
  }
  seek(time: number) {
    time=Math.max(0,Math.min(this.recording.durationMs,time))
    const events=this.recording.events
    this.editor.store.mergeRemoteChanges(()=>{
      if(time<this.time || time-this.time>5000) {
        let lo=0,hi=this.checkpoints.length
        while(lo<hi){const m=(lo+hi)>>>1;if(this.checkpoints[m].t<=time)lo=m+1;else hi=m}
        const cp=this.checkpoints[Math.max(0,lo-1)]
        const ids=this.editor.store.allRecords().filter(r=>this.editor.store.scopedTypes.document.has(r.typeName)).map(r=>r.id)
        this.editor.store.remove(ids.filter(id=>!cp.records.has(id)))
        this.editor.store.put([...cp.records.values()])
        this.editor.setCurrentPage(cp.pageId as TLPageId)
        this.index=cp.index
      }
      this.editor.run(()=>{
        while(this.index<events.length && events[this.index].t<=time){
          const e=events[this.index++]
          if(e.kind==='erase'||e.kind==='delete') this.editor.store.remove([e.id as TLRecord['id']])
          else if(e.record) this.editor.store.put([e.record])
          else if(e.kind==='page') this.editor.setCurrentPage(e.pageId as TLPageId)
        }
        const camera=cameraAt(this.recording,time,this.cameraKeys)
        const vp=this.editor.getViewportScreenBounds(), rv=this.recording.viewport
        const fit=Math.min(vp.w/rv.width,vp.h/rv.height)
        if(fit>0){camera.z*=fit;camera.x+=(vp.w-rv.width*fit)/(2*camera.z);camera.y+=(vp.h-rv.height*fit)/(2*camera.z)}
        this.editor.setCamera(camera,{immediate:true,force:true})
      },{history:'ignore'})
    })
    this.time=time
    return this
  }
  restart(){this.seek(0)}
}
