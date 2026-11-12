-- V3.2 employee-entry deletion. Run this entire file before deploying the UI.
-- No historical rows are removed or backfilled. All original business/ledger rows stay intact.
begin;

create table if not exists public.td_audit_hidden_v52 (
 source_table text not null, source_id uuid not null, reason text not null,
 hidden_by uuid not null, hidden_at timestamptz not null default now(),
 primary key(source_table,source_id)
);
alter table public.td_audit_hidden_v52 enable row level security;

create table if not exists public.td_business_hidden_v54 (
 source_table text not null check(source_table in ('td_orders','td_customers','td_parcels','td_pickups','td_payments')),
 source_id uuid not null, reason text not null check(length(trim(reason))>=3),
 hidden_by uuid not null, hidden_at timestamptz not null default now(),
 batch_id uuid not null, snapshot jsonb not null,
 primary key(source_table,source_id)
);
alter table public.td_business_hidden_v54 enable row level security;
revoke all on public.td_business_hidden_v54 from public,anon,authenticated;
grant select on public.td_business_hidden_v54 to authenticated;
drop policy if exists owner_read_v54 on public.td_business_hidden_v54;
create policy owner_read_v54 on public.td_business_hidden_v54 for select to authenticated
 using(exists(select 1 from public.td_members m where m.id=(select auth.uid()) and m.active and m.deleted_at is null and m.role='owner'));
-- Clients cannot insert, overwrite or erase deletion history directly.
revoke insert,update,delete,truncate on public.td_audit_hidden_v52 from public,anon,authenticated;
grant select on public.td_audit_hidden_v52 to authenticated;
drop policy if exists owner_read_v54 on public.td_audit_hidden_v52;
create policy owner_read_v54 on public.td_audit_hidden_v52 for select to authenticated
 using(exists(select 1 from public.td_members m where m.id=(select auth.uid()) and m.active and m.deleted_at is null and m.role='owner'));

create or replace function public.td_hide_audit_batch_v54(p_entries jsonb,p_reason text)
returns integer language plpgsql security definer set search_path='' as $$
declare e record; v_snapshot jsonb; v_batch uuid:=gen_random_uuid(); v_count integer:=0; v_rows integer;
begin
 -- Lock membership until commit so concurrent deactivation cannot race authorization.
 perform 1 from public.td_members where id=auth.uid() and active and deleted_at is null and role='owner' for share;
 if not found then raise exception '仅管理员可删除录入明细' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception '删除原因至少3字'; end if;
 if jsonb_typeof(p_entries) is distinct from 'array' then raise exception '无效删除列表'; end if;
 if jsonb_array_length(p_entries)<1 or jsonb_array_length(p_entries)>50000 then raise exception '请选择1至50000条记录'; end if;
 if exists(select 1 from jsonb_array_elements(p_entries) x where
   jsonb_typeof(x) is distinct from 'object' or coalesce(x->>'table','') not in ('td_orders','td_customers','td_parcels','td_pickups','td_payments')
   or coalesce(x->>'id','')='') then raise exception '无效记录类型或编号'; end if;
 -- One RPC = one transaction. No per-record exception swallowing. Stable lock order.
 for e in select distinct x->>'table' as tbl,(x->>'id')::uuid as id
          from jsonb_array_elements(p_entries) x order by 1,2 loop
   v_snapshot:=null;
   execute format('select to_jsonb(s) from public.%I s where id=$1 for update',e.tbl)
     into v_snapshot using e.id;
   if v_snapshot is null then raise exception '记录不存在：%/%，整批未删除',e.tbl,e.id; end if;
   insert into public.td_business_hidden_v54(source_table,source_id,reason,hidden_by,batch_id,snapshot)
     values(e.tbl,e.id,trim(p_reason),auth.uid(),v_batch,v_snapshot) on conflict(source_table,source_id) do nothing;
   get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
   -- Fix: FOUR explicit columns require FOUR expressions, including auth.uid().
   insert into public.td_audit_hidden_v52(source_table,source_id,reason,hidden_by)
     values(e.tbl,e.id,trim(p_reason),auth.uid()) on conflict(source_table,source_id) do nothing;
 end loop;
 return v_count;
end $$;
revoke all on function public.td_hide_audit_batch_v54(jsonb,text) from public,anon;
grant execute on function public.td_hide_audit_batch_v54(jsonb,text) to authenticated;

-- Old single-delete callers use the same atomic, authorized implementation.
create or replace function public.td_hide_audit_v52(p_source_table text,p_source_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform public.td_hide_audit_batch_v54(jsonb_build_array(jsonb_build_object('table',p_source_table,'id',p_source_id)),p_reason);
end $$;
revoke all on function public.td_hide_audit_v52(text,uuid,text) from public,anon;
grant execute on function public.td_hide_audit_v52(text,uuid,text) to authenticated;

-- Active staff need only IDs for normal business filtering, never snapshots or reasons.
-- Fully removed parcel settlements leave operational totals; receipts remain untouched.
create or replace function public.td_business_hidden_ids_v54()
returns table(source_table text,source_id uuid) language sql stable security definer set search_path='' as $$
 select h.source_table,h.source_id from public.td_business_hidden_v54 h
 where exists(select 1 from public.td_members m where m.id=auth.uid() and m.active and m.deleted_at is null)
 union
 select 'td_pickup_batches'::text,b.id from public.td_pickup_batches b
 where exists(select 1 from public.td_members m where m.id=auth.uid() and m.active and m.deleted_at is null)
 and exists(select 1 from public.td_pickup_batch_items i where i.batch_id=b.id)
 and not exists(select 1 from public.td_pickup_batch_items i where i.batch_id=b.id
   and not exists(select 1 from public.td_business_hidden_v54 h where h.source_table='td_parcels' and h.source_id=i.parcel_id))
$$;
revoke all on function public.td_business_hidden_ids_v54() from public,anon;
grant execute on function public.td_business_hidden_ids_v54() to authenticated;
notify pgrst,'reload schema';
commit;
