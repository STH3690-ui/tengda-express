-- Requires staff-entry-delete-v54.sql. No business rows are updated or physically deleted.
begin;
create schema if not exists td_private;
revoke all on schema td_private from public,anon,authenticated;
-- Public RPCs are invokers; only specifically granted private implementations are callable.
grant usage on schema td_private to authenticated;
create table if not exists td_private.deletion_previews_v55(
 token uuid primary key default gen_random_uuid(),actor uuid not null,entries jsonb not null,
 plan jsonb not null,expires_at timestamptz not null default now()+interval '15 minutes',
 completed_at timestamptz,result jsonb,reason text
);
alter table td_private.deletion_previews_v55 enable row level security;
revoke all on td_private.deletion_previews_v55 from public,anon,authenticated;

alter table public.td_business_hidden_v54 drop constraint if exists td_business_hidden_v54_source_table_check;
alter table public.td_business_hidden_v54 add constraint td_business_hidden_v54_source_table_check
 check(source_table in ('td_orders','td_customers','td_parcels','td_pickups','td_payments','td_pickup_batches','td_pickup_receipts_v32'));

create or replace function td_private.parcel_order_ids_v55(p_order uuid,p_notes text)
returns uuid[] language sql immutable set search_path='' as $$
 select coalesce(array_agg(distinct x::uuid),'{}'::uuid[]) from (
 select p_order::text x where p_order is not null
 union all
 select unnest(string_to_array((regexp_match(coalesce(p_notes,''),'\[TD_ORDER_IDS:([0-9a-fA-F,\-]+)\]'))[1],','))
 ) s where x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;
revoke all on function td_private.parcel_order_ids_v55(uuid,text) from public,anon,authenticated;

create or replace function td_private.deletion_plan_v55(p_entries jsonb)
returns jsonb language sql stable set search_path='' as $$
with roots as materialized(select distinct x->>'table' tbl,(x->>'id')::uuid id from jsonb_array_elements(p_entries) x),
h as materialized(select source_table tbl,source_id id from public.td_business_hidden_v54),
o as materialized(select t.* from public.td_orders t join roots r on r.tbl='td_orders' and r.id=t.id),
pc as materialized(select p.*,td_private.parcel_order_ids_v55(p.order_id,p.notes) links from public.td_parcels p
 where exists(select 1 from roots r where r.tbl='td_parcels' and r.id=p.id)
 or td_private.parcel_order_ids_v55(p.order_id,p.notes) && array(select id from o)),
pd as materialized(select p.id from pc p where exists(select 1 from roots r where r.tbl='td_parcels' and r.id=p.id)
 or (not exists(select 1 from unnest(p.links) l where not exists(select 1 from o where id=l) and not exists(select 1 from h where tbl='td_orders' and id=l))
 and not exists(select 1 from public.td_orders z where z.id=any(p.links) and z.customer_id<>p.customer_id)
 and (position('[TD_ORDER_IDS:' in coalesce(p.notes,''))=0 or coalesce(p.notes,'') ~ '\[TD_ORDER_IDS:[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}(,[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})*\]'))),
u as materialized(select t.* from public.td_pickups t where t.parcel_id in(select id from pd)
 or exists(select 1 from roots r where r.tbl='td_pickups' and r.id=t.id)),
bc as materialized(select b.* from public.td_pickup_batches b where exists(select 1 from roots r where r.tbl='td_pickup_batches' and r.id=b.id)
 or exists(select 1 from public.td_pickup_batch_items i where i.batch_id=b.id and i.parcel_id in(select id from pd))),
bd as materialized(select b.id from bc b where not exists(select 1 from public.td_pickup_batch_items i where i.batch_id=b.id
 and i.parcel_id not in(select id from pd) and not exists(select 1 from h where tbl='td_parcels' and id=i.parcel_id))),
rc as materialized(select t.* from public.td_pickup_receipts_v32 t where t.batch_id in(select id from bd)),
mc as materialized(select t.* from public.td_payments t where exists(select 1 from roots r where r.tbl='td_payments' and r.id=t.id)
 or t.order_id in(select id from o) or t.id in(select payment_id from rc)),
md as materialized(select m.id from mc m where not exists(select 1 from public.td_pickup_receipts_v32 r where r.payment_id=m.id and r.customer_id<>m.customer_id)
 and not exists(select 1 from public.td_pickup_receipts_v32 r where r.payment_id=m.id
 and r.batch_id not in(select id from bd) and not exists(select 1 from h where tbl='td_pickup_batches' and id=r.batch_id))
 and (m.order_id is null or m.order_id in(select id from o) or exists(select 1 from roots r where r.tbl='td_payments' and r.id=m.id)
 or exists(select 1 from h where tbl='td_orders' and id=m.order_id))),
cc as materialized(select c.* from public.td_customers c where exists(select 1 from roots r where r.tbl='td_customers' and r.id=c.id)
 or c.id in(select customer_id from o union select customer_id from pc union select customer_id from mc union select customer_id from bc)),
