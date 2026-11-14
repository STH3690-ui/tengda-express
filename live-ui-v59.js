/* Reusable rear-camera preview + serialized device OCR; no frame/photo uploads. */
const tdLive={running:false,epoch:0,stream:null,timer:null,gate:new TDLiveV59.Gate(),candidate:null,digest:null,busy:false,pending:null,frame:null,session:null,cap:null};
function tdV59PanelHTML(){return `<section class="td-live" id="tdLivePanel"><div class="td-live-heading"><span>V59 · 实时智能入库</span><h2>对准地址末尾，自动入库</h2><p>只识别附加的客户姓名和手机。默认一件，取件时统一称重。</p></div><div class="td-live-camera"><video id="tdLiveVideo" autoplay muted playsinline aria-label="地址末尾实时识别"></video><div class="td-live-guide"><span>客户姓名 + 中国 / 缅甸手机</span></div></div><div class="td-live-actions"><button class="primary" id="tdLiveStart" onclick="tdV59Start()">开始实时自动入库</button><button class="secondary" onclick="tdV59Stop()">停止</button></div><p id="tdLiveStatus" role="status" aria-live="polite">将面单地址末尾放进框内，不用拍照或上传。</p><div class="td-live-customer"><label>客户姓名<input id="tdLiveName" maxlength="60" autocomplete="off" oninput="tdV59Edited()" placeholder="识别后显示，可手动修改"></label><label>手机号码<input id="tdLivePhone" maxlength="25" inputmode="tel" autocomplete="off" oninput="tdV59Edited()" placeholder="完整号码，不接受隐藏号"></label></div><button class="secondary" id="tdLiveManual" onclick="tdV59Commit(true)">核对后手动入库 / 确认另一件</button><button class="secondary" id="tdLiveResolve" onclick="tdV59Resolve()" hidden>核实上次入库结果</button><p class="td-live-hint">同客户再次出现时，确认实物确为另一件再入库。仓库资料、冲突或模糊文字不会自动提交。</p><ol id="tdLiveRecent" class="td-live-recent" aria-live="polite"></ol></section>`;}
const tdV59LegacyPage=tdScanPage;
tdScanPage=function(){const html=tdV59LegacyPage();return page==='scanIntake'?tdV59PanelHTML()+'<details id="tdV59Legacy" ontoggle="if(this.open)tdV59Stop()"><summary>传统条码、拍照识别与手动批量入库</summary>'+html+'</details>':html};
function tdV59Message(text){const box=$('tdLiveStatus');if(box)box.textContent=text;}
function tdV59Storage(){return 'td-live-v59:'+user?.id;}
function tdV59Session(){if(tdLive.session)return tdLive.session;try{tdLive.session=sessionStorage.getItem(tdV59Storage()+':session')}catch{}if(!tdLive.session)tdLive.session=crypto.randomUUID();try{sessionStorage.setItem(tdV59Storage()+':session',tdLive.session)}catch{}return tdLive.session;}
function tdV59Pending(id){tdLive.pending=id;try{id?sessionStorage.setItem(tdV59Storage()+':pending',id):sessionStorage.removeItem(tdV59Storage()+':pending')}catch{}if($('tdLiveResolve'))$('tdLiveResolve').hidden=!id;}
function tdV59Restore(){if(!user||page!=='scanIntake')return;let id;try{id=sessionStorage.getItem(tdV59Storage()+':pending')}catch{}if(id){tdV59Pending(id);tdV59Message('存在结果待核实的入库，请先核实，不要重复提交')}}
function tdV59Edited(){tdLive.candidate=null;tdLive.gate.count=0;tdLive.edited=true;tdV59Message('已暂停自动提交，请核对姓名、完整号码和实际包裹后手动入库');}
function tdV59Stop(reset=false){
 tdLive.running=false;tdLive.epoch++;tdLive.gate.count=0;tdLive.gate.last='';clearTimeout(tdLive.timer);tdLive.stream?.getTracks().forEach(t=>t.stop());tdLive.stream=null;
 const video=$('tdLiveVideo');if(video)video.srcObject=null;TDLabelOCR.stop();if(tdLive.frame)tdLive.frame.width=tdLive.frame.height=1;tdLive.frame=null;
 if(reset){tdLive.cap=null;tdLive.candidate=null;tdLive.digest=null;tdLive.pending=null;tdLive.session=null;tdLive.edited=false;tdLive.gate=new TDLiveV59.Gate();}
 if($('tdLiveStart'))$('tdLiveStart').disabled=false;
}
async function tdV59Start(){tdV59Message('V60抓拍组件未完整加载，请刷新；传统手动入库仍可使用')}
function tdV59Evidence(result,p){
 const norm=s=>String(s||'').normalize('NFKC').replace(/[^\p{L}\d]/gu,'').toUpperCase(),name=norm(p.name),digits=String(p.phone_raw||p.phone).replace(/\D/g,'');
 const nw=(result.words||[]).filter(w=>{const t=norm(w.text);return t&&/\p{L}/u.test(t)&&name.includes(t)}),pw=(result.words||[]).filter(w=>{const t=String(w.text).replace(/\D/g,'');return t.length>=2&&digits.includes(t)});
 if(!norm(nw.map(w=>w.text).join('')).includes(name)||!pw.map(w=>w.text.replace(/\D/g,'')).join('').includes(digits))return {confidence:0,minConfidence:0};
 const words=[...nw,...pw];return {confidence:words.reduce((n,w)=>n+w.confidence,0)/words.length,minConfidence:Math.min(...words.map(w=>w.confidence))};
}
async function tdV59Digest(text){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function tdV59Commit(manual=false){
 if(page!=='scanIntake'||tdLive.busy||tdLive.pending||tdLabel.busy||tdLabel.pending||tdScan.busy||tdScan.uncertain||!navigator.onLine)return tdV59Message('离线、处理中或结果待核实，不能再次入库');
 if(!manual&&(tdLive.edited||tdLive.gate.locked))return;
 const name=TDLabelV58.clean($('tdLiveName').value),phone=TDLabelV58.normalizePhone($('tdLivePhone').value),epoch=tdLive.epoch,actor=user?.id;
 if(!name||!phone)return tdV59Message('请填写末尾客户姓名及完整手机号码');
 if(manual&&!confirm('核对客户 '+name+' / '+phone+'。确认面前是尚未登记的独立包裹？\n将入库1件；无冲突的新客户会自动创建。'))return;
 tdLive.busy=true;tdNav.pending++;$('tdLiveName').disabled=$('tdLivePhone').disabled=true;if(tdLive.running)tdV59Message('正在核对客户并入库…');
 try{
  const digest=manual?await tdV59Digest(name+'|'+phone):tdLive.digest,session=tdV59Session();
  const m=await tdScanRpc('td_live_resolve_v59',{p_name:name,p_phone:phone,p_digest:digest,p_session:session});
  if(epoch!==tdLive.epoch||page!=='scanIntake'||actor!==user?.id)return;
  if(m.status==='review')throw Error(m.reason);
  if(!manual&&m.needs_distinct_confirmation){tdLive.edited=true;tdV59Message('同一面单或此客户近期已登记，请确认这是另一件后手动入库');return}
  if(m.status==='new'&&!(tdLive.cap||await tdScanRpc('td_live_capabilities_v59')).create_customer)throw Error('当前账号不能新建客户，请管理员登记');
  const p=tdLive.candidate;
  if(!manual&&(!p?.eligible||p.name!==name||p.phone!==phone||p.stable_frames<3))throw Error('识别已变化，请重新稳定识别');
  const id=crypto.randomUUID();tdV59Pending(id);
  const r=await tdScanRpc('td_live_intake_v59',{p_request:id,p_payload:{name,phone,session_id:session,label_digest:digest,stable_frames:manual?0:p.stable_frames,confidence:manual?0:p.evidence.confidence,min_confidence:manual?0:p.evidence.minConfidence},p_confirmed:manual});
  if(actor!==user?.id)return;tdV59Pending(null);tdV59Apply(r);tdLive.gate.committed(name+'|'+phone);tdLive.edited=false;tdLive.candidate=null;
  const li=document.createElement('li');li.textContent=name+' · 1件 · '+r.parcel_number;$('tdLiveRecent')?.prepend(li);while($('tdLiveRecent')?.children.length>5)$('tdLiveRecent').lastChild.remove();
  tdScanFeedback(true);tdV59Message('✓ 入库成功。移开当前包裹，准备下一件');$('tdLiveName').value='';$('tdLivePhone').value='';
 }catch(e){tdLive.edited=true;tdV59Message((tdLive.pending?'结果待核实，请先核实上次入库：':'需要人工核对：')+e.message)}
 finally{tdLive.busy=false;tdNav.pending=Math.max(0,tdNav.pending-1);if($('tdLiveName'))$('tdLiveName').disabled=$('tdLivePhone').disabled=false}
}
function tdV59Apply(r){if(!r)return;if(r.parcel){const i=data.td_parcels.findIndex(x=>x.id===r.parcel.id);if(i<0)data.td_parcels.unshift(r.parcel);else data.td_parcels[i]=r.parcel}if(r.customer&&!data.td_customers.some(x=>x.id===r.customer.id))data.td_customers.unshift(r.customer);}
async function tdV59Resolve(){if(!tdLive.pending||tdLive.busy||!navigator.onLine)return;tdLive.busy=true;tdNav.pending++;try{const r=await tdScanRpc('td_live_request_v59',{p_request:tdLive.pending});tdV59Pending(null);tdV59Apply(r);tdLive.edited=true;tdV59Message(r?'上次已入库：'+(r.parcel_number||r.tracking_no)+'。不要重复登记；下一件请重新核对':'上次未入库，迟到请求已封存。请重新核对后入库');}catch(e){tdV59Message('仍待核实：'+e.message)}finally{tdLive.busy=false;tdNav.pending=Math.max(0,tdNav.pending-1)}}
addEventListener('pagehide',()=>tdV59Stop(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)tdV59Stop()});
