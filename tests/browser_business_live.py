"""Real production-browser verification using isolated accounts and live Supabase.
Requires a short-lived, gated verification function. No responses are mocked.
Credentials stay in process memory; output contains assertions only.
"""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import json, os, secrets, shutil, urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
RESULT=Path('/workspace/tengda-release-backup-20261019/browser-business-results.json')
GATE=json.loads(Path('/tmp/tengda-live-check.json').read_text())['gate']
def control(body):
 req=urllib.request.Request('https://yvsgawbbnyeyvynwghsc.supabase.co/functions/v1/v32-release-verification',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','x-release-check':GATE})
 return json.load(urllib.request.urlopen(req,timeout=90))
class QuietHandler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',8080),partial(QuietHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
ids=[];passed=[];failure='';browser=None;diagnostics={};page=None
try:
 owner=control({'action':'prepare-browser'})
 assert owner.get('ok'),'isolated owner setup failed'
 ids.append(owner['id'])
 with sync_playwright() as p:
  proxy={'server':os.environ['HTTPS_PROXY'],'bypass':'127.0.0.1,localhost'} if os.environ.get('HTTPS_PROXY') else None
  browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'],proxy=proxy)
  page=browser.new_page(viewport={'width':390,'height':844})
  errors=[];hosts=set()
  page.on('pageerror',lambda error:errors.append(str(error)))
  diagnostics['network_failures']=[]
  page.on('requestfailed',lambda r:diagnostics['network_failures'].append({'url':r.url.split('?')[0],'failure':r.failure}))
  diagnostics['errors']=errors
  page.on('request',lambda request:hosts.add(request.url.split('/')[2]) if request.url.startswith('https://') else None)
  page.on('dialog',lambda dialog:dialog.accept())
  page.goto('http://127.0.0.1:8080/',wait_until='domcontentloaded')
  page.locator('#auth').wait_for(state='visible')
  page.locator('#loginForm [name=username]').fill(owner['username'])
  page.locator('#loginForm [name=password]').fill(owner['password'])
  page.get_by_role('button',name='登录',exact=True).click()
  page.locator('#app').wait_for(state='visible',timeout=60000)
  page.wait_for_function("data.td_members.length>0",timeout=60000)
  passed.append('real-browser-owner-password-login-and-live-data')
  customer_name='V32 Browser '+secrets.token_hex(5)
  item_name='V32 Browser Order '+secrets.token_hex(4)
  tracking='V32-BROWSER-'+secrets.token_hex(5)
  page.get_by_role('button',name='客户',exact=True).click()
  page.locator('#customerForm [name=name]').fill(customer_name)
  page.locator('#customerForm [name=phone]').fill('123456789')
  page.locator('#customerSave').click()
  page.wait_for_function('(name)=>data.td_customers.some(x=>x.name===name)',arg=customer_name,timeout=60000)
  customer=page.evaluate('(name)=>data.td_customers.find(x=>x.name===name).id',customer_name)
  passed.append('real-ui-customer-registration')
  page.get_by_role('button',name='代买代付',exact=True).click()
  page.locator('#page [name=customer_id]').select_option(customer)
  page.locator('#page [name=item_name]').fill(item_name)
  page.locator('#page [name=total_price]').fill('100')
  page.get_by_role('button',name='保存代买 / 代付',exact=True).click()
  page.wait_for_function('(name)=>data.td_orders.some(x=>x.item_name===name)',arg=item_name,timeout=60000)
  order=page.evaluate('(name)=>data.td_orders.find(x=>x.item_name===name).id',item_name)
  passed.append('real-ui-order-creation')
  page.get_by_role('button',name='包裹入库',exact=True).click()
  page.locator('#page [name=customer_id]').select_option(customer)
  page.locator('#page [name=order_id]').select_option(order)
  page.locator('#page [name=tracking_no]').fill(tracking)
  page.locator('#page [name=description]').fill('Browser isolated parcel')
  page.locator('#page [name=pieces]').fill('3')
  page.locator('#page [name=weight_kg]').fill('3')
  page.get_by_role('button',name='确认入库',exact=True).click()
  page.wait_for_function('(tracking)=>data.td_parcels.some(x=>x.tracking_no===tracking)',arg=tracking,timeout=60000)
  parcel=page.evaluate('(tracking)=>data.td_parcels.find(x=>x.tracking_no===tracking).id',tracking)
  passed.append('real-ui-parcel-inventory-arrival')
  page.get_by_role('button',name='客户包裹查询',exact=True).click()
  page.locator('#queryTerm').fill(customer_name)
  assert tracking in page.locator('#queryResults').inner_text()
  passed.append('real-ui-customer-parcel-query')
  page.get_by_role('button',name='取件',exact=True).click()
  page.locator('#pickupCustomer').select_option(customer)
  page.locator('#pickupParcels input[type=checkbox]').first.check()
  page.locator('#pickupKg').fill('2')
  page.locator('#pickupRate').fill('100')
  page.locator('#pickupPaid').fill('50')
  page.locator('#pickupReceiver').fill('Browser isolated receiver')
  page.locator('#pickupSubmit').click()
  page.wait_for_function('(id)=>data.td_parcels.find(x=>x.id===id)?.remaining===2',arg=parcel,timeout=60000)
  debt=page.locator('#tdDebts tr').filter(has_text=customer_name)
  debt.wait_for(state='visible',timeout=30000)
  assert '150' in debt.inner_text()
  passed.append('real-ui-pickup-partial-collection-and-150-debt')
  debt.locator('input[type=number]').fill('150')
  debt.get_by_role('button',name='确认补款',exact=True).click()
  debt.wait_for(state='detached',timeout=60000)
  balances=page.evaluate("async(id)=>{const r=await db.from('td_pickup_balances_v32').select('paid_mmk,due_mmk').eq('customer_id',id);if(r.error)throw r.error;return r.data}",customer)
  assert len(balances)==1 and balances[0]['paid_mmk']==200 and balances[0]['due_mmk']==0
  passed.append('real-ui-debt-repayment-and-zero-balance')
  page.get_by_role('button',name='收付款',exact=True).click()
  page.locator('#page [name=customer_id]').select_option(customer)
  page.locator('#page [name=direction]').select_option(label='付款')
  page.locator('#page [name=amount]').fill('20')
  page.get_by_role('button',name='保存流水',exact=True).click()
  page.wait_for_function('(id)=>data.td_payments.filter(x=>x.customer_id===id).length===3',arg=customer,timeout=60000)
  passed.append('real-ui-payment-outgoing-ledger')
  page.get_by_role('button',name='总览',exact=True).click()
  period=page.evaluate('tdFreightPeriod()')
  assert period['received']==200 and period['initial']==50 and period['repaid']==150
  passed.append('real-ui-report-reconciles-50-initial-plus-150-repayment-without-double-counting')
  page.get_by_role('button',name='代买代付',exact=True).click()
  page.locator('#page tr').filter(has_text=item_name).get_by_role('button',name='从列表移除',exact=True).click()
  page.wait_for_function('(id)=>hiddenOrderIds.has(id)',arg=order,timeout=60000)
  assert page.evaluate('(id)=>data.td_orders.find(x=>x.id===id).total_price',order)==100
  original=page.evaluate("async(id)=>{const r=await db.from('td_orders').select('id,total_price').eq('id',id).single();return r.data}",order)
  assert original['total_price']==100
  denied=page.evaluate("async(id)=>{const r=await db.from('td_orders').delete().eq('id',id);return !!r.error}",order)
  assert denied
  passed.append('real-ui-removal-retains-source-order-and-denies-physical-deletion')
  assert 'yvsgawbbnyeyvynwghsc.supabase.co' in hosts and 'amknufvdvqfhrgtobpwg.supabase.co' not in hosts
  assert not errors,errors
  passed.append('no-mocks-no-javascript-errors-production-only')
  browser.close();browser=None
except Exception as error:
 if page:
  try:diagnostics['message']=page.locator('#msg').inner_text(timeout=1000)
  except Exception:pass
 failure=type(error).__name__+': '+str(error).splitlines()[0][:400]
finally:
 if browser:
  try:browser.close()
  except Exception:pass
 cleanup=control({'action':'cleanup-browser','ids':ids}) if ids else {'ok':True}
 server.shutdown()
 result={'ok':not failure and cleanup.get('ok',False),'passed':passed,'failure':failure,'cleanup':cleanup.get('ok',False),'mocked_responses':False,'diagnostics':diagnostics}
 RESULT.write_text(json.dumps(result,ensure_ascii=False,indent=2))
 print(json.dumps(result,ensure_ascii=False))
