"""V62.2 compact layout and interaction regression; existing business handlers mocked independently."""
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
 # Compact order, two-column fields, touch sizes and phone widths.
 for width,height in [(320,568),(360,740),(390,844),(430,932)]:
  pg.set_viewport_size({'width':width,'height':height});assert pg.evaluate('document.body.scrollWidth<=innerWidth')
  assert pg.locator('.td-compact-top h1').inner_text()=='扫码入库';assert pg.locator('#tdLivePanel .td-live-heading').count()==0
  assert pg.locator('#tdV62Notes').evaluate('(x)=>x.tagName')=='INPUT'
  for left,right in [('#tdLiveName','#tdLivePhone'),('#tdV62Pieces','#tdV62Weight')]:
   a=pg.locator(left).bounding_box();b1=pg.locator(right).bounding_box();assert abs(a['y']-b1['y'])<2 and a['x']<b1['x'],(width,a,b1)
  elements=['.td-compact-top','.td-live-camera','.td-compact-camera-actions','#tdV622CustomerPicker','.td-compact-pair','#tdV62Notes','#tdLiveManual'];ys=[pg.locator(x).first.bounding_box()['y'] for x in elements];assert ys==sorted(ys),(width,ys)
  assert pg.locator('button:visible').evaluate_all('(xs)=>xs.every(x=>x.getBoundingClientRect().height>=43)')
  if width>=390:assert pg.locator('#tdLiveManual').bounding_box()['y']+pg.locator('#tdLiveManual').bounding_box()['height']<height
 pg.set_viewport_size({'width':390,'height':844});pg.locator('#page').screenshot(path='/tmp/v622-compact-'+engine+'.png')
 assert not pg.locator('#tdV62CustomerTerm').is_visible();assert not pg.locator('#tdV622Advanced').evaluate('(x)=>x.open');assert not pg.locator('#tdV59Legacy').evaluate('(x)=>x.open')
 assert pg.get_by_role('button',name='搜索客户',exact=True).count()==0
 # Debounce typing and discard stale older search results without a Search button.
 pg.evaluate("""()=>{window.__searches=[];const old=db.rpc.bind(db);db.rpc=async(name,args)=>{if(name==='td_scan_customers_v57'){__searches.push(args.p_term);if(args.p_term==='old')await new Promise(ok=>window.__releaseSearch=ok);return {data:[{id:args.p_term,name:args.p_term==='old'?'Old Customer':'Current Customer',phone:'09967676761'}]}}return old(name,args)}}""")
 pg.locator('#tdV622CustomerPicker > summary').click();pg.locator('#tdV62CustomerTerm').fill('old');pg.wait_for_function('__searches.length===1');pg.locator('#tdV62CustomerTerm').fill('099');pg.wait_for_function('__searches.length===2');pg.locator('#tdV62Customers button').wait_for();pg.evaluate('__releaseSearch()');pg.wait_for_timeout(150);assert 'Old Customer' not in pg.locator('#tdV62Customers').inner_text();pg.locator('#tdV62Customers button').click()
 assert not pg.locator('#tdV622CustomerPicker').evaluate('(x)=>x.open');assert pg.locator('#tdLiveName').input_value()=='Current Customer';assert pg.locator('#tdLivePhone').input_value()=='09967676761'
 # Shutter activates preview on first tap; torch reflects device capability and makes no business call.
 pg.evaluate("""()=>{const old=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=async opts=>{const s=await old(opts);const track={enabled:true,stop(){__stops++},getCapabilities(){return {torch:true}},applyConstraints:async c=>{window.__torchConstraint=c}};s.getVideoTracks=()=>[track];return s}}""")
 pg.locator('#tdPhotoShutter').click();pg.wait_for_function('tdLive.running');assert pg.evaluate('__captureCalls')==0;assert pg.locator('#tdV622Torch').is_enabled();pg.locator('#tdV622Torch').click();pg.wait_for_function('tdV622.torch');assert pg.evaluate('__torchConstraint.advanced[0].torch') is True;pg.locator('#tdV622Torch').click();pg.wait_for_function('!tdV622.torch')
 # Gold confirm reuses manual intake, stopping preview as an interaction convenience.
 pg.locator('#tdV62Pieces').fill('3');pg.locator('#tdV62Weight').fill('1.275');pg.locator('#tdV62Notes').fill('备注不变');pg.locator('#tdLiveManual').click();pg.wait_for_function("tdPhoto.phase==='success' && !tdLive.busy");payload=pg.evaluate("__liveCalls.filter(x=>x.name==='td_intake_v62').at(-1).args");assert payload['p_confirmed'] is True;assert payload['p_payload']['customer_id']=='099' and payload['p_payload']['pieces']==3 and payload['p_payload']['weight_kg']==1.275 and payload['p_payload']['notes']=='备注不变';assert not pg.evaluate('tdLive.running')
 pg.evaluate('tdV59Stop(true)')
 # Gallery uses file chooser without forced camera capture; no selection causes no OCR or intake.
 before=pg.evaluate('__captureCalls')
 with pg.expect_file_chooser() as chooser:pg.locator('#tdPhotoNative').click()
 assert pg.locator('#tdPhotoInput').get_attribute('capture') is None;chooser.value.set_files([]);assert pg.evaluate('__captureCalls')==before
 # Opening old tools shows only their form, then restores the compact form when folded.
 pg.locator('#tdV59Legacy > summary').click();assert not pg.locator('#tdLivePanel').is_visible();assert pg.locator('#tdV621Name').is_visible();assert pg.locator('#tdV621CustomerSearch').count()==0;pg.locator('#tdV59Legacy > summary').click();assert pg.locator('#tdLivePanel').is_visible()
 assert errors==[],errors;print(json.dumps({'engine':engine,'compact_phone_widths':4,'ordered_eight_sections':True,'paired_fields_and_touch_sizes':True,'debounced_search_stale_guard':True,'gallery_and_torch':True,'same_intake_payload':True,'one_visible_form':True,'errors':errors}));b.close()
