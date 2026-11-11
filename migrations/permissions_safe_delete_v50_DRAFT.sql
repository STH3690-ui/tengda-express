-- Draft migration: review and test before applying to production.
alter table public.td_members add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.td_members add column if not exists deleted_at timestamptz;
alter table public.td_members add column if not exists deleted_by uuid references auth.users(id);
alter table public.td_members add column if not exists delete_reason text;
create or replace function public.td_has_permission_v50(p_permission text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
 select 1 from public.td_members m
 where m.id=(select auth.uid()) and m.active=true and m.deleted_at is null
 and (m.role='owner' or (m.role='staff' and (coalesce((m.permissions ->> p_permission)::boolean,false) or (p_permission='order_delete' and m.can_hide_orders=true))))
 );
$$;
revoke all on function public.td_has_permission_v50(text) from public,anon;
grant execute on function public.td_has_permission_v50(text) to authenticated;
create or replace function public.td_owner_set_permissions_v50(p_member uuid,p_permissions jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare allowed text[]:=array['customer_create','customer_edit','customer_delete','customer_restore','order_create','order_edit','order_delete','order_restore','parcel_create','parcel_edit','parcel_delete','pickup_create','pickup_edit','pickup_reverse','finance_view','finance_create','finance_edit','finance_export','audit_view','trash_view','record_restore'];
begin
 if not public.td_is_owner_v32() then raise exception '仅管理员可授权' using errcode='42501';end if;
 if p_permissions is null or jsonb_typeof(p_permissions)<>'object' then raise exception '权限必须为对象';end if;
 if exists(select 1 from jsonb_each(p_permissions) x where not (x.key=any(allowed)) or jsonb_typeof(x.value)<>'boolean') then raise exception '无效权限项目';end if;
 update public.td_members set permissions=p_permissions,can_hide_orders=coalesce((p_permissions->>'order_delete')::boolean,false) where id=p_member and role='staff' and deleted_at is null;
 if not found then raise exception '只能授权未删除的普通员工';end if;
 insert into public.td_staff_audit_v32(member_id,actor_id,action,details) values(p_member,auth.uid(),'set-permissions',p_permissions);
end $$;
revoke all on function public.td_owner_set_permissions_v50(uuid,jsonb) from public,anon;
grant execute on function public.td_owner_set_permissions_v50(uuid,jsonb) to authenticated;
create or replace function public.td_owner_soft_delete_staff_v50(p_member uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.td_is_owner_v32() then raise exception '仅管理员可删除员工' using errcode='42501';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception '请填写删除原因';end if;
 update public.td_members set active=false,deleted_at=now(),deleted_by=auth.uid(),delete_reason=trim(p_reason),permissions='{}'::jsonb,can_hide_orders=false
 where id=p_member and role='staff' and deleted_at is null;
 if not found then raise exception '员工不存在或已删除';end if;
 insert into public.td_staff_audit_v32(member_id,actor_id,action,details) values(p_member,auth.uid(),'soft-delete-staff',jsonb_build_object('reason',trim(p_reason)));
end $$;
revoke all on function public.td_owner_soft_delete_staff_v50(uuid,text) from public,anon;
grant execute on function public.td_owner_soft_delete_staff_v50(uuid,text) to authenticated;
create or replace function public.td_owner_restore_staff_v50(p_member uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.td_is_owner_v32() then raise exception '仅管理员可恢复员工' using errcode='42501';end if;
 update public.td_members set deleted_at=null,deleted_by=null,delete_reason=null,active=false where id=p_member and role='staff' and deleted_at is not null;
 if not found then raise exception '员工未删除';end if;
 insert into public.td_staff_audit_v32(member_id,actor_id,action,details) values(p_member,auth.uid(),'restore-staff','{}'::jsonb);
end $$;
revoke all on function public.td_owner_restore_staff_v50(uuid) from public,anon;
grant execute on function public.td_owner_restore_staff_v50(uuid) to authenticated;
-- Keep the old RPC signature for compatibility with existing clients.
create or replace function public.td_staff_hide_order(p_order_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.td_orders%rowtype; changed integer;
begin
 if not public.td_has_permission_v50('order_delete') and not exists(select 1 from public.td_members where id=auth.uid() and active=true and deleted_at is null and role='staff' and can_hide_orders=true)
 then raise exception '没有删除商品权限' using errcode='42501';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception '必须填写删除原因';end if;
 select * into r from public.td_orders where id=p_order_id for update;
 if not found then raise exception '商品订单不存在';end if;
 insert into public.td_order_hidden_v41(order_id,hidden_by,reason) values(p_order_id,auth.uid(),trim(p_reason)) on conflict(order_id) do nothing;
 get diagnostics changed=row_count;
 if changed=1 then
 insert into public.td_order_deletion_log(order_id,deleted_by,snapshot)
 values(p_order_id,auth.uid(),to_jsonb(r)||jsonb_build_object('_operation','hidden','_reason',trim(p_reason)));
 end if;
end $$;
revoke all on function public.td_staff_hide_order(uuid,text) from public,anon;
grant execute on function public.td_staff_hide_order(uuid,text) to authenticated;
-- Block the legacy one-argument RPC to enforce the deletion reason.
create or replace function public.td_staff_hide_order(p_order_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 raise exception '客户端版本过旧，请刷新页面后填写删除原因' using errcode='42501';
end $$;
revoke all on function public.td_staff_hide_order(uuid) from public,anon;
grant execute on function public.td_staff_hide_order(uuid) to authenticated;
-- All other business write policies and privileged RPCs still need review before release.

-- Existing approval RPC must also reject deleted staff, not just hide the UI button.
create or replace function public.td_owner_set_member_active_v30(p_active boolean,p_member uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.td_is_owner_v32() then raise exception '只有管理员可以审批员工' using errcode='42501';end if;
 update public.td_members set active=p_active
 where id=p_member and role='staff' and deleted_at is null;
 if not found then raise exception '员工不存在、已删除或不能修改管理员账号';end if;
end $$;
revoke all on function public.td_owner_set_member_active_v30(boolean,uuid) from public,anon;
grant execute on function public.td_owner_set_member_active_v30(boolean,uuid) to authenticated;

-- Preserve owner-only legacy removal while enforcing a documented reason.
-- The original owner RPC delegated to the old one-argument staff RPC.
create or replace function public.td_owner_hide_order_v41(p_order_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.td_is_owner_v32() then raise exception '仅管理员可移除历史订单' using errcode='42501';end if;
 perform public.td_staff_hide_order(p_order_id,'管理员从历史订单移除');
end $$;
revoke all on function public.td_owner_hide_order_v41(uuid) from public,anon;
grant execute on function public.td_owner_hide_order_v41(uuid) to authenticated;

-- The deployed staff-auth Edge Function calls this RPC, not td_owner_set_member_active_v30.
-- Guard the actual activation path against deleted employees.
create or replace function public.td_set_staff_active_v32(p_member uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.td_is_owner_v32() then raise exception 'Owner required' using errcode='42501';end if;
 if p_active is null then raise exception 'Status required';end if;
 update public.td_members set active=p_active
 where id=p_member and role='staff' and deleted_at is null;
 if not found then raise exception 'Staff account not found or deleted';end if;
end $$;
revoke all on function public.td_set_staff_active_v32(uuid,boolean) from public,anon;
grant execute on function public.td_set_staff_active_v32(uuid,boolean) to authenticated;

-- Fine-grained RLS on existing direct-write endpoints.
-- Compatibility: existing active staff retain their current create/edit capabilities
-- until an owner explicitly changes the permission switches.
update public.td_members
set permissions=coalesce(permissions,'{}'::jsonb) ||
 jsonb_build_object('customer_create',true,'customer_edit',true,'order_create',true,'parcel_create',true,'pickup_create',true,'finance_create',true)
where role='staff' and active=true and deleted_at is null
  and permissions='{}'::jsonb;

drop policy if exists td_customer_insert on public.td_customers;
create policy td_customer_insert on public.td_customers for insert to authenticated
with check (public.td_has_permission_v50('customer_create') and created_by=(select auth.uid()) and deleted_at is null and deleted_by is null);
drop policy if exists td_customer_update on public.td_customers;
create policy td_customer_update on public.td_customers for update to authenticated
using (public.td_has_permission_v50('customer_edit'))
with check (public.td_has_permission_v50('customer_edit'));

drop policy if exists td_business_insert on public.td_orders;
create policy td_business_insert on public.td_orders for insert to authenticated
with check (public.td_has_permission_v50('order_create') and created_by=(select auth.uid()));
-- Order editing remains owner-only until field-level controls and an audited
-- staff edit RPC are implemented; do not grant broad order UPDATE to staff.
drop policy if exists td_business_insert on public.td_parcels;
create policy td_business_insert on public.td_parcels for insert to authenticated
with check (public.td_has_permission_v50('parcel_create') and created_by=(select auth.uid()));
drop policy if exists td_business_insert on public.td_payments;
create policy td_business_insert on public.td_payments for insert to authenticated
with check (public.td_has_permission_v50('finance_create') and created_by=(select auth.uid()));
-- DRAFT: other RPCs, pickup/record mutations, and financial/reporting paths
-- must be audited before release; this is not a complete authorization migration.

-- Both legacy active-account helpers are used by existing RLS, triggers and pickup RPCs.
-- Make soft-deletion a hard deny for either helper, including stale JWT sessions.
create or replace function public.td_is_active_v32()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.td_members
 where id=(select auth.uid()) and active=true and deleted_at is null);
$$;
create or replace function public.td_is_active()
returns boolean language sql stable security definer set search_path='' as $$
 select public.td_is_active_v32();
$$;
revoke all on function public.td_is_active_v32() from public,anon;
revoke all on function public.td_is_active() from public,anon;
grant execute on function public.td_is_active_v32() to authenticated;
grant execute on function public.td_is_active() to authenticated;

-- Protect pickup writes even inside SECURITY DEFINER RPCs (RLS is bypassed there).
-- Existing v27/v32 batch and single pickup RPCs all write to these tables.
create or replace function public.td_guard_pickup_permission_v50()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.td_has_permission_v50('pickup_create') then
  raise exception '没有办理取件权限' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists td_pickup_permission_v50 on public.td_pickup_batches;
create trigger td_pickup_permission_v50 before insert on public.td_pickup_batches
for each row execute function public.td_guard_pickup_permission_v50();
drop trigger if exists td_pickup_permission_v50 on public.td_pickups;
create trigger td_pickup_permission_v50 before insert on public.td_pickups
for each row execute function public.td_guard_pickup_permission_v50();

-- Repay RPC writes receipt rows. Require financial create permission at the ledger edge.
create or replace function public.td_guard_pickup_receipt_permission_v50()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.td_has_permission_v50('finance_create') then
  raise exception '没有登记取件收款权限' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists td_pickup_receipt_permission_v50 on public.td_pickup_receipts_v32;
create trigger td_pickup_receipt_permission_v50 before insert on public.td_pickup_receipts_v32
for each row execute function public.td_guard_pickup_receipt_permission_v50();

-- SECURITY DEFINER pickup functions may write payments bypassing table RLS;
-- finance_create permission still requires explicit checks at their entry points.

-- SECURITY DEFINER pickup and legacy payment RPCs can bypass INSERT RLS.
-- Enforce finance permission on the actual ledger table, not only the client.
create or replace function public.td_guard_payment_permission_v50()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.td_has_permission_v50('finance_create') then
  raise exception '没有登记收付款权限' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists td_payment_permission_v50 on public.td_payments;
create trigger td_payment_permission_v50 before insert on public.td_payments
for each row execute function public.td_guard_payment_permission_v50();
-- Do not modify historical payment rows: the trigger only protects new inserts.

-- Guard legacy permissive payment UPDATE policy: all matching RLS policies
-- must also satisfy this restrictive permission gate.
drop policy if exists td_payment_update_permission_v50 on public.td_payments;
create policy td_payment_update_permission_v50 on public.td_payments
as restrictive for update to authenticated
using (public.td_has_permission_v50('finance_edit'))
with check (public.td_has_permission_v50('finance_edit'));

-- Prevent non-owners from editing the amount/status of settled pickup batches.
drop policy if exists td_pickup_batch_update_permission_v50 on public.td_pickup_batches;
create policy td_pickup_batch_update_permission_v50 on public.td_pickup_batches
as restrictive for update to authenticated
using (public.td_has_permission_v50('pickup_edit'))
with check (public.td_has_permission_v50('pickup_edit'));


-- Restrict direct payment ledger reads; existing active-staff SELECT policy
-- remains but cannot override this restrictive authorization check.
drop policy if exists td_payment_select_permission_v50 on public.td_payments;
create policy td_payment_select_permission_v50 on public.td_payments
as restrictive for select to authenticated
using (public.td_has_permission_v50('finance_view'));


-- Pickup staff require receipt totals for outstanding-balance calculations.
-- Deny receipt reads to staff who have neither pickup access nor finance access.
-- TODO before release: replace raw receipt access with a scoped balance RPC,
-- so pickup-only employees cannot enumerate unrelated receipt details.
drop policy if exists td_pickup_receipt_select_permission_v50 on public.td_pickup_receipts_v32;
create policy td_pickup_receipt_select_permission_v50 on public.td_pickup_receipts_v32
as restrictive for select to authenticated
using (
 public.td_has_permission_v50('finance_view')
 or public.td_has_permission_v50('pickup_create')
 or public.td_has_permission_v50('pickup_edit')
);


-- Trigger functions run through their triggers, not via client RPC.
-- Remove default PUBLIC EXECUTE to reduce exposed privileged surface.
revoke all on function public.td_guard_payment_permission_v50() from public, anon, authenticated;
revoke all on function public.td_guard_pickup_permission_v50() from public, anon, authenticated;
revoke all on function public.td_guard_pickup_receipt_permission_v50() from public, anon, authenticated;


-- The security-invoker balance view derives receivable and due from pickup batches.
-- Without this gate, users denied receipt SELECT could still read all balances.
drop policy if exists td_pickup_batch_select_permission_v50 on public.td_pickup_batches;
create policy td_pickup_batch_select_permission_v50 on public.td_pickup_batches
as restrictive for select to authenticated
using (
 public.td_has_permission_v50('pickup_create')
 or public.td_has_permission_v50('pickup_edit')
 or public.td_has_permission_v50('finance_view')
);


-- Return only operational balance aggregates to pickup-authorized staff.
-- Raw receipt records are reserved for finance_view users.
create or replace function public.td_pickup_balances_authorized_v50()
returns table(batch_id uuid,customer_id uuid,receivable_mmk numeric,paid_mmk numeric,due_mmk numeric,created_at timestamptz,is_v32 boolean)
language sql stable security definer set search_path='' as $$
select b.id,b.customer_id,b.freight_mmk,
coalesce(r.paid_mmk,0::numeric),
greatest(b.freight_mmk-coalesce(r.paid_mmk,0::numeric),0::numeric),
b.created_at,(v.batch_id is not null)
from public.td_pickup_batches b
left join public.td_pickup_v32_batches v on v.batch_id=b.id
left join (select batch_id,sum(amount_mmk) paid_mmk from public.td_pickup_receipts_v32 group by batch_id) r on r.batch_id=b.id
where public.td_has_permission_v50('pickup_create')
or public.td_has_permission_v50('pickup_edit')
or public.td_has_permission_v50('finance_view')
$$;
revoke all on function public.td_pickup_balances_authorized_v50() from public,anon;
grant execute on function public.td_pickup_balances_authorized_v50() to authenticated;
drop policy if exists td_pickup_receipt_select_permission_v50 on public.td_pickup_receipts_v32;
create policy td_pickup_receipt_select_permission_v50 on public.td_pickup_receipts_v32
as restrictive for select to authenticated using (public.td_has_permission_v50('finance_view'));
revoke select on public.td_pickup_balances_v32 from authenticated,anon;

-- Harden legacy direct pickup RPC while preserving its existing body.
do $guard$ declare src text;begin
src:=pg_get_functiondef('public.td_record_pickup(uuid,integer,text,text,text,text)'::regprocedure);
if position('td_has_permission_v50(' in src)>0 then return;end if;
if position('if not public.td_is_active_v32() then raise exception' in src)=0 then raise exception 'unexpected function body';end if;
src:=replace(src,'if not public.td_is_active_v32() then raise exception ''账号未批准或已停用'' using errcode=''42501'';end if;','if not public.td_has_permission_v50(''pickup_create'') then raise exception ''没有办理取件权限'' using errcode=''42501'';end if;');
execute src;
end $guard$;

-- Enforce granular permissions before privileged pickup/repayment operations.
do $guard$ declare src text;begin
src:=pg_get_functiondef('public.td_batch_pickup_v32(uuid,jsonb,numeric,numeric,numeric,text,text,text,text)'::regprocedure);
if position('td_has_permission_v50(''pickup_create'')' in src)=0 then
src:=replace(src,'IF auth.uid() IS NULL','IF NOT public.td_has_permission_v50(''pickup_create'') THEN RAISE EXCEPTION ''没有办理取件权限'' USING errcode=''42501''; END IF;'||chr(10)||'  IF auth.uid() IS NULL');
execute src;
end if;
src:=pg_get_functiondef('public.td_pickup_repay_v32(uuid,numeric,text,text)'::regprocedure);
if position('td_has_permission_v50(''finance_create'')' in src)=0 then
src:=replace(src,'IF NOT public.td_is_active() THEN','IF NOT public.td_has_permission_v50(''finance_create'') THEN RAISE EXCEPTION ''没有登记收款权限'' USING errcode=''42501''; END IF;'||chr(10)||'  IF NOT public.td_is_active() THEN');
execute src;
end if;
end $guard$;
