"""Actual legacy component rendering/routes and OCR-free intake; transport is mocked, no production writes."""
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
 pg.evaluate("""async()=>{user={id:'owner'};role='owner';$('app').classList.remove('hidden');$('auth').classList.add('hidden');await refresh();window.__calls=[];window.__ocr=0;window.__uploads=[];window.__results={};window.__online=true;Object.defineProperty(navigator,'onLine',{get:()=>__online,configurable:true});const old=db.rpc.bind(db);db.rpc=async(name,args)=>{__calls.push({name,args});if(name==='td_scan_capabilities_v57')return {data:{version:57,intake:true,pickup:true,finance:true}};if(name==='td_scan_customers_v57')return {data:[{id:'existing-client',name:'Existing Client',phone:'09922223333'}]};if(name==='td_intake_v62'){const r={success:true,parcel_id:args.p_request,parcel_number:'TD62TEST'+__calls.length,parcel:{id:args.p_request,pieces:args.p_payload.pieces,remaining:args.p_payload.pieces,weight_kg:args.p_payload.weight_kg},customer:{id:args.p_payload.customer_id||'matched-client',name:args.p_payload.name,phone:args.p_payload.phone}};__results[args.p_request]=r;if(window.__lost)return {error:{message:'response lost'}};return {data:r}};if(name==='td_intake_request_v62')return {data:__results[args.p_request]||null};return old(name,args)};TDLabelOCR.recognize=async()=>{__ocr++;throw Error('OCR unavailable in manual test')};uploadPhotos=async(id,files)=>{__uploads.push({id,count:files.length});return 'saved'};tdNavigate('home')}""")
 def panel():
  pg.wait_for_function('tdScan.ready');pg.locator('#tdV59Legacy > summary').click()
  for id in ['tdV621CustomerTerm','tdV621Name','tdV621Phone','tdV58Pieces','tdV58Weight','tdV58Upload']:
   assert pg.locator('#'+id).is_visible(),id
   assert pg.locator('#'+id).is_enabled(),id
  assert pg.locator('#tdV58Text').input_value()=='' and pg.evaluate('__ocr')==0
  assert pg.evaluate("!!($('tdV58Text').compareDocumentPosition($('tdV621CustomerTerm'))&Node.DOCUMENT_POSITION_FOLLOWING)&&!!($('tdV621Phone').compareDocumentPosition($('tdV58Pieces'))&Node.DOCUMENT_POSITION_FOLLOWING)")
 # Actual home photo entrance and actual scanner hub entrance both render the same fixed legacy component.
 pg.locator('.td-live-launch').click();panel();pg.evaluate('tdNavigate("home")');pg.locator('[data-route="scan"]').click();pg.locator('[data-route="scanIntake"]').click();panel()
 # All three fields are visible before any capture, scan or recognized text.
 pg.locator('#tdV58PreviewPanel').screenshot(path='/tmp/v621-legacy-'+engine+'.png')
 pg.locator('#tdV621CustomerTerm').fill('099222');pg.locator('#tdV621Customers button').click();assert pg.locator('#tdV621Name').input_value()=='Existing Client';assert pg.locator('#tdV621Phone').input_value()=='09922223333'
 pg.locator('#tdV58Pieces').fill('3');pg.locator('#tdV58Weight').fill('1.275');assert pg.locator('#tdV58Commit').is_enabled();pg.locator('#tdV58Commit').click();pg.wait_for_function('!tdLabel.busy && !tdLabel.pending')
 first=pg.evaluate("__calls.find(x=>x.name==='td_intake_v62').args");assert first['p_confirmed'] is True;assert first['p_payload']['customer_id']=='existing-client' and first['p_payload']['pieces']==3 and first['p_payload']['weight_kg']==1.275 and first['p_payload']['tracking_no']=='';assert pg.evaluate('__ocr')==0
 # Manual customer data and optional photo save work even when OCR is turned OFF.
 pg.locator('#tdV621Name').fill('Manual Client');pg.locator('#tdV621Phone').fill('09933334444');pg.locator('#tdV621OCR').uncheck();pg.locator('#tdV58Photo').set_input_files(str(ROOT/'icon-512.png'));pg.locator('#tdV58Weight').fill('');pg.locator('#tdV58Commit').click();pg.wait_for_function('__uploads.length===1 && !tdLabel.busy');assert pg.evaluate('__ocr')==0
 second=pg.evaluate("__calls.filter(x=>x.name==='td_intake_v62').at(-1).args.p_payload");assert second['customer_id'] is None and second['name']=='Manual Client' and second['weight_kg']==0;assert pg.locator('#tdV58Upload').is_checked()
 # Editing an existing choice clears its ID so authoritative rematching handles conflicts.
 pg.locator('#tdV621CustomerTerm').fill('Existing');pg.locator('#tdV621Customers button').click();pg.locator('#tdV621Name').fill('Changed Name');assert pg.evaluate('tdV621.selected===null')
 pg.evaluate('__online=false');n=pg.evaluate("__calls.filter(x=>x.name==='td_intake_v62').length");pg.locator('#tdV58Commit').click();assert pg.evaluate("__calls.filter(x=>x.name==='td_intake_v62').length")==n
 # Pending/lost response blocks repeat and barcode writes; resolving returns original success.
 pg.evaluate('__online=true;__lost=true');pg.locator('#tdV58Commit').click();pg.wait_for_function('tdLabel.pending && !tdLabel.busy');n=pg.evaluate("__calls.filter(x=>x.name==='td_intake_v62').length");pg.evaluate("tdV58Commit(false);tdScanAccept('NEW99999','hid')");assert pg.evaluate("__calls.filter(x=>x.name==='td_intake_v62').length")==n;assert pg.evaluate('tdScan.rows.length')==0
 pg.locator('#tdV58Resolve').click();pg.wait_for_function('!tdLabel.pending && !tdLabel.busy');assert '已提交' in pg.locator('#tdV58Result').inner_text()
 pg.evaluate('tdNavigate("home");tdNavigate("scanIntake")');panel() # direct navigation/re-render
 assert errors==[],errors;print(json.dumps({'engine':engine,'actual_home_and_scan_hub_routes':True,'always_visible_exact_position':True,'selected_and_typed_without_ocr':True,'photo_save_without_ocr':True,'editable_pieces_weight':True,'offline_and_pending_recovery':True,'errors':errors}));b.close()
