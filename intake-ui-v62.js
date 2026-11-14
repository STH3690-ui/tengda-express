/* V62 shared customer selection and optional intake metadata. Never edits existing customers. */
const tdV62={selected:null,dirty:false,customerEdited:false,search:0};
function tdV62MetaEdited(){tdV62.dirty=true}
const tdV62OldEdited=tdV59Edited;
tdV59Edited=function(){tdV62.selected=null;tdV62.dirty=true;tdV62.customerEdited=true;tdV62OldEdited()};
async function tdV62Search(){
 if(page!=='scanIntake'||tdPhoto.processing||tdLive.busy||tdLive.pending)return;
 const term=$('tdV62CustomerTerm').value.trim(),token=++tdV62.search,actor=user?.id;
 try{const list=await tdScanRpc('td_scan_customers_v57',{p_term:term});if(token!==tdV62.search||actor!==user?.id||page!=='scanIntake'||tdPhoto.processing||tdLive.busy)return;const box=$('tdV62Customers');box.replaceChildren();
  if(!list.length){box.textContent='没有匹配客户；填写姓名与完整电话后自动核对，冲突时不会创建';return}
  for(const c of list){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=c.name+(c.phone?' · '+c.phone:'');b.onclick=()=>{if(tdPhoto.processing||tdLive.busy||tdLive.pending||tdPhoto.phase==='success')return;tdV62.selected=c;tdV62.dirty=true;tdV62.customerEdited=true;$('tdLiveName').value=c.name;$('tdLivePhone').value=c.phone||'';tdLive.edited=true;tdLive.candidate=null;box.replaceChildren();tdV59Message('已选择客户，可修改；修改后重新匹配，不会覆盖原档案')};box.append(b)}
 }catch(e){if(token===tdV62.search)tdV59Message('客户搜索失败：'+e.message)}
}
function tdV62Clear(){tdV62.selected=null;tdV62.dirty=false;tdV62.customerEdited=false;tdV62.search++;if($('tdV62Pieces'))$('tdV62Pieces').value='1';if($('tdV62Weight'))$('tdV62Weight').value='';if($('tdV62Notes'))$('tdV62Notes').value='';if($('tdV62Customers'))$('tdV62Customers').replaceChildren();if($('tdV62CustomerTerm'))$('tdV62CustomerTerm').value=''}
const tdV62OldPreview=tdV61Preview;
tdV61Preview=async function(epoch){const completed=tdPhoto.phase==='success',name=(completed||!tdV62.customerEdited)?'':$('tdLiveName')?.value||'',phone=(completed||!tdV62.customerEdited)?'':$('tdLivePhone')?.value||'';if(completed)tdV62Clear();await tdV62OldPreview(epoch);if(epoch===tdLive.epoch&&tdPhoto.phase==='preview'&&(name||phone)){$('tdLiveName').value=name;$('tdLivePhone').value=phone;tdLive.edited=true}};
const tdV62OldStart=tdV59Start;
tdV59Start=async function(){if(tdPhoto.phase==='success'){tdV62Clear();if($('tdLiveName'))$('tdLiveName').value='';if($('tdLivePhone'))$('tdLivePhone').value=''}return tdV62OldStart()};
const tdV62OldStop=tdV59Stop;
tdV59Stop=function(reset=false){tdV62OldStop(reset);if(reset){tdV62Clear();if($('tdLiveName'))$('tdLiveName').value='';if($('tdLivePhone'))$('tdLivePhone').value=''}};
const tdV62OldDirty=tdScanDirty;
tdScanDirty=function(){return page==='scanIntake'&&tdV62.dirty||tdV62OldDirty()};
// Recompute when selection changes; an incomplete registered sum must never masquerade as a weighed total.
const tdV62OldSetWeight=tdScanSetWeight;
tdScanSetWeight=function(){const el=$('tdScanWeight');if(el)delete el.dataset.reweighed;tdV62OldSetWeight();const unknown=tdScan.rows.some(r=>Number(r.weight_kg)<=0);if(unknown&&el)el.value='';const hint=$('tdV62WeightHint');if(hint)hint.textContent='登记重量汇总 '+TDIntakeV62.weight(tdScan.rows)+' kg'+(unknown?'；含未称重包裹，请填写本次统一称重总重量':'；可重新称重修改');tdScanCalc()};
function tdV62Reweigh(){const el=$('tdScanWeight');if(el)el.dataset.reweighed='true';tdScanCalc()}
function tdV62RegisteredWeight(){tdScanSetWeight()}
const tdV62OldRegularWeight=tdSyncPickupWeight;
tdSyncPickupWeight=function(){tdV62OldRegularWeight();const unknown=data.td_parcels.some(r=>r.customer_id===pickupCustomer&&pickupSelected[r.id]>0&&Number(r.weight_kg)<=0);if(unknown&&$('pickupKg')){$('pickupKg').value='';calcPickup()}};
