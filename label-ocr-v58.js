/* Free self-hosted WASM. One serialized worker; no image upload. */
(function(root){'use strict';let worker=null,busy=false,epoch=0,cancelRun=null;
async function stop(){epoch++;workerGeneration++;const cancel=cancelRun;cancelRun=null;cancel?.();const w=worker;worker=null;try{await w?.terminate()}catch{}}
let loading=null,workerGeneration=0;
async function ensureWorker(progress=()=>{}){
 if(worker)return worker;const generation=workerGeneration;if(loading&&loading.generation===generation)return loading.promise;
 const promise=(async()=>{const next=await Tesseract.createWorker('chi_sim+eng',1,{workerPath:'/vendor/tesseract-v6/worker.min.js',corePath:'/vendor/tesseract-v6/tesseract-core-lstm.js',langPath:'/vendor/tesseract-v6/lang',workerBlobURL:false,logger:m=>progress(m.status,Math.round((m.progress||0)*100))});if(generation!==workerGeneration){await next.terminate();throw Error('识别已取消')}worker=next;return next})();loading={generation,promise};try{return await promise}finally{if(loading?.promise===promise)loading=null}
}
async function canvasJob(canvas,progress,current,options={}){
 if(!root.Tesseract)throw Error('本地OCR组件未加载，请联网重新打开页面');
 const active=await ensureWorker(progress);if(current!==epoch)throw Error('识别已取消');await active.setParameters({tessedit_pageseg_mode:String(options.psm||3)});
 if(current!==epoch)throw Error('识别已取消');const result=await active.recognize(canvas,{}, {text:true,blocks:true});
 if(current!==epoch)throw Error('识别已取消');
 const words=(result.data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>l.words||[]))).filter(w=>/[\p{L}\d]/u.test(w.text||'')).map(w=>({text:w.text,confidence:Number(w.confidence)||0}));
 return {text:result.data.text||'',confidence:Number(result.data.confidence)||0,minConfidence:words.length?Math.min(...words.map(w=>w.confidence)):0,words};
}
async function run(makeCanvas,onProgress,timeout,options={}){
 if(busy)throw Error('正在识别，请等待');busy=true;const current=++epoch;let timer,cleanup=()=>{};const cancelled=new Promise((_,reject)=>{cancelRun=()=>reject(Error('识别已取消'))});
 try{const job=(async()=>{const prepared=await makeCanvas();cleanup=prepared.cleanup||cleanup;if(current!==epoch)throw Error('识别已取消');return canvasJob(prepared.canvas,onProgress,current,options)})();return await Promise.race([job,cancelled,new Promise((_,reject)=>{timer=setTimeout(()=>{cancelRun=null;stop();reject(Error('识别超时，请改善光线后重新开始'))},timeout)})]);}
 catch(e){await stop();throw e}finally{cancelRun=null;clearTimeout(timer);cleanup();busy=false;}
}
async function recognize(file,onProgress=()=>{}){
 if(!file?.type?.startsWith('image/')||file.size>10*1024*1024)throw Error('仅支持不超过10MB的照片');
 return run(async()=>{const url=URL.createObjectURL(file),image=new Image();try{await new Promise((ok,no)=>{image.onload=ok;image.onerror=()=>no(Error('照片无法解码，请改用JPEG或PNG'));image.src=url});const scale=Math.min(1,2200/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return {canvas,cleanup:()=>{canvas.width=canvas.height=1}}}finally{URL.revokeObjectURL(url);image.src=''}},onProgress,60000);
}
function recognizeCanvas(canvas,onProgress=()=>{}){if(!canvas?.width||canvas.width>1800||canvas.height>1200)throw Error('识别区域尺寸无效');return run(async()=>({canvas}),onProgress,25000)}
function recognizeFrozen(canvas,onProgress=()=>{},options={}){if(!canvas?.width||canvas.width>3200||canvas.height>2400)throw Error('冻结图片尺寸无效');return run(async()=>({canvas}),onProgress,Math.max(1000,Math.min(35000,options.timeout||35000)),options)}
root.TDLabelOCR={recognize,recognizeCanvas,recognizeFrozen,preload:ensureWorker,stop};addEventListener('pagehide',stop);
})(globalThis);
