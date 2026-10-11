import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const path='output/calculus_intro_180s.mp4'
const media=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',path],{encoding:'utf8'}))
assert.equal(media.streams.length,1,'No audio or other streams')
const video=media.streams[0]
assert.equal(video.codec_name,'h264')
assert.equal(video.width,1920);assert.equal(video.height,1080)
assert.equal(video.r_frame_rate,'30/1');assert.equal(video.avg_frame_rate,'30/1')
assert.equal(Number(video.nb_read_frames),5400)
assert.equal(Number(video.duration),180);assert.equal(Number(media.format.duration),180)
assert.equal(video.pix_fmt,'yuv420p')
execFileSync('ffmpeg',['-v','error','-i',path,'-f','null','-'],{stdio:'pipe'})
// Packet presentation timestamps verify every scheduled logical video frame exists.
const packets=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','packet=pts_time','-of','json',path],{encoding:'utf8'})).packets
const pts=packets.map((p:{pts_time:string})=>Number(p.pts_time)).sort((a:number,b:number)=>a-b)
assert.equal(pts.length,5400)
pts.forEach((t:number,i:number)=>assert.ok(Math.abs(t-i/30)<.000002,`Timestamp ${i}`))
const manifest=JSON.parse(await readFile('output/export-manifest.json','utf8'))
assert.equal(manifest.frames,5400)
assert.deepEqual(manifest.browserErrors,[])
const recording=JSON.parse(await readFile('output/calculus_intro_180s.recording.json','utf8'))
assert.ok(recording.events.every((e:{t:number})=>e.t<=5399*1000/30),'All logical events precede the final sampled frame')
assert.ok(manifest.samples.every((s:{nativeDrawCount:number;shapeCount:number})=>s.nativeDrawCount===s.shapeCount))
await writeFile('output/media-validation.json',JSON.stringify({passed:true,codec:video.codec_name,width:video.width,height:video.height,frameRate:video.avg_frame_rate,frames:Number(video.nb_read_frames),durationSeconds:Number(video.duration),audioStreams:0,uniqueOrderedPresentationTimestamps:pts.length,fullDecode:'passed',bytes:Number(media.format.size)},null,2))
console.log('PASS: 1920×1080 · H.264 · 30 FPS · 5,400 frames · exactly 180s · no audio · full decode and all PTS verified')
