"""Real service worker install/offline shell; anonymous only, no live API or business writes."""
import threading,http.server,shutil,json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'dist'),**kw)
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();url='http://127.0.0.1:'+str(server.server_port)+'/'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox']);context=b.new_context();page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(url);page.wait_for_function('()=>!!db');page.evaluate('async()=>{await navigator.serviceWorker.ready}');page.close();page=context.new_page();page.goto(url);page.wait_for_function('()=>!!navigator.serviceWorker.controller');
 cached=page.evaluate('async()=>{const out=[];for(const name of await caches.keys()){const cache=await caches.open(name);out.push(...(await cache.keys()).map(r=>new URL(r.url).pathname))}return out}')
 assert '/' in cached and any('/assets/app.' in x for x in cached);assert not any('/api/' in x or '/tesseract' in x for x in cached)
 context.set_offline(True);page.goto(url,timeout=15000);page.wait_for_function('()=>!!db && !!document.querySelector("#loginForm button")');assert page.locator('#loginForm').is_visible();assert errors==[],errors
 context.set_offline(False);page.goto(url);page.wait_for_function('()=>!!db');assert page.locator('#loginForm').is_visible();print(json.dumps({'real_service_worker':True,'offline_shell_starts':True,'reconnect':True,'private_requests_not_cached':True,'engine_models_not_precached':True,'cached_paths':cached,'errors':errors}));context.close();b.close()
server.shutdown()
