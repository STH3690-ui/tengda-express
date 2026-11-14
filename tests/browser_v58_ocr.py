from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import threading,os,json,shutil
from PIL import Image,ImageDraw,ImageFont
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
im=Image.new('RGB',(1400,600),'white');d=ImageDraw.Draw(im);f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',48)
for i,line in enumerate(['WAYBILL: TD12345678','RECIPIENT: Alice Smith','PHONE: 09943253053']):d.text((60,70+i*120),line,font=f,fill='black')
im.save('/tmp/v58-ocr-label.png')
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def end_headers(self):
  self.send_header('Content-Security-Policy',next(x.strip().split(': ',1)[1] for x in (ROOT/'_headers').read_text().splitlines() if x.strip().startswith('Content-Security-Policy:')))
  super().end_headers()
server=ThreadingHTTPServer(('127.0.0.1',8766),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 engine=os.environ.get('TD_BROWSER_ENGINE','chromium');opts={'executable_path':shutil.which('chromium'),'args':['--no-sandbox']} if engine=='chromium' else {};b=getattr(p,engine).launch(**opts);pg=b.new_page();errors=[];pg.on('console',lambda m: errors.append(m.text) if m.type=='error' else None)
 pg.goto('http://127.0.0.1:8766/')
 pg.evaluate("document.body.innerHTML='<input id=fixture type=file>';window.TextDetector=undefined;window.createImageBitmap=undefined")
 pg.locator('#fixture').set_input_files('/tmp/v58-ocr-label.png');pg.set_default_timeout(90000)
 r=pg.evaluate('async()=>TDLabelOCR.recognize(document.getElementById("fixture").files[0])')
 print(json.dumps({'engine':engine,'actual_wasm_ocr':r,'errors':errors}))
 assert 'TD12345678' in r['text'] and '09943253053' in r['text'],r
 assert not any('Content Security Policy' in e for e in errors),errors
 pg.evaluate('TDLabelOCR.stop()');b.close()
server.shutdown()
