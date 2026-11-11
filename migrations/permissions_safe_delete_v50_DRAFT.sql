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
