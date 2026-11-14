/* V58: conservative label-text parser. Pure functions; never writes customer or parcel data. */
(function(root){
'use strict';
function clean(v){return String(v??'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim()}
function phoneMatchesPlaceholder(line){return /^(?:09\d{7,11}|\+?95\d{7,12})$/.test(line)}
function parseLabel(raw){
 const text=clean(raw),lines=text.split(/\r?\n/).map(clean).filter(Boolean);
 const codes=[...text.matchAll(/(?:运单号|快递单号|单号|waybill|tracking)\s*[:：#]?\s*([A-Z0-9-]{8,40})/gi)].map(m=>m[1].toUpperCase());
 const numeric=lines.filter(x=>/^\d{12,20}$/.test(x) && !phoneMatchesPlaceholder(x));
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
 if(tracking.length===1 && phone.includes(tracking[0]))issues.push('运单号与手机号相同，请核对');
 if(tracking.length===1 && /^(?:\d{3}[- ]?[A-Z]\d{2}|\d{3}[- ]?[A-Z]\d{2}\s+\d{3})$/i.test(tracking[0]))issues.push('疑似分拣码，不能作为运单号');
 return {tracking_no:tracking.length===1?tracking[0]:'',name:name.length===1?name[0]:'',phone:phone.length===1?phone[0]:'',carrier,issues,eligible_for_auto_intake:issues.length===0};
}
function matchCustomer(customers,parsed){
 if(!parsed.name||!parsed.phone||!Array.isArray(customers))return {status:'review',reason:'姓名、手机号不完整'};
 const samePhone=customers.filter(c=>!c.deleted_at&&clean(c.phone).replace(/[\s-]/g,'')===parsed.phone);
 const exact=samePhone.filter(c=>clean(c.name)===parsed.name);
 if(exact.length===1&&samePhone.length===1)return {status:'matched',customer_id:exact[0].id};
 if(samePhone.length>0)return {status:'review',reason:'手机号对应多个客户或姓名不一致'};
 const sameName=customers.filter(c=>!c.deleted_at&&clean(c.name)===parsed.name);
 if(sameName.length>0)return {status:'review',reason:'同名客户存在，需人工核对手机号'};
 return {status:'new',reason:'未找到客户，可在授权流程中创建'};
}
const api={parseLabel,matchCustomer};root.TDLabelV58=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
