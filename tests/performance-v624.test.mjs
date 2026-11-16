import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {route} from '../netlify/lib/supabase-proxy.mjs';
test('engines load only on request, deduplicate and allow a failed download to retry',async()=>{
 const tags=[];const ctx=vm.createContext({document:{createElement:()=>({remove(){this.removed=true}}),head:{appendChild:t=>tags.push(t)}},setTimeout,clearTimeout,Promise,Map});vm.runInContext(readFileSync('asset-loader-v624.js','utf8'),ctx);assert.equal(tags.length,0);
 const first=ctx.TDAssets.ocr(),second=ctx.TDAssets.ocr();assert.equal(first,second);assert.equal(tags.length,1);tags[0].onerror();await assert.rejects(first,/加载失败/);
 const retry=ctx.TDAssets.ocr();assert.equal(tags.length,2);ctx.Tesseract={createWorker(){}};tags[1].onload();assert.equal(await retry,ctx.Tesseract);await ctx.TDAssets.ocr();assert.equal(tags.length,2);
});
test('thumbnail gallery batches private signing, keeps originals and falls back for old files',async()=>{
 let calls=0;const ctx=vm.createContext({PHOTO_BUCKET:'tengda-images',esc:s=>String(s).replaceAll('&','&amp;'),db:{storage:{from(bucket){assert.equal(bucket,'tengda-images');return {async createSignedUrls(paths,expires){calls++;assert.equal(expires,3600);return {data:paths.map(path=>path.includes('old.jpg.jpg')?{path,error:'missing'}:{path,signedUrl:'/api/supabase/storage/v1/object/sign/tengda-images/'+path+'?token=synthetic'})}}}}}}});
 vm.runInContext(readFileSync('photo-thumbs-v624.js','utf8'),ctx);const html=await ctx.tdPhotoSignedGallery('parcel',[{name:'new.jpg'},{name:'old.jpg'}],'照片');assert.equal(calls,1);assert.match(html,/loading="lazy" decoding="async"/);assert.match(html,/href="[^\"]*parcel\/new.jpg\?token/);assert.match(html,/src="[^\"]*parcel\/\.thumbs\/new.jpg.jpg\?token/);assert.match(html,/src="[^\"]*parcel\/old.jpg\?token/);assert.ok(!html.includes('/render/image/'));
});
test('batch signing route remains restricted to the existing private bucket and POST',()=>{
 const params=new URLSearchParams();assert.equal(route('/api/supabase/storage/v1/object/sign/tengda-images','POST',params),true);assert.equal(route('/api/supabase/storage/v1/object/sign/tengda-images','GET',params),false);assert.equal(route('/api/supabase/storage/v1/object/sign/other-bucket','POST',params),false);
});
test('PWA never intercepts auth, RPC, signed photos, mutations or cross-origin requests',()=>{
 const handlers={};const ctx=vm.createContext({URL,Set,AbortController,Response,setTimeout,clearTimeout,self:{location:{origin:'https://station.test'},addEventListener:(name,cb)=>handlers[name]=cb}});vm.runInContext(readFileSync('sw.js','utf8'),ctx);
 for(const [url,method] of [['https://station.test/api/supabase/rest/v1/td_orders','GET'],['https://station.test/api/supabase/storage/v1/object/sign/tengda-images/a?token=synthetic','GET'],['https://station.test/','POST'],['https://other.test/','GET'],['https://station.test/release.json','GET']])handlers.fetch({request:{url,method,mode:'cors'},respondWith(){assert.fail('Sensitive/dynamic request must not be cached')}});
});
