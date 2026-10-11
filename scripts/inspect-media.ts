import { execFileSync } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
await mkdir('output/inspection/decoded',{recursive:true})
const times=[0,1/30,2/30,3/30,.2,1,19.5,34,50,59.6,96,114.5,118,120,141,146.5,150.5,157,172.5,179.5]
for(const [i,t] of times.entries()){
 const select=i<5?['-i','output/calculus_intro_180s.mp4','-vf',`select=eq(n\\,${Math.round(t*30)})`,'-fps_mode','passthrough']:['-ss',String(t),'-i','output/calculus_intro_180s.mp4']
 execFileSync('ffmpeg',['-v','error','-y',...select,'-frames:v','1',`output/inspection/decoded/${String(i).padStart(2,'0')}-${t.toFixed(3)}s.png`])
}
const recording=JSON.parse(await readFile('output/calculus_intro_180s.recording.json','utf8'))
const first=recording.events.find((e:any)=>e.kind==='create').id
const counts:number[]=[]
const {b64Vecs}=await import('@tldraw/tlschema')
for(const t of times.slice(0,5)){
 const latest=recording.events.filter((e:any)=>e.id===first&&e.record&&e.t<=t*1000).at(-1)
 counts.push(b64Vecs.decodePoints(latest.record.props.segments[0].path).length)
}
assert.ok(counts[1]>counts[0]&&counts[2]>counts[1]&&counts[3]>counts[2],'First native stroke reveals progressively across consecutive video frames')
const stats=execFileSync('python3',['-c',`
from PIL import Image
from pathlib import Path
import json
out=[]
for p in sorted(Path('output/inspection/decoded').glob('*.png'))[:5]:
 im=Image.open(p).convert('RGB')
 ink=sum(1 for r,g,b in im.getdata() if min(r,g,b)<140)
 out.append({'file':str(p),'inkPixels':ink})
print(json.dumps(out))
`],{encoding:'utf8'})
const ink=JSON.parse(stats)
assert.ok(ink[1].inkPixels>ink[0].inkPixels&&ink[2].inkPixels>ink[1].inkPixels&&ink[3].inkPixels>ink[2].inkPixels)
await writeFile('output/progressive-stroke-validation.json',JSON.stringify({passed:true,firstShapeId:first,consecutiveFrameNativePointCounts:counts,decodedVideoInkPixels:ink,decodedFrameTimes:times},null,2))
console.log('PASS: actual MP4 consecutive frames show increasing ink from one incrementally reconstructed native stroke')