cd as materialized(select c.id from cc c where
 not exists(select 1 from public.td_orders t where t.customer_id=c.id and t.id not in(select id from o) and not exists(select 1 from h where tbl='td_orders' and id=t.id))
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

create or replace function td_private.preview_deletion_v55(p_entries jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e record; ok boolean; v_plan jsonb; v_token uuid;
begin
 perform 1 from public.td_members where id=auth.uid() and active and deleted_at is null and role='owner' for share;
 if not found then raise exception '仅管理员可预览关联删除' using errcode='42501';end if;
 if jsonb_typeof(p_entries) is distinct from 'array' then raise exception '无效列表';end if;
 if jsonb_array_length(p_entries)<1 or jsonb_array_length(p_entries)>5000 then raise exception '请选择1至5000条';end if;
 for e in select distinct x->>'table' tbl,(x->>'id')::uuid id from jsonb_array_elements(p_entries) x loop
  if e.tbl is null or e.id is null or e.tbl not in ('td_orders','td_customers','td_parcels','td_pickups','td_payments','td_pickup_batches') then raise exception '无效业务类型';end if;
  execute format('select exists(select 1 from public.%I where id=$1)',e.tbl) into ok using e.id;
  if not ok then raise exception '原业务已不存在，不能从日志快照推断关联：%/%',e.tbl,e.id;end if;
 end loop;
 v_plan:=td_private.deletion_plan_v55(p_entries);
 if jsonb_array_length(v_plan)>20000 then raise exception '关联超过20000条，请缩小选择范围';end if;
 insert into td_private.deletion_previews_v55(actor,entries,plan) values(auth.uid(),p_entries,v_plan) returning token into v_token;
 return jsonb_build_object('token',v_token,'records',v_plan,'expires_in_seconds',900);
end $$;
revoke all on function td_private.preview_deletion_v55(jsonb) from public,anon;
grant execute on function td_private.preview_deletion_v55(jsonb) to authenticated;
create or replace function public.td_preview_history_delete_v55(p_entries jsonb)
returns jsonb language sql security invoker set search_path='' as $$select td_private.preview_deletion_v55(p_entries)$$;
revoke all on function public.td_preview_history_delete_v55(jsonb) from public,anon;
grant execute on function public.td_preview_history_delete_v55(jsonb) to authenticated;

create or replace function td_private.confirm_deletion_v55(p_token uuid,p_reason text,p_confirmation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v td_private.deletion_previews_v55%rowtype; p jsonb; e jsonb; core jsonb; n integer:=0; extras integer:=0; v_result jsonb;
begin
 perform 1 from public.td_members where id=auth.uid() and active and deleted_at is null and role='owner' for share;
 if not found then raise exception '仅管理员可关联删除' using errcode='42501';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception '删除原因至少3字';end if;
 if p_confirmation is distinct from '确认关联删除' then raise exception '请输入确认关联删除以二次确认';end if;
 select * into v from td_private.deletion_previews_v55 where token=p_token and actor=auth.uid() for update;
 if not found then raise exception '预览凭证无效或不属于当前管理员';end if;
 if v.completed_at is not null then return v.result;end if;
 if v.expires_at<now() then raise exception '预览已过期，请重新预览';end if;
 -- Prevent phantom new relations and concurrent V54 deletion between validation and commit.
 -- Briefly blocks business writes; never changes inventory, amounts or original ledger rows.
 lock table public.td_customers,public.td_orders,public.td_parcels,public.td_pickups,public.td_payments,
 public.td_pickup_batches,public.td_pickup_batch_items,public.td_pickup_receipts_v32,public.td_business_hidden_v54 in share row exclusive mode;
 p:=td_private.deletion_plan_v55(v.entries);
 if p is distinct from v.plan then raise exception '关联数据或删除状态已变化，请重新预览并确认';end if;
 select coalesce(jsonb_agg(jsonb_build_object('table',x->>'table','id',x->>'id')),'[]'::jsonb) into core
 from jsonb_array_elements(p) x where (x->>'remove')::boolean and x->>'table' in ('td_orders','td_customers','td_parcels','td_pickups','td_payments');
 if jsonb_array_length(core)>0 then n:=public.td_hide_audit_batch_v54(core,p_reason);end if;
 for e in select x from jsonb_array_elements(p) x where (x->>'remove')::boolean and x->>'table' in ('td_pickup_batches','td_pickup_receipts_v32') loop
  insert into public.td_business_hidden_v54(source_table,source_id,reason,hidden_by,batch_id,snapshot)
  values(e->>'table',(e->>'id')::uuid,trim(p_reason),auth.uid(),p_token,e->'snapshot') on conflict(source_table,source_id) do nothing;
  if found then extras:=extras+1;end if;
 end loop;
 v_result:=jsonb_build_object('deleted',n+extras,'preview_token',p_token);
 update td_private.deletion_previews_v55 set completed_at=now(),result=v_result,reason=trim(p_reason) where token=p_token;
 return v_result;
end $$;
revoke all on function td_private.confirm_deletion_v55(uuid,text,text) from public,anon;
grant execute on function td_private.confirm_deletion_v55(uuid,text,text) to authenticated;
create or replace function public.td_confirm_history_delete_v55(p_token uuid,p_reason text,p_confirmation text)
returns jsonb language sql security invoker set search_path='' as $$select td_private.confirm_deletion_v55(p_token,p_reason,p_confirmation)$$;
revoke all on function public.td_confirm_history_delete_v55(uuid,text,text) from public,anon;
grant execute on function public.td_confirm_history_delete_v55(uuid,text,text) to authenticated;

-- Keep the V54 ID endpoint and its original derivation; new marker types flow through unchanged.
-- No changes to legacy hide/restore RPCs or original financial protection triggers.
notify pgrst,'reload schema';
commit;
