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
 pg.evaluate("""async()=>{user={id:'owner'};role='owner';$('app').classList.remove('hidden');$('auth').classList.add('hidden');await refresh();window.__liveCalls=[];window.__frames=0;window.__stops=0;window.__online=true;window.__requests={};window.__lost=false;window.__text='地址: 广东省仓库, 张三 13800138000';Object.defineProperty(navigator,'onLine',{get:()=>__online,configurable:true});const original=db.rpc.bind(db);db.rpc=async(name,args)=>{if(name.startsWith('td_live_')){__liveCalls.push({name,args});if(name==='td_live_capabilities_v59')return {data:{version:59,intake:true,create_customer:true}};if(name==='td_live_resolve_v59')return {data:{status:window.__conflict?'review':'new',reason:'客户冲突',needs_distinct_confirmation:false}};if(name==='td_live_intake_v59'){const r={success:true,parcel_number:'TD59'+args.p_request.replaceAll('-',''),parcel:{id:args.p_request,pieces:1,remaining:1},customer:{id:'live-customer',name:args.p_payload.name,phone:args.p_payload.phone}};__requests[args.p_request]=r;return __lost?{error:{message:'response lost'}}:{data:r}};if(name==='td_live_request_v59')return {data:__requests[args.p_request]||null}}if(name==='td_scan_capabilities_v57')return {data:{version:57,intake:true,pickup:true,finance:true}};return original(name,args)};
 const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image instanceof HTMLVideoElement){this.fillStyle='white';this.fillRect(0,0,this.canvas.width,this.canvas.height);return}return draw.call(this,image,...args)};
 HTMLMediaElement.prototype.play=async()=>{};Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async opts=>{window.__constraints=opts;if(window.__deny)throw new DOMException('denied','NotAllowedError');const stream=new MediaStream();stream.getTracks=()=>[{stop(){__stops++}}];return stream}}});
 TDLabelOCR.recognizeCanvas=async canvas=>{__frames++;const p=TDLiveV59.parse(__text);return {text:__text,words:[{text:p.name,confidence:99},{text:p.phone_raw||p.phone,confidence:98}],confidence:98,minConfidence:98}};TDLabelOCR.stop=async()=>{};tdNavigate('scanIntake');const video=$('tdLiveVideo');Object.defineProperties(video,{videoWidth:{get:()=>1920},videoHeight:{get:()=>1080},readyState:{get:()=>4}})}""")
 pg.wait_for_function('tdScan.ready');assert pg.locator('#tdLivePanel').is_visible();assert not pg.locator('#tdV59Legacy').evaluate('(e)=>e.open')
 pg.locator('#tdLiveStart').click();pg.wait_for_function("__liveCalls.filter(x=>x.name==='td_live_intake_v59').length===1")
 assert pg.evaluate('__constraints.video.facingMode.ideal')=='environment';pg.wait_for_function('__frames>=7');assert pg.evaluate("__liveCalls.filter(x=>x.name==='td_live_intake_v59').length") == 1
 # Same client after genuine no-label presentations requires an explicit other-parcel assertion.
 pg.evaluate("__text=''");pg.wait_for_function('!tdLive.gate.locked');pg.evaluate("__text='地址: 广东省仓库, 张三 13800138000'");pg.wait_for_function("document.getElementById('tdLiveStatus').textContent.includes('此客户已入库过')")
 assert pg.evaluate("__liveCalls.filter(x=>x.name==='td_live_intake_v59').length")==1
 pg.locator('#tdLiveManual').click();pg.wait_for_function("__liveCalls.filter(x=>x.name==='td_live_intake_v59').length===2");assert pg.evaluate("__liveCalls.filter(x=>x.name==='td_live_intake_v59').at(-1).args.p_confirmed") is True
 pg.evaluate("__text=''");pg.wait_for_function('!tdLive.gate.locked');pg.evaluate("__text='地址: 转运仓库, 李明 09943253053'");pg.wait_for_function("__liveCalls.filter(x=>x.name==='td_live_intake_v59').length===3");assert pg.locator('#tdLiveRecent li').count()==3;assert pg.evaluate("data.td_parcels.filter(x=>x.remaining===1 && /^[a-f0-9-]{36}$/.test(x.id)).length")==3
 # Stop is a physical track stop, not only a hidden preview.
 pg.locator('#tdV59Legacy > summary').click();assert pg.evaluate('__stops>0 && tdLive.stream===null')
 pg.locator('#tdLiveName').fill('Manual Client');pg.locator('#tdLivePhone').fill('09922222222');pg.evaluate('__online=false');pg.locator('#tdLiveManual').click();assert pg.evaluate("__liveCalls.filter(x=>x.name==='td_live_intake_v59').length")==3
 pg.evaluate('__online=true;__lost=true');pg.locator('#tdLiveManual').click();pg.wait_for_function('!!tdLive.pending && !tdLive.busy');n=pg.evaluate('__liveCalls.length');pg.locator('#tdLiveManual').click();assert pg.evaluate('__liveCalls.length')==n
 pg.locator('#tdLiveResolve').click();pg.wait_for_function('!tdLive.pending && !tdLive.busy');assert '上次已入库' in pg.locator('#tdLiveStatus').inner_text()
 pg.evaluate('__deny=true');pg.locator('#tdLiveStart').click();pg.wait_for_function("document.getElementById('tdLiveStatus').textContent.includes('无法开始')");assert not pg.evaluate('tdLive.running')
 assert pg.evaluate("getComputedStyle(document.getElementById('tdLiveName')).backgroundColor")!='rgb(255, 255, 255)'
 pg.evaluate('tdNavigate("scanQuery")');assert pg.evaluate('tdLive.stream===null && !tdLive.running')
 assert errors==[],errors;print(json.dumps({'engine':engine,'continuous_camera_auto_intake':True,'same_presentation_and_same_client_protection':True,'manual_distinct_offline_uncertain_recovery_permission_and_release':True,'errors':errors}));b.close()
