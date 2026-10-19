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
RESULT=Path('/workspace/tengda-release-backup-20261019/browser-live-results.json')
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
  page.get_by_role('button',name='账号管理',exact=True).click()
  username='v32_browser_emp_'+secrets.token_hex(4);password=secrets.token_hex(24)
  page.locator('#page [name=username]').fill(username)
  page.locator('#page [name=display_name]').fill('Browser isolated staff')
  page.locator('#page [name=password]').fill(password)
  page.get_by_role('button',name='创建账号',exact=True).click()
  page.wait_for_function('(name)=>data.td_members.some(x=>x.username===name)',arg=username,timeout=60000)
  employee=page.evaluate('(name)=>data.td_members.find(x=>x.username===name).id',username)
  ids.append(employee)
  row=page.locator('#page tr').filter(has_text=username)
  row.get_by_role('button',name='批准',exact=True).click()
  page.wait_for_function('(id)=>data.td_members.some(x=>x.id===id&&x.active)',arg=employee,timeout=60000)
  passed.append('real-browser-owner-creates-and-approves-staff-without-email')
  row=page.locator('#page tr').filter(has_text=username)
  row.get_by_role('button',name='🔒 未授权 · 点击授权',exact=True).click()
  page.wait_for_function('(id)=>data.td_members.find(x=>x.id===id)?.can_hide_orders===true',arg=employee,timeout=60000)
  row=page.locator('#page tr').filter(has_text=username)
  row.get_by_role('button',name='✅ 已授权 · 点击撤销',exact=True).click()
  page.wait_for_function('(id)=>data.td_members.find(x=>x.id===id)?.can_hide_orders===false',arg=employee,timeout=60000)
  passed.append('real-browser-owner-grants-and-revokes-removal')
  staff=browser.new_page(viewport={'width':390,'height':844})
  staff.goto('http://127.0.0.1:8080/',wait_until='domcontentloaded')
  staff.locator('#auth').wait_for(state='visible')
  staff.locator('#loginForm [name=username]').fill(username)
  staff.locator('#loginForm [name=password]').fill(password)
  staff.get_by_role('button',name='登录',exact=True).click()
  staff.locator('#app').wait_for(state='visible',timeout=60000)
  staff.get_by_role('button',name='客户',exact=True).click()
  assert staff.get_by_role('button',name='删除',exact=True).count()==0
  assert staff.get_by_role('button',name='归档',exact=True).count()==0
  passed.append('real-browser-staff-login-and-customer-restrictions')
  for label in ['总览','代买代付','包裹入库','客户包裹查询','取件','收付款','记录查询']:
   page.get_by_role('button',name=label,exact=True).click()
   page.wait_for_timeout(500)
  assert page.locator('header.td-hero').is_visible()
  page.screenshot(path='/workspace/tengda-release-backup-20261019/production-mobile-preview.png',full_page=True)
  passed.append('production-feature-pages-and-black-gold-brand-render')
  page.get_by_role('button',name='账号管理',exact=True).click()
  page.locator('#page tr').filter(has_text=username).get_by_role('button',name='停用',exact=True).click()
  page.wait_for_function('(id)=>data.td_members.find(x=>x.id===id)?.active===false',arg=employee,timeout=60000)
  staff.evaluate('tdCheckMember()')
  staff.locator('#auth').wait_for(state='visible',timeout=30000)
  passed.append('real-browser-disabled-session-lockout')
  assert 'yvsgawbbnyeyvynwghsc.supabase.co' in hosts
  assert 'amknufvdvqfhrgtobpwg.supabase.co' not in hosts
  assert not errors,errors
  passed.append('only-production-supabase-contacted-no-javascript-errors')
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
