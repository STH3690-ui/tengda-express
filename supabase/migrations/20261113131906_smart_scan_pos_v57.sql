-- V57 REVIEW REQUIRED. Additive only; do not run against production without approval.
-- Prerequisites: V32 authoritative pickup, V50 permissions, V54/V55/V56 hidden markers.
-- Existing historical duplicate tracking numbers remain untouched and require manual disambiguation.
begin;
do $$begin
 if to_regprocedure('public.td_batch_pickup_v32(uuid,jsonb,numeric,numeric,numeric,text,text,text,text)') is null
 or to_regprocedure('public.td_has_permission_v50(text)') is null
 or to_regprocedure('public.td_delete_history_batch_v56(jsonb,text,boolean,uuid)') is null or to_regclass('public.td_business_hidden_v54') is null or to_regclass('public.td_parcel_hidden_v51') is null or to_regclass('public.td_order_hidden_v41') is null or to_regclass('public.td_pickup_hidden_v53') is null or to_regclass('public.td_customer_archives') is null then raise exception 'V32/V50/V54 prerequisites missing';end if;
end$$;
create schema if not exists td_private;
-- Preserve existing V55/V56 USAGE grants on this shared private schema.
revoke create on schema td_private from public,anon,authenticated;
create table td_private.scan_requests_v57(
 request_id uuid primary key,actor uuid not null references auth.users(id),operation text not null,
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
alter table td_private.scan_requests_v57 enable row level security;
create table public.td_scan_events_v57(
 id uuid primary key default gen_random_uuid(),request_id uuid,tracking_no text not null,
 operation text not null check(operation in ('intake','query','pickup')),
 actor uuid not null references auth.users(id),created_at timestamptz not null default now(),
 result text not null,parcel_id uuid references public.td_parcels(id) on delete set null,
 batch_id uuid references public.td_pickup_batches(id) on delete set null
);
alter table public.td_scan_events_v57 enable row level security;
revoke all on public.td_scan_events_v57 from public,anon,authenticated;
grant select on public.td_scan_events_v57 to authenticated;
create policy scan_history_read_v57 on public.td_scan_events_v57 for select to authenticated using(
 exists(select 1 from public.td_members m where m.id=(select auth.uid()) and m.active and m.deleted_at is null
 and ((actor=m.id) or (m.role='owner')))
);
create index scan_history_actor_date_v57 on public.td_scan_events_v57(actor,created_at desc);
create index scan_history_tracking_date_v57 on public.td_scan_events_v57(tracking_no,created_at desc);
create index scan_history_date_v57 on public.td_scan_events_v57(created_at desc);
create or replace function td_private.scan_key_v57(v text) returns text language sql immutable set search_path='' as $$select upper(btrim(normalize(coalesce(v,''),NFKC)))$$;
create index td_parcels_scan_key_v57 on public.td_parcels(td_private.scan_key_v57(tracking_no)) where tracking_no<>'';
create function td_private.scan_auth_v57(permission text default null) returns void language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.td_members where id=auth.uid() and active and deleted_at is null for share;
 if not found or (permission is not null and not public.td_has_permission_v50(permission)) then raise exception '无扫码操作权限' using errcode='42501';end if;
end$$;
create function td_private.scan_valid_v57(v text) returns text language plpgsql immutable set search_path='' as $$declare k text:=td_private.scan_key_v57(v);begin
 if k!~'^[A-Z0-9][A-Z0-9-]{3,63}$' then raise exception '运单须为4至64位字母、数字或短横线';end if;return k;
end$$;
-- Hidden parent orders/customers make a parcel unavailable too. No snapshot inference.
create function td_private.scan_hidden_v57(p public.td_parcels) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.td_business_hidden_v54 h where
 (h.source_table='td_parcels' and h.source_id=p.id) or (h.source_table='td_customers' and h.source_id=p.customer_id)
 or (h.source_table='td_orders' and (h.source_id=p.order_id or h.source_id::text=any(string_to_array(substring(p.notes from '\[TD_ORDER_IDS:([0-9a-fA-F,\-]+)\]'),',')))))
 or exists(select 1 from public.td_parcel_hidden_v51 h where h.parcel_id=p.id)
 or exists(select 1 from public.td_customer_archives h where h.customer_id=p.customer_id)
 or exists(select 1 from public.td_order_hidden_v41 h where h.order_id=p.order_id or h.order_id::text=any(string_to_array(substring(p.notes from '\[TD_ORDER_IDS:([0-9a-fA-F,\-]+)\]'),',')))
 or not exists(select 1 from public.td_customers c where c.id=p.customer_id and c.deleted_at is null)
