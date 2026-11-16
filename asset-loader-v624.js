/* Device-only engines: never download these on the login or workspace route. */
(function(root){
 'use strict';
 const pending=new Map();
 function script(path,globalName){
  if(root[globalName])return Promise.resolve(root[globalName]);
  if(pending.has(path))return pending.get(path);
  const promise=new Promise((resolve,reject)=>{
   const tag=document.createElement('script');let timer;
   const fail=()=>{clearTimeout(timer);tag.remove();pending.delete(path);reject(Error('识别组件加载失败，请检查网络后重试'))};
   timer=setTimeout(fail,30000);tag.src=path;tag.async=true;tag.onerror=fail;
   tag.onload=()=>{clearTimeout(timer);if(!root[globalName])return fail();resolve(root[globalName])};
   document.head.appendChild(tag);
  });pending.set(path,promise);return promise;
 }
 root.TDAssets={barcode:()=>script('/vendor/zxing-0.21.3.min.js','ZXing'),ocr:()=>script('/vendor/tesseract-v6/tesseract.min.js','Tesseract')};
})(globalThis);
