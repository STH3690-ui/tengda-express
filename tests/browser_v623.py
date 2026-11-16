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
   f=(ROOT/'dist' if os.environ.get('TD_TEST_DIST') else ROOT)/(u.split('https://station.test/')[1].split('?')[0] or 'index.html');r.fulfill(path=str(f)) if f.is_file() else r.fulfill(status=404,body='')
  else:r.abort()
 pg.route('**/*',route);pg.goto('https://station.test/')
 pg.evaluate("""async()=>{user={id:'owner'};role='owner';$('app').classList.remove('hidden');$('auth').classList.add('hidden');await refresh();window.__calls=[];window.__ocr=0;window.__uploads=[];window.__results={};window.__online=true;Object.defineProperty(navigator,'onLine',{get:()=>__online,configurable:true});const old=db.rpc.bind(db);db.rpc=async(name,args)=>{__calls.push({name,args});if(name==='td_scan_capabilities_v57')return {data:{version:57,intake:true,pickup:true,finance:true}};if(name==='td_scan_customers_v57')return {data:[{id:'existing-client',name:'Existing Client',phone:'09922223333'}]};if(name==='td_intake_v62'){const r={success:true,parcel_id:args.p_request,parcel_number:'TD62TEST'+__calls.length,parcel:{id:args.p_request,pieces:args.p_payload.pieces,remaining:args.p_payload.pieces,weight_kg:args.p_payload.weight_kg},customer:{id:args.p_payload.customer_id||'matched-client',name:args.p_payload.name,phone:args.p_payload.phone}};__results[args.p_request]=r;if(window.__lost)return {error:{message:'response lost'}};return {data:r}};if(name==='td_intake_request_v62')return {data:__results[args.p_request]||null};return old(name,args)};TDLabelOCR.recognize=async()=>{__ocr++;throw Error('OCR unavailable in manual test')};uploadPhotos=async(id,files)=>{__uploads.push({id,count:files.length});return 'saved'};tdNavigate('home')}""")
 pg.wait_for_function('tdScan.ready') if pg.evaluate("page==='scanIntake'") else None
 pg.locator('[data-route="scan"]').click();pg.locator('[data-route="scanIntake"]').click();pg.wait_for_function('tdScan.ready');pg.locator('#tdV59Legacy > summary').click()
 for width,height in [(320,568),(360,740),(390,844),(430,932)]:
  pg.set_viewport_size({'width':width,'height':height});assert pg.evaluate('document.body.scrollWidth<=innerWidth')
  assert not pg.locator('#tdLivePanel').is_visible();assert pg.locator('#tdV58PreviewPanel').is_visible()
  for id in ['tdScanVideo','tdScanStart','tdV623Album','tdScanTorch','tdScanInput','tdV621Name','tdV621Phone','tdV58Pieces','tdV58Weight','tdV623Notes','tdV58Commit']:assert pg.locator('#'+id).is_visible(),id
  for id in ['tdV58Text','tdV58Auto','tdV58Create','tdV58Upload','tdV621OCR']:assert not pg.locator('#'+id).is_visible(),id
  assert pg.locator('#tdV623Advanced').evaluate('(x)=>!x.open')
  for a,b1 in [('#tdV621Name','#tdV621Phone'),('#tdV58Pieces','#tdV58Weight')]:assert abs(pg.locator(a).bounding_box()['y']-pg.locator(b1).bounding_box()['y'])<2
  assert pg.locator('#tdV623Notes').evaluate('(x)=>x.tagName')=='INPUT'
  selectors=['#tdScanVideo','#tdScanStart','#tdScanInput','#tdV623CustomerPicker','#tdV621Name','#tdV58Pieces','#tdV623Notes','#tdV58Commit'];ys=[pg.locator(x).bounding_box()['y'] for x in selectors];assert ys==sorted(ys),(width,ys)
  assert pg.evaluate("document.querySelectorAll('#tdScanInput').length===1 && document.querySelectorAll('#tdScanVideo').length===1")
 pg.set_viewport_size({'width':390,'height':844});pg.locator('#page').screenshot(path='/tmp/v623-traditional-'+engine+'.png')
 # HID stages only a validated waybill in the shared form; no write until explicit confirmation.
 pg.evaluate("""()=>{const old=db.rpc.bind(db);db.rpc=async(name,args)=>{if(name==='td_scan_lookup_v57'){__calls.push({name,args});return {data:[]}}return old(name,args)}}""")
 pg.locator('#tdScanInput').fill('TRAD6230001');pg.locator('#tdScanInput').press('Enter');pg.wait_for_function("!tdV623.staging && tdScan.queued===0 && $('tdScanInput').value==='TRAD6230001'");assert pg.evaluate('tdScan.rows.length')==0;assert pg.evaluate("__calls.filter(x=>x.name==='td_intake_v62').length")==0
 pg.evaluate("tdScanAccept('TRAD6230002','camera')");assert pg.locator('#tdScanInput').input_value()=='TRAD6230001'
 pg.locator('#tdV623CustomerPicker > summary').click();pg.locator('#tdV621CustomerTerm').fill('099222');pg.locator('#tdV621Customers button').click();assert not pg.locator('#tdV623CustomerPicker').evaluate('(x)=>x.open')
 pg.locator('#tdV58Pieces').fill('3');pg.locator('#tdV58Weight').fill('1.275');pg.locator('#tdV623Notes').fill('易碎包裹');pg.locator('#tdV58Commit').click();pg.wait_for_function('!tdLabel.busy && !tdLabel.pending')
 payload=pg.evaluate("__calls.find(x=>x.name==='td_intake_v62').args.p_payload");assert payload['tracking_no']=='TRAD6230001' and payload['customer_id']=='existing-client' and payload['pieces']==3 and payload['weight_kg']==1.275 and payload['notes']=='易碎包裹';assert pg.evaluate('__ocr')==0
 # Legacy settings remain available only after expanding Advanced.
 pg.locator('#tdV623Advanced > summary').click()
 for id in ['tdV58Text','tdV58Auto','tdV58Create','tdV58Upload','tdV621OCR']:assert pg.locator('#'+id).is_visible(),id
 pg.locator('#tdV623Batch > summary').click();pg.locator('#tdV623BatchMode').check();pg.locator('#tdScanInput').fill('BATCH6230001');pg.locator('#tdScanInput').press('Enter');pg.wait_for_function('tdScan.rows.length===1 && !tdScan.queued');pg.locator('#tdV623BatchMode').evaluate('(x)=>{x.checked=false;x.dispatchEvent(new Event("change",{bubbles:true}))}');assert pg.locator('#tdV623BatchMode').is_checked() # No silent loss of staged packages.
 pg.evaluate("tdScan.rows=[];tdScanRenderRows()");pg.locator('#tdV623BatchMode').uncheck()
 # Query/pickup pages retain their original scanner without duplicate IDs.
 for target in ['scanQuery','scanPickup']:
  pg.evaluate('tdNavigate('+json.dumps(target)+')');pg.wait_for_function('tdScan.ready');assert pg.locator('#tdScanInput').count()==1 and pg.locator('#tdScanVideo').count()==1
 assert errors==[],errors;print(json.dumps({'engine':engine,'actual_scan_hub_traditional_route':True,'phone_widths':4,'compact_order_and_paired_fields':True,'advanced_settings_hidden_then_available':True,'single_scan_stages_without_write':True,'same_customer_pieces_weight_notes_payload':True,'batch_retained_no_staged_loss':True,'no_duplicate_scanner_ids':True,'errors':errors}));b.close()