$$;
-- Protect scanner AND existing normal parcel inserts against concurrent duplicate waybills.
-- Empty legacy waybills keep existing behavior. Existing rows are not rewritten/backfilled.
create function td_private.scan_unique_v57() returns trigger language plpgsql security definer set search_path='' as $$declare k text;begin
 if tg_op='UPDATE' and new.tracking_no is not distinct from old.tracking_no then return new;end if;
 if btrim(new.tracking_no)='' then return new;end if;
 k:=td_private.scan_key_v57(new.tracking_no);
 perform pg_advisory_xact_lock(hashtextextended(k,5701));
 if exists(select 1 from public.td_parcels p where p.id<>new.id and p.tracking_no<>'' and td_private.scan_key_v57(p.tracking_no)=k) then raise exception '运单已登记，不能重复入库' using errcode='23505';end if;
 return new;
end$$;
create trigger td_scan_unique_v57 before insert or update of tracking_no on public.td_parcels for each row execute function td_private.scan_unique_v57();
create function public.td_scan_capabilities_v57() returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform td_private.scan_auth_v57();return jsonb_build_object('version',57,'intake',public.td_has_permission_v50('parcel_create'),'pickup',public.td_has_permission_v50('pickup_create'),'finance',public.td_has_permission_v50('finance_create'));
end$$;
create function public.td_scan_lookup_v57(p_tracking text,p_operation text default 'query') returns jsonb language plpgsql security definer set search_path='' as $$declare k text;v jsonb;begin
 perform td_private.scan_auth_v57(case when p_operation='intake' then 'parcel_create' when p_operation='pickup' then 'pickup_create' else null end);
 if p_operation not in ('intake','query','pickup') then raise exception '无效扫码类型';end if;k:=td_private.scan_valid_v57(p_tracking);
 select coalesce(jsonb_agg(case when td_private.scan_hidden_v57(p) then jsonb_build_object('id',p.id,'tracking_no',k,'status','deleted') else
 jsonb_build_object('id',p.id,'tracking_no',k,'customer_id',p.customer_id,'customer_name',c.name,
 'customer_phone',case when public.td_has_permission_v50('customer_edit') then c.phone else '' end,
 'pieces',p.pieces,'remaining',p.remaining,'weight_kg',p.weight_kg,'category',p.category,'arrived_at',p.arrived_at,
 'status',case when p.remaining>0 then 'pending' else 'picked' end,
 'pickups',(select coalesce(jsonb_agg(t),'[]'::jsonb) from (select i.id,i.pieces,i.picked_at from public.td_pickups i where i.parcel_id=p.id and not exists(select 1 from public.td_business_hidden_v54 h where h.source_table='td_pickups' and h.source_id=i.id) union all select b.id,i.pieces,b.created_at from public.td_pickup_batch_items i join public.td_pickup_batches b on b.id=i.batch_id where i.parcel_id=p.id and not exists(select 1 from public.td_pickup_hidden_v53 h where h.batch_id=b.id) and not exists(select 1 from public.td_business_hidden_v54 h where h.source_table='td_pickup_batches' and h.source_id=b.id)) t)) end),'[]'::jsonb)
 into v from public.td_parcels p left join public.td_customers c on c.id=p.customer_id where p.tracking_no<>'' and td_private.scan_key_v57(p.tracking_no)=k;
 insert into public.td_scan_events_v57(tracking_no,operation,actor,result,parcel_id) values(k,p_operation,auth.uid(),case when jsonb_array_length(v)=0 then 'unregistered' when jsonb_array_length(v)>1 then 'ambiguous' else v->0->>'status' end,case when jsonb_array_length(v)=1 then (v->0->>'id')::uuid else null end);
 return v;
