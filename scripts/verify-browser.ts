import { b64Vecs } from '@tldraw/tlschema'
import assert from 'node:assert/strict'
import { writeFile, mkdir } from 'node:fs/promises'
import { openStudio } from './browser'
const session=await openStudio()
const {page}=session
const results:{test:string;passed:boolean;details?:unknown}[]=[]
const pass=(test:string,details?:unknown)=>{results.push({test,passed:true,details});console.log('PASS:',test)}
try{
  // Browser-native SVG and document snapshots must agree after different seek histories.
  const snapshot=()=>page.evaluate(()=>{
    const s=window.studio!;return JSON.stringify({records:s.editor.store.allRecords().filter(r=>s.editor.store.scopedTypes.document.has(r.typeName)).sort((a,b)=>a.id.localeCompare(b.id)),camera:s.editor.getCamera()})
  })
  await page.evaluate(()=>window.studio!.seek(59600));const expected=await snapshot()
  const expectedImage=await page.evaluate(()=>window.studio!.renderFrame(59600))
  for(const t of [179900,5000,120000,48000,59600])await page.evaluate(t=>window.studio!.seek(t),t)
  assert.equal(await snapshot(),expected)
  assert.equal(await page.evaluate(()=>window.studio!.renderFrame(59600)),expectedImage)
  pass('Native document and exported pixels are identical after checkpoint scrubbing')
  for(const fps of [24,30,60]){
    await page.evaluate(async fps=>{
      const s=window.studio!, url='/src/engine/replay.ts', {Replay}=await import(url)
      s.replay=new Replay(s.editor,s.recording)
      // Cross several checkpoints and all moving secant updates with different schedules.
      for(let t=47000;t<59600;t+=1000/fps)s.replay.seek(t)
      s.replay.seek(59600)
    },fps)
    assert.equal(await snapshot(),expected)
  }
  pass('Actual editor replay is frame-independent at 24, 30 and 60 FPS')
  // Start a human recording and drive real pointer events through the native SDK.
  await page.evaluate(async()=>{
    const ed=window.studio!.editor
    ed.updateInstanceState({isReadonly:false});ed.deleteShapes([...ed.getCurrentPageShapeIds()]);ed.setCamera({x:0,y:0,z:1},{immediate:true});ed.setCurrentTool('draw')
    const url='/src/engine/recorder.ts',{Recorder}=await import(url)
    ;(window as any).testRecorder=new Recorder(ed)
  })
  await page.mouse.move(300,400);await page.mouse.down()
  for(const [x,y] of [[320,403],[340,415],[365,431],[390,440],[420,443],[455,432]]){await page.mouse.move(x,y);await page.waitForTimeout(15)}
  await page.mouse.up()
  await page.mouse.move(650,450);await page.mouse.down()
  for(const [x,y] of [[670,420],[700,400],[730,420],[760,450]]){await page.mouse.move(x,y);await page.waitForTimeout(15)}
  await page.mouse.up()
  const nativeDrawing=await page.evaluate(()=>window.studio!.editor.getCurrentPageShapes().map(s=>({id:s.id,type:s.type})))
  assert.ok(nativeDrawing.length>=2);assert.ok(nativeDrawing.every(s=>s.type==='draw'))
  // Exercise pressure, styling and multiple commits within one browser animation frame.
  const encodedPressure=b64Vecs.encodePoints([{x:0,y:0,z:.2},{x:40,y:10,z:.75},{x:90,y:30,z:.4}])
  const pressure=await page.evaluate(encoded=>{
    const ed=window.studio!.editor
    // use an existing draw shape to retain the installed SDK's schema/defaults
    const s=ed.getCurrentPageShapes()[1] as any
    ed.updateShape({id:s.id,type:'draw',props:{isPen:true,color:'red',segments:[{type:'free',path:encoded}]}})
    ed.updateShape({id:s.id,type:'draw',x:s.x+15,rotation:.12})
    const shape=ed.getShape(s.id) as any
    return{id:s.id,encoded,shape}
  },encodedPressure)
  pass('Native pointer input and consecutive point/style/transform commits are recorded')
  // Erase the first stroke with the actual tldraw eraser tool, then undo/redo it.
  await page.evaluate(()=>window.studio!.editor.setCurrentTool('eraser'))
  await page.mouse.move(365,431);await page.mouse.down();await page.mouse.move(390,440);await page.mouse.up()
  const countAfterErase=await page.evaluate(()=>window.studio!.editor.getCurrentPageShapes().length)
  assert.equal(countAfterErase,nativeDrawing.length-1)
  await page.evaluate(()=>window.studio!.editor.undo())
  assert.equal(await page.evaluate(()=>window.studio!.editor.getCurrentPageShapes().length),nativeDrawing.length)
  await page.evaluate(()=>window.studio!.editor.redo())
  assert.equal(await page.evaluate(()=>window.studio!.editor.getCurrentPageShapes().length),countAfterErase)
  // Record a camera change, shape deletion, and state restoration via undo.
  await page.evaluate(()=>{
    const ed=window.studio!.editor;ed.setCamera({x:-80,y:-20,z:1.4},{immediate:true})
    ed.setCurrentTool('select');ed.markHistoryStoppingPoint('before-delete');ed.deleteShapes([ed.getCurrentPageShapes()[0].id]);ed.undo()
  })
  const human=await page.evaluate(()=>{
    const ed=window.studio!.editor, r=(window as any).testRecorder.stop()
    return{recording:r,final:ed.store.allRecords().filter(v=>ed.store.scopedTypes.document.has(v.typeName)).sort((a,b)=>a.id.localeCompare(b.id)),camera:ed.getCamera()}
  })
  assert.ok(human.recording.events.some((e:any)=>e.kind==='erase'))
  assert.ok(human.recording.events.some((e:any)=>e.kind==='complete'))
  assert.ok(human.recording.events.some((e:any)=>e.kind==='camera'))
  assert.ok(human.recording.events.some((e:any)=>e.record?.props?.segments?.some((s:any)=>s.path===pressure.encoded)))
  assert.ok(human.recording.events.filter((e:any)=>e.kind==='update').length>=8)
  assert.ok(human.recording.events.every((e:any,i:number)=>e.seq===i&&e.origin==='human'))
  await page.evaluate(r=>{window.studio!.load(r);window.studio!.replay.seek(r.durationMs)},human.recording)
  const final=await page.evaluate(()=>window.studio!.editor.store.allRecords().filter(v=>window.studio!.editor.store.scopedTypes.document.has(v.typeName)).sort((a,b)=>a.id.localeCompare(b.id)))
  assert.deepEqual(final,human.final)
  pass('Human recording/replay equivalence: geometry, pressure, styling, transforms, erasing, undo/redo and camera')
  await mkdir('output',{recursive:true})
  await writeFile('output/human-test.recording.json',JSON.stringify(human.recording,null,2))
  await writeFile('output/browser-validation.json',JSON.stringify({passed:true,tests:results,browserErrors:session.errors},null,2))
}finally{await session.close()}
