/* V58: conservative label-text parser. Pure functions; never writes customer or parcel data. */
(function(root){
'use strict';
function clean(v){return String(v??'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim()}
function parseLabel(raw){
 const text=clean(raw),lines=text.split(/\r?\n/).map(clean).filter(Boolean);
 const codes=[...text.matchAll(/(?:运单号|快递单号|单号|waybill|tracking)\s*[:：#]?\s*([A-Z0-9-]{8,40})/gi)].map(m=>m[1].toUpperCase());
 const numeric=lines.filter(x=>/^\d{12,20}$/.test(x));
 const tracking=[...new Set([...codes,...numeric])];
 const phoneMatches=[...text.matchAll(/(?:电话|手机|联系电话|收件电话|tel|phone)\s*[:：]?\s*(\+?\d[\d\s-]{6,20})/gi)].map(m=>m[1].replace(/[\s-]/g,''));
 const names=[...text.matchAll(/(?:收件人|收货人|客户姓名|姓名)\s*[:：]\s*([^\n,，]{1,35})/g)].map(m=>clean(m[1]));
 const phone=[...new Set(phoneMatches)].filter(x=>/^\+?\d{8,15}$/.test(x));
 const name=[...new Set(names)].filter(x=>x.length>=2&&x.length<=30);
 const carrier=/中通|ZTO/i.test(text)?'中通':/圆通|YTO/i.test(text)?'圆通':/韵达|YUNDA/i.test(text)?'韵达':/申通|STO/i.test(text)?'申通':'';
 const issues=[];
 if(tracking.length!==1)issues.push('运单号缺失或存在多个候选');
 if(name.length!==1)issues.push('收件人姓名缺失或不唯一');
 if(phone.length!==1)issues.push('完整手机号缺失或不唯一');
 if(/\*{2,}|[×X]{3,}/.test(text))issues.push('面单存在隐藏信息，请核对');
 return {tracking_no:tracking.length===1?tracking[0]:'',name:name.length===1?name[0]:'',phone:phone.length===1?phone[0]:'',carrier,issues,eligible_for_auto_intake:issues.length===0};
}
const api={parseLabel};root.TDLabelV58=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
