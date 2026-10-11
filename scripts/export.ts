import { spawn } from 'node:child_process'
import { mkdir, writeFile, rename, copyFile } from 'node:fs/promises'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { openStudio } from './browser'

const fps=30, frames=5400, output='output/calculus_intro_180s.mp4'
await mkdir('output/inspection',{recursive:true})
const session=await openStudio(process.argv.includes('--regenerate')?'?export=1&generate=1':'?export=1')
const {page}=session
const recording=await page.evaluate(()=>JSON.stringify(window.studio!.recording))
await writeFile('output/calculus_intro_180s.recording.json',recording)
await writeFile('public/lesson.recording.json',recording)
const r=JSON.parse(recording)
if(r.durationMs!==180000)throw Error('The lesson must be exactly 180 seconds')
const ffmpeg=spawn('ffmpeg',['-hide_banner','-loglevel','warning','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-r',String(fps),'-frames:v',String(frames),'-movflags','+faststart','output/calculus_intro_180s.partial.mp4'],{stdio:['pipe','ignore','pipe']})
let encodingError=''
ffmpeg.stderr.on('data',d=>{encodingError+=d.toString()})
// Attach failure handling immediately; backpressure never changes logical frame time.
const encodingDone=once(ffmpeg,'close')
ffmpeg.stdin.on('error',()=>{})
const samples=new Set([0,15,30,60,75,90,105,115,118,120,135,145,155,165,175,179])
const hashes:{frame:number;t:number;sha256:string;eventCursor:number;shapeCount:number;nativeDrawCount:number}[]=[]
const start=Date.now()
try{
  for(let i=0;i<frames;i++){
    const t=i*1000/fps
    const jpeg=await page.evaluate(t=>window.studio!.renderFrame(t),t)
    const buffer=Buffer.from(jpeg.slice(jpeg.indexOf(',')+1),'base64')
    if(!ffmpeg.stdin.write(buffer))await once(ffmpeg.stdin,'drain')
    if(samples.has(i/fps)){
      await writeFile(`output/inspection/export-${i/fps}s.jpg`,buffer)
      const stats=await page.evaluate(t=>{
        const s=window.studio!, shapes=s.editor.getCurrentPageShapes()
        return{eventCursor:s.recording.events.filter(e=>e.t<=t).length,shapeCount:shapes.length,nativeDrawCount:shapes.filter(s=>s.type==='draw').length}
      },t)
      hashes.push({frame:i,t,sha256:createHash('sha256').update(buffer).digest('hex'),...stats})
    }
    if(i%150===0)console.log(`Rendered ${i}/${frames} frames (${(t/1000).toFixed(1)}s lesson), ${(Date.now()-start)/1000|0}s elapsed`)
  }
  ffmpeg.stdin.end()
  const [code]=await encodingDone
  if(code!==0)throw Error(`FFmpeg failed (${code}): ${encodingError}`)
  await rename('output/calculus_intro_180s.partial.mp4',output)
  await mkdir('public/output',{recursive:true});await copyFile(output,'public/'+output)
  await writeFile('output/export-manifest.json',JSON.stringify({output,width:1920,height:1080,fps,frames,durationMs:r.durationMs,recordingSha256:createHash('sha256').update(recording).digest('hex'),recordingEvents:r.events.length,sdkVersion:r.sdkVersion,pipeline:'Explicit frame times → checkpoint replay → native SDK SVG export → Chromium rasterization → JPEG pipe → libx264',samples:hashes,browserErrors:session.errors,renderSeconds:(Date.now()-start)/1000},null,2))
  console.log(`Exported ${output}`)
}finally{ffmpeg.stdin.destroy();if(ffmpeg.exitCode===null)ffmpeg.kill();await session.close()}
