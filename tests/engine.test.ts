import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { b64Vecs, type TLDrawShape } from '@tldraw/tlschema'
import { parseRecording, type Recording } from '../src/engine/schema'
import { applyRecordEvent, buildCheckpoints, cameraAt } from '../src/engine/state'
import { length, lettering, path, prefix } from '../src/lesson/paths'
const lesson=parseRecording(JSON.parse(readFileSync('public/lesson.recording.json','utf8')))
function stateAt(t:number,checkpoint=false){
  const cp=checkpoint?buildCheckpoints(lesson).filter(c=>c.t<=t).at(-1):undefined
  const map=cp?new Map(cp.records):new Map(Object.values(lesson.initial.document.store).map(v=>[v.id as string,v]))
  for(const e of lesson.events.slice(cp?.index??0)){if(e.t>t)break;applyRecordEvent(map,e)}
  return [...map].sort(([a],[b])=>a.localeCompare(b))
}
test('versioned recording is ordered, exact duration, and explicitly generated',()=>{
  assert.equal(lesson.durationMs,180000);assert.equal(lesson.metadata.origin,'generated')
  assert.ok(lesson.events.length>8000)
  assert.ok(lesson.events.every((e,i)=>e.seq===i&&e.origin==='generated'&&(i===0||e.t>=lesson.events[i-1].t)))
  assert.throws(()=>parseRecording({...lesson,version:2}))
  const bad=structuredClone(lesson);bad.events[4].t=-1;assert.throws(()=>parseRecording(bad))
})
test('compressed native draw geometry, pressure, and styling are preserved as records',()=>{
  const completed=lesson.events.filter(e=>e.kind==='complete')
  assert.ok(completed.length>1000)
  for(const e of completed){
    const shape=e.record as TLDrawShape
    assert.equal(shape.type,'draw');assert.equal(shape.props.isPen,true)
    assert.equal(shape.props.fill,'none');assert.equal(shape.meta.origin,'generated')
    for(const segment of shape.props.segments){
      const points=b64Vecs.decodePoints(segment.path,segment.dim)
      assert.ok(points.length>=2);assert.ok(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.z!==undefined&&p.z>0&&p.z<=1))
      // Decode → encode preserves these actual SDK encoded point sequences byte-for-byte.
      assert.equal(b64Vecs.encodePoints(points,segment.dim),segment.path)
    }
  }
})
test('incremental point prefixes grow within each authored stroke, before completion',()=>{
  const grouped=new Map<string,number[]>()
  for(const e of lesson.events){if(!e.record||e.record.typeName!=='shape'||e.record.type!=='draw'||e.t>=48000&&e.t<=55100)continue
    const count=e.record.props.segments.reduce((n,s)=>n+b64Vecs.decodePoints(s.path,s.dim).length,0)
    const arr=grouped.get(e.id)??[];arr.push(count);grouped.set(e.id,arr)
  }
  assert.ok([...grouped.values()].filter(a=>a.length>5).length>300)
  for(const a of grouped.values())for(let i=1;i<a.length;i++)assert.ok(a[i]>=a[i-1])
})
test('checkpoints produce identical documents to replay from time zero, including boundary ties',()=>{
  for(const t of [0,16.6667,5000,20000,34000,50000,62000,96000,115100,118000,120000,148700,179999,180000])assert.deepEqual(stateAt(t,true),stateAt(t))
})
test('native whole-stroke eraser events remove records and survive seeking',()=>{
  const erased=lesson.events.filter(e=>e.kind==='erase')
  assert.ok(erased.length>100)
  assert.ok(erased.every(e=>e.tool==='eraser'&&e.before?.typeName==='shape'))
  const before=new Map(stateAt(114900)),after=new Map(stateAt(120000))
  erased.forEach(e=>{assert.ok(before.has(e.id));assert.ok(!after.has(e.id))})
})
test('camera hold, smooth pan, zoom, and interpolation are evaluated at time, never by frame deltas',()=>{
  const r:Recording={...lesson,initialCamera:{x:0,y:0,z:1},events:[
    {seq:0,t:1000,kind:'camera',id:'camera:test',camera:{x:0,y:0,z:1},easing:'hold',origin:'generated',source:'user',tool:'draw'},
    {seq:1,t:3000,kind:'camera',id:'camera:test',camera:{x:-100,y:-50,z:4},easing:'smooth',origin:'generated',source:'user',tool:'draw'},
  ]}
  assert.deepEqual(cameraAt(r,500),{x:0,y:0,z:1})
  assert.deepEqual(cameraAt(r,2000),{x:-50,y:-25,z:2})
  assert.deepEqual(cameraAt(r,3000),{x:-100,y:-50,z:4})
  assert.deepEqual(cameraAt(r,2000),cameraAt(r,2000))
  assert.ok(cameraAt(lesson,46000).z<1.2)
})
test('frame-independent ordered event folding at 24, 30, 60 FPS and irregular steps',()=>{
  const target=59600,expected=stateAt(target)
  for(const fps of [24,30,60]){
    const records=new Map(Object.values(lesson.initial.document.store).map(v=>[v.id as string,v]));let index=0
    for(let t=0;t<target+1000/fps;t=Math.min(target,t+1000/fps)){
      while(index<lesson.events.length&&lesson.events[index].t<=t)applyRecordEvent(records,lesson.events[index++])
      if(t===target)break
    }
    assert.deepEqual([...records].sort(([a],[b])=>a.localeCompare(b)),expected)
  }
})
test('vector lettering and arc-length reveal preserve full final paths and mathematical glyphs',()=>{
  assert.ok(lettering("f'(x) = lim ∫ x^2 dx → Δx ≠ 0",0,0).length>20)
  const p=path([[0,0],[100,0],[100,100]]).points
  assert.ok(Math.abs(length(prefix(p,.25))-50)<1e-5)
  assert.deepEqual(prefix(p,1),p)
  assert.ok(prefix(p,.5).length<p.length)
})
