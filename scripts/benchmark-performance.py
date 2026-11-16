import sys,json,threading,time,gzip,http.server,functools
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(sys.argv[1]);port=int(sys.argv[2]);out=sys.argv[3]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  path=root/(self.path.split('?')[0].lstrip('/') or 'index.html')
  if not path.is_file():self.send_error(404);return
  raw=path.read_bytes();body=gzip.compress(raw) if path.suffix in ['.js','.css','.html','.json','.svg'] else raw
  self.send_response(200);self.send_header('Content-Type',self.guess_type(str(path)))
  if body!=raw:self.send_header('Content-Encoding','gzip')
  self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
server=http.server.ThreadingHTTPServer(('127.0.0.1',port),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);results=[]
 for profile,latency,bandwidth,cpu in [('regular',40,1250000,1),('weak',150,187500,4)]:
  for i in range(3):
   context=b.new_context(viewport={'width':390,'height':844},service_workers='block');page=context.new_page();cdp=context.new_cdp_session(page);cdp.send('Network.enable');cdp.send('Network.setCacheDisabled',{'cacheDisabled':True});cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':latency,'downloadThroughput':bandwidth,'uploadThroughput':bandwidth});cdp.send('Emulation.setCPUThrottlingRate',{'rate':cpu})
   page.goto(f'http://127.0.0.1:{port}/',wait_until='load');page.wait_for_function("()=>typeof connect==='function' && !!document.querySelector('#loginForm button')")
   result=page.evaluate("""()=>{const n=performance.getEntriesByType('navigation')[0],r=performance.getEntriesByType('resource');return {load_ms:n.loadEventEnd,requests:r.length+1,transfer_bytes:n.transferSize+r.reduce((s,x)=>s+x.transferSize,0),decoded_bytes:n.decodedBodySize+r.reduce((s,x)=>s+x.decodedBodySize,0),engines:r.filter(x=>/zxing|tesseract/.test(x.name)).map(x=>x.name)}}""");result.update(profile=profile,run=i+1);results.append(result);context.close()
 b.close()
server.shutdown();Path(out).write_text(json.dumps(results,indent=2));print(json.dumps(results))
