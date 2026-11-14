"""Actual shipped WASM engine, synthetic label formats only (not real parcel photos)."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import threading,os,json,shutil,tempfile,time
from PIL import Image,ImageDraw,ImageFont
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];os.chdir(ROOT)
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def end_headers(self):
  self.send_header('Content-Security-Policy',next(x.strip().split(': ',1)[1] for x in (ROOT/'_headers').read_text().splitlines() if x.strip().startswith('Content-Security-Policy:')));super().end_headers()
server=ThreadingHTTPServer(('127.0.0.1',8767),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
font='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
if not Path(font).exists():font='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
formats=[('plus','（安康+09943253053）','安康','09943253053',0),('joined','（安康09943253053）','安康','09943253053',0),('space','安康 09943253053','安康','09943253053',0),('multiline','安康\n09943253053','安康','09943253053',0),('english','(Aung Kyaw+95 9943253053)','Aung Kyaw','09943253053',0),('tilted','（安康+09943253053）','安康','09943253053',4)]
with tempfile.TemporaryDirectory(prefix='v61-synthetic-') as tmp,sync_playwright() as p:
 engine=os.environ.get('TD_BROWSER_ENGINE','chromium');opts={'executable_path':shutil.which('chromium'),'args':['--no-sandbox']} if engine=='chromium' else {};b=getattr(p,engine).launch(**opts);pg=b.new_page();pg.set_default_timeout(90000);pg.goto('http://127.0.0.1:8767/');pg.evaluate("()=>{document.body.innerHTML='<input id=fixture type=file>';window.__workers=0;const original=Tesseract.createWorker;Tesseract.createWorker=(...args)=>{__workers++;return original(...args)}}")
 pg.evaluate('async()=>{await Promise.all([TDLabelOCR.preload(),TDLabelOCR.preload()])}');results=[]
 for key,text,name,phone,angle in formats:
  im=Image.new('RGB',(2000,650),'white');draw=ImageDraw.Draw(im);f=ImageFont.truetype(font,88)
  draw.multiline_text((65,100),text,font=f,fill='#222',spacing=35)
  if angle:im=im.rotate(-angle,resample=Image.Resampling.BICUBIC,expand=True,fillcolor='white')
  path=Path(tmp)/(key+'.png');im.save(path);pg.locator('#fixture').set_input_files(str(path))
  result=pg.evaluate('''async()=>{const url=URL.createObjectURL(document.getElementById('fixture').files[0]),im=new Image();try{await new Promise((ok,no)=>{im.onload=ok;im.onerror=no;im.src=url});const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);const reads=[],start=performance.now();for(const variant of ['raw','enhanced','binary']){const prep=TDPhotoV61.prepare(c,variant);try{const r=await TDLabelOCR.recognizeFrozen(prep.canvas,()=>{},{psm:variant==='binary'?11:6});const parsed=TDPhotoV61.parse(r.text);reads.push({variant,text:r.text,parsed,evidence:TDPhotoV61.evidence(r,parsed),angle:prep.angle})}finally{prep.canvas.width=prep.canvas.height=1}}c.width=c.height=1;return {reads,selection:TDPhotoV61.select(reads),elapsed_ms:Math.round(performance.now()-start)}}finally{URL.revokeObjectURL(url)}}''')
  good=[r for r in result['reads'] if r['parsed']['name']==name and r['parsed']['phone']==phone and r['parsed']['eligible']]
  assert good,{'format':key,'result':result}
  if result['selection']['automatic']:
   assert result['selection']['best']['parsed']['name']==name and result['selection']['best']['parsed']['phone']==phone,result
  results.append({'format':key,'correct_reads':len(good),'automatic':result['selection']['automatic'],'elapsed_ms':result['elapsed_ms'],'readings':[{'variant':r['variant'],'text':r['text'],'evidence':r['evidence'],'angle':r['angle']} for r in result['reads']]})
 assert pg.evaluate('__workers')==1
 print(json.dumps({'engine':engine,'synthetic_formats':results,'worker_initializations':1,'real_phone_or_real_label_photos':False},ensure_ascii=False));pg.evaluate('TDLabelOCR.stop()');b.close()
server.shutdown()
