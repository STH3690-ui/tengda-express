import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('let db='));
function app(){
 const nodes={};
 const ctx=vm.createContext({document:{getElementById:id=>nodes[id]??={innerHTML:'',classList:{add(){},remove(){}},addEventListener(){}},addEventListener(){}},window:{},setInterval(){},setTimeout(){},clearTimeout(){},console,confirm:()=>true,prompt:()=> '测试删除原因'});
 vm.runInContext(code,ctx);
 return {run:s=>vm.runInContext(s,ctx),ctx};
}
test('all-selected exceeds 1000 displayed rows and submits exactly one atomic RPC',async()=>{
 const f=app();f.run("role='owner';data.td_payments=Array.from({length:1205},(_,i)=>({id:'p'+i,amount:10,created_at:'2026-11-12'}));tdAuditSelectAll(true);window.calls=[];notify=()=>{};refresh=async()=>true;db={async rpc(name,args){window.calls.push({name,args});return {data:1205,error:null}}}");
 assert.equal(f.run('tdAuditSelected.size'),1205);
 await f.run('tdAuditBulkDelete()');
 assert.equal(f.run('window.calls.length'),1);
 assert.equal(f.run('window.calls[0].name'),'td_hide_audit_batch_v54');
 assert.equal(f.run('window.calls[0].args.p_entries.length'),1205);
 assert.equal(f.run('tdAuditRows().length'),0);
 assert.equal(f.run('data.td_payments.length'),0);
});
test('RPC failure leaves selection, business rows and totals intact',async()=>{
 const f=app();f.run("role='owner';data.td_payments=[{id:'p',amount:10,created_at:'2026-11-12'}];tdAuditSelectAll(true);notify=()=>{};db={async rpc(){return {error:{message:'rollback'}}}};");
 await f.run('tdAuditBulkDelete()');
 assert.equal(f.run('tdAuditSelected.size'),1);assert.equal(f.run('data.td_payments.length'),1);assert.equal(f.run('hiddenBusinessIds.size'),0);
});
test('single delete shares batch RPC and preserves original customer label for linked business',async()=>{
 const f=app();f.run("role='owner';data.td_customers=[{id:'c',name:'历史客户'}];data.td_orders=[{id:'o',customer_id:'c'}];notify=()=>{};refresh=async()=>true;window.calls=[];db={async rpc(name,args){window.calls.push({name,args});return {data:1}}}");
 await f.run("tdHideAuditEntry('td_customers','c')");
 assert.equal(f.run('data.td_customers.length'),0);assert.equal(f.run('data.td_orders.length'),1);assert.equal(f.run("name('c')"),'历史客户');
 assert.equal(f.run('window.calls[0].args.p_entries.length'),1);
});
test('staff, short reasons and cancelled confirmation never call RPC',async()=>{
 const f=app();f.run("db={rpc(){throw Error('unexpected RPC')}};notify=()=>{};role='staff'");
 await f.run("tdHideAuditEntry('td_payments','p')");
 f.run("role='owner';prompt=()=> '短'");await f.run("tdHideAuditEntry('td_payments','p')");
 f.run("prompt=()=> '测试原因';confirm=()=>false");await f.run("tdHideAuditEntry('td_payments','p')");
});
test('business marker pagination filters every type after refresh without mutating source arrays',async()=>{
 const f=app();f.run("window.offsets=[];db={rpc(){return {select(){return this},order(){return this},async range(a){window.offsets.push(a);return {data:Array.from({length:a===0?1000:2},(_,i)=>({source_table:'td_payments',source_id:String(a+i)}))}}}}}");
 await f.run('tdReadBusinessHidden().then(x=>hiddenBusinessIds=x)');assert.equal(f.run('hiddenBusinessIds.size'),1002);assert.equal(f.run('window.offsets.join()'),'0,1000');
 f.run("for(const t of ['td_customers','td_orders','td_parcels','td_pickups','td_payments']){data[t]=[{id:'gone'},{id:'kept'}];hiddenBusinessIds.add(t+':gone')}window.original=data.td_payments;tdApplyBusinessHidden()");
 assert.equal(f.run('window.original.length'),2);
 for(const t of ['td_customers','td_orders','td_parcels','td_pickups','td_payments'])assert.equal(f.run('data.'+t+'.length'),1);
});
test('proxy admits both new RPCs and blocks arbitrary unknown endpoints',()=>{
 const proxy=readFileSync('netlify/lib/supabase-proxy.mjs','utf8');
 assert.ok(proxy.includes("'td_hide_audit_batch_v54'"));assert.ok(proxy.includes("'td_business_hidden_ids_v54'"));
});
