"""V59 camera orchestration with simulated video/OCR/transport; real engine checked separately."""
import ast,json,os,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
tree=ast.parse((ROOT/'tests/browser_history_relations.py').read_text());STUB=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='STUB' for t in n.targets))
with sync_playwright() as p:
 engine=os.environ.get('TD_BROWSER_ENGINE','chromium');opts={'executable_path':shutil.which('chromium'),'args':['--no-sandbox']} if engine=='chromium' else {}
 b=getattr(p,engine).launch(**opts);pg=b.new_page(viewport={'width':390,'height':844});errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('dialog',lambda d:d.accept())
 def route(r):
  u=r.request.url
  if u.startswith('blob:'):r.continue_()
  elif '/vendor/supabase-' in u:r.fulfill(content_type='text/javascript',body=STUB)
  elif u.startswith('https://station.test/'):
   f=ROOT/(u.split('https://station.test/')[1].split('?')[0] or 'index.html');r.fulfill(path=str(f)) if f.is_file() else r.fulfill(status=404,body='')
  else:r.abort()
 pg.route('**/*',route);pg.goto('https://station.test/')
 pg.evaluate("""async()=>{user={id:'owner'};role='owner';$('app').classList.remove('hidden');$('auth').classList.add('hidden');await refresh();window.__liveCalls=[];window.__frames=0;window.__stops=0;window.__online=true;window.__requests={};window.__lost=false;window.__text='地址: 广东转运仓（安康+09943253053）';window.__captureCalls=0;window.__beeps=0;window.__stalled=false;window.__imageMode='blur';window.__hold=true;Object.defineProperty(navigator,'onLine',{get:()=>__online,configurable:true});const original=db.rpc.bind(db);db.rpc=async(name,args)=>{if(name.startsWith('td_live_')||name.startsWith('td_intake_')){__liveCalls.push({name,args});if(name==='td_live_capabilities_v59')return {data:{version:59,intake:true,create_customer:true}};if(name==='td_live_resolve_v59')return {data:{status:window.__conflict?'review':'new',reason:'客户冲突',needs_distinct_confirmation:false}};if(name==='td_intake_v62'){const r={success:true,parcel_number:'TD59'+args.p_request.replaceAll('-',''),parcel:{id:args.p_request,pieces:1,remaining:1},customer:{id:'live-customer',name:args.p_payload.name,phone:args.p_payload.phone}};__requests[args.p_request]=r;return __lost?{error:{message:'response lost'}}:{data:r}};if(name==='td_intake_request_v62')return {data:__requests[args.p_request]||null}}if(name==='td_scan_capabilities_v57')return {data:{version:57,intake:true,pickup:true,finance:true}};return original(name,args)};
 const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image instanceof HTMLVideoElement){this.fillStyle=__imageMode==='dark'?'#111':'#ddd';this.fillRect(0,0,this.canvas.width,this.canvas.height);if(__imageMode==='clear')for(let y=5;y<this.canvas.height;y+=15){this.fillStyle='#222';this.fillRect(5,y,this.canvas.width-10,3)}return}return draw.call(this,image,...args)};
 window.ImageCapture=undefined;HTMLMediaElement.prototype.play=async()=>{};Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async opts=>{window.__constraints=opts;if(window.__deny)throw new DOMException('denied','NotAllowedError');const stream=new MediaStream();stream.getTracks=()=>[{stop(){__stops++}}];stream.getVideoTracks=()=>[];return stream}}});
 TDLabelOCR.recognizeCanvas=async()=>{throw Error('continuous OCR must not run')};TDLabelOCR.preload=async()=>{window.__preloads=(window.__preloads||0)+1};TDLabelOCR.recognizeFrozen=async canvas=>{__captureCalls++;if(__hold)await new Promise(r=>window.__releaseOCR=r);const p=TDPhotoV61.parse(__text);return {text:__text,words:[{text:p.name,confidence:99},{text:p.phone_raw||p.phone,confidence:98}],confidence:98,minConfidence:98}};TDLabelOCR.stop=async()=>{window.__workerStops=(window.__workerStops||0)+1};tdScanFeedback=()=>{__beeps++};tdNavigate('scanIntake');const video=$('tdLiveVideo');Object.defineProperties(video,{videoWidth:{get:()=>window.__vw||2560},videoHeight:{get:()=>window.__vh||1440},readyState:{get:()=>4},currentTime:{get:()=>__stalled?0:Date.now()/1000}})}""")
 pg.wait_for_function('tdScan.ready');pg.evaluate('__workerStops=0')
 # V62 existing-customer selection, editable metadata and manual entry before any photo.
 pg.evaluate("""()=>{const old=db.rpc.bind(db);db.rpc=(name,args)=>name==='td_scan_customers_v57'?Promise.resolve({data:[{id:'selected-existing',name:'Existing Customer',phone:'09967676761'}]}):old(name,args)}""")
 pg.locator('#tdV622CustomerPicker > summary').click();pg.locator('#tdV62CustomerTerm').fill('099676');pg.locator('#tdV62Customers').get_by_role('button').click()
 assert pg.locator('#tdLiveName').input_value()=='Existing Customer';assert pg.locator('#tdLivePhone').input_value()=='09967676761'
 pg.locator('#tdV62Pieces').fill('3');pg.locator('#tdV62Weight').fill('1.275');pg.locator('#tdV62Notes').fill('易碎，请轻放');pg.locator('#tdLiveManual').click();pg.wait_for_function("tdPhoto.phase==='success' && !tdLive.busy")
 manual=pg.evaluate("__liveCalls.filter(x=>x.name==='td_intake_v62').at(-1).args.p_payload");assert manual['customer_id']=='selected-existing' and manual['pieces']==3 and manual['weight_kg']==1.275 and manual['notes']=='易碎，请轻放'
 pg.evaluate('tdV59Stop(true);__liveCalls=[];__beeps=0;__preloads=0;__workerStops=0')
 pg.locator('#tdPhotoShutter').click();pg.wait_for_function('tdLive.running');assert pg.locator('#tdLiveName').is_enabled();pg.wait_for_timeout(1500)
 assert pg.evaluate('__captureCalls')==0 # No auto capture regardless of time or scene.
 pg.locator('#tdPhotoShutter').click();pg.wait_for_function('__captureCalls===1')
 assert pg.locator('#tdCaptureFrozen').is_visible();assert not pg.locator('#tdLiveVideo').is_visible();assert pg.evaluate('__beeps===1')
 assert pg.evaluate("document.getElementById('tdCaptureFrozen').width")>=1600
 assert not any(x['name']=='td_intake_v62' for x in pg.evaluate('__liveCalls'))
 pg.evaluate('__hold=false;__releaseOCR()');pg.wait_for_function("tdPhoto.phase==='success' && !tdPhoto.processing && !tdLive.busy")
 assert pg.locator('#tdLiveName').input_value()=='安康';assert pg.locator('#tdLivePhone').input_value()=='09943253053'
 assert pg.evaluate('__captureCalls')==2
 pg.wait_for_function("tdPhoto.phase==='preview' && tdLive.running");pg.wait_for_timeout(1200)
 assert pg.evaluate('__captureCalls')==2;assert pg.evaluate("__liveCalls.filter(x=>x.name==='td_intake_v62').length")==1
 assert pg.evaluate('(__workerStops||0)===0 && __preloads===1') # Reuse camera + worker until leaving.
 # Invalid OCR keeps photo and never guesses or submits.
 pg.evaluate("__text='地址: (李明138****8000)'");pg.locator('#tdPhotoShutter').click();pg.wait_for_function("tdPhoto.phase==='review' && !tdPhoto.processing")
 assert pg.locator('#tdCaptureFrozen').is_visible();assert pg.evaluate('__captureCalls')==5;assert pg.evaluate("__liveCalls.filter(x=>x.name==='td_intake_v62').length")==1
 pg.locator('#tdLiveName').fill('李明');pg.locator('#tdLivePhone').fill('09922222222');pg.evaluate("tdScan.rows=[{tracking_no:'LEGACY001'}]");count=pg.evaluate('__liveCalls.length');pg.locator('#tdLiveManual').click();assert pg.evaluate('__liveCalls.length')==count;pg.evaluate('tdScan.rows=[]');pg.locator('#tdLiveManual').click();pg.wait_for_function("tdPhoto.phase==='success' && !tdLive.busy")
 assert pg.evaluate("__liveCalls.filter(x=>x.name==='td_intake_v62').at(-1).args.p_confirmed") is True
 # Response loss: no new intake until request reconciliation.
 pg.wait_for_function("tdPhoto.phase==='preview'");pg.evaluate("__text='地址: (Aung Kyaw09933333333)';__lost=true");pg.locator('#tdPhotoShutter').click();pg.wait_for_function('!!tdLive.pending && !tdLive.busy && !tdPhoto.processing')
 n=pg.evaluate('__liveCalls.length');pg.locator('#tdLiveManual').click(force=True);assert pg.evaluate('__liveCalls.length')==n
 pg.locator('#tdLiveResolve').click();pg.wait_for_function("!tdLive.pending && tdPhoto.phase==='success' && !tdLive.busy")
 assert pg.locator('#tdLivePhone').input_value()=='09933333333'
 # Offline recognition must not write; image remains editable.
 pg.evaluate("__lost=false;__online=true;__text='地址: (王小明09944444444)'");pg.locator('#tdPhotoShutter').click();pg.wait_for_function('tdLive.running');pg.evaluate('__online=false');before=pg.evaluate("__liveCalls.filter(x=>x.name==='td_intake_v62').length");pg.locator('#tdPhotoShutter').click();pg.wait_for_function('!tdPhoto.processing && tdPhoto.phase==="review"');assert pg.evaluate("__liveCalls.filter(x=>x.name==='td_intake_v62').length")==before
 # Stop a held OCR, discard late response and release navigation interlock.
 pg.evaluate("__online=true;__hold=true");pg.locator('#tdPhotoShutter').click();pg.wait_for_function('tdLive.running');calls=pg.evaluate('__captureCalls');pg.locator('#tdPhotoShutter').click();pg.wait_for_function(f'__captureCalls==={calls+1}')
 pg.evaluate('tdV59Stop()');assert pg.locator('#tdCaptureFrozen').is_visible();pg.evaluate('__hold=false;__releaseOCR()');pg.wait_for_function('!tdPhoto.processing && tdNav.pending===0');assert pg.evaluate("__liveCalls.filter(x=>x.name==='td_intake_v62').length")==before
 # Native HD still photo replaces provisional video crop before OCR.
 pg.evaluate("""()=>{__text='地址: (Aung Win09955555555)';tdLive.edited=false;const old=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=async opts=>{const stream=await old(opts);const track={enabled:true,stop(){__stops++},getCapabilities(){return {}}};stream.getVideoTracks=()=>[track];return stream};window.ImageCapture=class {takePhoto(){return new Promise(ok=>{window.__nativeRelease=()=>{const c=document.createElement('canvas');c.width=3200;c.height=2400;c.getContext('2d').fillRect(0,0,3200,2400);c.toBlob(ok,'image/jpeg')}})}}}""")
 pg.locator('#tdPhotoShutter').click();pg.wait_for_function('tdLive.running');base=pg.evaluate('__captureCalls');pg.locator('#tdPhotoShutter').click();pg.wait_for_function('!!window.__nativeRelease');assert pg.locator('#tdCaptureFrozen').is_visible();assert pg.evaluate('__captureCalls')==base
 pg.evaluate('tdV61Shutter()');assert pg.evaluate('__captureCalls')==base
 pg.evaluate('__nativeRelease()');pg.wait_for_function("tdPhoto.phase==='success' && !tdLive.busy && !tdPhoto.processing")
 proof=pg.evaluate("__liveCalls.filter(x=>x.name==='td_intake_v62').at(-1).args.p_payload");assert proof['source_kind']=='native_photo' and proof['source_width']==3200 and proof['source_height']==2400,{'proof':proof,'source':pg.evaluate('tdPhoto.source'), 'messages':pg.locator('#tdCaptureText').inner_text()}
 pg.wait_for_function("tdPhoto.phase==='preview'")
 # Low resolution original video cannot silently submit thumbnail OCR.
 pg.evaluate("()=>{window.ImageCapture=undefined;__vw=640;__vh=480;window.__nativeAsked=0;tdV61Native=()=>{__nativeAsked++}}");base=pg.evaluate('__captureCalls');pg.locator('#tdPhotoShutter').click();assert pg.evaluate('__nativeAsked')==1,pg.evaluate('({phase:tdPhoto.phase,running:tdLive.running,can:tdV61CanStart(),w:$("tdLiveVideo").videoWidth,pending:tdLive.pending,processing:tdPhoto.processing,status:$("tdLiveStatus").textContent})');assert pg.evaluate('__captureCalls')==base
 pg.evaluate('tdNavigate("scanQuery")');assert not pg.evaluate('tdLive.running')
 # Registered weight sum is editable; any unknown parcel requires actual unified weighing.
 pg.evaluate('tdNavigate("scanPickup")');pg.wait_for_function('tdScan.ready');pg.evaluate("tdScan.rows=[{id:'w1',pieces:3,remaining:2,weight_kg:1.275},{id:'w2',pieces:1,remaining:1,weight_kg:0.5}];tdScanSetWeight()")
 assert pg.locator('#tdScanWeight').input_value()=='1.35';pg.locator('#tdScanWeight').fill('1.8');assert pg.locator('#tdScanWeight').input_value()=='1.8'
 pg.evaluate("tdScan.rows.push({id:'w3',pieces:1,remaining:1,weight_kg:0});tdScanSetWeight()");assert pg.locator('#tdScanWeight').input_value()==''
 # Zero-paid pickup is debt, but must send an existing legal payment method.
 pg.evaluate("""()=>{const old=db.rpc.bind(db);db.rpc=async(name,args)=>{if(name==='td_scan_checkout_v57'){window.__zeroPaid=args.p_payload;return {data:{success:true,batch_id:'zero-paid-test'}}}return old(name,args)};tdScan.rows.forEach(r=>r.customer_id='weigh-customer')}""")
 pg.locator('#tdScanWeight').fill('2');pg.locator('#tdScanName').fill('Debt Receiver');pg.locator('#tdScanPaid').fill('0');pg.get_by_role('button',name='确认收款并完成取件',exact=True).click();pg.wait_for_function('!!window.__zeroPaid && !tdScan.busy');assert pg.evaluate('__zeroPaid.method')=='现金';assert pg.evaluate('__zeroPaid.paid')==0
 assert errors==[],errors;print(json.dumps({'engine':engine,'selected_customer_and_editable_metadata':True,'known_weight_sum_and_unknown_requires_weighing':True,'zero_paid_uses_legal_method':True,'manual_shutter_only':True,'hd_freeze_before_ocr':True,'native_hd_photo_and_low_resolution_guard':True,'two_variant_agreement':True,'automatic_return_no_auto_shutter':True,'worker_reuse':True,'failed_image_manual_edit':True,'lost_response_recovery':True,'offline_no_writes':True,'late_result_cancel':True,'errors':errors}));b.close()
