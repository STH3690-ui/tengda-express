import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(x=>x.includes('let db='))[0];
function frontend() {
 const nodes={};
 const node=id=>nodes[id]??={innerHTML:'',textContent:'',value:'',classList:{add(){},remove(){}},addEventListener(){}};
 const context=vm.createContext({document:{getElementById:node,addEventListener(){}},setInterval(){},setTimeout(){},clearTimeout(){},AbortController,Response,window:{},console,confirm:()=>true});
 vm.runInContext(inline,context);
 return {run:code=>vm.runInContext(code,context),nodes};
}
test('all inline scripts parse and duplicate active entry point stays synchronized',()=>{
 for(const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script);
 assert.equal(html,readFileSync(new URL('../index 9.html',import.meta.url),'utf8'));
});
test('staff can add/edit customers but cannot see destructive controls or staff management',()=>{
 const f=frontend();f.run("role='staff';data.td_customers=[{id:'customer1',name:'客户',phone:'1',notes:''}]");const result=f.run('customers()');assert.ok(result.includes('saveCustomer(event)'));assert.ok(result.includes('editCustomer('));for(const forbidden of ['onclick="softDeleteCustomer','onclick="manageCustomer','onclick="restoreDeletedCustomer'])assert.ok(!result.includes(forbidden));assert.ok(!f.run('staff()').includes('tdCreateStaff'));
});
test('owner retains customer actions and sees create/approve/disable controls',()=>{
 const f=frontend();f.run("role='owner';data.td_customers=[{id:'customer1',name:'客户'}];data.td_members=[{id:'staff1',role:'staff',active:false},{id:'staff2',role:'staff',active:true},{id:'owner',role:'owner',active:true}]");const result=f.run('customers()');assert.ok(result.includes('softDeleteCustomer'));assert.ok(result.includes('manageCustomer'));assert.ok(result.includes('客户回收站'));const staff=f.run('staff()');assert.ok(staff.includes('tdCreateStaff'));assert.ok(staff.includes("tdSetStaffActive('staff1',true)"));assert.ok(staff.includes("tdSetStaffActive('staff2',false)"));assert.ok(!staff.includes("tdSetStaffActive('owner'"));
});
test('direct staff call to delete is blocked before database use',async()=>{
 const f=frontend();f.run("role='staff';notify=(message)=>message;db={rpc(){throw Error('must not call database')}}");assert.equal(await f.run("softDeleteCustomer('customer1')"),'仅管理员可删除客户');
});
test('display names are escaped and business features remain present',()=>{
 const f=frontend();f.run("role='owner';data.td_members=[{id:'staff1',role:'staff',display_name:'<img onerror=alert(1)>',username:'staff1'}]");assert.ok(!f.run('staff()').includes('<img onerror'));for(const fn of ['tdLoadFinance','tdRepay','submitBatchPickup','uploadPhotos','openOrderPhotos','saveCustomer','payments','orders'])assert.equal(f.run('typeof '+fn),'function');assert.ok(html.includes('tengda-header.jpg'));assert.ok(html.includes('td-hero'));
});
test('failed membership check clears business data and hides app',async()=>{
 const f=frontend();f.run("user={id:'u'};role='owner';data.td_customers=[{id:'private'}];notify=()=>{};db={from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{active:false}}}}},auth:{async signOut(){}}}");assert.equal(await f.run('tdCheckMember()'),false);assert.equal(f.run('user'),null);assert.equal(f.run('role'),'');assert.equal(f.run('data.td_customers.length'),0);assert.equal(f.nodes.page.innerHTML,'');
});
test('frontend never constructs example-domain Auth addresses or calls privileged Auth',()=>{
 const js=readFileSync(new URL('../tengda-staff-auth-v32.js',import.meta.url),'utf8');assert.ok(!js.includes('example.com'));assert.ok(!js.includes('service_role'));assert.ok(!js.includes('auth.admin'));assert.ok(!html.includes('auth.signUp'));assert.ok(!html.includes('auth.signInWithPassword'));assert.equal(js,readFileSync(new URL('../tengda-staff-auth-v32.js.txt',import.meta.url),'utf8'));
});

function loadAuth(f){f.run('connect=()=>{}');f.run(readFileSync(new URL('../tengda-staff-auth-v32.js',import.meta.url),'utf8'));}
test('server login errors are presented without misreporting a deployment failure',async()=>{const f=frontend();loadAuth(f);f.run("db={functions:{async invoke(){return {error:{context:Response.json({message:'账号已停用'},{status:403})}}}}}");await assert.rejects(f.run("tdStaffRequest({action:'login'})"),/账号已停用/);});
test('transport failures use a safe actionable error',async()=>{const f=frontend();loadAuth(f);f.run("db={functions:{async invoke(){return {error:{}}}}}");await assert.rejects(f.run("tdStaffRequest({action:'login'})"),/网络/);});

test('authorized employees hide orders through the safe RPC, never delete a table row',async()=>{const f=frontend();f.run("canHideOrders=true;data.td_orders=[{id:'order1',item_name:'Original'}];notify=()=>{};refresh=async()=>{};let called='';db={async rpc(name){called=name;return {}}}");await f.run("deleteOrder('order1')");assert.equal(f.run('called'),'td_staff_hide_order');assert.equal(f.run('data.td_orders.length'),1);});
test('employees without a grant cannot call the order removal service',async()=>{const f=frontend();f.run("canHideOrders=false;notify=(x)=>x;db={rpc(){throw Error('RPC should not be called')}}");assert.match(await f.run("deleteOrder('order1')"),/未获管理员授权/);});
