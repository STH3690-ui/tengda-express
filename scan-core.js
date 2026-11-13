/* Shared scanner validation and POS totals. No database access. */
(function(root){
 'use strict';
 function normalize(raw){const v=String(raw??'').normalize('NFKC').trim().toUpperCase();if(!/^[A-Z0-9][A-Z0-9-]{3,63}$/.test(v))throw Error('运单须为4–64位字母、数字或短横线；不接受网址及指令');return v}
 function scaled(value,digits){const text=String(value);if(!new RegExp('^\\d+(?:\\.\\d{1,'+digits+'})?$').test(text))return null;const [whole,part='']=text.split('.');return BigInt(whole)*10n**BigInt(digits)+BigInt(part.padEnd(digits,'0'))}
 function totals(rows,weight,rate,paid){const pieces=rows.reduce((n,x)=>n+Number(x.remaining||0),0),kg=Number(weight),price=Number(rate),received=Number(paid);const grams=scaled(weight,3),cents=scaled(rate,2),paidCents=scaled(paid,2);const amount=grams!==null&&cents!==null?(grams*cents+500n)/1000n:null;const freight=amount===null?0:Number(amount)/100;return {pieces,weight:kg,rate:price,freight,paid:received,due:amount!==null&&paidCents!==null?Number(amount-paidCents)/100:0,valid:rows.length>0&&[kg,price,received].every(Number.isFinite)&&kg>0&&kg<=999999&&price>=0&&price<=999999999&&grams!==null&&cents!==null&&paidCents!==null&&amount<=99999999999999n&&paidCents<=amount}}

 function addPickup(rows,p){if(p.status!=='pending'||Number(p.remaining)<=0)throw Error('该包裹已取件、已删除或不可取件');if(rows.some(x=>x.id===p.id||x.tracking_no===p.tracking_no))throw Error('重复扫描，未重复累计');if(rows.length>=100)throw Error('每次最多100个运单');if(rows.length&&rows[0].customer_id!==p.customer_id)throw Error('不同客户不能混合结算，请先结算当前客户或移除清单');return [...rows,p]}
 const api={normalize,totals,addPickup};root.TDScanCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
