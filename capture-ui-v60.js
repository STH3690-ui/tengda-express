/* V60: pixel-only stability probe -> one frozen HD image -> local OCR -> explicit next. */
const tdCapture={state:'idle',quality:null,stability:new TDCaptureV60.Stability(),probe:null,image:null,processing:false};
const tdV60OldStop=tdV59Stop;
tdV59PanelHTML=function(){return `<section class="td-live" id="tdLivePanel"><div class="td-live-heading"><span>V60 · 稳定锁定入库</span><h2>对稳一秒，锁定识别</h2><p>对准地址末尾姓名和手机，清晰稳定后自动捕捉。抓拍后不再连续扫描。</p></div><div class="td-live-camera"><video id="tdLiveVideo" autoplay muted playsinline aria-label="稳定抓拍预览"></video><canvas id="tdCaptureFrozen" hidden aria-label="冻结的高清面单"></canvas><div id="tdCaptureGuide" class="td-live-guide"><span>地址末尾 · 括号内姓名与手机也可</span></div></div><div class="td-live-actions"><button class="primary" id="tdLiveStart" onclick="tdV59Start()">开启后置摄像头</button><button class="secondary" onclick="tdV59Stop()">停止</button></div><p id="tdLiveStatus" role="status" aria-live="polite">保持清晰稳定约一秒，滴声后画面冻结。默认一件，取件时称重。</p><div class="td-live-customer"><label>客户姓名<input id="tdLiveName" maxlength="60" autocomplete="off" oninput="tdV59Edited()"></label><label>手机号码<input id="tdLivePhone" maxlength="25" inputmode="tel" autocomplete="off" oninput="tdV59Edited()"></label></div><button class="secondary" id="tdLiveManual" onclick="tdV59Commit(true)">核对后手动入库</button><button class="secondary" id="tdLiveResolve" onclick="tdV59Resolve()" hidden>核实上次入库结果</button><details><summary>识别文字 / 核对提示</summary><pre id="tdCaptureText"></pre></details><ol id="tdLiveRecent" class="td-live-recent" aria-live="polite"></ol></section>`};
tdV59Stop=function(reset=false){tdV60OldStop(reset);if(tdCapture.job?.pending){tdCapture.job.pending=false;tdNav.pending=Math.max(0,tdNav.pending-1)}tdCapture.job=null;tdCapture.processing=false;tdCapture.stability.reset();if(tdCapture.probe)tdCapture.probe.width=tdCapture.probe.height=1;tdCapture.probe=null;if(reset){tdCapture.image=null;tdCapture.quality=null;tdCapture.state='idle';const c=$('tdCaptureFrozen');if(c)c.width=c.height=1}else if(tdCapture.state==='watching')tdCapture.state='idle';else if(tdCapture.state==='recognizing'){tdCapture.state='review';tdV59Message('已停止识别，冻结图片已保留，可手动核对或重新扫描')}tdV60Controls();};
function tdV60Controls(){const start=$('tdLiveStart'),manual=$('tdLiveManual');if(start){start.disabled=tdLive.running||tdCapture.state==='watching'||tdLive.busy||!!tdLive.pending||tdCapture.processing;start.textContent=tdCapture.state==='success'?'扫描下一件':tdCapture.image?'重新扫描':'开启后置摄像头'}if(manual)manual.disabled=tdLive.running||tdCapture.state==='watching'||tdLive.busy||tdCapture.processing||tdCapture.state==='success'||!!tdLive.pending;for(const id of ['tdLiveName','tdLivePhone'])if($(id))$(id).disabled=tdLive.running||tdCapture.state==='watching'||tdLive.busy||tdCapture.processing||tdCapture.state==='success';}
tdV59Edited=function(){tdLive.edited=true;tdLive.candidate=null;tdV59Message('请对照冻结图片核对姓名和完整号码，再手动确认入库')};
tdV59Start=async function(){
 if(page!=='scanIntake'||tdCapture.processing||tdLive.busy||tdLive.pending||tdLabel.busy||tdLabel.pending||tdScan.busy||tdScan.uncertain||tdScan.rows.length||tdLabel.file||$('tdV58Text')?.value.trim())return tdV59Message('先完成或核实当前入库请求');
 if(tdCapture.state!=='success'&&tdLive.edited&&!confirm('放弃当前冻结图片及修改，重新扫描？'))return;
 tdV59Stop();tdScanStop();tdLive.edited=false;tdLive.candidate=null;tdCapture.image=null;tdCapture.quality=null;tdCapture.state='watching';const epoch=tdLive.epoch,actor=user?.id;
 $('tdCaptureFrozen').hidden=true;$('tdCaptureFrozen').width=$('tdCaptureFrozen').height=1;$('tdLiveVideo').hidden=false;$('tdCaptureGuide').hidden=false;$('tdLiveName').value=$('tdLivePhone').value='';$('tdCaptureText').textContent='';if($('tdV59Legacy'))$('tdV59Legacy').open=false;tdV60Controls();
 try{tdScan.audio=tdScan.audio||new(window.AudioContext||window.webkitAudioContext)();tdScan.audio.resume().catch(()=>{})}catch{}
 try{
  tdV59Message('正在打开后置摄像头…');tdLive.cap=await tdScanRpc('td_live_capabilities_v59');if(epoch!==tdLive.epoch||actor!==user?.id)return;if(!tdLive.cap.intake)throw Error('需要入库与客户资料权限，可使用传统人工选客户');
  const acquisition=navigator.mediaDevices?.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1440},frameRate:{ideal:15,max:24}}});if(!acquisition)throw Error('浏览器不支持摄像头，请使用HTTPS或手动入库');
  let timer;acquisition.then(s=>{if(epoch!==tdLive.epoch)s.getTracks().forEach(t=>t.stop())}).catch(()=>{});let stream;try{stream=await Promise.race([acquisition,new Promise((_,no)=>{timer=setTimeout(()=>no(Error('摄像头打开超时')),20000)})])}finally{clearTimeout(timer)}
  if(epoch!==tdLive.epoch||actor!==user?.id){stream.getTracks().forEach(t=>t.stop());return}tdLive.stream=stream;
  const track=stream.getVideoTracks()[0];track?.addEventListener?.('ended',()=>{if(epoch===tdLive.epoch&&tdLive.running&&tdCapture.state==='watching'){tdV59Stop();tdV59Message('摄像头已中断，请重新打开，不会使用旧画面入库')}});const caps=track?.getCapabilities?.()||{};if(caps.focusMode?.includes('continuous'))track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
  const v=$('tdLiveVideo');v.srcObject=stream;await v.play();if(epoch!==tdLive.epoch)return;tdLive.running=true;tdCapture.lastVideoTime=null;tdCapture.lastVideoTick=Date.now();tdCapture.probe=document.createElement('canvas');tdCapture.probe.width=320;tdCapture.probe.height=200;tdV59Message('对准地址末尾，保持清晰稳定约1秒');tdV60Probe(epoch);
 }catch(e){if(epoch===tdLive.epoch){tdV59Stop();tdV59Message('无法打开：'+e.message)}}
};
function tdV60Region(v){const w=v.videoWidth,h=v.videoHeight,ratio=v.clientWidth/v.clientHeight,vw=Math.min(w,h*ratio),vh=Math.min(h,w/ratio);return {x:(w-vw)/2+vw*.05,y:(h-vh)/2+vh*.15,w:vw*.9,h:vh*.7};}
function tdV60Probe(epoch){
 if(!tdLive.running||epoch!==tdLive.epoch||page!=='scanIntake')return;
 try{const v=$('tdLiveVideo');if(v.readyState>=2&&v.videoWidth){const now=Date.now();if(v.currentTime!==tdCapture.lastVideoTime){tdCapture.lastVideoTime=v.currentTime;tdCapture.lastVideoTick=now}else if(now-tdCapture.lastVideoTick>500){tdCapture.stability.reset();tdV59Message('等待新的摄像头画面，请保持面单在框内');tdLive.timer=setTimeout(()=>tdV60Probe(epoch),125);return}const box=tdV60Region(v),c=tdCapture.probe,ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(v,box.x,box.y,box.w,box.h,0,0,c.width,c.height);const q=TDCaptureV60.measure(ctx.getImageData(0,0,c.width,c.height)),s=tdCapture.stability.observe(q,Date.now());
  if(s.state==='ready'){tdCapture.quality={brightness:q.brightness,sharpness:q.sharpness,stable_ms:s.stable_ms};tdV60Freeze(v,box,epoch).catch(e=>{if(epoch===tdLive.epoch){tdV59Stop();tdCapture.state='review';tdV59Message('捕捉失败，请重新扫描：'+e.message);tdV60Controls()}});return}
  tdV59Message(s.state==='dark'?'光线偏暗，请补光':s.state==='bright'?'反光或曝光过亮，请调整角度':s.state==='blur'?'文字还不清晰，请靠近并等待对焦':'保持不动，稳定 '+Math.min(100,Math.round(s.stable_ms/10))+'%');
 }}catch(e){tdV59Stop();tdV59Message('画面检测失败：'+e.message)}
 if(tdLive.running&&epoch===tdLive.epoch)tdLive.timer=setTimeout(()=>tdV60Probe(epoch),125);
}
async function tdV60Freeze(v,box,epoch){
 const c=$('tdCaptureFrozen'),scale=Math.min(1,2800/box.w,2000/box.h);c.width=Math.round(box.w*scale);c.height=Math.round(box.h*scale);c.getContext('2d').drawImage(v,box.x,box.y,box.w,box.h,0,0,c.width,c.height);
 tdCapture.image=c;tdCapture.state='recognizing';tdLive.running=false;clearTimeout(tdLive.timer);c.hidden=false;v.hidden=true;$('tdCaptureGuide').hidden=true;tdLive.stream?.getTracks().forEach(t=>t.stop());tdLive.stream=null;v.srcObject=null;tdScanFeedback();
 const job={pending:true};tdCapture.job=job;tdCapture.processing=true;tdNav.pending++;tdV60Controls();tdV59Message('已捕捉并冻结，正在本机识别高清图片…');
 let processed;
 try{
  // Keep the displayed original unchanged; enhance only a bounded temporary OCR canvas.
  processed=document.createElement('canvas');processed.width=c.width;processed.height=c.height;const ctx=processed.getContext('2d',{willReadFrequently:true});ctx.drawImage(c,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height),offset=Math.max(0,Math.min(30,135-tdCapture.quality.brightness));for(let i=0;i<pixels.data.length;i+=4){const g=pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114,x=Math.max(0,Math.min(255,(g-128)*1.12+128+offset));pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=x}ctx.putImageData(pixels,0,0);
  const r=await TDLabelOCR.recognizeFrozen(processed);if(epoch!==tdLive.epoch||page!=='scanIntake')return;
  const p=TDCaptureV60.parse(r.text),e=tdV59Evidence(r,p);tdLive.candidate={...p,evidence:e};tdLive.digest=await tdV59Digest(p.canonical);if(epoch!==tdLive.epoch)return;
  $('tdCaptureText').textContent=r.text+(p.issues.length?'\n\n'+p.issues.join('；'):'');$('tdLiveName').value=p.name;$('tdLivePhone').value=p.phone;tdCapture.state='review';
  if(p.eligible&&e.confidence>=95&&e.minConfidence>=90){tdV59Message('已锁定可靠资料，正在匹配客户…');tdCapture.processing=false;await tdV59Commit(false)}else tdV59Message('保持冻结，请核对：'+(p.issues.join('；')||'识别置信度不足，可手动修改或重新扫描'));
 }catch(e){if(epoch===tdLive.epoch){tdCapture.state='review';tdV59Message('识别失败，图片已保留：'+e.message+'；请手动核对或重新扫描')}}
 finally{if(processed)processed.width=processed.height=1;if(job.pending){job.pending=false;tdNav.pending=Math.max(0,tdNav.pending-1)}if(tdCapture.job===job){tdCapture.job=null;tdCapture.processing=false}tdV60Controls()}
}
tdV59Commit=async function(manual=false){
 if(page!=='scanIntake'||tdCapture.state==='success'||tdCapture.processing||tdLive.running||tdLive.busy||tdLive.pending||tdLabel.busy||tdLabel.pending||tdScan.busy||tdScan.uncertain||!navigator.onLine)return tdV59Message('请先冻结图片，或等待/核实当前请求');
 const name=TDLabelV58.clean($('tdLiveName').value),phone=TDLabelV58.normalizePhone($('tdLivePhone').value),p=tdLive.candidate,epoch=tdLive.epoch,actor=user?.id;
 if(!name||!phone)return tdV59Message('请补全客户姓名和完整手机号');
 if(!manual&&(!tdCapture.image||!p?.eligible||tdLive.edited||p.name!==name||p.phone!==phone))return;
 if(manual&&!confirm('请对照冻结图片，确认 '+name+' / '+phone+'，且这件包裹尚未入库？'))return;
 tdLive.busy=true;tdNav.pending++;tdV60Controls();
 try{
  const digest=manual?await tdV59Digest(name+'|'+phone):tdLive.digest,session=tdV59Session();const m=await tdScanRpc('td_live_resolve_v59',{p_name:name,p_phone:phone,p_digest:digest,p_session:session});if(epoch!==tdLive.epoch||actor!==user?.id)return;
  if(m.status==='review')throw Error(m.reason);if(!manual&&m.needs_distinct_confirmation){tdLive.edited=true;tdV59Message('此客户或面单近期已入库，请确认是另一件后手动确认');return}
  if(m.status==='new'&&!(tdLive.cap||await tdScanRpc('td_live_capabilities_v59')).create_customer)throw Error('当前账号不能创建客户');
  const id=crypto.randomUUID(),q=tdCapture.quality||{};tdV59Pending(id);const r=await tdScanRpc('td_capture_intake_v60',{p_request:id,p_payload:{name,phone,session_id:session,label_digest:digest,stable_ms:q.stable_ms||0,brightness:q.brightness||0,sharpness:q.sharpness||0,confidence:p?.evidence?.confidence||0,min_confidence:p?.evidence?.minConfidence||0,corrected:!!p?.corrected},p_confirmed:manual});
  if(actor!==user?.id)return;tdV59Pending(null);tdV59Apply(r);tdCapture.state='success';tdLive.edited=false;tdV59Message('✓ 入库成功 · '+name+' · '+phone+' · 1件。点击“扫描下一件”继续');const li=document.createElement('li');li.textContent=name+' · '+phone+' · 已入库 · '+r.parcel_number;$('tdLiveRecent')?.prepend(li);while($('tdLiveRecent')?.children.length>5)$('tdLiveRecent').lastChild.remove();tdScanFeedback();
 }catch(e){tdLive.edited=true;tdCapture.state='review';tdV59Message((tdLive.pending?'结果待核实，禁止重复入库：':'图片已保留，请人工核对：')+e.message)}finally{tdLive.busy=false;tdNav.pending=Math.max(0,tdNav.pending-1);tdV60Controls()}
};

tdV59Resolve=async function(){if(!tdLive.pending||tdLive.busy||tdCapture.processing||!navigator.onLine)return;tdLive.busy=true;tdNav.pending++;tdV60Controls();try{const r=await tdScanRpc('td_live_request_v59',{p_request:tdLive.pending});tdV59Pending(null);tdV59Apply(r);if(r){tdCapture.state='success';$('tdLiveName').value=r.customer?.name||'';$('tdLivePhone').value=r.customer?.phone||'';tdLive.edited=false;tdV59Message('✓ 上次已入库 · '+(r.customer?.name||'')+' · '+(r.customer?.phone||'')+'。点击扫描下一件，不要重复入库')}else{tdCapture.state='review';tdLive.edited=true;tdV59Message('上次未入库，迟到请求已封存，请核对冻结图片后重新确认')}}catch(e){tdV59Message('仍无法核实：'+e.message)}finally{tdLive.busy=false;tdNav.pending=Math.max(0,tdNav.pending-1);tdV60Controls()}};
