import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createProxy,createHealth,route,UPSTREAM,PUBLIC_KEY} from '../netlify/lib/supabase-proxy.mjs';
const site='https://deploy-preview.example.netlify.app';
const make=(path='/rest/v1/td_members',options={})=>new Request(site+'/api/supabase'+path,{...options,headers:{apikey:PUBLIC_KEY,authorization:'Bearer user-jwt',origin:site,...options.headers}});
test('allowlist covers actual frontend tables/RPCs and denies admin/realtime/arbitrary hosts and methods',()=>{
 const html=readFileSync('index.html','utf8');
 for(const [,name] of html.matchAll(/\.from\('(td_[a-z0-9_]+)'/g)) assert.ok(route('/api/supabase/rest/v1/'+name,'GET',new URLSearchParams()),name);
 for(const [,name] of html.matchAll(/\.rpc\('(td_[a-z0-9_]+)'/g)) assert.ok(route('/api/supabase/rest/v1/rpc/'+name,'POST',new URLSearchParams()),name);
 for(const p of ['/auth/v1/admin/users','/functions/v1/unknown','/rest/v1/profiles','/realtime/v1/websocket','/storage/v1/object/list/another-bucket','/https://evil.test/','/rest/v1/%74d_members','/rest/v1/td_members%252fadmin'])assert.ok(!route('/api/supabase'+p,'GET',new URLSearchParams()),p);
 assert.ok(!route('/api/supabase/rest/v1/td_orders','DELETE',new URLSearchParams()));
 assert.ok(!route('/api/supabase/auth/v1/token','POST',new URLSearchParams('grant_type=password')));
});
test('JWT, public key, query, range and preference are forwarded unchanged; secrets and cookies are not added',async()=>{
 let seen;const proxy=createProxy(async(url,opts)=>{seen={url:String(url),...opts};return new Response('[]',{status:206,headers:{'content-range':'0-9/20','set-cookie':'do-not-forward','access-control-allow-origin':'*','content-length':'999'}});});
 const result=await proxy(make('/rest/v1/td_orders?customer_id=eq.abc&select=*',{headers:{range:'0-9',prefer:'count=exact',cookie:'private=1','x-forwarded-for':'fake','x-service-role':'do-not-forward'}}));
 assert.equal(result.status,206);assert.equal(seen.url,UPSTREAM+'/rest/v1/td_orders?customer_id=eq.abc&select=*');
 assert.equal(seen.headers.get('authorization'),'Bearer user-jwt');assert.equal(seen.headers.get('apikey'),PUBLIC_KEY);assert.equal(seen.headers.get('range'),'0-9');assert.equal(seen.headers.get('prefer'),'count=exact');
 for(const h of ['cookie','host','x-forwarded-for','x-service-role'])assert.equal(seen.headers.get(h),null);
 assert.equal(seen.headers.get('origin'),'https://tengda-express-station.netlify.app');
 for(const h of ['set-cookie','access-control-allow-origin','content-length'])assert.equal(result.headers.get(h),null);
 assert.equal(result.headers.get('content-range'),'0-9/20');assert.equal(result.headers.get('cache-control'),'no-store');
});
test('missing credentials, cross-site requests and unsupported methods never reach upstream',async()=>{
 const proxy=createProxy(()=>{throw Error('must not reach upstream');});
 assert.equal((await proxy(new Request(site+'/api/supabase/rest/v1/td_orders'))).status,401);
 assert.equal((await proxy(make(undefined,{headers:{apikey:'wrong'}}))).status,401);
 assert.equal((await proxy(make(undefined,{headers:{origin:'https://evil.test'}}))).status,403);
 assert.equal((await proxy(make(undefined,{headers:{'sec-fetch-site':'cross-site'}}))).status,403);
 assert.equal((await proxy(make(undefined,{method:'DELETE'}))).status,405);
 assert.equal((await proxy(make('/auth/v1/admin/users'))).status,404);
});
test('login, registration, approval and refresh remain caller requests, not privileged proxy operations',async()=>{
 const seen=[];const proxy=createProxy(async(url,o)=>{seen.push({url:String(url),body:JSON.parse(new TextDecoder().decode(o.body)),auth:o.headers.get('authorization')});return Response.json({ok:true});});
 for(const action of ['login','register','create','set-active'])assert.equal((await proxy(make('/functions/v1/staff-auth',{method:'POST',body:JSON.stringify({action,username:'staff',password:'not-logged'})}))).status,200);
 assert.equal((await proxy(make('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:'not-logged'})}))).status,200);
 assert.deepEqual(seen.map(x=>x.body.action).slice(0,4),['login','register','create','set-active']);assert.ok(seen.every(x=>x.auth==='Bearer user-jwt'));
});
test('RLS and Auth errors keep HTTP status and body, including 401, 403 and 429',async()=>{
 for(const status of [400,401,403,409,429,500]){const body=JSON.stringify({code:'42501',message:'permission denied'});const res=await createProxy(async()=>new Response(body,{status,headers:{'retry-after':'30'}}))(make());assert.equal(res.status,status);assert.equal(await res.text(),body);assert.equal(res.headers.get('retry-after'),'30');}
});
test('redirect, network failure, timeout and body bounds fail closed without logging credentials',async()=>{
 assert.equal((await createProxy(async()=>new Response(null,{status:302,headers:{location:'https://evil.test'}}))(make())).status,502);
 assert.equal((await createProxy(async()=>{throw Error('secret-token');})(make())).status,502);
 const slow=createProxy(async(_,o)=>new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(Error('timeout')))),5);
 assert.equal((await slow(make())).status,504);
 assert.equal((await createProxy()(make('/functions/v1/staff-auth',{method:'POST',body:new Uint8Array(11*1024*1024+1)}))).status,413);
 const huge=createProxy(async()=>new Response(new Uint8Array(12*1024*1024+1)));assert.equal((await huge(make())).status,502);
});
test('private signed images use same origin and preserve signed token; uploads retain binary bytes',async()=>{
 const bytes=new Uint8Array([0,1,255,42]);let sent;
 const proxy=createProxy(async(url,o)=>{sent={url:String(url),...o};return new Response(bytes,{headers:{'content-type':'image/png'}});});
 const image=await proxy(new Request(site+'/api/supabase/storage/v1/object/sign/tengda-images/orders/abc/photo.png?token=signed-secret'));
 assert.equal(image.status,200);assert.deepEqual(new Uint8Array(await image.arrayBuffer()),bytes);assert.ok(sent.url.endsWith('?token=signed-secret'));
 assert.equal((await proxy(make('/storage/v1/object/tengda-images/orders/abc/photo.png',{method:'POST',body:bytes,headers:{'content-type':'image/png'}}))).status,200);assert.deepEqual(sent.body,bytes);
});
test('health distinguishes reachable 401 and 503 from network failure, accepts GET only',async()=>{
 for(const status of [200,401,503]){const response=await createHealth(async()=>new Response(null,{status}))(new Request(site));assert.deepEqual(await response.json(),{reachable:true,upstreamStatus:status,healthy:status===200});}
 assert.equal((await createHealth(async()=>{throw Error('private');})(new Request(site))).status,502);
 assert.equal((await createHealth()(new Request(site,{method:'POST'}))).status,405);
});
test('pinned SDK refresh, data reads and signed URLs all use same-origin transport and original JWT',async()=>{
 const calls=[];const id='11111111-1111-4111-8111-111111111111';
 const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
 const proxy=createProxy(async(url,opts)=>{
  calls.push({url:String(url),auth:opts.headers.get('authorization')});
  if(String(url).includes('/auth/v1/token'))return Response.json({access_token:jwt,refresh_token:'next-refresh',expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated'}});
  if(String(url).includes('/storage/'))return Response.json({signedURL:'/object/sign/tengda-images/orders/a/p.png?token=signed'});
  return Response.json([{id}]);
 });
 const context=vm.createContext({URL,Headers,Request,Response,AbortController,TextEncoder,TextDecoder,crypto,console,setTimeout,clearTimeout,setInterval,clearInterval,fetch:async(input,opts)=>{assert.ok(String(input).startsWith(site+'/api/supabase/'));return proxy(new Request(input,opts));}});
 context.self=context;context.document={currentScript:{tagName:'SCRIPT',src:site+'/vendor/supabase-2.49.8.min.js'}};
 vm.runInContext(readFileSync('vendor/supabase-2.49.8.min.js','utf8'),context);
 const client=context.supabase.createClient(site+'/api/supabase',PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'sb-yvsgawbbnyeyvynwghsc-auth-token'}});
 const refresh=await client.auth.refreshSession({refresh_token:'old-refresh'});assert.equal(refresh.error,null);
 const data=await client.from('td_orders').select('*');assert.equal(data.error,null);assert.equal(data.data[0].id,id);
 const photo=await client.storage.from('tengda-images').createSignedUrl('orders/a/p.png',3600);assert.equal(photo.error,null);assert.ok(photo.data.signedUrl.startsWith(site+'/api/supabase/storage/v1/'));
 assert.ok(calls.filter(x=>!x.url.includes('/auth/')).every(x=>x.auth==='Bearer '+jwt));
});
