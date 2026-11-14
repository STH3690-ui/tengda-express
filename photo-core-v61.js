/* Manual-photo parsing, bounded preprocessing and conservative multi-pass agreement. */
(function(root){'use strict';
function parse(raw){const normalized=TDLabelV58.clean(raw).replace(/([\p{L}])\s*\+\s*(?=(?:0[9Oo]|[Oo]9|1[3-9]))/gu,'$1 ');return TDCaptureV60.parse(normalized)}
function region(w,h,ratio){const vw=Math.min(w,h*ratio),vh=Math.min(h,w/ratio);return {x:(w-vw)/2+vw*.05,y:(h-vh)/2+vh*.15,w:vw*.9,h:vh*.7}}
function evidence(result,p){
 const letters=s=>String(s||'').normalize('NFKC').replace(/[^\p{L}]/gu,'').toUpperCase(),name=letters(p.name),digits=String(p.phone_raw||p.phone).replace(/\D/g,'');
 const nw=[],pw=[],selected=[];(result.words||[]).forEach(w=>{const l=letters(w.text),d=String(w.text).replace(/\D/g,'');const a=l&&name.includes(l),b=d.length>=2&&digits.includes(d);if(a)nw.push(l);if(b)pw.push(d);if(a||b)selected.push(Number(w.confidence)||0)});
 if(!name||!digits||!nw.join('').includes(name)||!pw.join('').includes(digits)||!selected.length)return {confidence:0,minConfidence:0};
 return {confidence:selected.reduce((a,b)=>a+b,0)/selected.length,minConfidence:Math.min(...selected)};
}
function select(reads){
 const valid=reads.filter(r=>r.parsed.eligible),key=p=>p.name.toUpperCase().replace(/\s/g,'')+'|'+p.phone,keys=new Set(valid.map(r=>key(r.parsed)));
 const high=valid.filter(r=>r.evidence.confidence>=95&&r.evidence.minConfidence>=90&&!r.parsed.corrected);
 const best=[...(valid.length?valid:reads)].sort((a,b)=>(b.evidence.confidence||0)-(a.evidence.confidence||0))[0];
 return {best,automatic:keys.size===1&&high.length>=2&&new Set(high.map(r=>r.variant)).size>=2,conflict:keys.size>1,agreements:high.length};
}
function estimateAngle(image){
 const {data,width:w,height:h}=image,points=[];let mean=0;for(let i=0;i<data.length;i+=4)mean+=(data[i]*.299+data[i+1]*.587+data[i+2]*.114);mean/=w*h;
 for(let y=1;y<h-1;y+=2)for(let x=1;x<w-1;x+=2){const i=(y*w+x)*4;if(data[i]*.299+data[i+1]*.587+data[i+2]*.114<mean-35)points.push([x-w/2,y-h/2])}
 if(points.length<80)return 0;const scores=[];for(let a=-6;a<=6;a+=.5){const r=a*Math.PI/180,c=Math.cos(r),s=Math.sin(r),bins=new Uint32Array(w+h+4);for(const [x,y] of points){const row=Math.round(y*c-x*s)+(w+h)/2|0;if(row>=0&&row<bins.length)bins[row]++}let score=0;for(let i=0;i<bins.length-1;i++){const n=bins[i]+bins[i+1];score+=n*n;}scores.push({a,score})}
 const zero=scores.find(x=>x.a===0),best=scores.reduce((a,b)=>a.score>b.score?a:b);return best.score>zero.score*1.025?best.a:0;
}
function prepare(source,variant){
 const probe=document.createElement('canvas'),s=Math.min(1,600/source.width,400/source.height);probe.width=Math.max(1,Math.round(source.width*s));probe.height=Math.max(1,Math.round(source.height*s));const pc=probe.getContext('2d',{willReadFrequently:true});pc.drawImage(source,0,0,probe.width,probe.height);const angle=variant==='raw'?0:estimateAngle(pc.getImageData(0,0,probe.width,probe.height));probe.width=probe.height=1;
 const r=angle*Math.PI/180,c=Math.abs(Math.cos(r)),si=Math.abs(Math.sin(r)),rw=source.width*c+source.height*si,rh=source.height*c+source.width*si,scale=Math.min(2800/rw,2000/rh,Math.max(1,1800/rw));
 const out=document.createElement('canvas');out.width=Math.max(1,Math.round(rw*scale));out.height=Math.max(1,Math.round(rh*scale));const ctx=out.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,out.width,out.height);ctx.save();ctx.translate(out.width/2,out.height/2);ctx.rotate(-r);ctx.scale(scale,scale);ctx.drawImage(source,-source.width/2,-source.height/2);ctx.restore();
 if(variant!=='raw'){
  const im=ctx.getImageData(0,0,out.width,out.height),gray=new Uint8Array(out.width*out.height),hist=new Uint32Array(256);for(let i=0;i<gray.length;i++){gray[i]=Math.round(im.data[i*4]*.299+im.data[i*4+1]*.587+im.data[i*4+2]*.114);hist[gray[i]]++}
  let threshold=128;if(variant==='binary'){let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];let count=0,part=0,variance=-1;for(let i=0;i<255;i++){count+=hist[i];part+=i*hist[i];if(!count||count===gray.length)continue;const d=part/count-(sum-part)/(gray.length-count),v=count*(gray.length-count)*d*d;if(v>variance){variance=v;threshold=i}}}
  const w=out.width;for(let y=0;y<out.height;y++)for(let x=0;x<w;x++){const i=y*w+x,g=gray[i];let v;if(variant==='binary')v=g>threshold?255:0;else {const blur=(gray[i] +(gray[i-1]??g)+(gray[i+1]??g)+(gray[i-w]??g)+(gray[i+w]??g))/5;v=Math.max(0,Math.min(255,(g-128)*1.18+128+(g-blur)*.65))}im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=v}ctx.putImageData(im,0,0);
 }
 return {canvas:out,angle,variant};
}
root.TDPhotoV61={parse,region,evidence,select,estimateAngle,prepare};if(typeof module!=='undefined')module.exports=root.TDPhotoV61;
})(globalThis);
