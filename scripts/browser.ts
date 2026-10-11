import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
export async function openStudio(query='?export=1'){
  const base=process.env.STUDIO_URL??'http://localhost:5173'
  let server:ReturnType<typeof spawn>|undefined
  try{await fetch(base)}catch{
    server=spawn('npm',['run','dev'],{stdio:'ignore'})
    let ready=false
    for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));try{await fetch(base);ready=true;break}catch{}}
    if(!ready)throw Error('Vite failed to start')
  }
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1})
  const errors:string[]=[]
  page.on('pageerror',e=>errors.push(String(e)))
  await page.goto(base+query)
  await page.waitForFunction(()=>!!window.studio,undefined,{timeout:120000})
  return{page,browser,errors,close:async()=>{await browser.close();server?.kill()}}
}
