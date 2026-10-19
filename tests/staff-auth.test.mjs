import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/staff-auth/handler.mjs';
const ID = '11111111-1111-4111-8111-111111111111';
const settings = { SUPABASE_URL:'https://testref.supabase.co', SUPABASE_ANON_KEY:'public-key', SUPABASE_SERVICE_ROLE_KEY:'server-only-secret', TD_TEST_PROJECT_REF:'testref', TD_ENVIRONMENT:'tengda-v32-test', TD_ALLOWED_ORIGINS:'https://station.test' };
function fixture(overrides = {}, state = {}) {
  const calls = [];
  const member = state.member ?? { role:'owner', active:true };
  const query = { select(){ return this; }, eq(){ return this; }, async maybeSingle(){ return { data: member, error:state.memberError }; } };
  const rpc = async (name, args) => {
    calls.push({ name, args });
    if(name==='td_login_attempt_v32')return { data:state.allowed??true, error:state.rateError };
    if(name==='td_login_identity_v32')return { data:state.unknown?[]:[{id:ID,auth_email:'internal@testref.supabase.co'}], error:state.lookupError };
    return { error:state.rpcError };
  };
  const auth = {
    async getUser(token){ calls.push({name:'getUser', token}); return {data:{user:state.badToken?null:{id:ID}},error:null}; },
    async signInWithPassword(credentials){ calls.push({name:'password',credentials});return { data:{user:{id:ID},session:{access_token:'access',refresh_token:'refresh'}},error:state.badPassword?new Error('invalid'):null }; },
    admin:{ async createUser(args){ calls.push({name:'createUser',args}); return {data:{user:{id:ID}}}; }, async deleteUser(id){calls.push({name:'deleteUser',id});return {}; }, async updateUserById(id,args){calls.push({name:'updateUserById',id,args});return {error:state.banError}; } },
  };
  const handler=createHandler({env:name=>({...settings,...overrides})[name],randomUUID:()=>ID,createClient:(_url,key)=>({auth,rpc,from:()=>({ ...query, select(columns){this.columns=columns;return this;},async maybeSingle(){return {data:key==='server-only-secret'&&this.columns==='role'?(state.target??{role:'staff',active:true}):member,error:state.memberError};} })})});
  const request = async (body, {token='valid-token',origin='https://station.test',method='POST'}={}) => {
    const response = await handler(new Request('https://testref.supabase.co/functions/v1/staff-auth',{method,headers:{origin,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}));
    return {status:response.status,body:response.status===204?null:await response.json(),headers:response.headers};
  };
  return {request,calls};
}
const credentials={action:'login',username:'  STAFF_01 ',password:'correct-password'};
const profile={action:'create',username:' Staff_01 ',display_name:'员工一',password:'safe-password-123',email:'',contact_phone:''};
test('username login normalizes names and returns only session tokens',async()=>{
 const f=fixture();const r=await f.request(credentials,{token:null});assert.equal(r.status,200);assert.deepEqual(r.body,{ok:true,session:{access_token:'access',refresh_token:'refresh'}});assert.equal(f.calls[0].args.p_login,'staff_01');assert.equal(r.headers.get('cache-control'),'no-store');
});
for(const [label,state] of Object.entries({unknown:{unknown:true},wrongPassword:{badPassword:true},pending:{member:{active:false}},disabled:{member:{active:false}},databaseError:{memberError:new Error('DB')}}))test('login rejects '+label,async()=>{
 const f=fixture({},state);const r=await f.request(credentials);assert.equal(r.status,401);assert.equal(r.body.message,'用户名、密码不正确，或账号尚未批准 / 已停用');assert.ok(f.calls.some(x=>x.name==='password'));
});
test('persistent rate limit is checked before identity lookup',async()=>{const f=fixture({},{allowed:false});assert.equal((await f.request(credentials)).status,429);assert.deepEqual(f.calls.map(x=>x.name),['td_login_attempt_v32']);});
test('rate limiter failure closes login',async()=>{const f=fixture({},{rateError:new Error('DB')});assert.equal((await f.request(credentials)).status,503);});
test('owner creates pending staff with optional email, without exposing internal identity',async()=>{
 const f=fixture();const r=await f.request({...profile,role:'owner',active:true});assert.equal(r.status,201);const created=f.calls.find(x=>x.name==='createUser').args;assert.equal(created.email,ID+'@testref.supabase.co');assert.equal(created.email_confirm,true);assert.deepEqual(created.user_metadata,{display_name:'员工一'});const provision=f.calls.find(x=>x.name==='td_provision_staff_v32').args;assert.equal(provision.p_username,'staff_01');assert.equal(provision.p_email,null);assert.ok(!JSON.stringify(r.body).includes(created.email));
});
test('optional contact email is profile data, not an Auth address',async()=>{const f=fixture();await f.request({...profile,email:'person@company.cn'});assert.equal(f.calls.find(x=>x.name==='td_provision_staff_v32').args.p_email,'person@company.cn');assert.notEqual(f.calls.find(x=>x.name==='createUser').args.email,'person@company.cn');});
for(const [label,state] of Object.entries({staff:{member:{role:'staff',active:true}},inactiveOwner:{member:{role:'owner',active:false}},forgedToken:{badToken:true}}))test('admin operations reject '+label,async()=>{const f=fixture({},state);const r=await f.request(profile);assert.ok([401,403].includes(r.status));assert.ok(!f.calls.some(x=>x.name==='createUser'));});
test('admin operations reject missing JWT',async()=>{const f=fixture();assert.equal((await f.request(profile,{token:null})).status,401);});
test('conflict rolls back newly created Auth user',async()=>{const f=fixture({},{rpcError:new Error('duplicate')});assert.equal((await f.request(profile)).status,409);assert.ok(f.calls.some(x=>x.name==='deleteUser'));});
for(const body of [{...profile,username:'x'},{...profile,password:'short'},{...profile,email:'bad'},{...profile,display_name:''}])test('invalid profile is rejected before Auth writes: '+JSON.stringify(body),async()=>{const f=fixture();assert.equal((await f.request(body)).status,400);assert.ok(!f.calls.some(x=>x.name==='createUser'));});
test('approve and disable use caller-authorized transaction RPC',async()=>{for(const active of [true,false]){const f=fixture();assert.equal((await f.request({action:'set-active',member_id:ID,active})).status,200);assert.deepEqual(f.calls.find(x=>x.name==='td_set_staff_active_v32').args,{p_member:ID,p_active:active});}});
test('status is a boolean, not a coerced string',async()=>{const f=fixture();assert.equal((await f.request({action:'set-active',member_id:ID,active:'false'})).status,400);});
test('unknown and oversized JSON are rejected',async()=>{const f=fixture();assert.equal((await f.request('{bad')).status,400);assert.equal((await f.request('x'.repeat(8193))).status,413);assert.equal((await f.request(null)).status,400);assert.equal((await f.request({action:'promote'})).status,400);});
test('CORS allows only configured origins',async()=>{const f=fixture();assert.equal((await f.request(credentials,{origin:'https://evil.test'})).status,403);const r=await f.request(null,{method:'OPTIONS'});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),'https://station.test');});
for(const overrides of [{TD_TEST_PROJECT_REF:'productionref'},{TD_ENVIRONMENT:'production'},{TD_ALLOWED_ORIGINS:''},{SUPABASE_SERVICE_ROLE_KEY:''}])test('wrong or missing environment fails closed '+JSON.stringify(overrides),async()=>{const f=fixture(overrides);assert.ok([403,503].includes((await f.request(credentials)).status));assert.equal(f.calls.length,0);});

