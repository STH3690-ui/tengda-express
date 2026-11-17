"""Actual V63 WASM pipeline. Optional private real-image manifest; never uploads images or uses expected text as OCR hints."""
import argparse,functools,hashlib,json,os,shutil,tempfile,threading,time
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
args=argparse.ArgumentParser();args.add_argument('--root');args.add_argument('--repeats',type=int,default=2);args.add_argument('--manifest');args.add_argument('--output');args.add_argument('--scalar',action='store_true');options=args.parse_args()
if options.root:ROOT=Path(options.root).resolve()
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  if options.scalar and self.path.split('?')[0]=='/vendor/tesseract-v6/worker.min.js':
   body=b'WebAssembly.validate=()=>false;\n'+(ROOT/'vendor/tesseract-v6/worker.min.js').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript');self.end_headers();self.wfile.write(body)
  else:super().do_GET()
 def end_headers(self):
  self.send_header('Content-Security-Policy',next(x.strip().split(': ',1)[1] for x in (ROOT/'_headers').read_text().splitlines() if x.strip().startswith('Content-Security-Policy:')));super().end_headers()
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
PIPELINE=r'''async()=>{
 const decodeStarted=performance.now();const file=document.querySelector('#fixture').files[0],url=URL.createObjectURL(file),image=new Image();let source,verification;
 try{
  await new Promise((ok,no)=>{image.onload=ok;image.onerror=no;image.src=url});source=document.createElement('canvas');source.width=image.naturalWidth;source.height=image.naturalHeight;source.getContext('2d').drawImage(image,0,0);
  const processingMs=Math.round(performance.now()-decodeStarted),reads=[],start=performance.now();let firstFillMs=null,prepareMs=0;
  for(const variant of ['raw','enhanced','binary']){
   const prepAt=performance.now(),prep=TDPhotoV63.prepare(variant!=='raw'&&verification?verification:source,variant);
   prepareMs+=performance.now()-prepAt;try{const result=await TDLabelOCR.recognizeFrozen(prep.canvas,()=>{},{psm:variant==='binary'?11:6,timeout:10000}),parsed=TDPhotoV63.parse(result.text),evidence=TDPhotoV61.evidence(result,parsed);reads.push({variant,parsed,evidence,timing:result.timing});
    if(variant==='raw'&&parsed.eligible&&!TDPhotoV63.fastAccept(reads.at(-1)))verification=TDPhotoV63.verificationRegion(result,parsed,prep.canvas,source);
    if(firstFillMs===null&&TDPhotoV63.fastAccept(reads.at(-1)))firstFillMs=Math.round(performance.now()-start);
    const choice=TDPhotoV61.select(reads);if(choice.automatic||(!choice.conflict&&TDPhotoV63.fastAccept(reads.at(-1))))break;
   }finally{if(prep.owned!==false)prep.canvas.width=prep.canvas.height=1}
  }
  const choice=TDPhotoV61.select(reads),fillAt=performance.now();const name=document.querySelector('#resultName'),phone=document.querySelector('#resultPhone');name.value=choice.best?.parsed.eligible?choice.best.parsed.name:'';phone.value=choice.best?.parsed.eligible?choice.best.parsed.phone:'';const fillMs=(performance.now()-fillAt);return {reads,best:choice.best?.parsed,automatic_proof:choice.automatic,conflict:choice.conflict,elapsed_ms:Math.round(performance.now()-start),first_fill_ms:firstFillMs,processing_ms:processingMs,prepare_ms:Math.round(prepareMs),worker_wait_ms:reads.reduce((n,r)=>n+(r.timing?.worker_ready_ms||0),0),parameters_ms:reads.reduce((n,r)=>n+(r.timing?.parameters_ms||0),0),ocr_ms:reads.reduce((n,r)=>n+(r.timing?.recognize_ms||0),0),fill_ms:Math.round(fillMs*1000)/1000,fill_latency_ms:Math.round(performance.now()-decodeStarted),used_targeted_verification:!!verification};
 }finally{URL.revokeObjectURL(url);image.src='';if(source)source.width=source.height=1;if(verification)verification.width=verification.height=1}
}'''
with tempfile.TemporaryDirectory(prefix='v63-fixtures-') as temp,sync_playwright() as p:
 if options.manifest:items=json.loads(Path(options.manifest).read_text())['images']
 else:
  items=[];font=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',82)
  for i,(text,name,phone) in enumerate([('（李明+09912345678）','李明','09912345678'),('张三09922222222','张三','09922222222'),('王小明\n13800138000','王小明','13800138000'),('(Aung Kyaw+95 912345678)','Aung Kyaw','0912345678')]):
   image=Image.new('RGB',(2000,650),'white');ImageDraw.Draw(image).multiline_text((60,100),text,font=font,fill='#222',spacing=30);path=Path(temp)/(str(i)+'.png');image.save(path);items.append({'path':str(path),'name':name,'phone':phone,'source':'synthetic'})
 engine=os.environ.get('TD_BROWSER_ENGINE','chromium');opts={'args':['--no-sandbox']} if engine=='chromium' else {}
 if engine=='chromium' and shutil.which('chromium'):opts['executable_path']=shutil.which('chromium')
 if engine=='webkit' and os.environ.get('TD_WEBKIT_EXECUTABLE'):opts['executable_path']=os.environ['TD_WEBKIT_EXECUTABLE']
 browser=getattr(p,engine).launch(**opts);context=browser.new_context(service_workers='block');page=context.new_page();page.set_default_timeout(90000);assets=[];context.on('request',lambda r:assets.append(r.url.rsplit('/',1)[-1]) if 'tesseract-core-' in r.url else None)
 page.goto('http://127.0.0.1:'+str(server.server_port)+'/');page.evaluate("async()=>{await TDAssets.ocr();document.body.innerHTML='<input id=fixture type=file><input id=resultName><input id=resultPhone>';window.__workers=0;const create=Tesseract.createWorker;Tesseract.createWorker=(...a)=>{__workers++;return create(...a)}}")
 start=time.perf_counter();page.evaluate('async()=>{await Promise.all([TDLabelOCR.preload(),TDLabelOCR.preload()])}');cold_ms=round((time.perf_counter()-start)*1000);results=[]
 for item in items:
  page.locator('#fixture').set_input_files(item['path'])
  for repeat in range(1,options.repeats+1):
   result=page.evaluate(PIPELINE);correct=result['best']['name']==item['name'] and result['best']['phone']==item['phone'];assert correct,{'image_sha256':hashlib.sha256(Path(item['path']).read_bytes()).hexdigest(),'correct':False,'elapsed_ms':result['elapsed_ms']}
   results.append({'source':item['source'],'image_sha256':hashlib.sha256(Path(item['path']).read_bytes()).hexdigest(),'repeat':repeat,'correct':correct,'elapsed_ms':result['elapsed_ms'],'first_fill_ms':result['first_fill_ms'],'passes':len(result['reads']),'automatic_proof':result['automatic_proof'],'targeted_verification':result['used_targeted_verification'],**{k:result[k] for k in ['processing_ms','prepare_ms','worker_wait_ms','parameters_ms','ocr_ms','fill_ms','fill_latency_ms']}})
 assert page.evaluate('__workers')==1
 if options.scalar:assert 'tesseract-core-lstm.wasm.js' in assets and not any('simd' in x for x in assets),assets
 report={'engine':engine,'forced_scalar':options.scalar,'core_assets':sorted(set(assets)),'cold_local_worker_ms':cold_ms,'worker_initializations':1,'results':results,'real_phone_tested':False,'production_writes':0};print(json.dumps(report))
 if options.output:
  out=Path(options.output);out.write_text(json.dumps(report,indent=2));out.chmod(0o600)
 page.evaluate('TDLabelOCR.stop()');context.close();browser.close()
server.shutdown()
