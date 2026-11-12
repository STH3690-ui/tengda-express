-- V56 incremental fix. Requires V54 + V55. No original business/financial rows deleted.
begin;
create table if not exists public.td_history_hidden_v56(
 source_table text not null check(source_table in ('td_orders','td_customers','td_parcels','td_pickups','td_payments','td_pickup_batches','td_pickup_receipts_v32')),
 source_id uuid not null,hidden_by uuid not null,hidden_at timestamptz not null default now(),
 reason text not null check(length(trim(reason))>=3),request_id uuid not null,
 primary key(source_table,source_id)
);
alter table public.td_history_hidden_v56 enable row level security;
revoke all on public.td_history_hidden_v56 from public,anon,authenticated;
grant select on public.td_history_hidden_v56 to authenticated;
drop policy if exists owner_read_v56 on public.td_history_hidden_v56;
create policy owner_read_v56 on public.td_history_hidden_v56 for select to authenticated using(
 exists(select 1 from public.td_members m where m.id=(select auth.uid()) and m.active and m.deleted_at is null and m.role='owner'));
create table if not exists td_private.history_requests_v56(
 request_id uuid primary key,actor uuid not null,entries jsonb not null,reason text not null,
 result jsonb not null,completed_at timestamptz not null default now()
);
alter table td_private.history_requests_v56 enable row level security;
revoke all on td_private.history_requests_v56 from public,anon,authenticated;
-- Existing V55 plan, extended only to start from exact selected UUIDs when parents are missing.
-- Never reads old log snapshots to infer a customer, parcel, payment or settlement.
create or replace function td_private.deletion_plan_v55(p_entries jsonb)
returns jsonb language sql stable set search_path='' as $$
with roots as materialized(select distinct x->>'table' tbl,(x->>'id')::uuid id from jsonb_array_elements(p_entries) x),
oi as materialized(select id from roots where tbl='td_orders'),
h as materialized(select source_table tbl,source_id id from public.td_business_hidden_v54),
o as materialized(select t.* from public.td_orders t join roots r on r.tbl='td_orders' and r.id=t.id),
pc as materialized(select p.*,td_private.parcel_order_ids_v55(p.order_id,p.notes) links from public.td_parcels p
 where exists(select 1 from roots r where r.tbl='td_parcels' and r.id=p.id)
 or td_private.parcel_order_ids_v55(p.order_id,p.notes) && array(select id from oi)),
pd as materialized(select p.id from pc p where exists(select 1 from roots r where r.tbl='td_parcels' and r.id=p.id)
 or (not exists(select 1 from unnest(p.links) l where not exists(select 1 from oi where id=l) and not exists(select 1 from h where tbl='td_orders' and id=l))
 and not exists(select 1 from public.td_orders z where z.id=any(p.links) and z.customer_id<>p.customer_id)
 and (position('[TD_ORDER_IDS:' in coalesce(p.notes,''))=0 or coalesce(p.notes,'') ~ '\[TD_ORDER_IDS:[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}(,[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})*\]'))
 union select id from roots where tbl='td_parcels'),
u as materialized(select t.* from public.td_pickups t where t.parcel_id in(select id from pd)
 or exists(select 1 from roots r where r.tbl='td_pickups' and r.id=t.id)),
bc as materialized(select b.* from public.td_pickup_batches b where exists(select 1 from roots r where r.tbl='td_pickup_batches' and r.id=b.id)
 or exists(select 1 from public.td_pickup_batch_items i where i.batch_id=b.id and i.parcel_id in(select id from pd))),
bd as materialized(select b.id from bc b where not exists(select 1 from public.td_pickup_batch_items i where i.batch_id=b.id
 and i.parcel_id not in(select id from pd) and not exists(select 1 from h where tbl='td_parcels' and id=i.parcel_id))),
rc as materialized(select t.* from public.td_pickup_receipts_v32 t where t.batch_id in(select id from bd)),
mc as materialized(select t.* from public.td_payments t where exists(select 1 from roots r where r.tbl='td_payments' and r.id=t.id)
 or t.order_id in(select id from oi) or t.id in(select payment_id from rc)),
md as materialized(select m.id from mc m where not exists(select 1 from public.td_pickup_receipts_v32 r where r.payment_id=m.id and r.customer_id<>m.customer_id)
 and not exists(select 1 from public.td_pickup_receipts_v32 r where r.payment_id=m.id
 and r.batch_id not in(select id from bd) and not exists(select 1 from h where tbl='td_pickup_batches' and id=r.batch_id))
 and (m.order_id is null or m.order_id in(select id from oi) or exists(select 1 from roots r where r.tbl='td_payments' and r.id=m.id)
 or exists(select 1 from h where tbl='td_orders' and id=m.order_id))),
