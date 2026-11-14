/* Fix the actual legacy label component, not the separate HD-photo form. No schema changes. */
const tdV621={selected:null,manual:false,search:0};
function tdV621Ready(){return !!$('tdV621Name')?.value.trim()&&!!(tdV621.selected||TDLabelV58.normalizePhone($('tdV621Phone')?.value||''))}
function tdV621Controls(){const blocked=tdLabel.busy||!!tdLabel.pending||tdScan.busy||tdScan.uncertain;for(const id of ['tdV621CustomerTerm','tdV621CustomerSearch','tdV621Name','tdV621Phone','tdV58Pieces','tdV58Weight','tdV58Upload','tdV621OCR','tdV58Text','tdV58Photo','tdV58Auto','tdV58Create'])if($(id))$(id).disabled=blocked;if($('tdV58Commit'))$('tdV58Commit').disabled=blocked||(tdV621.manual?!tdV621Ready():!tdLabel.parsed?.match||tdLabel.parsed.match.status==='review'||!tdLabel.parsed.eligible_for_auto_intake||!tdLabel.cap?.intake||(tdLabel.parsed.match.status==='new'&&!tdLabel.cap?.create_customer))}
function tdV621Edited(){tdV621.selected=null;tdV621.manual=true;tdLabel.revision=(tdLabel.revision||0)+1;tdLabel.parsed=null;tdLabel.evidence={...tdLabel.evidence,edited:true};tdV621Controls();tdV58Message('已使用手填资料；保存时自动匹配，无冲突且有权限才新建，不覆盖旧客户档案')}
function tdV621MetaEdited(){if($('tdV621Name')?.value||$('tdV621Phone')?.value){tdV621.manual=true;tdLabel.evidence={...tdLabel.evidence,edited:true}}tdLabel.revision=(tdLabel.revision||0)+1;tdV621Controls()}
async function tdV621Search(){
 if(page!=='scanIntake'||tdLabel.busy||tdLabel.pending||tdScan.busy||tdScan.uncertain)return;const token=++tdV621.search,epoch=tdLabel.epoch,actor=user?.id;
 try{const rows=await tdScanRpc('td_scan_customers_v57',{p_term:$('tdV621CustomerTerm').value.trim()});if(token!==tdV621.search||epoch!==tdLabel.epoch||actor!==user?.id||page!=='scanIntake'||tdLabel.busy||tdLabel.pending)return;const box=$('tdV621Customers');box.replaceChildren();if(!rows.length)box.textContent='没有匹配客户，可直接手填姓名与完整电话，入库时再次核对';
  for(const c of rows){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=c.name+(c.phone?' · '+c.phone:'');b.onclick=()=>{if(tdLabel.busy||tdLabel.pending||tdScan.busy||tdScan.uncertain)return;tdV621.selected=c;tdV621.manual=true;$('tdV621Name').value=c.name;$('tdV621Phone').value=c.phone||'';tdLabel.parsed=null;tdLabel.evidence={...tdLabel.evidence,edited:true};tdLabel.revision=(tdLabel.revision||0)+1;box.replaceChildren();tdV621Controls();tdV58Message('已选择客户，无需OCR，可修改资料后重新匹配或直接入库')};box.append(b)}
 }catch(e){if(token===tdV621.search)tdV58Message('客户搜索失败：'+e.message)}
}
const tdV621OldTextEdited=tdV58TextEdited;
tdV58TextEdited=function(){tdV621OldTextEdited();if(!tdV621.manual){if($('tdV621Name'))$('tdV621Name').value='';if($('tdV621Phone'))$('tdV621Phone').value=''}tdV621Controls()};
const tdV621OldPreview=tdV58Preview;
tdV58Preview=async function(fromOCR=false){if(tdV621.manual){tdV621Controls();tdV58Message('使用已选/手填客户资料，可直接确认入库；不会用OCR覆盖姓名或手机');return}await tdV621OldPreview(fromOCR);if(page==='scanIntake'&&tdLabel.parsed){$('tdV621Name').value=tdLabel.parsed.name||'';$('tdV621Phone').value=tdLabel.parsed.phone||'';}};
const tdV621OldRead=tdV58ReadPhoto;
tdV58ReadPhoto=async function(input){if(!$('tdV621OCR')?.checked){if(tdLabel.busy||tdLabel.pending||tdScan.busy||tdScan.uncertain)return;const file=input.files?.[0];if(!file)return;if(!file.type.startsWith('image/')||file.size>10*1024*1024){input.value='';return tdV58Message('仅支持不超过10MB的照片')}tdLabel.file=file;tdLabel.evidence={edited:true};tdV58Message('照片已保留，无需OCR；选择或填写客户后确认入库，按照片保存选项处理');tdV621Controls();return}const task=tdV621OldRead(input);tdV621Controls();try{return await task}finally{tdV621Controls()}};
const tdV621OldCommit=tdV58Commit;
tdV58Commit=async function(automatic=false){
 if(!tdV621.manual){const task=tdV621OldCommit(automatic);tdV621Controls();try{return await task}finally{tdV621Controls()}}
 if(automatic)return tdV58Message('已选或手填资料必须人工确认');
 if(page!=='scanIntake'||tdLabel.busy||tdLabel.pending||tdScan.busy||tdScan.uncertain||tdScan.queued||tdScan.rows.length||tdLive.busy||tdLive.pending||!navigator.onLine)return tdV58Message('请先完成/核实当前请求或待入库清单；离线不提交');
 if(!tdV621Ready())return tdV58Message('请选择客户，或填写姓名和完整手机号码');
 let details;try{details=TDIntakeV62.fields($('tdV58Pieces').value,$('tdV58Weight').value,'面单手动入库 V62.1')}catch(e){return tdV58Message(e.message)}
 const name=$('tdV621Name').value.trim(),phone=TDLabelV58.normalizePhone($('tdV621Phone').value)||$('tdV621Phone').value.trim(),parsed=TDLabelV58.parseLabel($('tdV58Text').value),tracking=$('tdScanInput')?.value.trim()||parsed.tracking_no||'',actor=user?.id,epoch=tdLabel.epoch,file=tdLabel.file,upload=!!$('tdV58Upload')?.checked;
 if(!confirm('确认入库？\n'+name+' / '+phone+'\n'+details.pieces+'件，'+details.weight_kg+'kg\n运单：'+(tracking||'自动生成独立包裹编号')+'\n无冲突时匹配已有客户或按权限新建，不修改原客户档案'))return;
 const id=crypto.randomUUID();tdV58Pending(id);tdLabel.busy=true;tdNav.pending++;tdV621Controls();
 try{const r=await tdScanRpc('td_intake_v62',{p_request:id,p_payload:{...details,customer_id:tdV621.selected?.id||null,name,phone,tracking_no:tracking},p_confirmed:true});if(actor!==user?.id)return;tdV58Pending(null);tdV59Apply(r);tdV58Message('入库成功：'+r.parcel_number+' · '+details.pieces+'件'+(r.customer_created?'；已创建客户':'；已关联客户'));
  if(file&&upload){try{await uploadPhotos(r.parcel_id,[file])}catch(e){tdV58Message('包裹已入库，照片上传失败；请在包裹图片页补传，不要重复入库')}}
  if(epoch===tdLabel.epoch&&page==='scanIntake'){tdV621.selected=null;tdV621.manual=false;tdLabel.parsed=null;tdLabel.file=null;tdLabel.evidence=null;for(const id of ['tdV621Name','tdV621Phone','tdV58Text','tdV58Photo','tdV621CustomerTerm','tdScanInput'])if($(id))$(id).value='';$('tdV58Pieces').value='1';$('tdV58Weight').value='0';}
  try{await refresh()}catch{}
 }catch(e){if(actor===user?.id)tdV58Message('结果待核实：'+e.message+'；请核实上次请求，不要重复入库')}
 finally{tdLabel.busy=false;tdNav.pending=Math.max(0,tdNav.pending-1);tdV621Controls()}
};
const tdV621OldResolve=tdV58Resolve;
tdV58Resolve=async function(){const task=tdV621OldResolve();tdV621Controls();try{return await task}finally{tdV621Controls()}};
const tdV621OldReset=tdV58Reset;
tdV58Reset=function(){tdV621.selected=null;tdV621.manual=false;tdV621.search++;tdV621OldReset()};
const tdV621OldDirty=tdScanDirty;
tdScanDirty=function(){return page==='scanIntake'&&tdV621.manual||tdV621OldDirty()};

// Keep barcode and legacy-photo writes mutually exclusive while a request is unresolved.
const tdV621OldAccept=tdScanAccept;
tdScanAccept=function(raw,source='manual'){if(tdLabel.busy||tdLabel.pending)return Promise.resolve(tdScanMessage('请先完成或核实面单入库请求',true));return tdV621OldAccept(raw,source)};
const tdV621OldSave=tdScanSaveIntake;
tdScanSaveIntake=function(){if(tdLabel.busy||tdLabel.pending)return tdScanMessage('请先完成或核实面单入库请求',true);return tdV621OldSave()};
