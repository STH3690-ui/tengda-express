/* Only static shell is cached. Auth, RPC, signed photographs and mutations NEVER enter CacheStorage. */
const CACHE='tengda-shell-__TD_SHELL_VERSION__';
const SHELL=/*__TD_SHELL_FILES__*/['/app-icon.svg','/manifest.webmanifest'];
const STATIC=new Set(SHELL.filter(p=>p!=='/'));
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));});
// The new release waits until the old app closes; no mixed-release skipWaiting.
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('tengda-shell-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);
 if(event.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.search)return;
 if(event.request.mode==='navigate'){
  event.respondWith((async()=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);
   try{return await fetch(event.request,{signal:controller.signal})}
   catch{const cached=await caches.open(CACHE).then(c=>c.match('/'));return cached||new Response('网络不可用，请连接网络后重试。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})}
   finally{clearTimeout(timer)}
  })());return;
 }
 if(STATIC.has(u.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));
});
