import font from './hershey.json'
export interface Point {x:number;y:number;z:number}
export interface InkPath {points:Point[];color:'black'|'blue'|'red'|'green'|'orange'|'grey';scale:number}
const special:Record<string,string>={
  '×':'M3,4 L19,20 M19,4 L3,20',
  'Σ':'M22,1 L1,1 12,11 1,22 22,22',
  '↔':'M1,12 L23,12 M17,6 L23,12 17,18 M7,6 L1,12 7,18',
  '∫':'M16,0 L13,-1 10,0 8,3 7,8 6,16 5,24 3,28 0,29 -3,27',
  '→':'M1,12 L23,12 M17,6 L23,12 17,18',
  'Δ':'M11,1 L1,22 21,22 11,1',
  '≠':'M2,9 L22,9 M2,16 L22,16 M17,2 L7,23',
  '∞':'M12,12 L9,7 5,6 1,8 0,12 2,16 6,17 10,14 15,8 19,6 23,8 24,12 22,16 18,17 14,14 12,12',
}
/** Public-domain Hershey single-line glyphs, decoded into pen-down subpaths.
 * Font data is geometry only: no text shape, DOM text, or raster tracing. */
export function lettering(text:string,x:number,y:number,height=40,color:InkPath['color']='black'):InkPath[]{
  const out:InkPath[]=[]
  let cursor=x
  let superNext=false
  for(const ch of text){
    if(ch==='^'){superNext=true;continue}
    if(ch===' '){cursor+=height*.45;continue}
    const glyph=font.chars[ch.charCodeAt(0)-33]
    const d=special[ch]??glyph?.d
    if(!d) throw Error(`No vector glyph for ${ch}`)
    const h=superNext?height*.6:height, s=h/21, offset=superNext?-height*.40:0
    for(const segment of d.split('M').filter(Boolean)){
      const nums=segment.replace(/L/g,' ').match(/-?\d+(?:\.\d+)?/g)!.map(Number)
      const points:Point[]=[]
      for(let i=0;i<nums.length;i+=2)points.push({x:cursor+nums[i]*s,y:y+(nums[i+1]-1)*s+offset,z:.55})
      out.push({points:resample(points),color,scale:height>45?1.15:.85})
    }
    cursor+=(special[ch]?26:glyph.o*2+2)*s
    superNext=false
  }
  return out
}
export function length(points:Point[]){let sum=0;for(let i=1;i<points.length;i++)sum+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);return sum}
export function resample(input:Point[]):Point[]{
  const out:Point[]=[input[0]]
  for(let i=1;i<input.length;i++){
    const a=input[i-1],b=input[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2.5))
    for(let j=1;j<=n;j++){const f=j/n;out.push({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:.52+.12*Math.sin((out.length+1)*.09)})}
  }
  if(out.length===1)out.push({...out[0],x:out[0].x+.15})
  return out
}
export function prefix(points:Point[],fraction:number):Point[]{
  if(fraction>=1)return points
  const target=length(points)*Math.max(0,fraction)
  let travelled=0
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],d=Math.hypot(b.x-a.x,b.y-a.y)
    if(travelled+d>=target){const f=(target-travelled)/(d||1);return [...points.slice(0,i),{x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:a.z+(b.z-a.z)*f}]}
    travelled+=d
  }
  return points
}
export function path(coords:number[][],color:InkPath['color']='black',scale=.85):InkPath{return{points:resample(coords.map(([x,y])=>({x,y,z:.55}))),color,scale}}