end$$;
create function public.td_scan_customers_v57(p_term text) returns jsonb language plpgsql security definer set search_path='' as $$declare v jsonb;begin
 perform td_private.scan_auth_v57('parcel_create');
 if length(btrim(p_term))<1 or length(p_term)>80 then raise exception '请输入1至80字的客户搜索条件';end if;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into v from (select c.id,c.name,case when public.td_has_permission_v50('customer_edit') then c.phone else '' end as phone from public.td_customers c
 where c.deleted_at is null and not exists(select 1 from public.td_customer_archives a where a.customer_id=c.id) and not exists(select 1 from public.td_business_hidden_v54 h where h.source_table='td_customers' and h.source_id=c.id)
 and (position(lower(p_term) in lower(c.name))>0 or (public.td_has_permission_v50('customer_edit') and position(p_term in c.phone)>0)) order by c.name,c.id limit 30) x;return v;
end$$;
-- One transaction, per-item savepoints: explicit partial results, never partial-success masquerading as all-success.
create function public.td_scan_intake_v57(p_request uuid,p_items jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior td_private.scan_requests_v57; x record;k text;pid uuid;r jsonb:='[]';one jsonb;err text;begin
 perform td_private.scan_auth_v57('parcel_create');
 lock table public.td_business_hidden_v54,public.td_parcel_hidden_v51,public.td_order_hidden_v41,public.td_customer_archives in share mode;
 if p_request is null then raise exception '请求编号必填';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,5702));
 select * into prior from td_private.scan_requests_v57 where request_id=p_request;
 if found then if prior.actor<>auth.uid() or prior.operation<>'intake' or prior.payload<>p_items then raise exception '请求编号已用于其他操作';end if;return prior.result;end if;
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception '无效入库清单';end if;
 if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then raise exception '请选择1至100个运单';end if;
 for x in select value as item,ordinality as pos from jsonb_array_elements(p_items) with ordinality order by td_private.scan_key_v57(value->>'tracking_no'),ordinality loop
  k:='';pid:=null;begin
   k:=td_private.scan_valid_v57(x.item->>'tracking_no');
   perform 1 from public.td_customers c where c.id=(x.item->>'customer_id')::uuid and c.deleted_at is null and not exists(select 1 from public.td_customer_archives a where a.customer_id=c.id) and not exists(select 1 from public.td_business_hidden_v54 h where h.source_table='td_customers' and h.source_id=c.id) for share;
   if not found then raise exception '请选择有效客户，不可猜测关联';end if;
   if coalesce(x.item->>'pieces','')!~'^[1-9][0-9]{0,5}$' or coalesce(x.item->>'weight_kg','')!~'^[0-9]{1,6}(\.[0-9]{1,3})?$' then raise exception '件数或重量不合法';end if;
   if length(coalesce(x.item->>'notes',''))>2000 or length(coalesce(x.item->>'category',''))>80 then raise exception '类别或备注过长';end if;
   insert into public.td_parcels(customer_id,tracking_no,category,pieces,remaining,weight_kg,fee_per_kg,notes,created_by)
   values((x.item->>'customer_id')::uuid,k,coalesce(nullif(x.item->>'category',''),'普通包裹'),(x.item->>'pieces')::int,(x.item->>'pieces')::int,(x.item->>'weight_kg')::numeric,7000,coalesce(x.item->>'notes',''),auth.uid()) returning id into pid;
   one:=jsonb_build_object('index',x.pos-1,'tracking_no',k,'success',true,'parcel_id',pid);
  exception when others then get stacked diagnostics err=message_text;one:=jsonb_build_object('index',x.pos-1,'tracking_no',k,'success',false,'error',case when sqlstate='23505' then '运单已登记，不能重复入库' when sqlstate in ('22P02','23503') then '客户或输入无效' else left(err,160) end);pid:=null;end;
  insert into public.td_scan_events_v57(request_id,tracking_no,operation,actor,result,parcel_id) values(p_request,k,'intake',auth.uid(),case when (one->>'success')::boolean then 'saved' else 'failed' end,pid);
  r:=r||jsonb_build_array(one);
 end loop;
 select jsonb_agg(value order by (value->>'index')::int) into r from jsonb_array_elements(r);
 insert into td_private.scan_requests_v57 values(p_request,auth.uid(),'intake',p_items,r,now());return r;
