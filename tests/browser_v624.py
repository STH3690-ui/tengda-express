"""Built-release mobile browser regression, synthetic paginated backend; no production calls."""
import os,json,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];PUBLIC=ROOT/'dist'
STUB=r"""(()=>{
 const at='2026-11-12T00:00:00Z';window.__reads=[];window.__mutations=0;window.__delay=25;window.__role='owner';window.__fail='';
 const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
 window.__fixtures={td_customers:Array.from({length:1205},(_,i)=>({id:id(i+1),name:'客户'+(i+1),phone:'099'+String(i).padStart(8,'0'),created_at:at})),td_orders:Array.from({length:1205},(_,i)=>({id:id(i+2001),customer_id:id(i+1),item_name:'商品'+(i+1),quantity:1,total_price:10,created_at:at})),td_parcels:Array.from({length:1205},(_,i)=>({id:id(i+4001),customer_id:id(i+1),description:'包裹'+(i+1),tracking_no:'TD'+(i+100000),pieces:2,remaining:1,weight_kg:0.5,arrived_at:at})),td_pickups:Array.from({length:1205},(_,i)=>({id:id(i+6001),parcel_id:id(i+4001),receiver_name:'领取人'+i,pieces:1,picked_at:at})),td_payments:Array.from({length:1205},(_,i)=>({id:id(i+8001),customer_id:id(i+1),amount:10,created_at:at})),td_members:[]};
 const delay=()=>new Promise(r=>setTimeout(r,__delay));
 const query=(table,input)=>{let start=0,end=999,filter=[];const q={select(){return q},order(){return q},eq(k,v){filter.push(x=>x[k]===v);return q},in(k,ids){filter.push(x=>ids.includes(x[k]));return q},or(text){const ids=text.match(/customer_id.in.\(([^)]+)\)/)?.[1]?.split(',')||[];const clauses=[...text.matchAll(/(\w+)\.ilike\.("(?:[^"\\]|\\.)*")/g)].map(m=>[m[1],JSON.parse(m[2]).slice(1,-1).replace(/\\([\\%_])/g,'$1')]);filter.push(x=>ids.includes(x.customer_id)||clauses.some(([k,t])=>String(x[k]||'').includes(t)));return q},range(a,b){start=a;end=b;return q},limit(n){end=n-1;return q},abortSignal(){return q},async maybeSingle(){await delay();__reads.push({table,single:true});return {data:{id:'owner',role:__role,active:true,permissions:__role==='owner'?{}:{parcel_create:true,customer_create:true}}}},insert(){__mutations++;throw Error('unexpected write')},update(){__mutations++;throw Error('unexpected write')},then(resolve,reject){__reads.push({table,start,end});return delay().then(()=>__fail===table?{error:{message:'synthetic read failure'}}:{data:input.filter(x=>filter.every(f=>f(x))).slice(start,end+1)}).then(resolve,reject)}};return q};
 window.supabase={createClient(){return {auth:{async getSession(){return {data:{session:null}}},async signOut(){}},from(t){return query(t,__fixtures[t]||[])},rpc(name,args){if(name==='td_business_hidden_ids_v54')return query(name,[]);if(name==='td_scan_capabilities_v57')return Promise.resolve({data:{version:57,intake:true,pickup:true,finance:true}});if(name==='td_scan_customers_v57')return Promise.resolve({data:__fixtures.td_customers.filter(x=>[x.name,x.phone].some(v=>v.includes(args.p_term))).slice(0,50)});return Promise.resolve({data:[]})}}}};
})();"""
with sync_playwright() as p:
 engine=os.environ.get('TD_BROWSER_ENGINE','chromium');opts={'executable_path':shutil.which('chromium'),'args':['--no-sandbox']} if engine=='chromium' else ({'executable_path':os.environ['TD_WEBKIT_EXECUTABLE']} if os.environ.get('TD_WEBKIT_EXECUTABLE') else {})
 browser=getattr(p,engine).launch(**opts);page=browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());requests=[];page.on('request',lambda r:requests.append(r.url))
 csp=next(line.strip().split(': ',1)[1] for line in (ROOT/'_headers').read_text().splitlines() if 'Content-Security-Policy:' in line)
 def route(r):
  u=r.request.url
  if '/vendor/supabase-' in u:r.fulfill(content_type='text/javascript',body=STUB)
  elif u.startswith('https://station.test/'):
   f=PUBLIC/(u.split('https://station.test/')[1].split('?')[0] or 'index.html')
   r.fulfill(path=str(f),headers={'Content-Security-Policy':csp}) if f.is_file() else r.fulfill(status=404,body='')
  else:r.abort()
 page.route('**/*',route);page.goto('https://station.test/');page.wait_for_function("()=>typeof TDAssets==='object'")
 assert not any('tesseract' in u or 'zxing' in u for u in requests)
 page.evaluate("async()=>{user={id:'owner'};await enter()}");assert page.locator('.td-function-grid').is_visible();assert page.evaluate('__reads.length')==1;assert page.evaluate('tdDataReady') is False
 assert '—' in page.locator('.td-home-overview').inner_text()
 for target,table in [('customers','td_customers'),('orders','td_orders'),('parcels','td_parcels'),('records',None)]:
  page.evaluate('tdNavigate('+json.dumps(target)+')');page.wait_for_function("()=>tdPagedState().loaded && !document.querySelector('#tdPagedList').hasAttribute('aria-busy')")
  if table:
   assert page.evaluate('tdPagedState().rows.length')==50
   assert all(x['end']-x['start']<=50 for x in page.evaluate('__reads.filter(x=>x.table==='+json.dumps(table)+')'))
  assert page.locator('#tdPagedList tr').count()<=151
  if target=='customers':
   first=page.evaluate('tdPagedState().rows[0].id');page.get_by_role('button',name='下一页',exact=True).click();page.wait_for_function('()=>tdPagedState().offset===50 && !document.querySelector("#tdPagedList").hasAttribute("aria-busy")');assert page.evaluate('tdPagedState().rows[0].id')!=first
   page.locator('#tdPagedSearch').fill('客户1205');page.wait_for_function("()=>tdPagedState().rows.length===1 && tdPagedState().rows[0].name==='客户1205'");page.get_by_role('button',name='修改',exact=True).click();assert page.locator('#customerForm input[name="name"]').input_value()=='客户1205';page.evaluate('cancelCustomerEdit()');page.wait_for_function("()=>page==='customers'&&!tdNav.route.view");page.evaluate('tdUiSaved()')
  if target in ['orders','parcels']:
   page.locator('input[placeholder="输入姓名或电话"]').fill('客户1205');page.wait_for_function("()=>document.querySelector('select[name=customer_id]').options.length===2");page.locator('select[name="customer_id"]').select_option(label='客户1205 09900001204')
   if target=='parcels':page.wait_for_function("()=>!!document.querySelector('#tdParcelOrderChoices input')");assert page.locator('#tdParcelOrderChoices input').count()==1
   page.evaluate('tdUiSaved()')
 assert not page.evaluate('__reads.some(x=>x.table==="td_payments")')
 # Concurrent explicit refreshes deduplicate, read all 1205 rows for accounting, not just the list page.
 page.evaluate("async()=>{__reads=[];const a=refresh(),b=refresh();await Promise.all([a,b])}");assert page.evaluate('tdDataReady') is True
 for t in ['td_customers','td_orders','td_parcels','td_pickups','td_payments']:assert page.evaluate('data['+json.dumps(t)+'].length')==1205
 assert page.evaluate('__reads.filter(x=>x.table==="td_payments").length')==2
 assert page.evaluate('data.td_payments.reduce((s,x)=>s+x.amount,0)')==12050
 # Failure does not replace authoritative full arrays with truncated/empty totals.
 page.evaluate("async()=>{__fail='td_payments';await refresh()}");assert page.evaluate('data.td_payments.length')==1205;page.evaluate("__fail='';tdUiSaved()")
 # Direct edit links fetch their authorized target even outside the first 50 rows.
 page.reload();page.evaluate("async()=>{location.hash='#/customers/edit/'+__fixtures.td_customers[1204].id;user={id:'owner'};await enter()}");page.wait_for_function("()=>document.querySelector('#customerForm input[name=name]')?.value==='客户1205'");assert not page.evaluate('__reads.some(x=>x.table==="td_payments")')
 # Photo intake updates must invalidate cached lists immediately, without waiting for the TTL.
 page.evaluate("()=>{tdUiSaved();tdNavigate('home');const customer={id:'00000000-0000-4000-8000-000000099999',name:'新增入库客户',phone:'09999990000',created_at:new Date().toISOString()};__fixtures.td_customers.unshift(customer);tdV59Apply({customer});tdNavigate('customers')}");page.wait_for_function("()=>tdPagedState().loaded&&tdPagedState().rows.some(x=>x.name==='新增入库客户')")
 # Membership permissions are available before the first data snapshot for real staff login.
 page.reload();page.evaluate("async()=>{__role='staff';user={id:'staff'};await enter();tdNavigate('home')}");assert page.locator('[data-route="parcels"]').is_visible();assert page.locator('[data-route="staff"]').count()==0;assert page.locator('[data-route="dashboard"]').count()==0
 page.evaluate('async()=>{__delay=75;const task=refresh();tdClearSessionView();await task}');assert page.evaluate('user===null && Object.values(data).every(x=>x.length===0)')
 assert page.evaluate('__mutations')==0
 assert errors==[],errors
 print(json.dumps({'engine':engine,'built_bundle_CSP':True,'home_before_history':True,'page_size':50,'synthetic_rows_per_table':1205,'server_search_and_paging':True,'customer_scoped_relations':True,'complete_finance_records':True,'deduplicated_refresh':True,'failed_read_preserves_totals':True,'staff_initial_permissions':True,'no_eager_engines':True,'no_writes':True,'errors':errors}));browser.close()
