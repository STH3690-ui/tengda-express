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
