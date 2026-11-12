import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {route} from '../netlify/lib/supabase-proxy.mjs';
const html=readFileSync('index.html','utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('let db='));
function app(){const nodes={};const c=vm.createContext({document:{getElementById:id=>nodes[id]??={innerHTML:'',value:'',classList:{add(){},remove(){}},addEventListener(){},scrollIntoView(){},showModal(){this.open=true},close(){this.open=false}},addEventListener(){}},window:{},crypto:{randomUUID:()=> 'batch-request'},console,setInterval(){},setTimeout(){},clearTimeout(){}});vm.runInContext(script,c);return {run:s=>vm.runInContext(s,c),nodes};}
test('history supports deduplicated single/multiple/all selection with no 1000-row truncation',()=>{
 const f=app();f.run("role='owner';tdHistoryRows=Array.from({length:1001},(_,i)=>({table:'td_orders',id:String(i),snapshot:{},at:'2026-11-12'}));tdHistorySelectAll(true)");assert.equal(f.run('tdHistorySelected.size'),1001);
 f.run("tdHistoryToggle('td_orders:0',false)");assert.equal(f.run('tdHistorySelected.size'),1000);
 f.run('tdHistorySelectAll(false)');assert.equal(f.run('tdHistorySelected.size'),0);
});
test('one modal and one RPC share a reason across all selected history',async()=>{
 const f=app();f.run("role='owner';window.calls=[];notify=()=>{};refresh=async()=>true;tdHistoryRows=[{table:'td_orders',id:'gone',snapshot:{}},{table:'td_orders',id:'live',snapshot:{}}];tdHistorySelectAll(true);db={async rpc(name,args){window.calls.push({name,args});return {data:{business_hidden:2,history_hidden:3}}}}");
 f.run('tdHistoryDeleteSelected()');assert.equal(f.nodes.tdHistoryDeleteDialog.open,true);assert.equal(f.run('window.calls.length'),0);
 f.nodes.tdHistoryReason.value='统一删除原因';await f.run('tdHistoryConfirmDelete()');
 assert.equal(f.run('window.calls.length'),1);assert.equal(f.run('window.calls[0].name'),'td_delete_history_batch_v56');assert.equal(f.run('window.calls[0].args.p_entries.length'),2);assert.equal(f.run('window.calls[0].args.p_reason'),'统一删除原因');assert.equal(f.run('tdHistoryRows.length'),0);assert.equal(f.nodes.tdHistoryDeleteDialog.open,false);
});
test('cancel, missing reason and non-owner never submit a mutation',async()=>{
 const f=app();f.run("role='staff';notify=()=>{};db={rpc(){throw Error('unexpected RPC')}}");f.run('tdHistoryDeleteSelected()');
 f.run("role='owner';tdHistoryRows=[{table:'td_orders',id:'o',snapshot:{}}];tdHistorySelectAll(true);tdHistoryDeleteSelected()");
 f.nodes.tdHistoryReason.value='短';await f.run('tdHistoryConfirmDelete()');f.run('tdHistoryCancel()');assert.equal(f.run('tdHistoryDeleteEntries.length'),0);
});
test('date reports consistently exclude markers for today/week/month/year and history queries',()=>{
 const f=app();f.run("render=()=>{};const at=new Date().toISOString();for(const t of ['td_customers','td_orders','td_parcels','td_payments','td_pickups']){data[t]=[{id:'gone',created_at:at,arrived_at:at,picked_at:at,total_price:100,amount:100,pieces:2,remaining:1},{id:'kept',created_at:at,arrived_at:at,picked_at:at,total_price:50,amount:50,pieces:1,remaining:1}];hiddenBusinessIds.add(t+':gone')}tdApplyBusinessHidden()");
 for(const preset of ['today','week','month','year']){f.run(`tdDashSetPreset('${preset}')`);for(const kind of ['orders','parcels','payments','pickups','customers'])assert.equal(f.run(`tdReportData().${kind}.length`),1);assert.equal(f.run('tdReportData().orders[0].total_price'),50);}
 assert.equal(f.run('tdAuditRows().some(x=>x.id==="gone")'),false);
});
test('failed bulk submission preserves rows, selection, dialog and request ID for safe retry',async()=>{
 const f=app();f.run("role='owner';notify=()=>{};tdHistoryRows=[{table:'td_orders',id:'o',snapshot:{}}];tdHistorySelectAll(true);tdHistoryDeleteSelected();db={async rpc(){return {error:{message:'network failure'}}}}");f.nodes.tdHistoryReason.value='测试原因';await f.run('tdHistoryConfirmDelete()');assert.equal(f.run('tdHistoryRows.length'),1);assert.equal(f.run('tdHistorySelected.size'),1);assert.equal(f.run('tdHistoryRequestId'),'batch-request');assert.equal(f.nodes.tdHistoryDeleteDialog.open,true);
});
test('proxy admits controlled V55 endpoints and read-only marker table only',()=>{
 for(const name of ['td_preview_history_delete_v55','td_confirm_history_delete_v55','td_delete_history_batch_v56'])assert.equal(route('/api/supabase/rest/v1/rpc/'+name,'POST',new URLSearchParams()),true);
 assert.equal(route('/api/supabase/rest/v1/td_business_hidden_v54','GET',new URLSearchParams()),true);
 assert.equal(route('/api/supabase/rest/v1/td_business_hidden_v54','DELETE',new URLSearchParams()),false);
});
test('settlement and receipt markers are excluded from period freight reports without altering original receipts',async()=>{
 const f=app();f.run("const at=new Date().toISOString();tdDashSetPreset=()=>{};tdDashFrom='2000-01-01';tdDashTo='2100-01-01';hiddenBusinessIds=new Set(['td_pickup_batches:gone']);window.receipts=[{id:'r1',batch_id:'gone',amount_mmk:100,created_at:at},{id:'r2',batch_id:'kept',amount_mmk:20,created_at:at}];tdReadBalances=async()=>[{batch_id:'kept',due_mmk:30}];db={from(t){const rows=t==='td_pickup_batches'?[{id:'gone',freight_mmk:100,created_at:at},{id:'kept',freight_mmk:50,created_at:at}]:window.receipts;return {select(){return this},order(){return this},async range(){return {data:rows}}}}}");
 const r=await f.run('tdFreightPeriod()');assert.equal(r.receivable,50);assert.equal(r.received,20);assert.equal(r.currentDue,30);assert.equal(f.run('window.receipts.length'),2);
});

test('history loading suppresses missing-source and new cascade cards after full reload',async()=>{
 const f=app();f.run("role='owner';page='deletions';tdHistoryRead=async(t)=>t==='td_order_deletion_log'?[{order_id:'gone',snapshot:{}},{order_id:'keep',snapshot:{}}]:t==='td_business_hidden_v54'?[{source_table:'td_parcels',source_id:'cascade',snapshot:{}}]:[{source_table:'td_orders',source_id:'gone'},{source_table:'td_parcels',source_id:'cascade'}]");await f.run('loadDeletionLogs()');assert.equal(f.run('tdHistoryRows.length'),1);assert.equal(f.run('tdHistoryRows[0].id'),'keep');
});
test('history page has one delete action, no per-card previews or extra typed confirmation',()=>{
 const f=app();f.run("role='owner';tdHistoryRows=[{table:'td_orders',id:'o',snapshot:{}}];tdHistoryRender()");const out=f.nodes.deletionResults.innerHTML;assert.ok(out.includes('删除已选'));assert.ok(!out.includes('预览'));assert.ok(!out.includes('恢复显示'));assert.equal((out.match(/<button/g)||[]).length,1);assert.ok(!f.run('deletions()').includes('id="tdHistoryConfirm"'));
});
