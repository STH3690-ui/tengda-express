/* Shared intake validation; weight is the total for this parcel record, not per piece. */
(function(root){'use strict';
function fields(pieces='1',weight='',notes=''){
 const p=String(pieces),w=String(weight).trim()||'0',n=String(notes||'');
 if(!/^[1-9]\d{0,5}$/.test(p)||!/^[0-9]{1,6}(\.[0-9]{1,3})?$/.test(w)||Number(w)>999999)throw Error('件数须为正整数；重量最多3位小数，可留空');
 if(n.length>2000||n.includes('[TD_ORDER_IDS:'))throw Error('备注无效或超过2000字');
 return {pieces:Number(p),weight_kg:Number(w),notes:n};
}
function weight(rows){return Math.round(rows.reduce((sum,r)=>sum+(Number(r.pieces)>0?Number(r.weight_kg||0)*Number(r.remaining)/Number(r.pieces):0),0)*1000)/1000}
root.TDIntakeV62={fields,weight};if(typeof module!=='undefined')module.exports=root.TDIntakeV62;
})(globalThis);