test('owner Auth identity is never modified by staff status action',async()=>{const f=fixture({},{target:{role:'owner'}});assert.equal((await f.request({action:'set-active',member_id:ID,active:false})).status,409);assert.ok(!f.calls.some(x=>x.name==='updateUserById'));assert.ok(!f.calls.some(x=>x.name==='td_set_staff_active_v32'));});
test('disable denies database access before Auth ban, approve unbans before DB activation',async()=>{for(const active of [false,true]){const f=fixture();await f.request({action:'set-active',member_id:ID,active});const names=f.calls.map(x=>x.name);assert.equal(names.indexOf('updateUserById')<names.indexOf('td_set_staff_active_v32'),active);assert.equal(f.calls.find(x=>x.name==='updateUserById').args.ban_duration,active?'none':'876000h');}});
test('Auth failure on approve never activates database membership',async()=>{const f=fixture({},{banError:new Error('Auth')});assert.equal((await f.request({action:'set-active',member_id:ID,active:true})).status,503);assert.ok(!f.calls.some(x=>x.name==='td_set_staff_active_v32'));});
test('Auth failure on disable leaves database access denied and reports partial failure',async()=>{const f=fixture({},{banError:new Error('Auth')});const r=await f.request({action:'set-active',member_id:ID,active:false});assert.equal(r.status,503);assert.ok(r.body.message.includes('业务访问已停用'));assert.ok(f.calls.some(x=>x.name==='td_set_staff_active_v32'&&x.args.p_active===false));});

test('production project binding accepts only the explicit production ref',async()=>{const f=fixture({TD_ENVIRONMENT:'tengda-v32-production',TD_PROJECT_REF:'yvsgawbbnyeyvynwghsc',SUPABASE_URL:'https://yvsgawbbnyeyvynwghsc.supabase.co'});assert.equal((await f.request(credentials)).status,200);const wrong=fixture({TD_ENVIRONMENT:'tengda-v32-production',TD_PROJECT_REF:'testref'});assert.equal((await wrong.request(credentials)).status,503);});
