import ast,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
tree=ast.parse((root/'tests/browser_history_relations.py').read_text());stub=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='STUB' for t in n.targets))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox']);pg=b.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  u=r.request.url
  if '/vendor/supabase-' in u:r.fulfill(status=200,content_type='text/javascript',body=stub)
  elif u.startswith('https://station.test/'):
   f=root/(u.split('https://station.test/',1)[1].split('?',1)[0] or 'index.html')
   r.fulfill(path=str(f)) if f.is_file() else r.fulfill(status=404,body='')
  else:r.abort()
 pg.route('**/*',route);pg.goto('https://station.test/');pg.evaluate("async()=>{user={id:'owner'};role='owner';document.getElementById('app').classList.remove('hidden');document.getElementById('auth').classList.add('hidden');await refresh()}")
 failures=[]
 for w,h in [(320,640),(390,844),(844,390),(768,1024),(1024,768),(1280,800)]:
  pg.set_viewport_size({'width':w,'height':h})
  for name in ['dashboard','customers','orders','parcels','pickups','payments','records','deletions','staffAudit']:
   pg.evaluate('(n)=>{page=n;render()}',name);pg.wait_for_timeout(50)
   size=pg.evaluate('({viewport:innerWidth,body:document.body.scrollWidth})')
   if size['body']>w:failures.append([w,h,name,size])
  if w in (390,768):pg.screenshot(path=f'/tmp/tengda-android-layout-{w}.png',full_page=True)
 print({'viewports':6,'pages_per_viewport':9,'overflow':failures,'script_errors':errors});b.close()