cc as materialized(select c.* from public.td_customers c where exists(select 1 from roots r where r.tbl='td_customers' and r.id=c.id)
 or c.id in(select customer_id from o union select customer_id from pc union select customer_id from mc union select customer_id from bc)),
cd as materialized(select c.id from cc c where
 not exists(select 1 from public.td_orders t where t.customer_id=c.id and t.id not in(select id from oi) and not exists(select 1 from h where tbl='td_orders' and id=t.id))
 and not exists(select 1 from public.td_parcels t where t.customer_id=c.id and t.id not in(select id from pd) and not exists(select 1 from h where tbl='td_parcels' and id=t.id))
 and not exists(select 1 from public.td_payments t where t.customer_id=c.id and t.id not in(select id from md) and not exists(select 1 from h where tbl='td_payments' and id=t.id))
 and not exists(select 1 from public.td_pickups t join public.td_parcels p on p.id=t.parcel_id where p.customer_id=c.id and t.id not in(select id from u) and not exists(select 1 from h where tbl='td_pickups' and id=t.id))
 and not exists(select 1 from public.td_pickup_batches t where t.customer_id=c.id and t.id not in(select id from bd) and not exists(select 1 from h where tbl='td_pickup_batches' and id=t.id))),
rows as (
 select 'td_orders' tbl,id::text id,true remove,'所选订单' why,to_jsonb(o) snapshot from o
 union all select 'td_parcels',id::text,id in(select id from pd),case when id in(select id from pd) then '专属包裹或明确选择' else '共享包裹：仍关联其他订单或关联标记不完整' end,to_jsonb(pc)-'links' from pc
 union all select 'td_pickups',id::text,true,'包裹外键或明确选择',to_jsonb(u) from u
 union all select 'td_pickup_batches',id::text,id in(select id from bd),case when id in(select id from bd) then '整批专属结算' else '共享结算：仍有正常包裹' end,to_jsonb(bc) from bc
 union all select 'td_pickup_receipts_v32',id::text,true,'随专属结算退出业务统计；原凭证永久保留',to_jsonb(rc) from rc
 union all select 'td_payments',id::text,id in(select id from md),case when id in(select id from md) then '订单外键、凭证payment_id或明确选择' else '收款仍关联其他正常结算或订单' end,to_jsonb(mc) from mc
 union all select 'td_customers',id::text,id in(select id from cd),case when id in(select id from cd) then '已无其他正常业务的专属客户' else '共享客户：仍有其他订单、包裹、独立收付款或结算' end,to_jsonb(cc) from cc
 union all select 'td_pickup_batch_items',i.batch_id::text||':'||i.parcel_id::text,i.batch_id in(select id from bd),'保留原批次-包裹关系；随整批退出业务查询',to_jsonb(i) from public.td_pickup_batch_items i where i.batch_id in(select id from bc)
)
select coalesce(jsonb_agg(jsonb_build_object('table',tbl,'id',id,'remove',remove,'why',why,'snapshot',snapshot,
 'already_deleted',exists(select 1 from h where h.tbl=rows.tbl and h.id::text=rows.id)) order by tbl,id),'[]'::jsonb) from rows
$$;
revoke all on function td_private.deletion_plan_v55(jsonb) from public,anon,authenticated;


