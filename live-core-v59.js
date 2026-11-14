/* Address-tail customer extraction and presentation latch. No I/O or writes. */
(function(root){'use strict';
const clean=v=>TDLabelV58.clean(v),phone=TDLabelV58.normalizePhone;
function parse(raw){
 const text=clean(raw).replace(/([^\S\r\n]+)/g,' '),issues=[];
 const address=/(?:收货地址|收件地址|寄送地址|地址|address)\s*[:：]?/ig;let marker,last;while((marker=address.exec(text)))last=marker;
 let tail=last?text.slice(last.index+last[0].length):text;
 tail=tail.split(/\n\s*(?:寄件人|发件人|sender|运单号|快递单号|tracking|分拣码)\s*[:：]/i)[0].trim();
 if(!last&&/(?:收件人|收货人|recipient|consignee|仓库|warehouse)\s*[:：]?/i.test(tail))issues.push('请对准收货地址末尾客户资料，不使用仓库收件人');
 if(/[*×•]|[xX]{3,}/.test(tail))issues.push('号码或姓名有隐藏字符');
 const candidates=[...tail.matchAll(/(?:\+\s*(?:86|95)\s*|0095\s*)?\d[\d ()-]{6,19}\d/g)].map(m=>({raw:m[0],index:m.index,phone:phone(m[0])})).filter(m=>m.phone);
 const c=candidates.at(-1);let name='';
 if(c){
  const after=tail.slice(c.index+c.raw.length).trim();if(after&&!/^[，,;；。.\s]*$/.test(after))issues.push('客户电话必须位于地址资料末尾');
  let before=tail.slice(0,c.index).trim().replace(/(?:手机(?:号码|号)?|电话|phone|tel)\s*[:：]?\s*$/i,'').trim();
  const explicit=/(?:客户(?:姓名)?|末尾客户|customer|client)\s*[:：]?\s*([^:：,，;；|/\n]{2,60})$/i.exec(before);
  if(explicit)name=explicit[1].trim();else{
   let segment=before.split(/[,，;；|/\n]/).at(-1).trim().replace(/[-:：]+$/,'').trim();
   if(/^[\p{Script=Han}·]{2,12}$/u.test(segment))name=segment;
   else if(/^[A-Za-z][A-Za-z .'-]{1,59}$/.test(segment))name=segment;
   else {const end=/(?:^|\s)([\p{Script=Han}·]{2,12})$/u.exec(segment);if(end)name=end[1];}
  }
  if(!/^(?:[\p{Script=Han}·]{2,12}|[A-Za-z][A-Za-z .'-]{1,59})$/u.test(name)||/(?:省|地址|仓库|物流|收件|收货|街道|号楼|大厦|园区|warehouse|recipient|road|street)/i.test(name))name='';
 }else issues.push('未找到完整中国或缅甸手机号码');
 if(!name)issues.push('末尾客户姓名不明确，请手动核对');
 if(text.length>10000)issues.push('识别区域过大');
 return {name,phone:c?.phone||'',phone_raw:c?.raw||'',issues,eligible:issues.length===0,key:name&&c?name+'|'+c.phone:'',canonical:tail.normalize('NFKC').toUpperCase().replace(/[^\p{L}\d+]/gu,'')};
}
class Gate{
 constructor(){this.locked=false;this.last='';this.count=0;this.since=0;this.at=0;this.clear=0;this.seen=new Set();}
 observe(p,e,now){
  if(this.locked){if(!p.eligible){this.clear++;if(this.clear>=3){this.locked=false;this.count=0;this.last='';this.clear=0}}else this.clear=0;return {state:'remove'};}
  if(!p.eligible||!Number.isFinite(e.confidence)||e.confidence<95||!Number.isFinite(e.minConfidence)||e.minConfidence<90){this.count=0;this.last='';return {state:'review'};}
  if(this.last!==p.key||now-this.at>7000){this.count=0;this.since=now;this.last=p.key}this.at=now;this.count++;
  return {state:this.count>=3&&now-this.since>=1200?(this.seen.has(p.key)?'distinct':'ready'):'stabilizing',count:this.count};
 }
 committed(key){this.seen.add(key);this.locked=true;this.clear=0;this.count=0;}
}
root.TDLiveV59={parse,Gate};if(typeof module!=='undefined')module.exports=root.TDLiveV59;
})(globalThis);
