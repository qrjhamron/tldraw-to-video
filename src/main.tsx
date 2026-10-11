import { getAssetUrls } from '@tldraw/assets/selfHosted'
import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Box, Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import './style.css'
import { Recorder } from './engine/recorder'
import { Replay } from './engine/replay'
import { cameraAt } from './engine/state'
import { parseRecording, type Recording } from './engine/schema'
import { createCalculusLesson } from './lesson/calculus'

export interface StudioAPI {
  editor: Editor
  recording: Recording
  replay: Replay
  seek(t:number):void
  renderFrame(t:number):Promise<string>
  load(r:Recording):void
}
declare global {interface Window {studio?:StudioAPI}}
const assetUrls=getAssetUrls({baseUrl:'/tldraw/'})
const stamp=(ms:number)=>`${Math.floor(ms/60000).toString().padStart(2,'0')}:${Math.floor(ms/1000)%60<10?'0':''}${Math.floor(ms/1000)%60}`
function App(){
  const exporting=new URLSearchParams(location.search).has('export')
  const [recording,setRecording]=useState<Recording>()
  const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1)
  const [mode,setMode]=useState<'lesson'|'record'>('lesson'),[capturing,setCapturing]=useState(false)
  const [status,setStatus]=useState('Preparing the native document'),[error,setError]=useState('')
  const editorRef=useRef<Editor>(null), replayRef=useRef<Replay>(null),recorderRef=useRef<Recorder>(null)
  const frame=useRef(0),currentTime=useRef(0),file=useRef<HTMLInputElement>(null)
  function seek(t:number){replayRef.current?.seek(t);currentTime.current=t;setTime(t)}
  function load(r:Recording){
    setPlaying(false);recorderRef.current?.stop();recorderRef.current=null;setCapturing(false)
    const ed=editorRef.current!
    replayRef.current=new Replay(ed,r)
    ed.updateInstanceState({isReadonly:true});ed.setCurrentTool('select')
    setRecording(r);setMode('lesson');seek(0);setStatus(r.metadata.origin==='generated'?'Generated vector strokes · native tldraw':'Human input · native tldraw')
    if(window.studio){window.studio.recording=r;window.studio.replay=replayRef.current}
  }
  async function mounted(editor:Editor){
    editorRef.current=editor
    editor.user.updateUserPreferences({colorScheme:'light',isSnapMode:false})
    editor.setCameraOptions({constraints:undefined,isLocked:false})
    try{
      let r:Recording
      if(new URLSearchParams(location.search).has('generate'))r=createCalculusLesson(editor)
      else {const response=await fetch('/lesson.recording.json');r=response.ok&&response.headers.get('content-type')?.includes('application/json')?parseRecording(await response.json()):createCalculusLesson(editor)}
      load(r)
      const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080
      const ctx=canvas.getContext('2d')!
      let lastKey='',lastFrame='',lastRecording:Recording|undefined
      window.studio={editor,recording:r,replay:replayRef.current!,seek,load,
        async renderFrame(t){
          const api=window.studio!;api.replay.seek(t)
          const c=cameraAt(api.recording,t), rv=api.recording.viewport
          const fit=Math.min(1920/rv.width,1080/rv.height)
          c.z*=fit;c.x+=(1920-rv.width*fit)/(2*c.z);c.y+=(1080-rv.height*fit)/(2*c.z)
          const bounds=new Box(-c.x,-c.y,1920/c.z,1080/c.z)
          const events=api.recording.events
          let lo=0,hi=events.length
          while(lo<hi){const m=(lo+hi)>>>1;if(events[m].t<=t)lo=m+1;else hi=m}
          const key=`${lo}:${c.x}:${c.y}:${c.z}`
          if(key===lastKey&&lastRecording===api.recording)return lastFrame
          const shapes=editor.getCurrentPageShapes().filter(s=>{
            const b=editor.getShapePageBounds(s);return b&&bounds.collides(b)
          })
          // Official SDK SVG exporter reconstructs each native draw shape at time t.
          const result=shapes.length?await editor.getSvgString(shapes,{bounds,scale:c.z,padding:0,background:true,darkMode:false}):undefined
          ctx.fillStyle='white';ctx.fillRect(0,0,1920,1080)
          if(result){
            const url=URL.createObjectURL(new Blob([result.svg],{type:'image/svg+xml'}))
            const img=new Image()
            try{img.src=url;await img.decode();ctx.drawImage(img,0,0,1920,1080)}finally{URL.revokeObjectURL(url)}
          }
          lastKey=key;lastRecording=api.recording;lastFrame=canvas.toDataURL('image/jpeg',.95)
          return lastFrame
        },
      }
    }catch(e){setError(String(e));console.error(e)}
  }
  useEffect(()=>{
    if(!playing)return
    let previous=performance.now()
    const tick=(now:number)=>{
      const next=Math.min(recording?.durationMs??0,currentTime.current+(now-previous)*speed)
      previous=now;seek(next)
      if(next>=(recording?.durationMs??0)){setPlaying(false);return}
      frame.current=requestAnimationFrame(tick)
    }
    frame.current=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(frame.current)
  },[playing,speed,recording])
  function startRecord(){
    setPlaying(false)
    const ed=editorRef.current!
    ed.updateInstanceState({isReadonly:false})
    ed.selectNone();ed.deleteShapes([...ed.getCurrentPageShapeIds()]);ed.setCamera({x:0,y:0,z:1},{immediate:true})
    ed.setCurrentTool('draw');setMode('record');setTime(0)
    recorderRef.current=new Recorder(ed);setCapturing(true);setStatus('Recording human editor input')
  }
  function stopRecord(){if(recorderRef.current){const r=recorderRef.current.stop();recorderRef.current=null;load(r)}}
  function save(){if(!recording)return;const url=URL.createObjectURL(new Blob([JSON.stringify(recording)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='native-strokes.v1.json';a.click();URL.revokeObjectURL(url)}
  const chapter=recording?.metadata.chapters?.filter(c=>c.t<=time).at(-1)
  return <div className={exporting?'studio exporting':'studio'}>
    {!exporting&&<aside>
      <div className="brand"><span className="brand-icon">∿</span><div>Stroke Studio<small>NATIVE RECORDING ENGINE</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <button className={mode==='lesson'?'nav active':'nav'} onClick={()=>{if(capturing)stopRecord();else if(window.studio)load(window.studio.recording)}}>◷ &nbsp; Playback room</button>
      <button className={mode==='record'?'nav active':'nav'} onClick={startRecord}>✎ &nbsp; Record a whiteboard</button>
      <div className="nav-label">LESSON CHAPTERS</div>
      <div className="chapters">{recording?.metadata.chapters?.map((c,i)=><button key={c.t} className={chapter===c?'chapter selected':'chapter'} onClick={()=>{setPlaying(false);seek(c.t)}}><span>{String(i+1).padStart(2,'0')}</span><div>{c.title}<small>{stamp(c.t)}</small></div></button>)}</div>
      <div className="sidebar-note"><span className="green-dot"/> REAL GEOMETRY<p>Every mark is a native tldraw stroke. Point data, pressure and editor changes travel with the recording.</p></div>
    </aside>}
    <main>
      {!exporting&&<header><div><span className="eyebrow">THE WHITEBOARD LAB</span><h1>{mode==='record'?'Your next explanation':recording?.metadata.title??'Kalkulus'}</h1></div><div className="header-actions"><button onClick={()=>file.current?.click()}>Import JSON</button><button onClick={save} disabled={!recording}>Save recording</button><a className="export-link" href="/output/calculus_intro_180s.mp4" download>↓ MP4</a></div></header>}
      {!exporting&&<div className="board-heading"><span className="green-dot"/>{status}<span className="board-spec">{mode==='record'?'Draw · erase · pan · zoom':'INDONESIAN · NO AUDIO · 1920 × 1080'}</span></div>}
      <div className="board-wrap"><div className="board"><Tldraw licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY} assetUrls={assetUrls} hideUi={exporting||mode==='lesson'} onMount={editor=>{void mounted(editor)}}/></div>{error&&<div role="alert" className="error">{error}</div>}</div>
      {!exporting&&<footer>
        {capturing?<div className="record-panel"><span className="record-dot"/> Recording editor events <button className="primary" onClick={stopRecord}>Stop & replay</button><span>Use tldraw’s pen, eraser, selection, undo and camera tools.</span></div>:<>
          <div className="transport"><button className="restart" title="Restart" onClick={()=>{setPlaying(false);seek(0)}}>↺</button><button className="play primary" disabled={!recording} onClick={()=>{if(time===(recording?.durationMs??0))seek(0);setPlaying(!playing)}}>{playing?'Ⅱ Pause':'▶ Play'}</button><span className="time">{stamp(time)} <span>/ {stamp(recording?.durationMs??180000)}</span></span><span className="transport-chapter">{chapter?.title??'Native stroke recording'}</span><select aria-label="Playback speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.25,.5,1,1.5,2,4].map(n=><option key={n} value={n}>{n}× speed</option>)}</select></div>
          <input aria-label="Timeline" className="timeline" type="range" min={0} max={recording?.durationMs??180000} step={1} value={time} onChange={e=>{setPlaying(false);seek(Number(e.target.value))}}/>
          <div className="footer-note"><span>{recording?.events.length.toLocaleString()??'…'} ordered events · schema v1 · SDK 5.5.2</span><span>Seek freely. The document rebuilds from native records.</span></div>
        </>}
      </footer>}
    </main>
    <input ref={file} type="file" accept=".json,application/json" hidden onChange={async e=>{try{const f=e.target.files?.[0];if(f)load(parseRecording(JSON.parse(await f.text())))}catch(err){setError(String(err))}finally{e.target.value=''}}}/>
  </div>
}
createRoot(document.getElementById('root')!).render(<App/> )
