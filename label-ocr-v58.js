/* Free, self-hosted Tesseract WASM. Image bytes never leave the device here. */
(function(root){
'use strict';let worker=null,busy=false,epoch=0;
async function stop(){epoch++;const w=worker;worker=null;try{await w?.terminate()}catch{}}
async function recognize(file,onProgress=()=>{}){
 if(busy)throw Error('正在识别，请等待');if(!file?.type?.startsWith('image/')||file.size>10*1024*1024)throw Error('仅支持不超过10MB的照片');
 busy=true;let timer,url;const image=new Image(),current=++epoch;
 try{
  const job=(async()=>{
   url=URL.createObjectURL(file);await new Promise((ok,no)=>{image.onload=ok;image.onerror=()=>no(Error('照片无法解码，请改用JPEG或PNG'));image.src=url});
   const scale=Math.min(1,2200/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
   if(!root.Tesseract)throw Error('本地OCR组件未加载，请联网重新打开页面');
   if(!worker){const next=await Tesseract.createWorker('chi_sim+eng',1,{workerPath:'/vendor/tesseract-v6/worker.min.js',corePath:'/vendor/tesseract-v6/',langPath:'/vendor/tesseract-v6/lang',workerBlobURL:false,logger:m=>onProgress(m.status,Math.round((m.progress||0)*100))});if(current!==epoch){await next.terminate();throw Error('识别已取消')}worker=next;}
   const result=await worker.recognize(canvas,{}, {text:true,blocks:true});
   const words=(result.data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>l.words||[]))).filter(w=>/[\p{L}\d]/u.test(w.text||''));
   if(current!==epoch)throw Error('识别已取消');return {text:result.data.text||'',confidence:Number(result.data.confidence)||0,minConfidence:words.length?Math.min(...words.map(w=>Number(w.confidence)||0)):0};
  })();
  return await Promise.race([job,new Promise((_,reject)=>{timer=setTimeout(()=>{stop();reject(Error('识别超时，请重拍或使用实况文本人工核对'))},60000)})]);
 }catch(e){await stop();throw e}finally{clearTimeout(timer);if(url)URL.revokeObjectURL(url);image.src='';busy=false;}
}
root.TDLabelOCR={recognize,stop};addEventListener('pagehide',stop);
})(globalThis);
