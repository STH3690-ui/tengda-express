import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {route} from '../netlify/lib/supabase-proxy.mjs';
const html=readFileSync('index.html','utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('let db='));
function app(){const nodes={};const c=vm.createContext({document:{getElementById:id=>nodes[id]??={innerHTML:'',value:'',classList:{add(){},remove(){}},addEventListener(){},scrollIntoView(){}},addEventListener(){}},window:{},console,setInterval(){},setTimeout(){},clearTimeout(){}});vm.runInContext(script,c);return {run:s=>vm.runInContext(s,c),nodes};}
test('history supports deduplicated single/multiple/all selection with no 1000-row truncation',()=>{
 const f=app();f.run("role='owner';tdHistoryRows=Array.from({length:1001},(_,i)=>({table:'td_orders',id:String(i),snapshot:{},at:'2026-11-12'}));tdHistorySelectAll(true)");assert.equal(f.run('tdHistorySelected.size'),1001);
 f.run("tdHistoryToggle('td_orders:0',false)");assert.equal(f.run('tdHistorySelected.size'),1000);
 f.run('tdHistorySelectAll(false)');assert.equal(f.run('tdHistorySelected.size'),0);
});
test('preview displays all protected and affected rows; confirmation carries server token',async()=>{
 const f=app();f.run("role='owner';window.calls=[];notify=()=>{};refresh=async()=>true;db={async rpc(name,args){window.calls.push({name,args});return name==='td_preview_history_delete_v55'?{data:{token:'bound-token',records:[{table:'td_customers',id:'c',remove:false,why:'共享客户',snapshot:{name:'<script>x</script>'}},{table:'td_orders',id:'o',remove:true,why:'所选订单'}]}}:{data:{deleted:1}}}}");
 await f.run("tdHistoryStart([{table:'td_orders',id:'o'}])");assert.ok(f.nodes.tdHistoryPreview.innerHTML.includes('共享客户'));assert.ok(!f.nodes.tdHistoryPreview.innerHTML.includes('<script>'));
 f.nodes.tdHistoryReason={value:'测试清理原因'};f.nodes.tdHistoryConfirm={value:'确认关联删除'};await f.run('tdHistoryConfirmDelete()');
 assert.equal(f.run('window.calls.length'),2);assert.equal(f.run('window.calls[1].args.p_token'),'bound-token');assert.equal(f.run('window.calls[1].args.p_confirmation'),'确认关联删除');
});
test('cancel, missing confirmation and non-owner never submit destructive RPC',async()=>{
 const f=app();f.run("role='staff';notify=()=>{};db={rpc(){throw Error('RPC must not execute')}}");await f.run("tdHistoryStart([{table:'td_orders',id:'o'}])");
 f.run("role='owner';tdHistoryPreview={token:'t'}");f.nodes.tdHistoryReason={value:'测试原因'};f.nodes.tdHistoryConfirm={value:'wrong'};await f.run('tdHistoryConfirmDelete()');f.run('tdHistoryCancel()');assert.equal(f.run('tdHistoryPreview'),null);
});
test('date reports consistently exclude markers for today/week/month/year and history queries',()=>{
 const f=app();f.run("render=()=>{};const at=new Date().toISOString();for(const t of ['td_customers','td_orders','td_parcels','td_payments','td_pickups']){data[t]=[{id:'gone',created_at:at,arrived_at:at,picked_at:at,total_price:100,amount:100,pieces:2,remaining:1},{id:'kept',created_at:at,arrived_at:at,picked_at:at,total_price:50,amount:50,pieces:1,remaining:1}];hiddenBusinessIds.add(t+':gone')}tdApplyBusinessHidden()");
 for(const preset of ['today','week','month','year']){f.run(`tdDashSetPreset('${preset}')`);for(const kind of ['orders','parcels','payments','pickups','customers'])assert.equal(f.run(`tdReportData().${kind}.length`),1);assert.equal(f.run('tdReportData().orders[0].total_price'),50);}
 assert.equal(f.run('tdAuditRows().some(x=>x.id==="gone")'),false);
});
test('failed confirmation leaves business rows untouched and invalidates local preview',async()=>{
 const f=app();f.run("role='owner';notify=()=>{};data.td_orders=[{id:'o'}];tdHistoryPreview={token:'t'};db={async rpc(){return {error:{message:'stale preview'}}}}");f.nodes.tdHistoryReason={value:'测试原因'};f.nodes.tdHistoryConfirm={value:'确认关联删除'};await f.run('tdHistoryConfirmDelete()');assert.equal(f.run('data.td_orders.length'),1);assert.equal(f.run('tdHistoryPreview'),null);
});
test('proxy admits controlled V55 endpoints and read-only marker table only',()=>{
 for(const name of ['td_preview_history_delete_v55','td_confirm_history_delete_v55'])assert.equal(route('/api/supabase/rest/v1/rpc/'+name,'POST',new URLSearchParams()),true);
 assert.equal(route('/api/supabase/rest/v1/td_business_hidden_v54','GET',new URLSearchParams()),true);
 assert.equal(route('/api/supabase/rest/v1/td_business_hidden_v54','DELETE',new URLSearchParams()),false);
});
test('settlement and receipt markers are excluded from period freight reports without altering original receipts',async()=>{
 const f=app();f.run("const at=new Date().toISOString();tdDashSetPreset=()=>{};tdDashFrom='2000-01-01';tdDashTo='2100-01-01';hiddenBusinessIds=new Set(['td_pickup_batches:gone']);window.receipts=[{id:'r1',batch_id:'gone',amount_mmk:100,created_at:at},{id:'r2',batch_id:'kept',amount_mmk:20,created_at:at}];tdReadBalances=async()=>[{batch_id:'kept',due_mmk:30}];db={from(t){const rows=t==='td_pickup_batches'?[{id:'gone',freight_mmk:100,created_at:at},{id:'kept',freight_mmk:50,created_at:at}]:window.receipts;return {select(){return this},order(){return this},async range(){return {data:rows}}}}}");
 const r=await f.run('tdFreightPeriod()');assert.equal(r.receivable,50);assert.equal(r.received,20);assert.equal(r.currentDue,30);assert.equal(f.run('window.receipts.length'),2);
});
