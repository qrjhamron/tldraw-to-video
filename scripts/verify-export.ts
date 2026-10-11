import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { openStudio } from './browser'
const manifest=JSON.parse(await readFile('output/export-manifest.json','utf8'))
const session=await openStudio()
try{
 const recording=await session.page.evaluate(()=>JSON.stringify(window.studio!.recording))
 assert.equal(createHash('sha256').update(recording).digest('hex'),manifest.recordingSha256)
 const results=[]
 for(const sample of manifest.samples){
  const data=await session.page.evaluate(t=>window.studio!.renderFrame(t),sample.t)
  const actual=createHash('sha256').update(Buffer.from(data.split(',')[1],'base64')).digest('hex')
  assert.equal(actual,sample.sha256,`Final source matches rendered video frame at ${sample.t}ms`)
  results.push({t:sample.t,sha256:actual})
 }
 assert.deepEqual(session.errors,[])
 await writeFile('output/export-reproducibility.json',JSON.stringify({passed:true,verifiedFrames:results.length,recordingSha256:manifest.recordingSha256,frames:results,browserErrors:session.errors},null,2))
 console.log(`PASS: final source reproduces all ${results.length} sampled export frame hashes exactly`)
}finally{await session.close()}