end$$;
-- Atomic adapter: locks + idempotency + audit around the ORIGINAL V32 ledger implementation.
create function public.td_scan_checkout_v57(p_request uuid,p_payload jsonb,p_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior td_private.scan_requests_v57;x record;p public.td_parcels;b uuid;r jsonb;c uuid;begin
 perform td_private.scan_auth_v57('pickup_create');
 if p_confirmed is distinct from true then raise exception '员工必须确认收款和取件';end if;
 if p_request is null then raise exception '请求编号必填';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,5702));
 select * into prior from td_private.scan_requests_v57 where request_id=p_request;
 if found then if prior.actor<>auth.uid() or prior.operation<>'pickup' or prior.payload<>p_payload then raise exception '请求编号已用于其他操作';end if;return prior.result;end if;
 if (p_payload->>'paid')::numeric>0 then perform td_private.scan_auth_v57('finance_create');end if;
 c:=(p_payload->>'customer_id')::uuid;
 if jsonb_typeof(p_payload->'items') is distinct from 'array' then raise exception '无效结算清单';end if;
 if jsonb_array_length(p_payload->'items') not between 1 and 100 then raise exception '请选择1至100个包裹';end if;
 if (select count(distinct value->>'parcel_id') from jsonb_array_elements(p_payload->'items'))<>jsonb_array_length(p_payload->'items') then raise exception '结算清单重复';end if;
 -- Shared marker table lock serializes V54/V55/V56 deletion vs checkout, not just a stale client check.
 lock table public.td_business_hidden_v54,public.td_parcel_hidden_v51,public.td_order_hidden_v41,public.td_customer_archives in share mode;
 perform 1 from public.td_customers where id=c and deleted_at is null for share;
 if not found then raise exception '客户不可办理取件';end if;
 for x in select value from jsonb_array_elements(p_payload->'items') order by value->>'parcel_id' loop
  select * into p from public.td_parcels where id=(x.value->>'parcel_id')::uuid for update;
  if not found or p.customer_id<>c or td_private.scan_hidden_v57(p) or p.remaining<=0 or p.remaining is distinct from (x.value->>'pieces')::int then raise exception '包裹状态已变化、已删除、已取件或客户不匹配，请重新查询';end if;
 end loop;
 b:=public.td_batch_pickup_v32(c,p_payload->'items',(p_payload->>'weight')::numeric,(p_payload->>'rate')::numeric,(p_payload->>'paid')::numeric,p_payload->>'method',p_payload->>'name',coalesce(p_payload->>'phone',''),coalesce(p_payload->>'notes',''));
 for x in select value from jsonb_array_elements(p_payload->'items') loop
  select * into p from public.td_parcels where id=(x.value->>'parcel_id')::uuid;
  insert into public.td_scan_events_v57(request_id,tracking_no,operation,actor,result,parcel_id,batch_id) values(p_request,p.tracking_no,'pickup',auth.uid(),'settled',p.id,b);
 end loop;
 r:=jsonb_build_object('batch_id',b,'success',true);
 insert into td_private.scan_requests_v57 values(p_request,auth.uid(),'pickup',p_payload,r,now());return r;
end$$;
create function public.td_scan_request_v57(p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare v jsonb;begin
 perform td_private.scan_auth_v57();if p_request is null then raise exception '请求编号必填';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,5702));
 select jsonb_build_object('operation',operation,'result',result) into v from td_private.scan_requests_v57 where request_id=p_request and actor=auth.uid() and operation in ('intake','pickup');
 -- Fence a request that has not reached the database yet. Late network delivery cannot commit after a negative status response.
 if v is null then insert into td_private.scan_requests_v57 values(p_request,auth.uid(),'cancelled','{}','{}',now()) on conflict(request_id) do nothing;end if;
 return v;
end$$;
-- Only RPCs expose minimal data. No client writes to audit or private request records.
revoke all on function td_private.scan_key_v57(text),td_private.scan_auth_v57(text),td_private.scan_valid_v57(text),td_private.scan_hidden_v57(public.td_parcels),td_private.scan_unique_v57() from public,anon,authenticated;
-- Expression index is evaluated by normal authenticated parcel inserts. Pure normalizer exposes no rows.
grant execute on function td_private.scan_key_v57(text) to authenticated;
revoke all on td_private.scan_requests_v57 from public,anon,authenticated;
do $$declare sig text;begin foreach sig in array array['td_scan_capabilities_v57()','td_scan_lookup_v57(text,text)','td_scan_customers_v57(text)','td_scan_intake_v57(uuid,jsonb)','td_scan_checkout_v57(uuid,jsonb,boolean)','td_scan_request_v57(uuid)'] loop
 execute 'revoke all on function public.'||sig||' from public,anon';execute 'grant execute on function public.'||sig||' to authenticated';end loop;end$$;
notify pgrst,'reload schema';
commit;
