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
  if '/vendor/supabase-' in u:r.fulfill(content_type='text/javascript',body=STUB)
  elif u.startswith('https://station.test/'):
   f=ROOT/(u.split('https://station.test/')[1].split('?')[0] or 'index.html');r.fulfill(path=str(f)) if f.is_file() else r.fulfill(status=404,body='')
  else:r.abort()
 pg.route('**/*',route);pg.goto('https://station.test/')
 pg.evaluate("""async()=>{user={id:'owner'};role='owner';$('app').classList.remove('hidden');$('auth').classList.add('hidden');await refresh();window.__liveCalls=[];window.__frames=0;window.__stops=0;window.__online=true;window.__requests={};window.__lost=false;window.__text='地址: 广东转运仓（张三13800138000）';window.__captureCalls=0;window.__beeps=0;window.__stalled=false;window.__imageMode='blur';window.__hold=true;Object.defineProperty(navigator,'onLine',{get:()=>__online,configurable:true});const original=db.rpc.bind(db);db.rpc=async(name,args)=>{if(name.startsWith('td_live_')||name==='td_capture_intake_v60'){__liveCalls.push({name,args});if(name==='td_live_capabilities_v59')return {data:{version:59,intake:true,create_customer:true}};if(name==='td_live_resolve_v59')return {data:{status:window.__conflict?'review':'new',reason:'客户冲突',needs_distinct_confirmation:false}};if(name==='td_capture_intake_v60'){const r={success:true,parcel_number:'TD59'+args.p_request.replaceAll('-',''),parcel:{id:args.p_request,pieces:1,remaining:1},customer:{id:'live-customer',name:args.p_payload.name,phone:args.p_payload.phone}};__requests[args.p_request]=r;return __lost?{error:{message:'response lost'}}:{data:r}};if(name==='td_live_request_v59')return {data:__requests[args.p_request]||null}}if(name==='td_scan_capabilities_v57')return {data:{version:57,intake:true,pickup:true,finance:true}};return original(name,args)};
 const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image instanceof HTMLVideoElement){this.fillStyle=__imageMode==='dark'?'#111':'#ddd';this.fillRect(0,0,this.canvas.width,this.canvas.height);if(__imageMode==='clear')for(let y=5;y<this.canvas.height;y+=15){this.fillStyle='#222';this.fillRect(5,y,this.canvas.width-10,3)}return}return draw.call(this,image,...args)};
 HTMLMediaElement.prototype.play=async()=>{};Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async opts=>{window.__constraints=opts;if(window.__deny)throw new DOMException('denied','NotAllowedError');const stream=new MediaStream();stream.getTracks=()=>[{stop(){__stops++}}];stream.getVideoTracks=()=>[];return stream}}});
 TDLabelOCR.recognizeCanvas=async()=>{throw Error('continuous OCR must not run')};TDLabelOCR.recognizeFrozen=async canvas=>{__captureCalls++;if(__hold)await new Promise(r=>window.__releaseOCR=r);const p=TDCaptureV60.parse(__text);return {text:__text,words:[{text:p.name,confidence:99},{text:p.phone_raw||p.phone,confidence:98}],confidence:98,minConfidence:98}};TDLabelOCR.stop=async()=>{};tdScanFeedback=()=>{__beeps++};tdNavigate('scanIntake');const video=$('tdLiveVideo');Object.defineProperties(video,{videoWidth:{get:()=>2560},videoHeight:{get:()=>1440},readyState:{get:()=>4},currentTime:{get:()=>__stalled?0:Date.now()/1000}})}""")
 pg.wait_for_function('tdScan.ready')
 pg.locator('#tdLiveStart').click();pg.wait_for_function('tdLive.running');assert pg.locator('#tdLiveName').is_disabled();assert pg.locator('#tdLiveManual').is_disabled();pg.wait_for_function("document.getElementById('tdLiveStatus').textContent.includes('清晰')")
 assert pg.evaluate('__captureCalls')==0
 pg.evaluate("__imageMode='clear';__stalled=true");pg.wait_for_timeout(1400);assert pg.evaluate('__captureCalls')==0;pg.evaluate('__stalled=false');pg.wait_for_function('__captureCalls===1')
 assert pg.locator('#tdCaptureFrozen').is_visible();assert not pg.locator('#tdLiveVideo').is_visible();assert pg.evaluate('tdLive.stream===null && __stops>0 && __beeps===1')
 assert pg.evaluate("document.getElementById('tdCaptureFrozen').width")>=1600
 assert not any(x['name']=='td_capture_intake_v60' for x in pg.evaluate('__liveCalls'))
 pg.evaluate('__hold=false;__releaseOCR()');pg.wait_for_function("tdCapture.state==='success' && !tdCapture.processing && !tdLive.busy")
 assert pg.locator('#tdLiveName').input_value()=='张三';assert pg.locator('#tdLivePhone').input_value()=='13800138000';assert pg.locator('#tdLiveStart').inner_text()=='扫描下一件'
 calls=pg.evaluate('__captureCalls');pg.wait_for_timeout(1500);assert pg.evaluate('__captureCalls')==calls;assert not pg.evaluate('tdLive.running')
 # Next is an explicit action. Failed recognition keeps the same frozen image for editing.
 pg.evaluate("__text='地址: (李明138****8000)'");pg.locator('#tdLiveStart').click();pg.wait_for_function("tdCapture.state==='review' && !tdCapture.processing")
 assert pg.locator('#tdCaptureFrozen').is_visible();assert pg.evaluate('__captureCalls')==2;assert pg.evaluate("__liveCalls.filter(x=>x.name==='td_capture_intake_v60').length")==1
 pg.locator('#tdLiveName').fill('李明');pg.locator('#tdLivePhone').fill('09943253053');pg.locator('#tdLiveManual').click();pg.wait_for_function("tdCapture.state==='success' && !tdLive.busy")
 assert pg.evaluate("__liveCalls.filter(x=>x.name==='td_capture_intake_v60').at(-1).args.p_confirmed") is True
 # A lost response blocks all new attempts; recovery must show original success.
 pg.evaluate("__text='地址: (Aung Kyaw09922222222)';__lost=true");pg.locator('#tdLiveStart').click();pg.wait_for_function('!!tdLive.pending && !tdLive.busy && !tdCapture.processing')
 n=pg.evaluate('__liveCalls.length');pg.locator('#tdLiveManual').click(force=True);assert pg.evaluate('__liveCalls.length')==n
 pg.locator('#tdLiveResolve').click();pg.wait_for_function("!tdLive.pending && tdCapture.state==='success' && !tdLive.busy")
 assert pg.locator('#tdLivePhone').input_value()=='09922222222'
 # Cancel a held OCR: keep image, discard late result, and release pending state.
 pg.evaluate("__text='地址: (王小明09933333333)';__lost=false;__hold=true");pg.locator('#tdLiveStart').click();pg.wait_for_function('tdCapture.processing && __captureCalls===4');before=pg.evaluate("__liveCalls.filter(x=>x.name==='td_capture_intake_v60').length")
 pg.evaluate('tdV59Stop()');assert pg.locator('#tdCaptureFrozen').is_visible();pg.evaluate('__hold=false;__releaseOCR()');pg.wait_for_function('!tdCapture.processing && tdNav.pending===0');assert pg.evaluate("__liveCalls.filter(x=>x.name==='td_capture_intake_v60').length")==before
 pg.evaluate('tdNavigate("scanQuery")');assert not pg.evaluate('tdLive.running')
 assert errors==[],errors;print(json.dumps({'engine':engine,'no_continuous_ocr':True,'clear_one_second_capture_freeze_before_ocr':True,'one_commit_until_explicit_next':True,'failed_image_retained_edit_rescan':True,'lost_response_recovery_and_late_result_cancel':True,'errors':errors}));b.close()
