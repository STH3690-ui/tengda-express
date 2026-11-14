"""V58 mobile intake/edit orchestration. Mocked business transport; real OCR in browser_v58_ocr.py."""
import ast,json,os,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
tree=ast.parse((ROOT/'tests/browser_history_relations.py').read_text())
STUB=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='STUB' for t in n.targets))
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
 pg.evaluate("""async()=>{user={id:'owner'};role='owner';$('app').classList.remove('hidden');$('auth').classList.add('hidden');await refresh();window.__v58=[];window.__state='matched';window.__online=true;Object.defineProperty(navigator,'onLine',{get:()=>__online,configurable:true});const original=db.rpc.bind(db);db.rpc=async(name,args)=>{if(name.startsWith('td_label_')){__v58.push({name,args});if(name==='td_label_capabilities_v58')return {data:{version:58,intake:true,create_customer:true,parcel_edit:true}};if(name==='td_label_resolve_v58')return {data:{status:__state,reason:__state,customer_id:'c'}};if(name==='td_label_intake_v58'){if(window.__lost)return {error:{message:'Response lost'}};return {data:{success:true,parcel_id:'saved',customer_created:__state==='new'}}}if(name==='td_label_request_v58')return {data:null}}if(name==='td_scan_capabilities_v57')return {data:{version:57,intake:true,pickup:true,finance:true}};return original(name,args)};uploadPhotos=async()=>{window.__photo=true};tdNavigate('scanIntake')}""")
 pg.wait_for_function('tdScan.ready');assert pg.locator('#tdV58PreviewPanel').is_visible()
 text='运单号: TD12345678\n收件人: 安康\n手机号: 09943253053'
 def preview(value):
  pg.locator('#tdV58Text').fill(value);pg.get_by_role('button',name='核对并匹配客户',exact=True).click()
  pg.wait_for_function("!document.getElementById('tdV58Commit').disabled || document.getElementById('tdV58Result').textContent.includes('核对') || document.getElementById('tdV58Result').textContent.includes('review')")
 preview(text.replace('09943253053','099****3053'));assert pg.locator('#tdV58Commit').is_disabled();assert not any(x['name']=='td_label_intake_v58' for x in pg.evaluate('__v58'))
 preview(text);pg.wait_for_function("!document.getElementById('tdV58Commit').disabled")
 pg.evaluate('__online=false');pg.get_by_role('button',name='人工确认并入库',exact=True).click();assert not any(x['name']=='td_label_intake_v58' for x in pg.evaluate('__v58'));pg.evaluate('__online=true')
 pg.get_by_role('button',name='人工确认并入库',exact=True).click();pg.wait_for_function('!tdLabel.busy');assert pg.evaluate("__v58.filter(x=>x.name==='td_label_intake_v58').length") == 1
 assert pg.evaluate("__v58.find(x=>x.name==='td_label_intake_v58').args.p_confirmed") is True
 pg.evaluate("__state='review'");preview(text);pg.wait_for_function("document.getElementById('tdV58Result').textContent.includes('review')");assert pg.locator('#tdV58Commit').is_disabled()
 pg.evaluate("__state='matched';window.__lost=true");preview(text);pg.wait_for_function("!document.getElementById('tdV58Commit').disabled");pg.locator('#tdV58Commit').click();pg.wait_for_function('!!tdLabel.pending && !tdLabel.busy');before=len(pg.evaluate('__v58'));pg.locator('#tdV58Commit').click();assert len(pg.evaluate('__v58'))==before
 pg.locator('#tdV58Resolve').click();pg.wait_for_function('!tdLabel.pending && !tdLabel.busy');assert pg.evaluate("sessionStorage.getItem(tdV58Key())") is None
 # Actual UI photo path, high-confidence engine and independent barcode mocked independently.
 pg.evaluate("""()=>{window.__lost=false;__state='new';TDLabelOCR.recognize=async()=>({text:'运单号: TD12345678\\n收件人: 安康\\n手机号: 09943253053',confidence:99,minConfidence:96});ZXing.BrowserMultiFormatReader.prototype.decodeFromImageUrl=async()=>({getText:()=>'TD12345678'})}""")
 pg.locator('#tdV58Auto').check();pg.locator('#tdV58Create').check();pg.locator('#tdV58Photo').set_input_files(str(ROOT/'icon-512.png'));pg.wait_for_function('window.__photo===true && !tdLabel.busy')
 last=pg.evaluate("__v58.filter(x=>x.name==='td_label_intake_v58').at(-1)");assert last['args']['p_confirmed'] is False;assert last['args']['p_payload']['allow_create'] is True
 assert errors==[],errors
 print(json.dumps({'engine':engine,'manual_masked_conflict_offline_lost_response_fence':True,'auto_intake_photo_customer_optin':True,'errors':errors}));b.close()
