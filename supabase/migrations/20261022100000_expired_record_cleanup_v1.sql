-- Teng Da expired-record cleanup V1
-- Safe-by-default: archive flags only; never DELETE business, financial, or pickup rows.
-- Apply only after code review and explicit production migration approval.

begin;

alter table public.td_orders
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

alter table public.td_parcels
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

create table if not exists public.td_record_cleanup_audit (
  id bigint generated always as identity primary key,
  actor uuid not null,
  cutoff_date date not null,
  action text not null check (action in ('preview','archive')),
  orders_archived integer not null default 0,
  parcels_archived integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.td_record_cleanup_audit enable row level security;

drop policy if exists "td cleanup audit owner read" on public.td_record_cleanup_audit;
create policy "td cleanup audit owner read"
  on public.td_record_cleanup_audit for select to authenticated
  using (exists (
    select 1 from public.td_members m
    where m.id = auth.uid() and m.role = 'owner' and m.active = true
  ));

create or replace function public.td_cleanup_preview_v1(p_cutoff_date date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_orders jsonb;
  v_parcels jsonb;
  v_order_count integer;
  v_parcel_count integer;
begin
  if v_actor is null or not exists (
    select 1 from public.td_members m
    where m.id = v_actor and m.role = 'owner' and m.active = true
  ) then
    raise exception '仅管理员可预览过期记录清理';
  end if;
  if p_cutoff_date is null or p_cutoff_date > current_date then
    raise exception '截止日期不能为空，且不能晚于今天';
  end if;

  -- Only exact terminal labels are candidates; unknown statuses are not guessed.
  select count(*) into v_order_count
  from public.td_orders o
  where o.archived_at is null
    and o.created_at < (p_cutoff_date + 1)::timestamptz
    and lower(trim(coalesce(o.status,''))) in ('已完成','完成','completed','complete','done')
    and not exists (
      select 1 from public.td_parcels p
      where p.order_id = o.id and coalesce(p.remaining, 0) > 0
    );

  select count(*) into v_parcel_count
  from public.td_parcels p
  where p.archived_at is null
    and p.arrived_at < (p_cutoff_date + 1)::timestamptz
    and p.remaining = 0;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'customer_id',o.customer_id,'item_name',o.item_name,
    'status',o.status,'created_at',o.created_at,'total_price',o.total_price,
    'has_payments',exists(select 1 from public.td_payments pay where pay.order_id=o.id),
    'parcel_count',(select count(*) from public.td_parcels p where p.order_id=o.id)
  ) order by o.created_at), '[]'::jsonb)
  into v_orders
  from public.td_orders o
  where o.archived_at is null
    and o.created_at < (p_cutoff_date + 1)::timestamptz
    and lower(trim(coalesce(o.status,''))) in ('已完成','完成','completed','complete','done')
    and not exists (
      select 1 from public.td_parcels p
      where p.order_id = o.id and coalesce(p.remaining, 0) > 0
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'customer_id',p.customer_id,'tracking_no',p.tracking_no,
    'description',p.description,'pieces',p.pieces,'remaining',p.remaining,
    'arrived_at',p.arrived_at,'pickup_count',(select count(*) from public.td_pickups pu where pu.parcel_id=p.id),
    'batch_count',(select count(*) from public.td_pickup_batch_items bi where bi.parcel_id=p.id)
  ) order by p.arrived_at), '[]'::jsonb)
  into v_parcels
  from public.td_parcels p
  where p.archived_at is null
    and p.arrived_at < (p_cutoff_date + 1)::timestamptz
    and p.remaining = 0;

  insert into public.td_record_cleanup_audit(actor,cutoff_date,action,orders_archived,parcels_archived,details)
  values(v_actor,p_cutoff_date,'preview',v_order_count,v_parcel_count,
    jsonb_build_object('note','Preview only; no business rows changed'));

  return jsonb_build_object(
    'cutoff_date',p_cutoff_date,
    'orders_count',v_order_count,'orders',v_orders,
    'parcels_count',v_parcel_count,'parcels',v_parcels,
    'note','预览不会修改业务数据；财务与取件记录保留'
  );
end;
$$;

create or replace function public.td_cleanup_archive_v1(p_cutoff_date date, p_confirm_text text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_orders integer := 0;
  v_parcels integer := 0;
begin
  if v_actor is null or not exists (
    select 1 from public.td_members m
    where m.id = v_actor and m.role = 'owner' and m.active = true
  ) then
    raise exception '仅管理员可执行过期记录归档';
  end if;
  if p_cutoff_date is null or p_cutoff_date > current_date then
    raise exception '截止日期不能为空，且不能晚于今天';
  end if;
  if p_confirm_text is distinct from '确认归档' then
    raise exception '二次确认文字不正确，未执行任何更改';
  end if;

  -- Lock and re-evaluate the candidates inside the same transaction.
  with candidates as (
    select o.id from public.td_orders o
    where o.archived_at is null
      and o.created_at < (p_cutoff_date + 1)::timestamptz
      and lower(trim(coalesce(o.status,''))) in ('已完成','完成','completed','complete','done')
      and not exists (
        select 1 from public.td_parcels p
        where p.order_id = o.id and coalesce(p.remaining, 0) > 0
      )
    for update
  )
  update public.td_orders o
  set archived_at=now(), archived_by=v_actor
  from candidates c where o.id=c.id;
  get diagnostics v_orders = row_count;

  with candidates as (
    select p.id from public.td_parcels p
    where p.archived_at is null
      and p.arrived_at < (p_cutoff_date + 1)::timestamptz
      and p.remaining = 0
    for update
  )
  update public.td_parcels p
  set archived_at=now(), archived_by=v_actor
  from candidates c where p.id=c.id;
  get diagnostics v_parcels = row_count;

  insert into public.td_record_cleanup_audit(actor,cutoff_date,action,orders_archived,parcels_archived,details)
  values(v_actor,p_cutoff_date,'archive',v_orders,v_parcels,
    jsonb_build_object('confirmation','确认归档','financial_rows_deleted',0,'pickup_rows_deleted',0));

  return jsonb_build_object(
    'orders_archived',v_orders,'parcels_archived',v_parcels,
    'financial_rows_deleted',0,'pickup_rows_deleted',0,
    'message','归档完成；原始订单、财务流水、取件签收与结算历史均保留'
  );
end;
$$;

revoke all on function public.td_cleanup_preview_v1(date) from public;
revoke all on function public.td_cleanup_archive_v1(date,text) from public;
grant execute on function public.td_cleanup_preview_v1(date) to authenticated;
grant execute on function public.td_cleanup_archive_v1(date,text) to authenticated;

commit;
