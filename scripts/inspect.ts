import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
const page=await browser.newPage({viewport:{width:1920,height:1080}})
page.on('pageerror',e=>console.log('BROWSER ERROR',e))
await page.goto('http://localhost:5173/?export=1&generate=1')
await page.waitForFunction(()=>!!window.studio,undefined,{timeout:120000})
console.log(await page.evaluate(()=>({events:window.studio!.recording.events.length,shapes:window.studio!.editor.getCurrentPageShapes().length,first:window.studio!.recording.events[0],last:window.studio!.recording.events.at(-1)})))
await mkdir('output/inspection',{recursive:true})
const recording=await page.evaluate(()=>JSON.stringify(window.studio!.recording))
await writeFile('public/lesson.recording.json',recording)
await writeFile('output/calculus_intro_180s.recording.json',recording)
for(const t of [18000,34000,59000,96000,114500,118000,157000,172500,179500]){
 const frame=await page.evaluate(t=>window.studio!.renderFrame(t),t)
 await writeFile(`output/inspection/${t}.jpg`,Buffer.from(frame.split(',')[1],'base64'))
 console.log('Frame',t)
}
await page.goto('http://localhost:5173/')
await page.waitForFunction(()=>!!window.studio,undefined,{timeout:120000})
await page.evaluate(()=>window.studio!.seek(59000))
await page.screenshot({path:'output/inspection/application.png'})
await browser.close()
