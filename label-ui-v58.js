/* V58 label intake. V57 manual barcode and settlement flows remain independent. */
const tdLabel={cap:null,evidence:null,parsed:null,file:null,pending:null,busy:false,epoch:0};
function tdV58PanelHTML(){return `<section class="photo-box" id="tdV58PreviewPanel" hidden><h3>拍照识别面单 · V58</h3><p>免费设备端OCR；姓名、完整电话和运单须可靠。隐藏号码或不确定结果只能人工核对。</p><label>拍摄或选择面单<input id="tdV58Photo" type="file" accept="image/*" capture="environment" onchange="tdV58ReadPhoto(this)"></label><label>面单文字<textarea id="tdV58Text" rows="5" maxlength="10000" oninput="tdV58TextEdited()" placeholder="也可粘贴实况文本；修改后必须人工确认"></textarea></label><div class="grid"><label>件数<input id="tdV58Pieces" type="number" min="1" max="999999" step="1" value="1" oninput="tdV58TextEdited()"></label><label>入库重量 kg<input id="tdV58Weight" type="number" min="0" max="999999" step="0.001" value="0" oninput="tdV58TextEdited()"></label></div><label><input id="tdV58Auto" type="checkbox">本次会话允许高置信度且条码一致时自动入库</label><label><input id="tdV58Create" type="checkbox">允许在权限范围内自动新建无冲突客户</label><label><input id="tdV58Upload" type="checkbox" checked>入库成功后保存面单照片</label><button type="button" class="secondary" onclick="tdV58Preview()">核对并匹配客户</button><button type="button" class="primary" id="tdV58Commit" onclick="tdV58Commit(false)" disabled>人工确认并入库</button><button type="button" class="secondary" id="tdV58Resolve" onclick="tdV58Resolve()" hidden>核实上次面单请求</button><div id="tdV58Result" aria-live="polite"></div></section>`;}
function tdV58Message(message){const box=$('tdV58Result');if(box)box.textContent=message;else notify(message);}
function tdV58TextEdited(){tdLabel.revision=(tdLabel.revision||0)+1;tdLabel.evidence={...tdLabel.evidence,edited:true};tdLabel.parsed=null;if($('tdV58Commit'))$('tdV58Commit').disabled=true;}
async function tdV58Capabilities(){if(tdLabel.capActor!==user?.id){tdLabel.cap=null;tdLabel.capActor=user?.id}if(!tdLabel.cap)tdLabel.cap=await tdScanRpc('td_label_capabilities_v58');return tdLabel.cap;}
async function tdV58ReadPhoto(input){
 const file=input.files?.[0];if(!file||tdLabel.busy||tdLabel.pending||tdScan.busy||tdScan.uncertain)return;
 const epoch=++tdLabel.epoch;tdLabel.file=file;tdLabel.busy=true;tdNav.pending++;input.disabled=true;$('tdV58Text').disabled=true;
 try{tdV58Message('本机识别中，首次加载中文字库可能需要等待…');
  const result=await TDLabelOCR.recognize(file,(_,p)=>{if(epoch===tdLabel.epoch&&page==='scanIntake')tdV58Message('本机识别中 '+p+'%')});
  if(epoch!==tdLabel.epoch||page!=='scanIntake')return;
  $('tdV58Text').value=result.text;tdLabel.evidence={...result,edited:false,barcode:''};
  // Independent decoder corroboration is mandatory for automatic tracking-number writes.
  const url=URL.createObjectURL(file);const reader=new ZXing.BrowserMultiFormatReader();
  try{const decoded=await reader.decodeFromImageUrl(url);tdLabel.evidence.barcode=TDScanCore.normalize(decoded.getText())}catch{}finally{reader.reset();URL.revokeObjectURL(url)}
  await tdV58Preview(true);
 }catch(e){tdV58Message('识别未完成：'+e.message+'。请重拍或用实况文本粘贴后人工核对。')}
 finally{tdLabel.busy=false;tdNav.pending=Math.max(0,tdNav.pending-1);if(input.isConnected)input.disabled=false;if($('tdV58Text'))$('tdV58Text').disabled=false}
 if(epoch===tdLabel.epoch&&page==='scanIntake'&&$('tdV58Auto')?.checked&&TDLabelV58.canAutoCommit(tdLabel.parsed,tdLabel.evidence))await tdV58Commit(true);
}
async function tdV58Preview(fromOCR=false){
 if(page!=='scanIntake'||tdLabel.pending||(!fromOCR&&tdLabel.busy))return;
 if(!fromOCR)tdLabel.evidence={...tdLabel.evidence,edited:true};
 const revision=tdLabel.revision||0,epoch=tdLabel.epoch;const parsed=TDLabelV58.parseLabel($('tdV58Text')?.value||'');tdLabel.parsed=parsed;
 $('tdV58Commit').disabled=true;
 if(parsed.issues.length){tdV58Message(parsed.issues.join('；')+'。请人工补全核实，不能自动入库。');return}
 try{const cap=await tdV58Capabilities();if(!cap.intake)throw Error('当前账号不能自动匹配，请使用V57人工选客户流程');
  const match=await tdScanRpc('td_label_resolve_v58',{p_name:parsed.name,p_phone:parsed.phone,p_tracking:parsed.tracking_no});
  if(page!=='scanIntake'||epoch!==tdLabel.epoch||revision!==(tdLabel.revision||0))return;tdLabel.parsed={...parsed,match};
  tdV58Message('运单：'+parsed.tracking_no+'；收件人：'+parsed.name+'；电话：'+parsed.phone+'；'+match.reason+(fromOCR?'；OCR '+Math.round(tdLabel.evidence.confidence)+'%':''));
  $('tdV58Commit').disabled=match.status==='review'||(match.status==='new'&&!cap.create_customer);
  $('tdV58Create').disabled=!cap.create_customer;
 }catch(e){tdV58Message('匹配未完成：'+e.message+'。V57扫码功能可继续使用。')}
}
function tdV58Key(){return 'td-label-request-v58:'+user.id;}
function tdV58Pending(id){tdLabel.pending=id;try{id?sessionStorage.setItem(tdV58Key(),id):sessionStorage.removeItem(tdV58Key())}catch{}if($('tdV58Resolve'))$('tdV58Resolve').hidden=!id;}
async function tdV58Commit(automatic=false){
 if(page!=='scanIntake'||tdLabel.busy||tdLabel.pending||tdScan.busy||tdScan.uncertain||!navigator.onLine)return tdV58Message('正在处理、请求待核实或离线，不能提交');
 const p=tdLabel.parsed;if(!p?.eligible_for_auto_intake||p.match?.status==='review'||!p.match)return tdV58Message('请先核对面单并匹配客户');
 const pieces=Number($('tdV58Pieces').value),weight=Number($('tdV58Weight').value),create=!!$('tdV58Create').checked;
 if(!Number.isInteger(pieces)||pieces<1||pieces>999999||!Number.isFinite(weight)||weight<0||weight>999999)return tdV58Message('件数或重量无效');
 if(p.match.status==='new'&&!create)return tdV58Message('无匹配客户；需明确允许新建或使用人工选客户流程');
 if(automatic&&!TDLabelV58.canAutoCommit(p,tdLabel.evidence))return tdV58Message('识别未达到自动入库条件，请人工核对');
 if(!automatic&&!confirm('确认面单姓名、完整电话和运单准确？\n'+p.tracking_no+' / '+p.name+' / '+p.phone+'\n'+pieces+'件，'+weight+'kg'+(p.match.status==='new'?'；将新建客户':'；关联已有客户')))return;
 const payload={tracking_no:p.tracking_no,name:p.name,phone:p.phone,pieces,weight_kg:weight,category:'普通包裹',allow_create:create,automatic,confidence:Number(tdLabel.evidence?.confidence)||0,min_confidence:Number(tdLabel.evidence?.minConfidence)||0,barcode:tdLabel.evidence?.barcode||''};
 const id=crypto.randomUUID();tdV58Pending(id);tdLabel.busy=true;tdNav.pending++;
 try{const r=await tdScanRpc('td_label_intake_v58',{p_request:id,p_payload:payload,p_confirmed:!automatic});tdV58Pending(null);tdV58Message('入库成功：'+p.tracking_no+(r.customer_created?'；客户已创建':'；已关联客户'));
  if(tdLabel.file&&$('tdV58Upload')?.checked){try{await uploadPhotos(r.parcel_id,[tdLabel.file])}catch{tdV58Message('包裹已入库，照片上传失败；请在原包裹图片页面补传，不要重复入库')}}
  tdLabel.parsed=null;tdLabel.file=null;$('tdV58Text').value='';$('tdV58Commit').disabled=true;try{await refresh()}catch{}
 }catch(e){tdV58Message('结果待核实：'+e.message+'；请核实上次面单请求，不要重复办理')}
 finally{tdLabel.busy=false;tdNav.pending=Math.max(0,tdNav.pending-1)}
}
async function tdV58Resolve(){const id=tdLabel.pending;if(!id||tdLabel.busy)return;tdLabel.busy=true;tdNav.pending++;try{const r=await tdScanRpc('td_label_request_v58',{p_request:id});tdV58Pending(null);tdV58Message(r?'上次请求已提交，请核对包裹；如有照片请在图片页补传':'上次请求未提交；已封存迟到请求，请重新核对');if(r)tdLabel.parsed=null;}catch(e){tdV58Message('仍无法核实：'+e.message)}finally{tdLabel.busy=false;tdNav.pending=Math.max(0,tdNav.pending-1)}}
async function tdV58Restore(){if(!user||page!=='scanIntake')return;let id;try{id=sessionStorage.getItem(tdV58Key())}catch{}if(id){tdV58Pending(id);await tdV58Resolve()}}
addEventListener('pagehide',()=>{tdLabel.epoch++;tdLabel.file=null;tdLabel.parsed=null;tdLabel.cap=null;});
function tdV58Reset(){tdLabel.epoch++;TDLabelOCR.stop();tdLabel.cap=null;tdLabel.file=null;tdLabel.parsed=null;tdLabel.pending=null;const dlg=$('tdParcelEditDialog');if(dlg){dlg.close();dlg.innerHTML=''}tdParcelEditing=null;}
const tdParcelFields=['tracking_no','description','category','weight_kg','fee_per_kg','fee_per_piece','notes','pieces','remaining','customer_id','order_id'];
let tdParcelEditing=null;
function tdParcelEditV58(id){
 if(!tdNavPermission('parcel_edit')||tdLabel.pending||tdLabel.busy)return notify('无编辑权限或有请求待核实',true);
 const p=data.td_parcels.find(x=>x.id===id);if(!p)return notify('包裹不存在',true);if(Number(p.remaining)!==Number(p.pieces))return notify('已有取件不能编辑原入库数据',true);
 tdParcelEditing={id,expected:Object.fromEntries(tdParcelFields.map(k=>[k,p[k]??null]))};
 let dlg=$('tdParcelEditDialog');if(!dlg){dlg=document.createElement('dialog');dlg.id='tdParcelEditDialog';dlg.className='td-history-dialog';document.body.append(dlg)}
 dlg.innerHTML='<form onsubmit="tdParcelSaveV58(event)"><h2>编辑未取件包裹</h2><p>客户、件数、剩余和原财务记录不变。</p>'+[['tracking_no','运单号'],['description','包裹内容'],['category','类别'],['weight_kg','重量 kg'],['fee_per_kg','每公斤收费'],['fee_per_piece','每件收费'],['notes','备注']].map(([k,label])=>'<label>'+label+'<input name="'+k+'" value="'+esc(p[k]??'')+'" '+(['weight_kg','fee_per_kg','fee_per_piece'].includes(k)?'type="number" min="0" step="'+(k==='weight_kg'?'0.001':'0.01')+'" required':'maxlength="'+(k==='notes'?2000:k==='description'?500:k==='tracking_no'?64:80)+'"')+'></label>').join('')+'<button class="primary">确认保存</button><button class="secondary" type="button" onclick="document.getElementById(\'tdParcelEditDialog\').close()">取消</button><p id="tdParcelEditResult" role="status"></p></form>';dlg.showModal();
}
async function tdParcelSaveV58(e){
 e.preventDefault();if(tdLabel.busy||tdLabel.pending||!tdParcelEditing||!navigator.onLine)return;
 const changes=Object.fromEntries(new FormData(e.target));for(const k of ['weight_kg','fee_per_kg','fee_per_piece'])changes[k]=Number(changes[k]);
 if(!confirm('确认修改该未取件包裹的入库资料？'))return;
 const id=crypto.randomUUID();tdV58Pending(id);tdLabel.busy=true;tdNav.pending++;const b=e.target.querySelector('button');b.disabled=true;
 try{await tdScanRpc('td_parcel_edit_v58',{p_request:id,p_parcel:tdParcelEditing.id,p_expected:tdParcelEditing.expected,p_changes:changes,p_confirmed:true});tdV58Pending(null);$('tdParcelEditDialog').close();await refresh();notify('包裹资料已保存，原库存和财务不变')}
 catch(err){$('tdParcelEditResult').textContent='结果待核实：'+err.message+'；关闭后点击核实面单/编辑请求';}
 finally{tdLabel.busy=false;tdNav.pending=Math.max(0,tdNav.pending-1);b.disabled=false;}
}
function tdV58RecoveryBanner(){let id;try{id=sessionStorage.getItem(tdV58Key())}catch{}if(!id)return '';tdLabel.pending=id;return '<p>存在上次面单/编辑请求待核实。<button class="secondary" onclick="tdV58Resolve().then(()=>refresh())">核实面单/编辑请求</button></p>';}
