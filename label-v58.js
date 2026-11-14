/* Pure label validation. No network, storage or writes. Server matching is authoritative. */
(function(root){
'use strict';
const clean=v=>String(v??'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim();
function normalizePhone(value){
 let p=clean(value);if(/[^+\d\s()\-]/.test(p))return '';p=p.replace(/[\s()\-]/g,'');
 if(p.startsWith('0095'))p='0'+p.slice(4);else if(p.startsWith('+95'))p='0'+p.slice(3);else if(/^959\d{7,9}$/.test(p))p='0'+p.slice(2);
 if(p.startsWith('+86'))p=p.slice(3);
 return /^(?:09\d{7,9}|1[3-9]\d{9}|\+[1-9]\d{7,14})$/.test(p)?p:'';
}
function parseLabel(raw){
 const text=clean(raw).replace(/([\u3400-\u9fff])[^\S\r\n]+(?=[\u3400-\u9fff])/g,'$1'),lines=text.split(/\r?\n/).map(clean).filter(Boolean),unique=a=>[...new Set(a)];
 const codes=[...text.matchAll(/(?:运单号|快递单号|单号|waybill|tracking(?:\s*(?:no|number))?)\s*[:：#]?\s*([A-Z0-9-]{8,40})(?![A-Z0-9-])/gi)].map(m=>m[1].toUpperCase());
 const numeric=lines.filter(x=>/^\d{12,20}$/.test(x)&&!normalizePhone(x));
 const tracking=unique([...codes,...numeric]);
 const phoneLines=lines.filter(x=>/^(?:收件电话|联系电话|手机号|手机|电话|tel|phone)\s*[:：]?/i.test(x));
 const phone=unique(phoneLines.map(x=>normalizePhone(x.replace(/^(?:收件电话|联系电话|手机号|手机|电话|tel|phone)\s*[:：]?\s*/i,''))).filter(Boolean));
 const name=unique(lines.map(x=>/^(?:收件人|收货人|客户姓名|姓名|recipient|consignee)\s*[:：]\s*(.+)$/i.exec(x)?.[1]).filter(Boolean).map(clean)).filter(x=>x.length>=2&&x.length<=60&&!/[\d<>:*×#]/.test(x));
 const carrier=/中通|ZTO/i.test(text)?'中通':/圆通|YTO/i.test(text)?'圆通':/韵达|YUNDA/i.test(text)?'韵达':/申通|STO/i.test(text)?'申通':'';
 const issues=[];
 if(text.length>10000)issues.push('面单文字过长');
 if(tracking.length!==1)issues.push('运单号缺失或存在多个候选');
 if(name.length!==1)issues.push('收件人姓名缺失或不唯一');
 if(phone.length!==1||phoneLines.length!==1)issues.push('完整手机号缺失或不唯一');
 if(/\*{2,}|[×Xx]{3,}/.test(text))issues.push('面单存在隐藏信息，请核对');
 if(tracking.length===1&&phone.includes(tracking[0]))issues.push('运单号与手机号相同，请核对');
 return {tracking_no:tracking.length===1?tracking[0]:'',name:name.length===1?name[0]:'',phone:phone.length===1?phone[0]:'',carrier,issues,eligible_for_auto_intake:issues.length===0};
}
function matchCustomer(customers,parsed){
 if(!parsed.name||!normalizePhone(parsed.phone)||!Array.isArray(customers))return {status:'review',reason:'姓名、手机号不完整'};
 const all=customers.filter(c=>normalizePhone(c.phone)===normalizePhone(parsed.phone)||clean(c.name)===clean(parsed.name));
 if(all.some(c=>c.deleted_at||c.archived||c.hidden))return {status:'review',reason:'客户已删除或归档，请核对'};
 const exact=all.filter(c=>normalizePhone(c.phone)===normalizePhone(parsed.phone)&&clean(c.name)===clean(parsed.name));
 if(exact.length===1&&all.length===1)return {status:'matched',customer_id:exact[0].id};
 if(all.length)return {status:'review',reason:'同名、同号或多个客户，请人工核对'};
 return {status:'new',reason:'未找到客户；由服务器核对权限后决定是否创建'};
}
function canAutoCommit(parsed,evidence){return !!parsed?.eligible_for_auto_intake&&Number.isFinite(evidence?.confidence)&&evidence.confidence>=97&&evidence.confidence<=100&&Number.isFinite(evidence?.minConfidence)&&evidence.minConfidence>=90&&evidence.minConfidence<=100&&evidence.barcode===parsed.tracking_no&&!evidence.edited;}
const api={clean,normalizePhone,parseLabel,matchCustomer,canAutoCommit};root.TDLabelV58=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
