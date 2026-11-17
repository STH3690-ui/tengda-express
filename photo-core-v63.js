/* V63: generic recipient-suffix parsing, exact preview-to-sensor ROI, bounded fast pass. */
(function(root){'use strict';
 const previousParse=TDPhotoV61.parse,previousEvidence=TDPhotoV61.evidence;
 const normalize=text=>TDLabelV58.clean(text).replace(/[〈《【〔［]/g,'(').replace(/[〉》】〕］]/g,')').replace(/[၀-၉]/g,c=>String(c.charCodeAt(0)-0x1040));
 function parse(raw){
  const text=normalize(raw);const marks=[...text.matchAll(/(?:收货地址|收件地址|送货地址|派送地址|地址|address)\s*[:：]?/ig)].filter(m=>!/(?:寄件|发件|退件|sender)\s*$/i.test(text.slice(Math.max(0,m.index-12),m.index)));
  let scoped=marks.length?text.slice(marks.at(-1).index+marks.at(-1)[0].length):text;
  if(marks.length)scoped=scoped.split(/\n\s*(?:寄件人|发件人|寄件地址|发件地址|sender|运单号|快递单号|tracking|分拣码|商品|物品|签收)\s*[:：]/i)[0].trim();
  const brackets=[...scoped.matchAll(/\(([^()]*)\)/g)].filter(m=>/[\dOo〇零Il]{6}/.test(m[1].replace(/[\s+\-]/g,'')));
  const last=brackets.at(-1),prefix=last?scoped.slice(0,last.index):'',after=last?scoped.slice(last.index+last[0].length):'';
  const addressContext=(prefix.match(/(?:省|市|区|街道|路|物流城|园区|号)/g)||[]).length>=2;
  const forbiddenPrefix=/(?:寄件|发件|sender|运单|tracking|waybill)/i.test(prefix);
  const following=after.split(/\r?\n/).slice(1).join('\n').trim(),routing=/^\s*[A-Z=]{0,4}[-\s]?\d{1,5}\s+\d{7,20}\s+[\p{Script=Han}]{1,12}(?:省|市|县|区|州|镇)\s*$/u.test(following),followingSafe=!following||((marks.length||addressContext)&&routing);
  const canScope=followingSafe&&last&&/^[\s,，;；。.\-—]*$/.test(after.split(/\r?\n/)[0])&&(marks.length||addressContext||!/(?:寄件|发件|sender|运单|tracking|仓库|warehouse)/i.test(prefix))&&!forbiddenPrefix;

  const result=previousParse(canScope?last[0]:scoped);
  if(brackets.length>1){result.issues.push('有多个客户附加号码，请人工核对');result.eligible=false}
  if(result.phone&&!/^(?:09\d{7,9}|1[3-9]\d{9})$/.test(result.phone)){result.issues.push('仅支持完整的中国或缅甸手机号码');result.eligible=false}
  // A sender-only address must never become a customer merely because it contains parentheses.
  if(!marks.length&&/(?:寄件|发件|sender)/i.test(text)){result.issues.push('不能使用寄件人资料');result.eligible=false}
  if(result.issues.some(x=>/寄件人|多个客户附加|虚拟或转接/.test(x))||(!result.name&&/(?:仓库|warehouse|运单|tracking|waybill)/i.test(scoped))){result.name='';result.phone='';result.eligible=false}
  return result;
 }
 function region(w,h,viewport,guide,previewW=w,previewH=h){
  if(![w,h,viewport?.width,viewport?.height,guide?.width,guide?.height,previewW,previewH].every(x=>Number.isFinite(x)&&x>0))throw Error('取景框尺寸无效，请重新打开相机');
  const sensorW=Math.min(w,h*previewW/previewH),sensorH=Math.min(h,w*previewH/previewW),sx=(w-sensorW)/2,sy=(h-sensorH)/2;
  const scale=Math.max(viewport.width/previewW,viewport.height/previewH),dx=(viewport.width-previewW*scale)/2,dy=(viewport.height-previewH*scale)/2;
  const x=sx+(guide.left-viewport.left-dx)/(scale*previewW)*sensorW,y=sy+(guide.top-viewport.top-dy)/(scale*previewH)*sensorH;
  const right=Math.min(w,x+guide.width/(scale*previewW)*sensorW),bottom=Math.min(h,y+guide.height/(scale*previewH)*sensorH),left=Math.max(0,x),top=Math.max(0,y);
  if(right<=left||bottom<=top)throw Error('识别框超出相机画面');return {x:left,y:top,w:right-left,h:bottom-top};
 }
 function fastAccept(read){const p=read?.parsed,e=read?.evidence;return !!(p?.eligible&&!p.corrected&&p.name&&p.phone&&Number.isFinite(e?.confidence)&&e.confidence>=90&&e.confidence<=100&&Number.isFinite(e?.minConfidence)&&e.minConfidence>=85&&e.minConfidence<=100)}
 function prepare(source,variant){
  if(variant!=='raw')return TDPhotoV61.prepare(source,variant,source.tdTextHeight?{scale:48/source.tdTextHeight}:{});
  // No unconditional upscaling or full-image deskew probe on the fast path.
  const scale=Math.min(1,1920/source.width,1400/source.height);if(scale===1)return {canvas:source,angle:0,variant,owned:false};const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);return {canvas,angle:0,variant};
 }
 function verificationRegion(result,parsed,canvas,source){
  if(!parsed.eligible||TDPhotoV61.evidence(result,parsed).confidence<=0)return null;const letters=s=>normalize(s).replace(/[^\p{L}]/gu,'').toUpperCase(),name=letters(parsed.name),phone=parsed.phone;
  const words=(result.words||[]).filter(w=>{const l=letters(w.text),d=normalize(w.text).replace(/\D/g,'');return w.bbox&&(l&&(name.includes(l)||l.endsWith(name))||d.length>=4&&(phone.includes(d)||d.endsWith(phone)))&&[w.bbox.x0,w.bbox.y0,w.bbox.x1,w.bbox.y1].every(Number.isFinite)});
  if(!words.length)return null;const x0=Math.min(...words.map(w=>w.bbox.x0)),y0=Math.min(...words.map(w=>w.bbox.y0)),x1=Math.max(...words.map(w=>w.bbox.x1)),y1=Math.max(...words.map(w=>w.bbox.y1)),pad=Math.max(8,(y1-y0)*.35),sx=source.width/canvas.width,sy=source.height/canvas.height;
  const x=Math.max(0,(x0-pad)*sx),y=Math.max(0,(y0-pad)*sy),right=Math.min(source.width,(x1+pad)*sx),bottom=Math.min(source.height,(y1+pad)*sy);if(right<=x||bottom<=y)return null;
  const crop=document.createElement('canvas');crop.width=Math.max(1,Math.ceil(right-x));crop.height=Math.max(1,Math.ceil(bottom-y));crop.getContext('2d').drawImage(source,x,y,right-x,bottom-y,0,0,crop.width,crop.height);const heights=words.map(w=>(w.bbox.y1-w.bbox.y0)*sy).filter(h=>h>0).sort((a,b)=>a-b);crop.tdTextHeight=heights[Math.floor(heights.length/2)];return crop;
 }
 TDPhotoV61.evidence=(result,parsed)=>{
  const normalized={...result,words:(result.words||[]).map(w=>({...w,text:normalize(w.text)}))},existing=previousEvidence(normalized,parsed);if(existing.confidence)return existing;
  const letters=s=>String(s||'').replace(/[^\p{L}]/gu,'').toUpperCase(),name=letters(parsed.name),phone=String(parsed.phone_raw||parsed.phone).replace(/\D/g,'');let names='',phones='';const confidences=[];
  for(const word of normalized.words){const l=letters(word.text),d=word.text.replace(/\D/g,'');const a=l&&(name.includes(l)||l.endsWith(name)),b=d.length>=2&&(phone.includes(d)||d.endsWith(phone));if(a)names+=l.endsWith(name)?name:l;if(b)phones+=d.endsWith(phone)?phone:d;if(a||b)confidences.push(Number(word.confidence)||0)}
  if(!name||!phone||!names.includes(name)||!phones.includes(phone)||!confidences.length)return {confidence:0,minConfidence:0};return {confidence:confidences.reduce((a,b)=>a+b,0)/confidences.length,minConfidence:Math.min(...confidences)};
 };
 TDPhotoV61.parse=parse;root.TDPhotoV63={parse,normalize,region,fastAccept,prepare,verificationRegion};if(typeof module!=='undefined')module.exports=root.TDPhotoV63;
})(globalThis);
