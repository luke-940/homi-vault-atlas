/** Offline numeric shoreline fields. Inputs are already-public curated coast geometry. */
import fs from 'node:fs';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const islands=JSON.parse(fs.readFileSync('public/data/islands.json')).islands;
const anchors={rocket:[-8,-4],groot:[6,-1],common:[-7,7],atlas:[2,7]},scales={rocket:.12,groot:.13,common:.12,atlas:.12};
const inside=(x,z,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
const table=Array.from({length:256},(_,i)=>{for(let j=0;j<8;j++)i=i&1?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
const crc=b=>{let c=0xffffffff;for(const x of b)c=table[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc(body),out.length-4);return out;};
// Reversible PNG row filters preserve the 16-bit distance values exactly while
// making the smooth numeric field much smaller on the wire.
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
function filterRows(raw,side){
 const stride=side*4+1,out=Buffer.alloc(raw.length);
 for(let y=0;y<side;y++){
  const offset=y*stride;let bestScore=Infinity,best;
  for(const type of [0,1,2,4]){
   const row=Buffer.alloc(stride);row[0]=type;let score=0;
   for(let x=1;x<stride;x++){
    const a=x>4?raw[offset+x-4]:0,b=y?raw[offset-stride+x]:0,c=y&&x>4?raw[offset-stride+x-4]:0;
    const predictor=type===1?a:type===2?b:type===4?paeth(a,b,c):0;
    const value=(raw[offset+x]-predictor)&255;row[x]=value;score+=Math.min(value,256-value);
   }
   if(score<bestScore){bestScore=score;best=row;}
  }
  best.copy(out,offset);
 }
 return out;
}
fs.mkdirSync('public/assets/shores',{recursive:true});const records=[];
for(const id of ['world',...islands.map(i=>i.id)]){
 const detail=id!=='world',extent=detail?65:35,side=512,rows=Buffer.alloc((side*4+1)*side);
 const shapes=(detail?islands.filter(i=>i.id===id):islands).map(i=>{const s=detail?1:scales[i.id],off=detail?[0,0]:anchors[i.id],tr=p=>[p[0]*s+off[0],p[1]*s+off[1]];return {coast:i.coast.map(tr),exclusion:i.shoreline.dock.pierExclusionXZ.map(tr),s,shore:i.shoreline};});
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){
  const px=((x+.5)/side*2-1)*extent,pz=((y+.5)/side*2-1)*extent;let nearest=24,width=.32,opacity=0,excluded=false;
  for(const shape of shapes){let min=Infinity,seg=0;for(let i=0;i<shape.coast.length;i++){const a=shape.coast[i],b=shape.coast[(i+1)%shape.coast.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((px-a[0])*dx+(pz-a[1])*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(px-a[0]-t*dx,pz-a[1]-t*dz);if(d<min){min=d;seg=i;}}
   const d=min*(inside(px,pz,shape.coast)?-1:1);if(d<nearest){nearest=d;const o=shape.shore.segmentOverrides.find(v=>v.index===seg);width=(o?.foamWidth??shape.shore.foam.widthByProfile[shape.shore.defaultProfile])*shape.s;opacity=o?.foamOpacity??shape.shore.foam.opacityByProfile[shape.shore.defaultProfile];}if(inside(px,pz,shape.exclusion))excluded=true;
  }
  const v=Math.round(Math.max(0,Math.min(1,(nearest+8)/32))*65535),o=y*(side*4+1)+1+x*4;
  rows[o]=v>>8;rows[o+1]=v&255;rows[o+2]=Math.round(Math.min(1,width/.5)*255);rows[o+3]=excluded?0:Math.round(opacity*255);
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(side);ihdr.writeUInt32BE(side,4);ihdr[8]=8;ihdr[9]=6;
 const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(filterRows(rows,side),{level:9})),chunk('IEND',Buffer.alloc(0))]);
 const file=`assets/shores/${id}.png`;fs.writeFileSync('public/'+file,png);records.push({id,file,bytes:png.length,sha256:createHash('sha256').update(png).digest('hex'),extent,side});
}
console.log(JSON.stringify(records,null,2));