create or replace function td_private.delete_history_batch_v56(p_entries jsonb,p_reason text,p_confirmed boolean,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e record; x jsonb; plan jsonb; core jsonb; normalized jsonb; prior td_private.history_requests_v56%rowtype;
 n integer:=0; extras integer:=0; history_count integer:=0; result jsonb;
begin
 perform 1 from public.td_members where id=auth.uid() and active and deleted_at is null and role='owner' for share;
 if not found then raise exception '仅管理员可删除历史' using errcode='42501';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception '删除原因至少3字';end if;
 if p_confirmed is distinct from true then raise exception '请确认删除所选历史';end if;
 if p_request_id is null then raise exception '缺少批量请求编号';end if;
 if jsonb_typeof(p_entries) is distinct from 'array' then raise exception '无效选择列表';end if;
 if jsonb_array_length(p_entries)<1 or jsonb_array_length(p_entries)>50000 then raise exception '请选择1至50000条历史';end if;
 if exists(select 1 from jsonb_array_elements(p_entries) z where jsonb_typeof(z) is distinct from 'object'
 or coalesce(z->>'table','') not in ('td_orders','td_customers','td_parcels','td_pickups','td_payments','td_pickup_batches')
 or coalesce(z->>'id','')='') then raise exception '无效历史类型或编号';end if;
 select jsonb_agg(jsonb_build_object('table',tbl,'id',id) order by tbl,id) into normalized
 from(select distinct z->>'table' tbl,(z->>'id')::uuid id from jsonb_array_elements(p_entries) z) s;
 -- Serializes retries with the same key before checking the stored result.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,56));
 select * into prior from td_private.history_requests_v56 where request_id=p_request_id;
 if found then
  if prior.actor<>auth.uid() or prior.entries<>normalized or prior.reason<>trim(p_reason) then raise exception '请求编号已用于其他删除，请刷新重试';end if;
  return prior.result;
 end if;
 -- One statement/transaction, no per-row commits. Locks prevent new FK relations mid-plan.
 lock table public.td_customers,public.td_orders,public.td_parcels,public.td_pickups,public.td_payments,
 public.td_pickup_batches,public.td_pickup_batch_items,public.td_pickup_receipts_v32,
 public.td_business_hidden_v54,public.td_order_deletion_log,public.td_history_hidden_v56 in share row exclusive mode;
 for e in select z->>'table' tbl,(z->>'id')::uuid id from jsonb_array_elements(normalized) z loop
  if not exists(select 1 from public.td_business_hidden_v54 h where h.source_table=e.tbl and h.source_id=e.id)
   and not exists(select 1 from public.td_history_hidden_v56 h where h.source_table=e.tbl and h.source_id=e.id)
   and not exists(select 1 from public.td_order_deletion_log l where e.tbl='td_orders' and l.order_id=e.id) then
   raise exception '所选历史不存在或已变化：%/%',e.tbl,e.id;
  end if;
 end loop;
 plan:=td_private.deletion_plan_v55(normalized);
 if jsonb_array_length(plan)>50000 then raise exception '关联超过50000条，请缩小选择范围';end if;
 select coalesce(jsonb_agg(jsonb_build_object('table',z->>'table','id',z->>'id')),'[]'::jsonb) into core
 from jsonb_array_elements(plan) z where (z->>'remove')::boolean and z->>'table' in ('td_orders','td_customers','td_parcels','td_pickups','td_payments');
 if jsonb_array_length(core)>0 then n:=public.td_hide_audit_batch_v54(core,p_reason);end if;
 for x in select z from jsonb_array_elements(plan) z where (z->>'remove')::boolean and z->>'table' in ('td_pickup_batches','td_pickup_receipts_v32') loop
  insert into public.td_business_hidden_v54(source_table,source_id,reason,hidden_by,batch_id,snapshot)
  values(x->>'table',(x->>'id')::uuid,trim(p_reason),auth.uid(),p_request_id,x->'snapshot') on conflict(source_table,source_id) do nothing;
  if found then extras:=extras+1;end if;
 end loop;
 -- Hide selected history even when the source row is missing. Also hide new cascade markers
 -- so successful cleanup does not immediately create replacement cards in deletion history.
 for e in select z->>'table' tbl,(z->>'id')::uuid id from jsonb_array_elements(normalized) z
 union select z->>'table',(z->>'id')::uuid from jsonb_array_elements(plan) z
 where (z->>'remove')::boolean and z->>'table'<>'td_pickup_batch_items' loop
  insert into public.td_history_hidden_v56(source_table,source_id,hidden_by,reason,request_id)
  values(e.tbl,e.id,auth.uid(),trim(p_reason),p_request_id) on conflict(source_table,source_id) do nothing;
  if found then history_count:=history_count+1;end if;
 end loop;
 result:=jsonb_build_object('history_hidden',history_count,'business_hidden',n+extras,'request_id',p_request_id);
 insert into td_private.history_requests_v56(request_id,actor,entries,reason,result)
 values(p_request_id,auth.uid(),normalized,trim(p_reason),result);
 return result;
end $$;
revoke all on function td_private.delete_history_batch_v56(jsonb,text,boolean,uuid) from public,anon;
grant execute on function td_private.delete_history_batch_v56(jsonb,text,boolean,uuid) to authenticated;
create or replace function public.td_delete_history_batch_v56(p_entries jsonb,p_reason text,p_confirmed boolean,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select td_private.delete_history_batch_v56(p_entries,p_reason,p_confirmed,p_request_id)
$$;
revoke all on function public.td_delete_history_batch_v56(jsonb,text,boolean,uuid) from public,anon;
grant execute on function public.td_delete_history_batch_v56(jsonb,text,boolean,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
