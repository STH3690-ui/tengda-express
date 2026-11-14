"""Real decoder images + mocked permissions/media/business transport. No production writes."""
import ast,json,os,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
tree=ast.parse((ROOT/'tests/browser_history_relations.py').read_text())
STUB=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='STUB' for t in n.targets))
MOCK=r'''window.__online=true;Object.defineProperty(navigator,'onLine',{get:()=>window.__online,configurable:true});
window.__scanCalls=[];window.__requests={};window.__gumCalls=[];
window.__scanParcel=(code,customer='c',status='pending')=>({id:code,tracking_no:code,customer_id:customer,customer_name:customer==='c'?'测试客户':'其他客户',pieces:2,remaining:status==='picked'?0:2,weight_kg:1.5,category:'普通包裹',arrived_at:'2026-11-13T01:00:00Z',status,pickups:status==='picked'?[{id:'b1',pieces:2,picked_at:'2026-11-13T02:00:00Z'}]:[]});
window.__installScan=()=>{const original=db.rpc.bind(db);const handler=async(name,args)=>{if(!(name.startsWith('td_scan_')||name.startsWith('td_intake_')))return original(name,args);window.__scanCalls.push({name,args});
 if(name==='td_scan_capabilities_v57')return {data:window.__missing?null:{version:57,intake:true,pickup:true,finance:true},error:window.__missing?{message:'RPC missing'}:null};
 if(name==='td_scan_lookup_v57'){const code=args.p_tracking;return {data:code.startsWith('NEW')?[]:code==='AMBIG100'?[__scanParcel(code),__scanParcel(code,'other')]:[__scanParcel(code,code==='OTHER100'?'other':'c',code==='PICKED100'?'picked':code==='HIDDEN100'?'deleted':'pending')]};}
 if(name==='td_scan_customers_v57')return {data:[{id:'c',name:'测试客户',phone:''},{id:'other',name:'其他客户',phone:''}]};
 if(name==='td_intake_batch_v62'){const out=args.p_items.map((x,i)=>({index:i,tracking_no:x.tracking_no,success:i===0,parcel_id:i===0?'saved-id':null,error:i===1?'模拟逐条失败':''}));__requests[args.p_request]={operation:'intake',result:out};return {data:out};}
 if(name==='td_scan_checkout_v57'){if(window.__holdCheckout)await new Promise(r=>window.__releaseCheckout=r);const out={success:true,batch_id:'settled-batch'};__requests[args.p_request]={operation:'pickup',result:out};if(window.__timeout)return {error:{message:'Network response lost'}};return {data:out};}
 if(name==='td_intake_request_v62')return {data:__requests[args.p_request]||null};return {data:null};};db.rpc=(name,args)=>(name.startsWith('td_scan_')||name.startsWith('td_intake_'))?handler(name,args):original(name,args);uploadPhotos=async()=> '成功上传1张照片';};
'''
with sync_playwright() as p:
 engine=os.environ.get('TD_BROWSER_ENGINE','chromium');options={'executable_path':shutil.which('chromium'),'args':['--no-sandbox']} if engine=='chromium' else {}
 browser=getattr(p,engine).launch(headless=True,**options);pg=browser.new_page(viewport={'width':390,'height':844});errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  u=r.request.url
  if '/vendor/supabase-' in u:r.fulfill(status=200,content_type='text/javascript',body=STUB)
  elif u.startswith('https://station.test/'):
   f=ROOT/(u.split('https://station.test/',1)[1].split('?',1)[0] or 'index.html');r.fulfill(path=str(f)) if f.is_file() else r.fulfill(status=404,body='')
  else:r.abort()
 pg.route('**/*',route);pg.goto('https://station.test/')
 pg.evaluate(MOCK);pg.evaluate("async()=>{user={id:'owner'};role='owner';document.getElementById('app').classList.remove('hidden');document.getElementById('auth').classList.add('hidden');await refresh();__installScan()}")
 # Decode generated real barcode images through the shipped decoder, not a mocked decoder result.
 decoded=[]
 for fmt,expected in [('code128','TD12345678'),('code39','TD12345678'),('ean13','5901234123457'),('ean8','96385074'),('qrcode','TD12345678')]:
  import base64
  data=base64.b64encode(Path('/tmp/tengda-scan-fixtures/'+fmt+'.png').read_bytes()).decode()
  got=pg.evaluate("async u=>{const reader=new ZXing.BrowserMultiFormatReader();const r=await reader.decodeFromImageUrl(u);reader.reset();return r.getText()}",'data:image/png;base64,'+data);assert got==expected,(fmt,got);decoded.append(fmt)
 def go(target):
  pg.evaluate('(target)=>tdNavigate(target)',target);pg.wait_for_function('tdScan.ready')
  if target=='scanIntake':pg.locator('#tdV59Legacy > summary').click()
 def scan(code):pg.evaluate('(code)=>tdScanAccept(code)',code)
 accept=lambda d:d.accept();pg.on('dialog',accept)
 go('scanQuery');assert pg.evaluate('__gumCalls.length')==0
 pg.evaluate("()=>{Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async opts=>{__gumCalls.push(opts);throw new DOMException('denied','NotAllowedError')}}})}")
 pg.get_by_role('button',name='开启摄像头',exact=True).click();pg.wait_for_function("document.getElementById('tdScanMessage').textContent.includes('授权被拒绝')")
 # HID scanner in focused input, including Enter terminator.
 pg.locator('#tdScanInput').fill('picked100');pg.locator('#tdScanInput').press('Enter');pg.wait_for_function("document.getElementById('tdScanQueryResult').textContent.includes('已取件')")
 assert not any(x['name'].endswith(('checkout_v57','intake_v57')) for x in pg.evaluate('__scanCalls'))
 scan('NEW00001');assert '未登记' in pg.locator('#tdScanQueryResult').inner_text()
 scan('https://bad.test/evil');assert '网址' in pg.locator('#tdScanMessage').inner_text()
 # Camera allow, rear preference, continuous callbacks, torch, camera switching and release.
 pg.evaluate("""window.__stops=0;window.__torch=[];window.__track={stop(){__stops++},getCapabilities(){return {torch:true}},async applyConstraints(c){__torch.push(c)}};navigator.mediaDevices.getUserMedia=async opts=>{__gumCalls.push(opts);const stream=new MediaStream();stream.getTracks=()=>[__track];stream.getVideoTracks=()=>[__track];return stream};navigator.mediaDevices.enumerateDevices=async()=>[{kind:'videoinput',deviceId:'rear',label:'后置'},{kind:'videoinput',deviceId:'front',label:'前置'}];HTMLMediaElement.prototype.play=async()=>{};ZXing.BrowserMultiFormatReader.prototype.decodeFromStream=async(stream,video,cb)=>{window.__decode=cb};ZXing.BrowserMultiFormatReader.prototype.reset=()=>{};""")
 pg.get_by_role('button',name='开启摄像头',exact=True).click();pg.wait_for_function("!!tdScan.reader || document.getElementById('tdScanMessage').classList.contains('error')");assert pg.evaluate('!!tdScan.reader'),pg.locator('#tdScanMessage').inner_text();assert pg.evaluate('__gumCalls.at(-1).video.facingMode.ideal')=='environment'
 pg.locator('#tdScanTorch').click();assert pg.evaluate('__torch[0].advanced[0].torch') is True
 pg.locator('#tdScanCamera').select_option('front');pg.wait_for_function("__gumCalls.at(-1).video.deviceId?.exact==='front'")
 go('scanIntake');assert pg.evaluate('tdScan.stream===null && __stops>0')
 scan('NEW10001');scan('NEW10002');assert pg.evaluate('tdScan.rows.length')==2;assert pg.evaluate("tdScan.rows.every(x=>!x.customer_id)")
 scan('NEW10001');assert '重复' in pg.locator('#tdScanMessage').inner_text();assert pg.evaluate('tdScan.rows.length')==2
 for i in (0,1):
  pg.locator('#tdScanCustomerTerm'+str(i)).fill('客户');pg.locator('.td-scan-row').nth(i).get_by_role('button',name='搜索客户',exact=True).click();pg.locator('#tdScanCustomers'+str(i)).get_by_role('button',name='测试客户',exact=True).click()
 pg.locator('.td-scan-row input[type=file]').first.set_input_files(str(ROOT/'icon-512.png'))
 pg.get_by_role('button',name='批量确认入库',exact=True).click();pg.wait_for_function('!tdScan.busy && tdScan.results.length===2');assert '成功 1 条，失败 1 条' in pg.locator('#tdScanMessage').inner_text();assert pg.evaluate('tdScan.rows.length')==1;assert '成功上传1张照片' in pg.locator('#tdScanResults').inner_text()
 go('scanPickup');scan('PICKED100');assert pg.evaluate('tdScan.rows.length')==0;scan('HIDDEN100');assert pg.evaluate('tdScan.rows.length')==0;scan('AMBIG100');assert pg.evaluate('tdScan.rows.length')==0
 scan('PACK1001');scan('PACK1002');scan('OTHER100');scan('PACK1001');assert pg.evaluate('tdScan.rows.length')==2;assert '重复' in pg.locator('#tdScanMessage').inner_text()
 # Global keyboard-wedge capture also works when the input isn't focused.
 pg.locator('#tdPageContent h2').first.click();pg.keyboard.type('PACK1003',delay=5);pg.keyboard.press('Enter');pg.wait_for_function('tdScan.rows.length===3')
 pg.locator('#tdScanWeight').fill('2');pg.locator('#tdScanPaid').fill('5000');pg.locator('#tdScanName').fill('取件人');assert '9,000' in pg.locator('#tdScanTotals').inner_text()
 # Cancellation never invokes checkout; pending submission locks navigation and duplicate submit.
 pg.remove_listener('dialog',accept);dismiss=lambda d:d.dismiss();pg.on('dialog',dismiss);pg.get_by_role('button',name='确认收款并完成取件',exact=True).click();assert not any(x['name']=='td_scan_checkout_v57' for x in pg.evaluate('__scanCalls'));pg.remove_listener('dialog',dismiss);pg.on('dialog',accept)
 pg.evaluate('window.__holdCheckout=true');pg.get_by_role('button',name='确认收款并完成取件',exact=True).click();pg.wait_for_function('tdScan.busy');pg.evaluate("tdNavigate('home')");assert pg.url.endswith('#/scanPickup');pg.evaluate('tdScanCheckout({preventDefault(){}})');assert sum(x['name']=='td_scan_checkout_v57' for x in pg.evaluate('__scanCalls'))==1
 pg.evaluate('__releaseCheckout()');pg.wait_for_function('!tdScan.busy');assert pg.evaluate('tdScan.rows.length')==0
 assert pg.locator('#tdScanWeight').count()==1,pg.evaluate('({url:location.href,page,html:document.getElementById("page").innerHTML,msg:document.getElementById("msg").textContent})')
 # Lost response recovers the SAME request; no second charge.
 scan('PACK2001');pg.locator('#tdScanWeight').fill('1');pg.locator('#tdScanName').fill('取件人');pg.evaluate('window.__holdCheckout=false;window.__timeout=true');pg.get_by_role('button',name='确认收款并完成取件',exact=True).click();pg.wait_for_function('tdScan.uncertain');pg.get_by_role('button',name='核实上次请求',exact=True).click();pg.wait_for_function('!tdScan.uncertain && !tdScan.busy');assert pg.evaluate('tdScan.rows.length')==0
 # Offline never writes; refresh retains a minimal pending request ID and recovers its result.
 pg.evaluate('window.__online=false');scan('PACK3001');assert '网络不可用' in pg.locator('#tdScanMessage').inner_text();pg.evaluate('window.__online=true')
 pg.evaluate("sessionStorage.setItem(tdScanStorageKey(),'recover-id');__requests['recover-id']={operation:'pickup',result:{success:true,batch_id:'prior-batch'}}");awaited=pg.evaluate('tdScanRecover()');assert '已提交' in pg.locator('#tdScanMessage').inner_text()
 # Camera remains continuous across multiple callbacks and shuts down on visibility/page exit.
 go('scanQuery');pg.get_by_role('button',name='开启摄像头',exact=True).click();pg.wait_for_function('!!tdScan.reader');pg.evaluate("__decode({getText:()=> 'PACK4001'})");pg.evaluate('tdScan.queue');pg.evaluate("__decode({getText:()=> 'PACK4002'})");pg.evaluate('tdScan.queue');assert pg.evaluate('tdScan.stream!==null');go('scan');assert pg.evaluate('tdScan.stream===null')
 # Scanner pages across phone/tablet orientations; no overflow and both return controls.
 checks=0
 for w,h in [(320,640),(390,844),(844,390),(768,1024),(1024,768),(1280,800)]:
  pg.set_viewport_size({'width':w,'height':h})
  for target in ['scan','scanIntake','scanQuery','scanPickup','scanHistory']:
   go(target);assert pg.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth'),(w,target);assert pg.get_by_role('button',name='返回主页',exact=True).count()==1;assert pg.get_by_role('button',name='返回上一页',exact=True).count()==1;checks+=1
 # Full browser reload recovers only the durable request UUID from sessionStorage.
 pg.evaluate("sessionStorage.setItem(tdScanStorageKey(),'reload-id');__requests['reload-id']={operation:'pickup',result:{success:true,batch_id:'reloaded-batch'}}")
 server=pg.evaluate('__requests');pg.reload(wait_until='load');pg.evaluate(MOCK)
 pg.evaluate("async results=>{__requests=results;__installScan();user={id:'owner'};role='owner';document.getElementById('app').classList.remove('hidden');document.getElementById('auth').classList.add('hidden');await refresh();}",server)
 pg.wait_for_function("document.getElementById('tdScanMessage')?.textContent.includes('上次请求已提交')")
 assert pg.evaluate("sessionStorage.getItem(tdScanStorageKey())===null")
 # Installation gate stays closed when RPC migration is absent.
 pg.evaluate("window.__missing=true;tdNavigate('scanQuery')");pg.wait_for_function("document.getElementById('tdScanMessage').textContent.includes('V57 SQL')");assert not pg.evaluate('tdScan.ready');assert 'V57 SQL' in pg.locator('#tdScanMessage').inner_text()
 assert not errors,errors
 browser.close();print(json.dumps({'engine':engine,'real_barcode_formats':decoded,'layout_combinations':checks,'camera_allow_deny_switch_torch_release':True,'hid_continuous_duplicate':True,'unmatched_and_mixed_customers':True,'partial_intake_and_photos':True,'payment_confirmation_pending_and_lost_response':True,'offline_and_migration_gate':True,'errors':errors},ensure_ascii=False))
