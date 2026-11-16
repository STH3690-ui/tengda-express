/* Free device-generated thumbnails. Original bytes/paths are never replaced or deleted. */
'use strict';
async function tdPhotoThumbnail(file){
 const url=URL.createObjectURL(file),image=new Image(),canvas=document.createElement('canvas');let timer;
 try{
  await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('照片解码超时')),10000);image.onload=resolve;image.onerror=()=>reject(Error('无法生成缩略图'));image.src=url});
  const ratio=Math.min(1,480/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.75));if(!blob)throw Error('无法生成缩略图');return blob;
 }finally{clearTimeout(timer);URL.revokeObjectURL(url);image.src='';canvas.width=canvas.height=1}
}
async function tdPhotoUploadThumbnail(prefix,filename,file){
 try{const blob=await tdPhotoThumbnail(file);const {error}=await db.storage.from(PHOTO_BUCKET).upload(prefix+'/.thumbs/'+filename+'.jpg',blob,{contentType:'image/jpeg',upsert:false});return !error}catch{return false}
}
async function tdPhotoSignedGallery(prefix,photos,alt){
 if(!photos.length)return '';
 const storage=db.storage.from(PHOTO_BUCKET),originals=photos.map(f=>prefix+'/'+f.name),thumbs=photos.map(f=>prefix+'/.thumbs/'+f.name+'.jpg');
 let links;
 if(typeof storage.createSignedUrls==='function'){
  const {data:rows,error}=await storage.createSignedUrls([...originals,...thumbs],3600);if(error)throw Error('照片链接读取失败：'+error.message);links=rows||[];
 }else{
  // SDK compatibility; same private authorization and original links.
  links=await Promise.all([...originals,...thumbs].map(async path=>{const {data,error}=await storage.createSignedUrl(path,3600);return {path,signedUrl:error?null:data?.signedUrl}}));
 }
 const byPath=new Map(links.map(x=>[x.path,x.error?null:x.signedUrl]));
 return originals.map((path,i)=>{const full=byPath.get(path);if(!full)return '';const thumb=byPath.get(thumbs[i])||full;return '<a href="'+esc(full)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(thumb)+'" alt="'+esc(alt)+'" loading="lazy" decoding="async" width="160" height="110" onerror="this.onerror=null;this.src=this.closest(\'a\').href"></a>'}).join('');
}
