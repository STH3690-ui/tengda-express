// No server secrets: ordinary requests keep the caller's public key and JWT.
export const UPSTREAM = 'https://yvsgawbbnyeyvynwghsc.supabase.co';
export const PUBLIC_KEY = 'sb_publishable_olGZexHf-mjgPzQ6Bz7X9w_Idr2L6Hu';
const PREFIX = '/api/supabase';
const TABLES = new Set(['td_station_addresses','td_members','td_customers','td_orders','td_parcels','td_pickups','td_payments','td_customer_archives','td_order_hidden_v41','td_order_deletion_log','td_pickup_batches','td_pickup_receipts_v32','td_pickup_balances_v32']);
const RPCS = new Set(['td_soft_delete_customer_v31','td_restore_customer_v31','td_owner_archive_customer_v29','td_owner_restore_customer_v29','td_owner_delete_customer_v29','td_staff_hide_order','td_batch_pickup_v32','td_owner_hide_order_v41','td_owner_restore_hidden_order_v42','td_owner_set_order_hide_permission','td_record_pickup','td_pickup_repay_v32','td_cleanup_preview_v1','td_cleanup_archive_v1']);
const METHODS = new Set(['GET','HEAD','POST','PATCH','OPTIONS']);
const IN_HEADERS = ['authorization','apikey','content-type','accept','prefer','range','range-unit','accept-profile','content-profile','x-client-info','x-upsert','x-supabase-api-version'];
const OUT_HEADERS = ['content-type','content-range','range-unit','preference-applied','retry-after','www-authenticate','x-supabase-api-version'];
const MAX_BODY = 11 * 1024 * 1024; // Existing 10 MB photo uploads plus multipart overhead.
const MAX_RESPONSE = 12 * 1024 * 1024;
function reply(status, error) { return Response.json({error}, {status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}); }
export function route(path, method, search) {
 if (!path.startsWith(PREFIX+'/') || /%|\\|\/\/|(?:^|\/)\.{1,2}(?:\/|$)/.test(path)) return false;
 const p=path.slice(PREFIX.length);
 if (p==='/functions/v1/staff-auth') return method==='POST';
 if (p==='/auth/v1/user') return method==='GET';
 if (p==='/auth/v1/logout') return method==='POST';
 if (p==='/auth/v1/token') return method==='POST' && search.get('grant_type')==='refresh_token';
 if (p.startsWith('/rest/v1/rpc/')) return method==='POST' && RPCS.has(p.slice(13));
 if (p.startsWith('/rest/v1/')) {
  const table=p.slice(9);if (!TABLES.has(table)) return false;
  return ['GET','HEAD'].includes(method) || (method==='POST'&&['td_customers','td_orders','td_parcels','td_payments','td_station_addresses'].includes(table)) || (method==='PATCH'&&['td_customers','td_station_addresses'].includes(table));
 }
 if (p==='/storage/v1/object/list/tengda-images') return method==='POST';
 if (/^\/storage\/v1\/object\/sign\/tengda-images\/[a-zA-Z0-9_./-]+$/.test(p)) return ['GET','POST'].includes(method);
 if (/^\/storage\/v1\/object\/tengda-images\/[a-zA-Z0-9_./-]+$/.test(p)) return ['GET','HEAD','POST'].includes(method);
 return false; // No realtime WebSockets, admin, arbitrary functions, buckets or destinations.
}
async function bounded(stream, max, signal) {
 if (!stream) return undefined;
 const reader=stream.getReader();let total=0;const chunks=[];
 const abort=()=>{reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try { for (;;) { if(signal.aborted) throw new Error('timeout');const {done,value}=await reader.read();if(signal.aborted)throw new Error('timeout');if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw new RangeError('body_limit');}chunks.push(value); }
 const bytes=new Uint8Array(total);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.length;}return bytes;
 } finally {signal.removeEventListener('abort',abort);reader.releaseLock();}
}
export function createProxy(fetcher=fetch, timeoutMs=25000) {
 return async(request)=>{
  const u=new URL(request.url), origin=request.headers.get('origin');
  if (origin && origin!==u.origin) return reply(403,'cross_origin_denied');
  if (request.headers.get('sec-fetch-site')==='cross-site') return reply(403,'cross_origin_denied');
  if (!METHODS.has(request.method)) return reply(405,'method_not_allowed');
  if (request.method==='OPTIONS') return reply(405,'preflight_not_required');
  if (!route(u.pathname,request.method,u.searchParams)) return reply(404,'route_not_allowed');
  const signedImage=request.method==='GET'&&u.pathname.startsWith(PREFIX+'/storage/v1/object/sign/tengda-images/')&&u.searchParams.has('token');
  if (!signedImage && request.headers.get('apikey')!==PUBLIC_KEY) return reply(401,'public_api_key_required');
  if (!signedImage && !/^Bearer \S+$/i.test(request.headers.get('authorization')||'')) return reply(401,'authorization_required');
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),timeoutMs);
  const cancel=()=>controller.abort();request.signal.addEventListener('abort',cancel,{once:true});
  let responsePhase=false;
  try {
   if(Number(request.headers.get('content-length'))>MAX_BODY)return reply(413,'request_too_large');
   const body=await bounded(request.body,MAX_BODY,controller.signal);
   const headers=new Headers();for(const key of IN_HEADERS){const value=request.headers.get(key);if(value!==null)headers.set(key,value);}
   // Browser origin is checked above; only the already-approved production origin reaches staff-auth.
   // Never trust client-supplied forwarded-IP, cookies, host or other routing headers.
   headers.set('origin','https://tengda-express-station.netlify.app');
   const target=new URL(u.pathname.slice(PREFIX.length)+u.search,UPSTREAM);
   const result=await fetcher(target,{method:request.method,headers,body,signal:controller.signal,redirect:'manual'});
   if(result.status>=300&&result.status<400){await result.body?.cancel();return reply(502,'upstream_redirect_denied');}
   responsePhase=true;
   const bytes=await bounded(result.body,MAX_RESPONSE,controller.signal);
   const out=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});
   for(const key of OUT_HEADERS){const value=result.headers.get(key);if(value!==null)out.set(key,value);}
   if(signedImage&&!/^image\/(jpeg|png|gif|webp|avif|heic)(;|$)/i.test(out.get('content-type')||''))out.set('content-disposition','attachment');
   return new Response(request.method==='HEAD'||[204,205,304].includes(result.status)?null:bytes,{status:result.status,headers:out});
  }catch(error){return reply(controller.signal.aborted?504:error instanceof RangeError?(responsePhase?502:413):502,controller.signal.aborted?'upstream_timeout':error instanceof RangeError?'body_limit':'upstream_unreachable');}
  finally{clearTimeout(timer);request.signal.removeEventListener('abort',cancel);}
 };
}
export function createHealth(fetcher=fetch) {
 return async request=>{
  if(request.method!=='GET')return reply(405,'method_not_allowed');
  try {const response=await fetcher(UPSTREAM+'/auth/v1/health',{signal:AbortSignal.timeout(8000),redirect:'manual'});await response.body?.cancel();return Response.json({reachable:true,upstreamStatus:response.status,healthy:response.ok},{headers:{'Cache-Control':'no-store'}});}
  catch{return Response.json({reachable:false,error:'upstream_unreachable'},{status:502,headers:{'Cache-Control':'no-store'}});}
 };
}
