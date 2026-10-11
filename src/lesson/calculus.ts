import { b64Vecs, createShapeId, type Editor, type TLDrawShape, type TLShapeId } from 'tldraw'
import { Recorder } from '../engine/recorder'
import { lettering, length, path, prefix, type InkPath } from './paths'
import type { Recording } from '../engine/schema'
interface Task {t:number;order:number;run:()=>void}

/** Author a lesson through the real editor; record each supported create/update/delete.
 * A virtual monotonic clock makes generation reproducible and independent of RAF. */
export function createCalculusLesson(editor:Editor):Recording{
  editor.selectNone()
  editor.deleteShapes([...editor.getCurrentPageShapeIds()])
  editor.setCamera({x:0,y:0,z:1.2},{immediate:true,force:true})
  editor.setCurrentTool('draw')
  let now=0, order=0,serial=0
  const recorder=new Recorder(editor,()=>now,'generated')
  recorder.recording.viewport={width:1920,height:1080}
  recorder.recording.metadata={title:'Kalkulus: perubahan dan akumulasi',language:'id',origin:'generated',generatedBy:'Hershey vector pen author / native tldraw SDK',chapters:[
    {t:0,title:'Apa itu kalkulus?'},{t:20000,title:'Dari sekan ke tangen'},{t:62000,title:'Turunan dari definisi'},
    {t:98000,title:'Contoh turunan'},{t:115000,title:'Menghapus papan'},{t:121000,title:'Integral sebagai akumulasi'},
    {t:158000,title:'Contoh integral'},{t:173000,title:'Ringkasan'},
  ]}
  const tasks:Task[]=[]
  const at=(t:number,run:()=>void)=>tasks.push({t,run,order:order++})
  const regions=new Map<number,TLShapeId[]>()
  function write(paths:InkPath[],start:number,duration:number,region:number){
    const weights=paths.map(p=>Math.max(12,length(p.points)))
    const total=weights.reduce((a,b)=>a+b,0)
    let cursor=start
    const ids:TLShapeId[]=[]
    paths.forEach((p,j)=>{
      const id=createShapeId(`lesson-${serial++}`), first=p.points[0]
      ids.push(id)
      const d=duration*weights[j]/total, ink=d*.86
      const local=p.points.map(q=>({...q,x:q.x-first.x,y:q.y-first.y}))
      at(cursor,()=>editor.createShape<TLDrawShape>({id,type:'draw',x:region+first.x,y:first.y,meta:{origin:'generated',generator:'vector-pen',region},props:{color:p.color,fill:'none',dash:'draw',size:'s',isPen:true,isComplete:false,isClosed:false,scale:p.scale,segments:[{type:'free',path:b64Vecs.encodePoints(prefix(local,0))}]}}))
      const steps=Math.max(1,Math.ceil(ink/(1000/60)))
      for(let k=1;k<=steps;k++)at(cursor+ink*k/steps,()=>editor.updateShape<TLDrawShape>({id,type:'draw',props:{segments:[{type:'free',path:b64Vecs.encodePoints(prefix(local,k/steps))}],isComplete:k===steps}}))
      cursor+=d
    })
    regions.set(region,[...(regions.get(region)??[]),...ids])
    return ids
  }
  function text(s:string,x:number,y:number,t:number,d:number,region=0,h=40,color:InkPath['color']='black'){return write(lettering(s,x,y,h,color),t,d,region)}
  function ink(coords:number[][],t:number,d:number,region=0,color:InkPath['color']='black',scale=.85){return write([path(coords,color,scale)],t,d,region)[0]}
  function camera(t:number,duration:number,region:number,z=1.2,offsetX=0,offsetY=0){
    at(t,()=>recorder.cameraKey({...editor.getCamera()},'hold'))
    at(t+duration,()=>recorder.cameraKey({x:-region+offsetX,y:offsetY,z},'smooth'))
  }
  function underline(x:number,y:number,w:number,t:number,region=0,color:InkPath['color']='blue'){ink([[x,y],[x+w,y-1]],t,450,region,color)}
  function arrow(x:number,y:number,w:number,t:number,region=0,color:InkPath['color']='blue'){
    ink([[x,y],[x+w,y]],t,350,region,color)
    ink([[x+w-12,y-10],[x+w,y],[x+w-12,y+10]],t+350,220,region,color)
  }
  // 00:00–00:20. Two questions, connected by a visual rate/area contrast.
  text('KALKULUS',100,80,0,2700,0,64,'blue')
  text('Perubahan dan akumulasi',100,177,3200,4200,0,44)
  underline(100,243,1100,7700)
  text('1. Laju perubahan?',100,325,8500,3100,0,42)
  arrow(780,350,70,11700)
  text('TURUNAN',920,325,12400,1600,0,46,'red')
  text('2. Total terkumpul?',100,490,14000,2800,0,42)
  arrow(780,515,70,16900)
  text('INTEGRAL',920,490,17500,1600,0,46,'green')

  camera(20000,2200,1800)
  // 00:22–01:02. Native coordinate axes and parabola, two moving points.
  const R=1800
  text('LAJU PERUBAHAN',90,65,22200,2600,R,50,'blue')
  text('y = x^2',1150,86,25200,1400,R,48,'blue')
  ink([[105,670],[785,670],[770,660],[785,670],[770,680]],27000,900,R)
  ink([[310,760],[310,190],[300,205],[310,190],[320,205]],28000,950,R)
  text('x',795,648,29000,300,R,32)
  text('y',275,155,29400,300,R,32)
  text('0',277,686,29750,250,R,28)
  for(let x=-1;x<=3;x++){if(x===0)continue;ink([[310+x*150,663],[310+x*150,677]],30000+(x+1)*140,100,R);text(String(x),297+x*150,694,30600+(x+1)*130,160,R,26)}
  const curve=Array.from({length:240},(_,i)=>{const x=-1.85+i*4.4/239;return[310+150*x,670-70*x*x]})
  ink(curve,31600,2300,R,'blue',1.15)
  text('Dua titik: laju rata-rata',875,245,34500,2400,R,32)
  const dot=(x:number,y:number,color:InkPath['color'],t:number)=>ink(Array.from({length:30},(_,i)=>[x+5*Math.cos(i/29*Math.PI*2),y+5*Math.sin(i/29*Math.PI*2)]),t,170,R,color,1.6)
  dot(460,600,'red',37200)
  text('P(1,1)',400,548,37400,650,R,28,'red')
  const qdot=dot(685,232.5,'orange',38300)
  const qlabel=text('Q',705,212,38500,230,R,30,'orange')
  function secant(q:number){return [.3,Math.max(2.3,q+.25)].map(x=>[310+150*x,670-70*(1+(1+q)*(x-1))])}
  const sec=ink(secant(2.5),39000,900,R,'orange',1.1)
  text('m = (q^2 - 1)/(q - 1)',875,325,40500,2300,R,34,'orange')
  text('  = q + 1',875,387,43200,1200,R,38,'orange')
  text('Q mendekati P',875,478,44900,1600,R,38)
  text('q → 1',875,545,46900,950,R,42,'red')
  // Move the same native records: no redraw-as-image or slideshow.
  camera(45000,1800,R,1.15,35,20)
  camera(60000,1500,R)
  const qlabelInitial=new Map<TLShapeId,{x:number;y:number}>()
  at(47900,()=>qlabel.forEach(id=>{const s=editor.getShape(id)!;qlabelInitial.set(id,{x:s.x,y:s.y})}))
  for(let i=0;i<=240;i++)at(48000+i*7000/240,()=>{
    const f=i/240, q=2.5-1.5*(f*f*(3-2*f))
    const pts=path(secant(q)).points
    editor.updateShape<TLDrawShape>({id:sec,type:'draw',x:R+pts[0].x,y:pts[0].y,props:{color:i===240?'red':'orange',segments:[{type:'free',path:b64Vecs.encodePoints(pts.map(p=>({...p,x:p.x-pts[0].x,y:p.y-pts[0].y})))}]}})
    editor.updateShape({id:qdot,type:'draw',x:R+310+150*q+5,y:670-70*q*q})
    for(const id of qlabel){const shape=editor.getShape(id);if(shape)editor.updateShape({id,type:'draw',x:qlabelInitial.get(id)!.x+150*(q-2.5),y:qlabelInitial.get(id)!.y-70*(q*q-6.25)})}
  })
  at(55100,()=>editor.deleteShapes(qlabel))
  text('Sekan → tangen',875,625,55300,1500,R,38,'red')
  text('Di x=1: laju = 2',875,706,57400,2000,R,38,'red')
  camera(62000,2000,3600)
  // 01:04–01:38. Correct difference quotient, one algebra step at a time.
  const D=3600
  text('TURUNAN DARI DEFINISI',90,65,64000,2500,D,48,'blue')
  text('f(x) = x^2',95,158,67000,1500,D,44)
  text("f'(x) = lim",95,286,69200,1700,D,44)
  text('h → 0',304,336,71000,900,D,28)
  text('(x+h)^2 - x^2',620,262,72400,2400,D,44)
  ink([[590,323],[1060,323]],75000,400,D)
  text('h',797,349,75500,400,D,42)
  text('h ≠ 0',1200,321,76000,800,D,32,'grey')
  text('Kembangkan:',95,432,77400,1600,D,34)
  text('x^2 + 2xh + h^2 - x^2',615,434,79400,2500,D,42)
  ink([[590,495],[1190,495]],82100,350,D)
  text('h',855,516,82600,350,D,40)
  text('= 2x + h',615,591,84100,1300,D,44)
  text('h → 0',1120,591,86100,900,D,36,'red')
  arrow(950,620,110,87100,D,'red')
  text("f'(x) = 2x",615,718,88300,1800,D,52,'red')
  underline(615,788,480,90500,D,'red')
  text('Turunan memberi kemiringan tangen.',95,833,91600,2400,D,32)
  // Camera gently shifts down/right to the adjacent example area.
  camera(98000,1500,D+1700)
  const E=D+1700
  text('CONTOH TURUNAN',95,100,99500,2100,E,50,'blue')
  text('f(x) = x^2 + 3x',95,235,102000,2400,E,50)
  text("f'(x) = 2x + 3",95,373,104900,2400,E,50,'red')
  text('Pada x = 2:',95,502,107800,1200,E,40)
  text("f'(2) = 2(2) + 3 = 7",95,598,109400,2500,E,50,'red')
  text('Artinya: laju sesaat adalah 7.',95,742,112000,2300,E,36)
  // 01:55–02:01. Eraser sweep deletes actual shapes left-to-right, row-by-row.
  at(115000,()=>{editor.setCurrentTool('eraser');editor.selectNone()})
  const erased=regions.get(E)??[]
  const ranks=new Map<TLShapeId,number>()
  // Read coordinates when erasing, retaining stroke metadata and native eraser result.
  at(115050,()=>{
    const sorted=erased.map(id=>editor.getShape(id)!).filter(Boolean).sort((a,b)=>Math.floor(a.y/95)-Math.floor(b.y/95)||a.x-b.x)
    sorted.forEach((s,i)=>ranks.set(s.id,i))
  })
  for(let i=0;i<erased.length;i++)at(115100+i/Math.max(1,erased.length-1)*4400,()=>{
    const id=[...ranks].find(([,rank])=>rank===i)?.[0]
    if(id)editor.deleteShapes([id])
  })
  at(120000,()=>editor.setCurrentTool('draw'))
  camera(121000,2000,7200)
  // 02:03–02:38. Accumulation graph, rectangles refined, then hatched area.
  const I=7200
  text('INTEGRAL = AKUMULASI',90,65,123000,2500,I,48,'green')
  text('Jumlah bagian kecil → total',90,158,126000,2000,I,38)
  ink([[140,700],[800,700],[785,690],[800,700],[785,710]],128600,700,I)
  ink([[230,740],[230,265],[220,280],[230,265],[240,280]],129450,750,I)
  text('x',810,680,130400,250,I,30)
  text('y',190,235,130750,250,I,30)
  const line=Array.from({length:120},(_,i)=>{const x=i*2.45/119;return[230+200*x,700-160*x]})
  ink(line,131200,1500,I,'blue',1.15)
  text('y = x',485,272,133000,750,I,40,'blue')
  text('0',210,723,133900,230,I,30)
  text('1',416,723,134200,230,I,30)
  text('2',615,723,134500,230,I,30)
  text('Luas di bawah kurva',885,280,135000,1900,I,36)
  text('dari x=0 sampai x=2',885,345,137200,1800,I,36)
  const rectangles:TLShapeId[]=[]
  for(let j=0;j<4;j++)rectangles.push(ink([[230+j*100,700],[230+j*100,700-j*.5*160],[230+(j+1)*100,700-j*.5*160],[230+(j+1)*100,700]],139400+j*400,350,I,'orange'))
  text('Persegi panjang:',885,440,141200,1600,I,36,'orange')
  text('Σ f(x) Δx',885,504,143000,1300,I,42,'orange')
  // Σ is added below to the vector glyph table.
  for(let j=0;j<4;j++)at(144700+j*90,()=>editor.deleteShapes([rectangles[j]]))
  const fineRects:TLShapeId[]=[]
  for(let j=0;j<12;j++){const a=j/6,b=(j+1)/6;fineRects.push(ink([[230+200*a,700],[230+200*a,700-160*a],[230+200*b,700-160*a],[230+200*b,700]],145100+j*150,140,I,'orange',.65))}
  text('Δx → 0',885,580,147400,1000,I,42,'green')
  at(148700,()=>editor.deleteShapes(fineRects))
  const areaPaths:InkPath[]=[]
  for(let j=1;j<29;j++){const x=j*2/29;areaPaths.push(path([[230+200*x,700],[230+200*x,700-160*x]],'green',.6))}
  write(areaPaths,148900,2400,I)
  text('∫ x dx',885,670,152000,1400,I,50,'green')
  text('2',867,641,153600,200,I,26,'green')
  text('0',855,728,153900,200,I,26,'green')
  text('Batas integral menentukan daerah.',90,828,154400,2300,I,32)
  // 02:38–02:53. Pan to the calculation beside the graph.
  camera(158000,1500,I+1700)
  const J=I+1700
  text('CONTOH INTEGRAL',95,90,159500,1800,J,50,'green')
  text('∫ x dx = [x^2/2]',150,240,161700,2500,J,52)
  text('2',133,213,164250,200,J,28)
  text('0',121,300,164500,200,J,28)
  text('2',825,213,164750,200,J,28)
  text('0',825,300,165000,200,J,28)
  text('= 2^2/2 - 0^2/2 = 2',365,405,165300,2200,J,48,'green')
  text('Cek: luas segitiga',95,568,168000,1600,J,38)
  text('A = (1/2) × 2 × 2 = 2',95,651,170000,1900,J,44,'green')
  // 02:53–03:00. Concise visual summary; all strokes visible by 178.8s.
  camera(173000,1100,10600)
  const S=10600
  text('DUA IDE UTAMA',95,110,174100,1100,S,54,'blue')
  text('TURUNAN → laju sesaat',95,335,175350,1800,S,48,'red')
  text('INTEGRAL → akumulasi',95,545,177350,1800,S,48,'green')
  tasks.sort((a,b)=>a.t-b.t||a.order-b.order)
  for(const task of tasks){now=task.t;editor.run(task.run,{history:'ignore'})}
  now=180000
  return recorder.stop(180000)
}
