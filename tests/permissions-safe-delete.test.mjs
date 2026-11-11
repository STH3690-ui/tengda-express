import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8');
const mirror=readFileSync('index 9.html','utf8');
const sql=readFileSync('migrations/permissions_safe_delete_v50_DRAFT.sql','utf8');
test('both web entry points are identical',()=>assert.equal(html,mirror));
test('deletion asks for reason and uses reasoned RPC',()=>{
 assert.match(html,/reason=prompt\('请填写删除商品原因/);
 assert.match(html,/p_order_id:id,p_reason:reason\.trim\(\)/);
 assert.match(sql,/create or replace function public\.td_staff_hide_order\(p_order_id uuid,p_reason text\)/);
 assert.match(sql,/create or replace function public\.td_staff_hide_order\(p_order_id uuid\)/);
 assert.match(sql,/客户端版本过旧/);
});
test('permissions are server-managed and staff deletion is soft',()=>{
 assert.match(html,/td_owner_set_permissions_v50/);
 assert.match(html,/td_owner_soft_delete_staff_v50/);
 assert.match(html,/td_owner_restore_staff_v50/);
 assert.match(sql,/role='staff' and deleted_at is null/);
 assert.match(sql,/update public\.td_members set active=false,deleted_at=now\(\)/);
 assert.match(sql,/p_permissions jsonb/);
});
test('hidden orders excluded from standard order reporting',()=>{
 assert.match(html,/const orders=data\.td_orders\.filter\(x=>!hiddenOrderIds\.has\(x\.id\)/);
 assert.match(html,/allOs=data\.td_orders\.filter\(x=>!hiddenOrderIds\.has\(x\.id\)/);
});

test('deleted staff cannot be approved by old server RPC or UI',()=>{
 assert.match(sql,/create or replace function public\.td_owner_set_member_active_v30\(p_active boolean,p_member uuid\)/);
 assert.match(sql,/where id=p_member and role='staff' and deleted_at is null/);
 assert.match(html,/x\.deleted_at\?'已删除'/);
 assert.match(html,/x\.deleted_at\?'':`<button class="secondary" onclick="tdSetStaffActive/);
});
test('new RPC endpoints are explicitly allowed by network proxy',()=>{
 const proxy=readFileSync('netlify/lib/supabase-proxy.mjs','utf8');
 for(const rpc of ['td_owner_set_permissions_v50','td_owner_soft_delete_staff_v50','td_owner_restore_staff_v50'])assert.ok(proxy.includes("'"+rpc+"'"),rpc);
});

test('legacy owner hide RPC delegates to reasoned RPC, not blocked legacy RPC',()=>{
 assert.match(sql,/create or replace function public\.td_owner_hide_order_v41\(p_order_id uuid\)/);
 assert.match(sql,/perform public\.td_staff_hide_order\(p_order_id,'管理员从历史订单移除'\)/);
});

test('staff-auth blocks deleted employees before unbanning credentials',()=>{
 const edge=readFileSync('supabase/functions/staff-auth/handler.mjs','utf8');
 const check=edge.indexOf("!target.deleted_at");
 const unban=edge.indexOf("ban_duration: 'none'");
 assert.ok(check>=0 && unban>check,'deleted staff must be rejected before Auth unban');
});

test('actual staff-auth approval RPC denies deleted staff',()=>{
 assert.match(sql,/create or replace function public\.td_set_staff_active_v32\(p_member uuid,p_active boolean\)/);
 assert.match(sql,/where id=p_member and role='staff' and deleted_at is null/);
});

test('both legacy membership guards deny soft-deleted accounts',()=>{
 assert.match(sql,/create or replace function public\.td_is_active_v32\(\)/);
 assert.match(sql,/where id=\(select auth\.uid\(\)\) and active=true and deleted_at is null/);
 assert.match(sql,/create or replace function public\.td_is_active\(\)/);
 assert.match(sql,/select public\.td_is_active_v32\(\)/);
});

test('deleted employees cannot open permissions editor',()=>{
 assert.match(html,/m\.role==='owner'\|\|m\.deleted_at/);
});
test('direct-write RLS draft checks granular permissions for all core insert paths',()=>{
 for(const permission of ['customer_create','customer_edit','order_create','parcel_create','finance_create'])
  assert.ok(sql.includes("public.td_has_permission_v50('"+permission+"')"),permission);
});

test('pickup RPC writes are protected by database trigger guards',()=>{
 for(const table of ['td_pickup_batches','td_pickups','td_pickup_receipts_v32'])
  assert.ok(sql.includes('before insert on public.'+table),table);
 assert.ok(sql.includes("td_has_permission_v50('pickup_create')"));
 assert.ok(sql.includes("td_has_permission_v50('finance_create')"));
});

test('privileged RPC cannot bypass finance permission on payment ledger inserts',()=>{
 assert.match(sql,/create or replace function public\.td_guard_payment_permission_v50\(\)/);
 assert.match(sql,/create trigger td_payment_permission_v50 before insert on public\.td_payments/);
 assert.match(sql,/if not public\.td_has_permission_v50\('finance_create'\)/);
});

test('report rows and CSV use filtered live orders while preserving payment ledger',()=>{
 const report=html.match(/function tdReportData\(\)\{[\s\S]*?\}\}\nasync function tdFreightPeriod/);
 assert.ok(report,'report function must be present');
 assert.match(report[0],/orders=data\.td_orders\.filter\(x=>!hiddenOrderIds\.has\(x\.id\)/);
 assert.match(report[0],/payments=data\.td_payments\.filter\(x=>tdDashWithin\(x,'created_at'\)\)/);
 assert.match(html,/async function tdReportRows\(\)\{const r=tdReportData\(\)/);
 assert.match(html,/const csv='\\uFEFF'/);
 assert.match(html,/r\.rows/);
});
test('staff permission editor does not equate front-end switches with server-side RLS',()=>{
 assert.match(sql,/create or replace function public\.td_has_permission_v50/);
 assert.match(html,/td_owner_set_permissions_v50/);
});

test('legacy broad UPDATE policies are constrained by restrictive granular guards',()=>{
 for(const [table,permission] of [['td_payments','finance_edit'],['td_pickup_batches','pickup_edit']]){
  const name=table==='td_payments'?'td_payment_update_permission_v50':'td_pickup_batch_update_permission_v50';
  assert.ok(sql.includes('create policy '+name+' on public.'+table),name);
  assert.match(sql.slice(sql.indexOf('create policy '+name)),new RegExp("as restrictive for update to authenticated[\\s\\S]*?td_has_permission_v50\\('"+permission+"'\\)"));
 }
});

test('pickup receipt reads require pickup or finance authorization',()=>{
 assert.match(sql,/create policy td_pickup_receipt_select_permission_v50 on public\.td_pickup_receipts_v32/);
 assert.match(sql,/as restrictive for select to authenticated/);
 for(const permission of ['finance_view','pickup_create','pickup_edit']){
  assert.ok(sql.includes("public.td_has_permission_v50('"+permission+"')"),permission);
 }
});

test('privileged trigger guards cannot be invoked as public RPCs',()=>{
 for(const fn of ['td_guard_payment_permission_v50','td_guard_pickup_permission_v50','td_guard_pickup_receipt_permission_v50']){
  assert.ok(sql.includes('revoke all on function public.'+fn+'() from public, anon, authenticated;'),fn);
 }
});

test('report preview and CSV both require finance_export in the UI',()=>{
 assert.match(html,/function tdCanExportFinance\(\)/);
 assert.match(html,/m\.permissions\?\.finance_export===true/);
 assert.match(html,/async function tdReportOpen\(\)\{if\(!tdCanExportFinance\(\)\)/);
 assert.match(html,/async function tdReportCSV\(\)\{if\(!tdCanExportFinance\(\)\)/);
});

test('pickup operational balance uses restricted RPC without raw receipt access',()=>{
 assert.match(sql,/create or replace function public\.td_pickup_balances_authorized_v50\(\)/);
 assert.match(sql,/revoke select on public\.td_pickup_balances_v32 from authenticated,anon/);
 assert.match(html,/db\.rpc\('td_pickup_balances_authorized_v50'\)/);
 assert.match(sql,/as restrictive for select to authenticated using \(public\.td_has_permission_v50\('finance_view'\)\)/);
 assert.doesNotMatch(html,/db\.from\('td_pickup_balances_v32'\)/);
});

test('privileged pickup and repayment RPCs require granular permissions at entry',()=>{
 assert.match(sql,/td_batch_pickup_v32\(uuid,jsonb,numeric,numeric,numeric,text,text,text,text\)/);
 assert.match(sql,/td_pickup_repay_v32\(uuid,numeric,text,text\)/);
 assert.match(sql,/td_has_permission_v50\(''pickup_create''\)/);
 assert.match(sql,/td_has_permission_v50\(''finance_create''\)/);
});
