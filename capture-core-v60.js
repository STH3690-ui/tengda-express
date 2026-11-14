/* Pure frozen-label parsing and image quality/stability measurements. */
(function(root){'use strict';
const clean=v=>TDLabelV58.clean(v),normalizePhone=TDLabelV58.normalizePhone;
function parse(raw){
 const text=clean(raw).replace(/[‐‑‒–—]/g,'-').replace(/[^\S\r\n]+/g,' '),issues=[];
 const marks=[...text.matchAll(/(?:收货地址|收件地址|寄送地址|地址|address)\s*[:：]?/ig)];let tail=marks.length?text.slice(marks.at(-1).index+marks.at(-1)[0].length):text;
 tail=tail.split(/\n\s*(?:寄件人|发件人|sender|运单号|快递单号|tracking|分拣码)\s*[:：]/i)[0].trim();
 if(!marks.length&&/(?:收件人|收货人|recipient|consignee|仓库|warehouse|寄件人|发件人|sender|运单号|快递单号|tracking|waybill)/i.test(tail))issues.push('请使用收货地址末尾客户资料，不能使用仓库或寄件人');
 if(/[*×•]|[xX]{3,}/.test(tail))issues.push('有隐藏号码或姓名');
 // Brackets around both fields are useful scope boundaries, never a reason to use a warehouse phone.
 const brackets=[...tail.matchAll(/\(([^()]*)\)/g)].filter(m=>/\d{3}/.test(m[1]));
 if(brackets.length&&/^[\s,，;；。.]*$/.test(tail.slice(brackets.at(-1).index+brackets.at(-1)[0].length))){const b=brackets.at(-1);const start=b[1].search(/\d|[Oo](?=9)/),prefix=b[1].slice(0,start).replace(/(?:联系电话|手机(?:号码|号)?|电话|phone|tel)\s*[:：]?\s*$/i,'');if(/[\p{L}]/u.test(prefix))tail=b[1].trim();}
 const hits=[...tail.matchAll(/(?:\+\s*(?:86|95)\s*|0095\s*)?(?:\d|[Oo〇零](?=9)|[Il](?=[3-9]))[\dOo〇零IlISBZ| ()\r\n-]{6,24}[\dOo〇零IlISBZ]/g)];
 const candidates=hits.map(m=>{const mapped=m[0].replace(/[Oo〇零]/g,'0').replace(/[IlI|]/g,'1').replace(/S/g,'5').replace(/B/g,'8').replace(/Z/g,'2');return {raw:m[0],index:m.index,phone:normalizePhone(mapped),corrected:mapped!==m[0]}}).filter(m=>m.phone&&m.raw.replace(/\D/g,'').length>=6);
 const c=candidates.at(-1);let name='';
 if(c){
  const after=tail.slice(c.index+c.raw.length).trim();if(after&&!/^[)\]，,;；。.\s]*$/.test(after))issues.push('电话后还有其他号码、分机或文字，需核对');
  let before=tail.slice(0,c.index).trim().replace(/(?:联系电话|收件电话|手机(?:号码|号)?|电话|phone|tel)\s*[:：]?\s*[([]?\s*$/i,'').replace(/[()\[\]]/g,' ').trim();
  const explicit=/(?:客户(?:姓名)?|姓名|customer(?:\s*name)?|client|name)\s*[:：]?\s*([^:：,，;；|/]{2,80})$/i.exec(before);
  if(explicit)name=explicit[1].trim();else{
   const pieces=before.split(/[,，;；|/]/);let segment=pieces.at(-1).trim();const lines=segment.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);let addressLine=-1;for(let i=0;i<lines.length;i++)if(/(?:[0-9]|省|地址|仓|物流|园区|road|street|warehouse)/i.test(lines[i]))addressLine=i;if(addressLine>=0&&addressLine<lines.length-1)segment=lines.slice(addressLine+1).join('\n');
   if(/^[\p{Script=Han}·\s]{2,30}$/u.test(segment))name=segment;
   else if(/^[A-Za-z][A-Za-z .'\-\r\n]{1,65}$/.test(segment))name=segment;
   else {const end=/(?:^|[\s\d号楼室栋])([\p{Script=Han}·]{2,12})$/u.exec(segment);if(end)name=end[1];else {const line=segment.split(/\r?\n/).filter(Boolean).at(-1)||'';if(/^[A-Za-z][A-Za-z .'-]{1,59}$/.test(line))name=line;}}
  }
  if(/^[\p{Script=Han}·\s]+$/u.test(name))name=name.replace(/\s/g,'');else name=name.replace(/\s+/g,' ');
  if(!/^(?:[\p{Script=Han}·]{2,12}|[A-Za-z][A-Za-z .'-]{1,59})$/u.test(name)||/(?:省|地址|仓|寄件|发件|收件|收货|运单|单号|快递|编号|邮编|物流|街道|号楼|大厦|园区|warehouse|recipient|sender|road|street)/i.test(name))name='';
  if(/^(?:name|customer|client|客户|姓名|电话|手机|联系电话|phone|tel)$/i.test(name))name='';
  if(c.corrected)issues.push('号码含OCR字符纠错，请人工核对，不能自动提交');
  if(/^(?:1(?:62|65|67|70|71))/.test(c.phone)||/(?:虚拟|隐私号|转接|分机|转\s*\d)/.test(tail))issues.push('疑似虚拟或转接号码，请人工核对');
 }else issues.push('没有完整的中国或缅甸手机号码');
 if(!name)issues.push('末尾客户姓名不明确');
 if(candidates.length>1)issues.push('冻结区域中有多个完整号码，请人工核对');
 if((tail.match(/(?:^|[\n,，;；|])\s*(?:客户(?:姓名)?|customer(?:\s*name)?|client)\s*[:：]/gi)||[]).length>1)issues.push('存在多个客户标签');
 if(text.length>10000)issues.push('文字过多，请缩小到地址末尾');
 return {name,phone:c?.phone||'',phone_raw:c?.raw||'',corrected:!!c?.corrected,issues,eligible:!issues.length,key:name&&c?name+'|'+c.phone:'',canonical:tail.toUpperCase().replace(/[^\p{L}\d+]/gu,'')};
}
function measure(image){
 const {data,width:w,height:h}=image,gray=new Uint8Array(w*h);let sum=0,lap=0,lap2=0,n=0;
 for(let i=0;i<gray.length;i++){gray[i]=Math.round(data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114);sum+=gray[i]}
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,v=4*gray[i]-gray[i-1]-gray[i+1]-gray[i-w]-gray[i+w];lap+=v;lap2+=v*v;n++}
 return {gray,brightness:sum/gray.length,sharpness:n?lap2/n-(lap/n)**2:0};
}
class Stability{
 constructor(){this.reset()}
 reset(){this.anchor=null;this.since=null;this.at=null}
 observe(q,now){
  if(q.brightness<65||q.brightness>248||q.sharpness<60){this.reset();return {state:q.brightness<65?'dark':q.brightness>248?'bright':'blur',stable_ms:0}}
  let movement=Infinity;if(this.anchor?.length===q.gray.length){movement=0;for(let i=0;i<q.gray.length;i++)movement+=Math.abs(q.gray[i]-this.anchor[i]);movement/=q.gray.length}
  if(movement>2.2||this.at===null||now-this.at>500){this.anchor=q.gray.slice();this.since=now}this.at=now;
  const stable_ms=now-this.since;return {state:stable_ms>=1000?'ready':'stabilizing',stable_ms,movement};
 }
}
root.TDCaptureV60={parse,measure,Stability};if(typeof module!=='undefined')module.exports=root.TDCaptureV60;
})(globalThis);
