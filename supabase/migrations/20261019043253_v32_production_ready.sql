set local td.environment='tengda-v32-production';
set local td.project_ref='yvsgawbbnyeyvynwghsc';
-- V3.2 production upgrade. Target: yvsgawbbnyeyvynwghsc ONLY.
-- No business data, auth user or storage object is deleted by this migration.
-- Run within a transaction; full executable SQL is included in docs/PRODUCTION_MIGRATION.sql.
DO $$ BEGIN
 IF current_setting('td.environment',true) IS DISTINCT FROM 'tengda-v32-production'
 OR current_setting('td.project_ref',true) IS DISTINCT FROM 'yvsgawbbnyeyvynwghsc' THEN
 RAISE EXCEPTION 'Verified production connection and explicit environment settings required'; END IF;
END $$;
create schema if not exists td_private;
revoke all on schema td_private from public,anon,authenticated;


create table if not exists public.td_order_deletion_log (
id bigint generated always as identity not null,
order_id uuid not null,
deleted_by uuid not null,
deleted_at timestamp with time zone default now() not null,
snapshot jsonb not null
);

create table if not exists public.td_members (
id uuid not null,
display_name text default ''::text not null,
role text default 'staff'::text not null,
active boolean default false not null,
created_at timestamp with time zone default now(),
username text,
contact_email text,
contact_phone text
);

create table if not exists public.td_orders (
id uuid default gen_random_uuid() not null,
customer_id uuid not null,
item_name text not null,
category text default '其他'::text not null,
quantity numeric(12,2) not null,
unit text default '件'::text not null,
unit_price numeric(14,2) default 0 not null,
total_price numeric(14,2) default 0 not null,
advanced_amount numeric(14,2) default 0 not null,
service_fee numeric(14,2) default 0 not null,
status text default '已下单'::text not null,
notes text default ''::text not null,
created_by uuid,
created_at timestamp with time zone default now()
);

create table if not exists public.td_parcels (
id uuid default gen_random_uuid() not null,
customer_id uuid not null,
order_id uuid,
tracking_no text default ''::text not null,
category text default '其他'::text not null,
description text default ''::text not null,
pieces integer not null,
remaining integer not null,
weight_kg numeric(12,3) default 0 not null,
fee_per_kg numeric(14,2) default 0 not null,
fee_per_piece numeric(14,2) default 0 not null,
arrived_at timestamp with time zone default now(),
notes text default ''::text not null,
created_by uuid
);

create table if not exists public.td_pickups (
id uuid default gen_random_uuid() not null,
parcel_id uuid not null,
pieces integer not null,
receiver_name text not null,
receiver_phone text default ''::text not null,
signature text default ''::text not null,
notes text default ''::text not null,
picked_at timestamp with time zone default now(),
created_by uuid
);

create table if not exists public.td_payments (
id uuid default gen_random_uuid() not null,
customer_id uuid not null,
order_id uuid,
amount numeric(14,2) not null,
direction text not null,
method text default '现金'::text not null,
notes text default ''::text not null,
created_at timestamp with time zone default now(),
created_by uuid
);

create table if not exists public.td_customers (
id uuid default gen_random_uuid() not null,
name text not null,
phone text default ''::text not null,
notes text default ''::text not null,
created_by uuid,
created_at timestamp with time zone default now(),
deleted_at timestamp with time zone,
deleted_by uuid
);

create table if not exists public.td_pickup_batches (
id uuid default gen_random_uuid() not null,
customer_id uuid not null,
total_pieces integer not null,
total_kg numeric(12,3) not null,
rate_per_kg numeric(14,2) not null,
freight_mmk numeric(14,2) not null,
payment_method text not null,
receiver_name text not null,
receiver_phone text default ''::text not null,
notes text default ''::text not null,
created_by uuid not null,
created_at timestamp with time zone default now() not null
);

create table if not exists public.td_pickup_batch_items (
batch_id uuid not null,
parcel_id uuid not null,
pieces integer not null
);

create table if not exists public.td_pickup_receipts_v32 (
id uuid default gen_random_uuid() not null,
batch_id uuid not null,
customer_id uuid not null,
amount_mmk numeric(18,2) not null,
method text not null,
payment_id uuid,
notes text default ''::text not null,
created_by uuid,
created_at timestamp with time zone default now() not null
);

create table if not exists public.td_customer_archives (
customer_id uuid not null,
archived_at timestamp with time zone default now() not null,
archived_by uuid not null
);

create table if not exists public.td_pickup_v32_batches (
batch_id uuid not null,
customer_id uuid not null,
created_at timestamp with time zone default now() not null
);

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_order_deletion_log'::regclass and conname='td_order_deletion_log_pkey') THEN ALTER TABLE public.td_order_deletion_log ADD CONSTRAINT td_order_deletion_log_pkey PRIMARY KEY (id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_members'::regclass and conname='td_members_id_fkey') THEN ALTER TABLE public.td_members ADD CONSTRAINT td_members_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_members'::regclass and conname='td_members_pkey') THEN ALTER TABLE public.td_members ADD CONSTRAINT td_members_pkey PRIMARY KEY (id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_members'::regclass and conname='td_members_role_check') THEN ALTER TABLE public.td_members ADD CONSTRAINT td_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'staff'::text]))); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_orders'::regclass and conname='td_orders_advanced_amount_check') THEN ALTER TABLE public.td_orders ADD CONSTRAINT td_orders_advanced_amount_check CHECK ((advanced_amount >= (0)::numeric)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_orders'::regclass and conname='td_orders_created_by_fkey') THEN ALTER TABLE public.td_orders ADD CONSTRAINT td_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_orders'::regclass and conname='td_orders_customer_id_fkey') THEN ALTER TABLE public.td_orders ADD CONSTRAINT td_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES td_customers(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_orders'::regclass and conname='td_orders_pkey') THEN ALTER TABLE public.td_orders ADD CONSTRAINT td_orders_pkey PRIMARY KEY (id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_orders'::regclass and conname='td_orders_quantity_check') THEN ALTER TABLE public.td_orders ADD CONSTRAINT td_orders_quantity_check CHECK ((quantity > (0)::numeric)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_orders'::regclass and conname='td_orders_service_fee_check') THEN ALTER TABLE public.td_orders ADD CONSTRAINT td_orders_service_fee_check CHECK ((service_fee >= (0)::numeric)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_orders'::regclass and conname='td_orders_total_price_check') THEN ALTER TABLE public.td_orders ADD CONSTRAINT td_orders_total_price_check CHECK ((total_price >= (0)::numeric)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_orders'::regclass and conname='td_orders_unit_price_check') THEN ALTER TABLE public.td_orders ADD CONSTRAINT td_orders_unit_price_check CHECK ((unit_price >= (0)::numeric)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_parcels'::regclass and conname='td_parcels_check') THEN ALTER TABLE public.td_parcels ADD CONSTRAINT td_parcels_check CHECK (((remaining >= 0) AND (remaining <= pieces))); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_parcels'::regclass and conname='td_parcels_created_by_fkey') THEN ALTER TABLE public.td_parcels ADD CONSTRAINT td_parcels_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_parcels'::regclass and conname='td_parcels_customer_id_fkey') THEN ALTER TABLE public.td_parcels ADD CONSTRAINT td_parcels_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES td_customers(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_parcels'::regclass and conname='td_parcels_fee_per_kg_check') THEN ALTER TABLE public.td_parcels ADD CONSTRAINT td_parcels_fee_per_kg_check CHECK ((fee_per_kg >= (0)::numeric)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_parcels'::regclass and conname='td_parcels_fee_per_piece_check') THEN ALTER TABLE public.td_parcels ADD CONSTRAINT td_parcels_fee_per_piece_check CHECK ((fee_per_piece >= (0)::numeric)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_parcels'::regclass and conname='td_parcels_order_id_fkey') THEN ALTER TABLE public.td_parcels ADD CONSTRAINT td_parcels_order_id_fkey FOREIGN KEY (order_id) REFERENCES td_orders(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_parcels'::regclass and conname='td_parcels_pieces_check') THEN ALTER TABLE public.td_parcels ADD CONSTRAINT td_parcels_pieces_check CHECK ((pieces > 0)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_parcels'::regclass and conname='td_parcels_pkey') THEN ALTER TABLE public.td_parcels ADD CONSTRAINT td_parcels_pkey PRIMARY KEY (id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_parcels'::regclass and conname='td_parcels_weight_kg_check') THEN ALTER TABLE public.td_parcels ADD CONSTRAINT td_parcels_weight_kg_check CHECK ((weight_kg >= (0)::numeric)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickups'::regclass and conname='td_pickups_created_by_fkey') THEN ALTER TABLE public.td_pickups ADD CONSTRAINT td_pickups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickups'::regclass and conname='td_pickups_parcel_id_fkey') THEN ALTER TABLE public.td_pickups ADD CONSTRAINT td_pickups_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES td_parcels(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickups'::regclass and conname='td_pickups_pieces_check') THEN ALTER TABLE public.td_pickups ADD CONSTRAINT td_pickups_pieces_check CHECK ((pieces > 0)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickups'::regclass and conname='td_pickups_pkey') THEN ALTER TABLE public.td_pickups ADD CONSTRAINT td_pickups_pkey PRIMARY KEY (id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_payments'::regclass and conname='td_payments_amount_check') THEN ALTER TABLE public.td_payments ADD CONSTRAINT td_payments_amount_check CHECK ((amount > (0)::numeric)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_payments'::regclass and conname='td_payments_created_by_fkey') THEN ALTER TABLE public.td_payments ADD CONSTRAINT td_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_payments'::regclass and conname='td_payments_customer_id_fkey') THEN ALTER TABLE public.td_payments ADD CONSTRAINT td_payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES td_customers(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_payments'::regclass and conname='td_payments_direction_check') THEN ALTER TABLE public.td_payments ADD CONSTRAINT td_payments_direction_check CHECK ((direction = ANY (ARRAY['收款'::text, '付款'::text]))); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_payments'::regclass and conname='td_payments_order_id_fkey') THEN ALTER TABLE public.td_payments ADD CONSTRAINT td_payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES td_orders(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_payments'::regclass and conname='td_payments_pkey') THEN ALTER TABLE public.td_payments ADD CONSTRAINT td_payments_pkey PRIMARY KEY (id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_customers'::regclass and conname='td_customers_created_by_fkey') THEN ALTER TABLE public.td_customers ADD CONSTRAINT td_customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_customers'::regclass and conname='td_customers_pkey') THEN ALTER TABLE public.td_customers ADD CONSTRAINT td_customers_pkey PRIMARY KEY (id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_batches'::regclass and conname='td_pickup_batches_customer_id_fkey') THEN ALTER TABLE public.td_pickup_batches ADD CONSTRAINT td_pickup_batches_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES td_customers(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_batches'::regclass and conname='td_pickup_batches_freight_mmk_check') THEN ALTER TABLE public.td_pickup_batches ADD CONSTRAINT td_pickup_batches_freight_mmk_check CHECK ((freight_mmk >= (0)::numeric)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_batches'::regclass and conname='td_pickup_batches_pkey') THEN ALTER TABLE public.td_pickup_batches ADD CONSTRAINT td_pickup_batches_pkey PRIMARY KEY (id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_batches'::regclass and conname='td_pickup_batches_rate_per_kg_check') THEN ALTER TABLE public.td_pickup_batches ADD CONSTRAINT td_pickup_batches_rate_per_kg_check CHECK ((rate_per_kg >= (0)::numeric)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_batches'::regclass and conname='td_pickup_batches_total_kg_check') THEN ALTER TABLE public.td_pickup_batches ADD CONSTRAINT td_pickup_batches_total_kg_check CHECK ((total_kg > (0)::numeric)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_batches'::regclass and conname='td_pickup_batches_total_pieces_check') THEN ALTER TABLE public.td_pickup_batches ADD CONSTRAINT td_pickup_batches_total_pieces_check CHECK ((total_pieces > 0)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_batch_items'::regclass and conname='td_pickup_batch_items_batch_id_fkey') THEN ALTER TABLE public.td_pickup_batch_items ADD CONSTRAINT td_pickup_batch_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES td_pickup_batches(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_batch_items'::regclass and conname='td_pickup_batch_items_parcel_id_fkey') THEN ALTER TABLE public.td_pickup_batch_items ADD CONSTRAINT td_pickup_batch_items_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES td_parcels(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_batch_items'::regclass and conname='td_pickup_batch_items_pieces_check') THEN ALTER TABLE public.td_pickup_batch_items ADD CONSTRAINT td_pickup_batch_items_pieces_check CHECK ((pieces > 0)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_batch_items'::regclass and conname='td_pickup_batch_items_pkey') THEN ALTER TABLE public.td_pickup_batch_items ADD CONSTRAINT td_pickup_batch_items_pkey PRIMARY KEY (batch_id, parcel_id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_receipts_v32'::regclass and conname='td_pickup_receipts_v32_amount_mmk_check') THEN ALTER TABLE public.td_pickup_receipts_v32 ADD CONSTRAINT td_pickup_receipts_v32_amount_mmk_check CHECK ((amount_mmk > (0)::numeric)); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_receipts_v32'::regclass and conname='td_pickup_receipts_v32_batch_id_fkey') THEN ALTER TABLE public.td_pickup_receipts_v32 ADD CONSTRAINT td_pickup_receipts_v32_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES td_pickup_batches(id) ON DELETE RESTRICT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_receipts_v32'::regclass and conname='td_pickup_receipts_v32_created_by_fkey') THEN ALTER TABLE public.td_pickup_receipts_v32 ADD CONSTRAINT td_pickup_receipts_v32_created_by_fkey FOREIGN KEY (created_by) REFERENCES td_members(id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_receipts_v32'::regclass and conname='td_pickup_receipts_v32_customer_id_fkey') THEN ALTER TABLE public.td_pickup_receipts_v32 ADD CONSTRAINT td_pickup_receipts_v32_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES td_customers(id) ON DELETE RESTRICT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_receipts_v32'::regclass and conname='td_pickup_receipts_v32_method_check') THEN ALTER TABLE public.td_pickup_receipts_v32 ADD CONSTRAINT td_pickup_receipts_v32_method_check CHECK ((method = ANY (ARRAY['现金'::text, 'KBZ Pay'::text, 'AYA Pay'::text, 'Wave Pay'::text, '银行转账'::text, '其他'::text]))); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_receipts_v32'::regclass and conname='td_pickup_receipts_v32_payment_id_fkey') THEN ALTER TABLE public.td_pickup_receipts_v32 ADD CONSTRAINT td_pickup_receipts_v32_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES td_payments(id) ON DELETE RESTRICT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_receipts_v32'::regclass and conname='td_pickup_receipts_v32_payment_id_key') THEN ALTER TABLE public.td_pickup_receipts_v32 ADD CONSTRAINT td_pickup_receipts_v32_payment_id_key UNIQUE (payment_id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_receipts_v32'::regclass and conname='td_pickup_receipts_v32_pkey') THEN ALTER TABLE public.td_pickup_receipts_v32 ADD CONSTRAINT td_pickup_receipts_v32_pkey PRIMARY KEY (id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_customer_archives'::regclass and conname='td_customer_archives_customer_id_fkey') THEN ALTER TABLE public.td_customer_archives ADD CONSTRAINT td_customer_archives_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES td_customers(id) ON DELETE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_customer_archives'::regclass and conname='td_customer_archives_pkey') THEN ALTER TABLE public.td_customer_archives ADD CONSTRAINT td_customer_archives_pkey PRIMARY KEY (customer_id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_v32_batches'::regclass and conname='td_pickup_v32_batches_batch_id_fkey') THEN ALTER TABLE public.td_pickup_v32_batches ADD CONSTRAINT td_pickup_v32_batches_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES td_pickup_batches(id) ON DELETE RESTRICT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_v32_batches'::regclass and conname='td_pickup_v32_batches_customer_id_fkey') THEN ALTER TABLE public.td_pickup_v32_batches ADD CONSTRAINT td_pickup_v32_batches_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES td_customers(id) ON DELETE RESTRICT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint where conrelid='public.td_pickup_v32_batches'::regclass and conname='td_pickup_v32_batches_pkey') THEN ALTER TABLE public.td_pickup_v32_batches ADD CONSTRAINT td_pickup_v32_batches_pkey PRIMARY KEY (batch_id); END IF; END $$;


alter table public.td_members add column if not exists username text;
alter table public.td_members add column if not exists contact_email text;
alter table public.td_members add column if not exists contact_phone text;
alter table public.td_members add column if not exists can_hide_orders boolean not null default false;
create unique index if not exists td_members_username_v32 on public.td_members(lower(username)) where username is not null;
create table if not exists td_private.login_attempts_v32(login_hash text primary key,started_at timestamptz not null default clock_timestamp(),attempts integer not null default 1);
alter table td_private.login_attempts_v32 enable row level security;
revoke all on td_private.login_attempts_v32 from public,anon,authenticated;
create table if not exists public.td_order_hidden_v41(order_id uuid primary key references public.td_orders(id),hidden_at timestamptz not null default now(),hidden_by uuid not null references auth.users(id),reason text not null default '从业务列表移除，原记录保留');
create table if not exists public.td_staff_audit_v32(id uuid primary key default gen_random_uuid(),member_id uuid not null,actor_id uuid not null,action text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
-- Backfill only unambiguous existing usernames, without changing any passwords or active/role flags.
with names as (select m.id,lower(coalesce(nullif(u.raw_user_meta_data->>'username',''),split_part(u.email,'@',1))) name from public.td_members m join auth.users u on u.id=m.id where m.username is null)
update public.td_members m set username=n.name from names n where m.id=n.id and n.name ~ '^[a-z0-9_]{3,30}$'
and (select count(*) from names z where z.name=n.name)=1 and not exists(select 1 from public.td_members e where lower(e.username)=n.name);


CREATE OR REPLACE FUNCTION public.td_update_customer_v31(p_customer_id uuid, p_name text, p_phone text, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.td_is_active() THEN
    RAISE EXCEPTION '账号未批准或已停用';
  END IF;

  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION '客户姓名不能为空';
  END IF;

  UPDATE public.td_customers
  SET name = btrim(p_name),
      phone = COALESCE(p_phone, ''),
      notes = COALESCE(p_notes, '')
  WHERE id = p_customer_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION '客户不存在或已删除';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.td_soft_delete_customer_v31(p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.td_members
    WHERE id = auth.uid()
      AND active IS TRUE
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION '仅管理员可以删除客户' using errcode='42501';
  END IF;

  UPDATE public.td_customers
  SET deleted_at = now(),
      deleted_by = auth.uid()
  WHERE id = p_customer_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION '客户不存在或已删除';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.td_login_attempt_v32(p_login text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer;
begin
  -- The RPC is service-role-only. Limits survive cold starts and concurrent requests.
  delete from td_private.login_attempts_v32 where started_at < clock_timestamp()-interval '15 minutes';
  insert into td_private.login_attempts_v32(login_hash) values(md5(lower(p_login)))
    on conflict(login_hash) do update set attempts=td_private.login_attempts_v32.attempts+1
    returning attempts into n;
  return n<=10;
end $function$
;

CREATE OR REPLACE FUNCTION public.td_login_identity_v32(p_login text)
 RETURNS TABLE(id uuid, auth_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.id,u.email::text from public.td_members m join auth.users u on u.id=m.id
  where lower(m.username)=lower(p_login)
     or (position('@' in p_login)>0 and lower(u.email)=lower(p_login))
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.td_set_staff_active_v32(p_member uuid, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.td_is_owner_v32() then raise exception 'Owner required' using errcode='42501'; end if;
  if p_active is null then raise exception 'Status required'; end if;
  update public.td_members set active=p_active where id=p_member and role<>'owner';
  if not found then raise exception 'Staff account not found'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.td_batch_pickup_v32(p_customer uuid, p_items jsonb, p_weight numeric, p_rate numeric, p_paid numeric, p_method text, p_name text, p_phone text DEFAULT ''::text, p_notes text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_batch uuid;
  v_payment uuid;
  v_freight numeric;
  v_total integer := 0;
  v_expected integer;
  v_item jsonb;
  v_parcel uuid;
  v_pieces integer;
  v_remaining integer;
  v_customer uuid;
  v_seen uuid[] := ARRAY[]::uuid[];
BEGIN
  -- 只允许已激活员工操作
  IF auth.uid() IS NULL
     OR NOT public.td_is_active()
  THEN
    RAISE EXCEPTION '员工未登录或无权限';
  END IF;

  -- 检查客户
  IF NOT EXISTS (
    SELECT 1
    FROM public.td_customers
    WHERE id = p_customer
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION '客户不存在';
  END IF;

  -- 检查金额
  IF p_weight IS NULL OR p_weight <= 0
     OR p_rate IS NULL OR p_rate < 0
     OR p_paid IS NULL OR p_paid < 0
  THEN
    RAISE EXCEPTION '重量、单价或实收金额不合法';
  END IF;

  v_freight := round(p_weight * p_rate, 2);

  IF p_paid > v_freight THEN
    RAISE EXCEPTION '实收不能超过应收';
  END IF;

  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0
  THEN
    RAISE EXCEPTION '请选择取件包裹';
  END IF;

  IF COALESCE(trim(p_name), '') = '' THEN
    RAISE EXCEPTION '请填写收件人';
  END IF;

  IF p_weight <> round(p_weight, 3)
     OR p_rate <> round(p_rate, 2)
     OR p_paid <> round(p_paid, 2)
  THEN
    RAISE EXCEPTION
      '重量最多3位小数，单价和实收最多2位小数';
  END IF;

  IF p_method IS NULL OR p_method NOT IN (
    '现金',
    'KBZ Pay',
    'AYA Pay',
    'Wave Pay',
    '银行转账', '赊账'
  ) OR (p_method='赊账' AND p_paid<>0) THEN
    RAISE EXCEPTION '付款方式不合法';
  END IF;

  IF p_weight::text in ('NaN','Infinity','-Infinity') OR p_rate::text in ('NaN','Infinity','-Infinity') OR p_paid::text in ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION '金额必须为有限数值'; END IF;
  SELECT sum((x->>'pieces')::integer) INTO v_expected FROM jsonb_array_elements(p_items) x;
  IF coalesce(v_expected,0)<=0 THEN RAISE EXCEPTION '取件件数必须大于0'; END IF;
  -- 创建取件批次
  INSERT INTO public.td_pickup_batches (
    customer_id,
    total_pieces,
    total_kg,
    rate_per_kg,
    freight_mmk,
    payment_method,
    receiver_name,
    receiver_phone,
    notes,
    created_by
  )
  VALUES (
    p_customer,
    v_expected,
    p_weight,
    p_rate,
    v_freight,
    p_method,
    p_name,
    COALESCE(p_phone, ''),
    COALESCE(p_notes, ''),
    auth.uid()
  )
  RETURNING id INTO v_batch;

  -- 逐件扣除库存
  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items) ORDER BY value->>'parcel_id'
  LOOP
    IF COALESCE(v_item->>'parcel_id', '') = ''
       OR COALESCE(v_item->>'pieces', '') !~ '^[0-9]+$'
    THEN
      RAISE EXCEPTION '包裹明细格式错误';
    END IF;

    v_parcel := (v_item->>'parcel_id')::uuid;
    v_pieces := (v_item->>'pieces')::integer;

    IF v_pieces <= 0
       OR v_parcel = ANY(v_seen)
    THEN
      RAISE EXCEPTION '包裹数量错误或重复选择';
    END IF;

    v_seen := array_append(v_seen, v_parcel);

    -- 原子扣减，避免超额取件
    UPDATE public.td_parcels
    SET remaining = remaining - v_pieces
    WHERE id = v_parcel
      AND customer_id = p_customer
      AND remaining >= v_pieces
    RETURNING remaining INTO v_remaining;

    IF NOT FOUND THEN
      RAISE EXCEPTION '包裹库存不足或客户不匹配';
    END IF;

    INSERT INTO public.td_pickup_batch_items (
      batch_id,
      parcel_id,
      pieces
    )
    VALUES (
      v_batch,
      v_parcel,
      v_pieces
    );

    v_total := v_total + v_pieces;
  END LOOP;

  UPDATE public.td_pickup_batches
  SET total_pieces = v_total
  WHERE id = v_batch;

  INSERT INTO public.td_pickup_v32_batches (
    batch_id,
    customer_id
  )
  VALUES (
    v_batch,
    p_customer
  );

  -- 只有实际收到钱才记收款
  IF p_paid > 0 THEN

    INSERT INTO public.td_payments (
      customer_id,
      amount,
      direction,
      method,
      notes,
      created_by
    )
    VALUES (
      p_customer,
      p_paid,
      '收款',
      p_method,
      'V3.2取件首付款 | ' || v_batch::text,
      auth.uid()
    )
    RETURNING id INTO v_payment;

    INSERT INTO public.td_pickup_receipts_v32 (
      batch_id,
      customer_id,
      amount_mmk,
      method,
      payment_id,
      notes,
      created_by
    )
    VALUES (
      v_batch,
      p_customer,
      p_paid,
      p_method,
      v_payment,
      '取件首付款',
      auth.uid()
    );

  END IF;

  RETURN v_batch;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.td_pickup_repay_v32(p_batch uuid, p_amount numeric, p_method text, p_notes text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_customer uuid;
  v_freight numeric;
  v_paid numeric;
  v_payment uuid;
BEGIN
  IF NOT public.td_is_active() THEN
    RAISE EXCEPTION '账号无权操作';
  END IF;

  IF p_amount IS NULL
     OR p_amount::text in ('NaN','Infinity','-Infinity')
     OR p_amount <= 0
     OR p_amount <> round(p_amount, 2)
  THEN
    RAISE EXCEPTION '补款金额不合法';
  END IF;

  IF p_method IS NULL OR p_method NOT IN (
    '现金',
    'KBZ Pay',
    'AYA Pay',
    'Wave Pay',
    '银行转账'
  ) THEN
    RAISE EXCEPTION '付款方式不合法';
  END IF;

  -- 锁定批次，防止同时重复补款
  SELECT b.customer_id, b.freight_mmk
  INTO v_customer, v_freight
  FROM public.td_pickup_batches b
  JOIN public.td_pickup_v32_batches v
    ON v.batch_id = b.id
  WHERE b.id = p_batch
  FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到V3.2取件结算单';
  END IF;

  SELECT COALESCE(SUM(amount_mmk), 0)
  INTO v_paid
  FROM public.td_pickup_receipts_v32
  WHERE batch_id = p_batch;

  IF p_amount > v_freight - v_paid THEN
    RAISE EXCEPTION '补款超过剩余欠款';
  END IF;

  INSERT INTO public.td_payments (
    customer_id,
    amount,
    direction,
    method,
    notes,
    created_by
  )
  VALUES (
    v_customer,
    p_amount,
    '收款',
    p_method,
    'V3.2取件补款 | '
      || p_batch::text
      || ' '
      || COALESCE(p_notes, ''),
    auth.uid()
  )
  RETURNING id INTO v_payment;

  INSERT INTO public.td_pickup_receipts_v32 (
    batch_id,
    customer_id,
    amount_mmk,
    method,
    payment_id,
    notes,
    created_by
  )
  VALUES (
    p_batch,
    v_customer,
    p_amount,
    p_method,
    v_payment,
    COALESCE(p_notes, ''),
    auth.uid()
  );

  IF v_paid + p_amount = v_freight THEN
    UPDATE public.td_pickup_batches
    SET payment_method = p_method
    WHERE id = p_batch;
  END IF;

  RETURN v_payment;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.td_is_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.td_members
    WHERE id = (SELECT auth.uid())
      AND active = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.td_restore_customer_v31(p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.td_members
    WHERE id = auth.uid()
      AND active IS TRUE
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION '仅管理员可以恢复客户';
  END IF;

  UPDATE public.td_customers
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_customer_id
    AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION '客户不在回收站';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.td_owner_archive_customer_v29(p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.td_members
    WHERE id = auth.uid()
      AND active IS TRUE
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION '仅管理员可以归档客户';
  END IF;

  PERFORM 1 FROM public.td_customers
  WHERE id = p_customer_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '客户不存在或已删除';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.td_customer_archives
    WHERE customer_id = p_customer_id
  ) THEN
    RAISE EXCEPTION '客户已经归档';
  END IF;

  INSERT INTO public.td_customer_archives (
    customer_id, archived_by, archived_at
  )
  VALUES (p_customer_id, auth.uid(), now());
END;
$function$
;

CREATE OR REPLACE FUNCTION public.td_owner_restore_customer_v29(p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.td_members
    WHERE id = auth.uid()
      AND active IS TRUE
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION '仅管理员可以取消归档';
  END IF;

  DELETE FROM public.td_customer_archives
  WHERE customer_id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '客户未归档';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.td_is_active_v32()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.td_members where id=auth.uid() and active=true)
$function$
;

CREATE OR REPLACE FUNCTION public.td_is_owner_v32()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.td_members where id=auth.uid() and active=true and role='owner')
$function$
;

CREATE OR REPLACE FUNCTION public.td_provision_staff_v32(p_user uuid, p_username text, p_name text, p_email text, p_phone text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.td_is_owner_v32() then raise exception 'Owner required' using errcode='42501'; end if;
  if p_username !~ '^[a-z0-9_]{3,30}$' or length(trim(p_name)) not between 1 and 60
    or length(coalesce(p_email,''))>254 or length(coalesce(p_phone,''))>30 then raise exception 'Invalid profile'; end if;
  -- Only finalize newly created Auth users with an internal project identity.
  if not exists(select 1 from auth.users u where u.id=p_user and u.created_at>now()-interval '5 minutes'
      and u.email ~ '^[0-9a-f-]{36}@[a-z0-9]+\.supabase\.co$') then raise exception 'New Auth user required'; end if;
  if exists(select 1 from public.td_members where id=p_user and (role='owner' or active=true or username is not null)) then
    raise exception 'Existing account is protected';
  end if;
  insert into public.td_members(id,display_name,role,active,username,contact_email,contact_phone)
    values(p_user,trim(p_name),'staff',false,p_username,nullif(trim(p_email),''),trim(p_phone))
    on conflict(id) do update set display_name=excluded.display_name,role='staff',active=false,
      username=excluded.username,contact_email=excluded.contact_email,contact_phone=excluded.contact_phone;
end $function$
;

CREATE OR REPLACE FUNCTION public.td_guard_members_v32()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (auth.jwt()->>'role')='service_role' then
    if TG_OP='DELETE' then return old; else return new; end if;
  end if;
  if TG_OP='INSERT' and auth.uid() is null then
    -- Existing Auth signup triggers may still run. They may only create pending staff.
    new.role := 'staff'; new.active := false; return new;
  end if;
  -- Trusted SQL maintenance can bootstrap an owner; browser JWTs cannot use this path.
  if auth.uid() is null and coalesce((auth.jwt()->>'role'),'') not in ('anon','authenticated') then
    if TG_OP='DELETE' then return old; else return new; end if;
  end if;
  if not public.td_is_owner_v32() then raise exception 'Only active owners can manage members' using errcode='42501'; end if;
  if TG_OP <> 'INSERT' and old.role='owner' then raise exception 'Owner accounts are protected' using errcode='42501'; end if;
  if TG_OP <> 'DELETE' and new.role='owner' then raise exception 'Owner promotion is not permitted here' using errcode='42501'; end if;
  if TG_OP='DELETE' then return old; else return new; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.td_guard_customers_v32()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (auth.jwt()->>'role')='service_role' or (auth.uid() is null and coalesce((auth.jwt()->>'role'),'') not in ('anon','authenticated')) then
    if TG_OP='DELETE' then return old; else return new; end if;
  end if;
  if not public.td_is_active_v32() then raise exception 'Active account required' using errcode='42501'; end if;
  if public.td_is_owner_v32() then
    if TG_OP='DELETE' then return old; else return new; end if;
  end if;
  if TG_TABLE_NAME='td_customer_archives' or TG_OP='DELETE' then
    raise exception 'Only owners can delete, restore or archive customers' using errcode='42501';
  end if;
  if TG_OP='INSERT' then
    if new.deleted_at is not null or new.created_by is distinct from auth.uid() then
      raise exception 'Invalid customer creation' using errcode='42501'; end if;
  else
    if old.deleted_at is not null or exists(select 1 from public.td_customer_archives where customer_id=old.id)
      or (to_jsonb(new)-array['name','phone','notes','updated_at']) is distinct from
         (to_jsonb(old)-array['name','phone','notes','updated_at']) then
      raise exception 'Staff can only edit live customer details' using errcode='42501';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.td_guard_active_write_v32()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (auth.jwt()->>'role') in ('anon','authenticated') and not public.td_is_active_v32() then
    raise exception 'Active account required' using errcode='42501'; end if;
  if TG_OP='DELETE' then return old; else return new; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.td_guard_customer_lifecycle_v36()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is not null or new.deleted_by is not null then
      if not public.td_is_owner_v32() then
        raise exception '仅管理员可以设置客户删除状态';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if (new.deleted_at is distinct from old.deleted_at)
       or (new.deleted_by is distinct from old.deleted_by) then
      if not public.td_is_owner_v32() then
        raise exception '仅管理员可以删除或恢复客户';
      end if;
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.td_record_pickup(p_parcel uuid, p_pieces integer, p_name text, p_phone text, p_signature text, p_notes text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_remaining integer;v_id uuid;
begin
 if not public.td_is_active_v32() then raise exception '账号未批准或已停用' using errcode='42501';end if;
 if p_pieces is null or p_pieces<1 then raise exception '取件数量必须大于0';end if;
 if nullif(btrim(coalesce(p_name,'')),'') is null then raise exception '收件人不能为空';end if;
 select remaining into v_remaining from public.td_parcels where id=p_parcel for update;
 if not found then raise exception '包裹不存在';end if;
 if p_pieces>coalesce(v_remaining,0) then raise exception '取件数量超过剩余件数';end if;
 update public.td_parcels set remaining=remaining-p_pieces where id=p_parcel;
 insert into public.td_pickups(parcel_id,pieces,receiver_name,receiver_phone,signature,notes,created_by)
 values(p_parcel,p_pieces,btrim(p_name),coalesce(p_phone,''),coalesce(p_signature,''),coalesce(p_notes,''),auth.uid())
 returning id into v_id;
 return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.td_is_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.td_members where id=auth.uid() and active=true and role='owner')
$function$
;


create or replace function public.td_staff_hide_order(p_order_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.td_orders%rowtype; changed integer;
begin
 if not exists(select 1 from public.td_members where id=auth.uid() and active=true and (role='owner' or (role='staff' and can_hide_orders=true))) then raise exception '没有订单移除权限' using errcode='42501';end if;
 select * into r from public.td_orders where id=p_order_id for update;
 if not found then raise exception '订单不存在';end if;
 insert into public.td_order_hidden_v41(order_id,hidden_by,reason) values(p_order_id,auth.uid(),'从业务列表移除；原始订单和财务账目保留') on conflict(order_id) do nothing;
 get diagnostics changed=row_count;
 if changed=1 then insert into public.td_order_deletion_log(order_id,deleted_by,snapshot) values(p_order_id,auth.uid(),to_jsonb(r)||jsonb_build_object('_operation','hidden')); end if;
end $$;
create or replace function public.td_owner_set_order_hide_permission(p_member uuid,p_allowed boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.td_is_owner_v32() then raise exception '仅管理员可以授权' using errcode='42501';end if;
 if p_allowed is null then raise exception '授权参数不能为空';end if;
 update public.td_members set can_hide_orders=p_allowed where id=p_member and role='staff';
 if not found then raise exception '只能授权普通员工';end if;
 insert into public.td_staff_audit_v32(member_id,actor_id,action,details) values(p_member,auth.uid(),'set-order-hide-permission',jsonb_build_object('allowed',p_allowed));
end $$;
create or replace function public.td_owner_hide_order_v41(p_order_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin if not public.td_is_owner_v32() then raise exception '仅管理员可移除历史订单' using errcode='42501';end if;
 perform public.td_staff_hide_order(p_order_id);end $$;
-- Legacy callers also get non-destructive removal. No RPC can physically delete an order.
create or replace function public.td_owner_delete_order(p_order_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform public.td_owner_hide_order_v41(p_order_id);end $$;


CREATE OR REPLACE FUNCTION public.td_owner_restore_hidden_order_v42(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_order public.td_orders%rowtype;
begin
 if not public.td_is_owner_v32() then raise exception '仅管理员可以恢复历史订单' using errcode='42501';end if;
 select * into v_order from public.td_orders where id=p_order_id for update;
 if not found then raise exception '原订单已不存在，无法恢复';end if;
 delete from public.td_order_hidden_v41 where order_id=p_order_id;
 if not found then raise exception '订单未处于历史移除状态';end if;
 insert into public.td_order_deletion_log(order_id,deleted_by,snapshot)
 values(p_order_id,auth.uid(),to_jsonb(v_order)||jsonb_build_object('_operation','restored','_note','管理员恢复历史订单显示'));
end;$function$
;


-- These invoker triggers see the caller of the write, including SECURITY DEFINER RPCs.
create or replace function public.td_preserve_ledger_v32() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid() is not null then
  if tg_op='DELETE' then raise exception '原始订单与账目不可永久删除' using errcode='42501';end if;
  if tg_table_name<>'td_orders' or not public.td_is_owner_v32() then raise exception '账目为只增记录，不能覆盖' using errcode='42501';end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
create or replace function public.td_guard_inventory_v32() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' then
  if tg_op='INSERT' and (new.remaining is distinct from new.pieces or new.created_by is distinct from auth.uid()) then raise exception '入库件数或操作人错误' using errcode='42501';end if;
  if tg_op='UPDATE' and (new.remaining is distinct from old.remaining or new.pieces is distinct from old.pieces) then raise exception '库存只能通过取件结算修改' using errcode='42501';end if;
 end if;
 return new;
end $$;


create or replace view public.td_pickup_balances_v32 with (security_invoker=true) as  SELECT b.id AS batch_id,
    b.customer_id,
    b.created_at,
    b.freight_mmk AS receivable_mmk,
        CASE
            WHEN (r.batch_id IS NOT NULL) THEN COALESCE(p.paid, (0)::numeric)
            WHEN (b.payment_method = '赊账'::text) THEN (0)::numeric
            ELSE b.freight_mmk
        END AS paid_mmk,
    (b.freight_mmk -
        CASE
            WHEN (r.batch_id IS NOT NULL) THEN COALESCE(p.paid, (0)::numeric)
            WHEN (b.payment_method = '赊账'::text) THEN (0)::numeric
            ELSE b.freight_mmk
        END) AS due_mmk,
    b.payment_method,
    (r.batch_id IS NOT NULL) AS is_v32
   FROM ((td_pickup_batches b
     LEFT JOIN td_pickup_v32_batches r ON ((r.batch_id = b.id)))
     LEFT JOIN ( SELECT td_pickup_receipts_v32.batch_id,
            sum(td_pickup_receipts_v32.amount_mmk) AS paid
           FROM td_pickup_receipts_v32
          GROUP BY td_pickup_receipts_v32.batch_id) p ON ((p.batch_id = b.id)));

DO $$ declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'td_%' or p.proname in ('init_tengda_profile','record_pickup','tengda_active','tengda_owner','rls_auto_enable')) and p.prokind='f' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 end loop;
end $$;


grant execute on function public.td_login_attempt_v32(p_login text) to service_role;

grant execute on function public.td_login_identity_v32(p_login text) to service_role;

grant execute on function public.td_is_active() to authenticated,service_role;

grant execute on function public.td_is_owner() to authenticated,service_role;

grant execute on function public.td_is_active_v32() to authenticated,service_role;

grant execute on function public.td_is_owner_v32() to authenticated,service_role;

grant execute on function public.td_provision_staff_v32(p_user uuid, p_username text, p_name text, p_email text, p_phone text) to authenticated,service_role;

grant execute on function public.td_set_staff_active_v32(p_member uuid, p_active boolean) to authenticated,service_role;

grant execute on function public.td_batch_pickup_v32(p_customer uuid, p_items jsonb, p_weight numeric, p_rate numeric, p_paid numeric, p_method text, p_name text, p_phone text, p_notes text) to authenticated,service_role;

grant execute on function public.td_pickup_repay_v32(p_batch uuid, p_amount numeric, p_method text, p_notes text) to authenticated,service_role;

grant execute on function public.td_record_pickup(p_parcel uuid, p_pieces integer, p_name text, p_phone text, p_signature text, p_notes text) to authenticated,service_role;

grant execute on function public.td_update_customer_v31(p_customer_id uuid, p_name text, p_phone text, p_notes text) to authenticated,service_role;

grant execute on function public.td_soft_delete_customer_v31(p_customer_id uuid) to authenticated,service_role;

grant execute on function public.td_restore_customer_v31(p_customer_id uuid) to authenticated,service_role;

grant execute on function public.td_owner_archive_customer_v29(p_customer_id uuid) to authenticated,service_role;

grant execute on function public.td_owner_restore_customer_v29(p_customer_id uuid) to authenticated,service_role;

grant execute on function public.td_staff_hide_order(p_order_id uuid) to authenticated,service_role;

grant execute on function public.td_owner_set_order_hide_permission(p_member uuid, p_allowed boolean) to authenticated,service_role;

grant execute on function public.td_owner_hide_order_v41(p_order_id uuid) to authenticated,service_role;

grant execute on function public.td_owner_restore_hidden_order_v42(p_order_id uuid) to authenticated,service_role;

grant execute on function public.td_owner_delete_order(p_order_id uuid) to authenticated,service_role;

DO $$ declare t record;p record;begin
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'td\_%' escape '\' loop
  execute format('alter table public.%I enable row level security',t.tablename);
  for p in select policyname from pg_policies where schemaname='public' and tablename=t.tablename loop execute format('drop policy %I on public.%I',p.policyname,t.tablename);end loop;
  execute format('revoke all on public.%I from anon,authenticated',t.tablename);
  execute format('grant select on public.%I to authenticated',t.tablename);
  execute format('grant all on public.%I to service_role',t.tablename);
  if t.tablename='td_members' then
   execute 'create policy td_member_read on public.td_members for select to authenticated using(id=(select auth.uid()) or (select public.td_is_owner_v32()))';
  elsif t.tablename in ('td_order_deletion_log','td_staff_audit_v32') then
   execute format('create policy td_owner_read on public.%I for select to authenticated using((select public.td_is_owner_v32()))',t.tablename);
  else
   execute format('create policy td_active_read on public.%I for select to authenticated using((select public.td_is_active_v32()))',t.tablename);
  end if;
  execute format('drop trigger if exists td_active_write_v32 on public.%I',t.tablename);
  if t.tablename<>'td_members' then execute format('create trigger td_active_write_v32 before insert or update or delete on public.%I for each row execute function public.td_guard_active_write_v32()',t.tablename);end if;
 end loop;
end $$;
grant insert,update on public.td_customers to authenticated;
create policy td_customer_insert on public.td_customers for insert to authenticated with check((select public.td_is_active_v32()) and created_by=(select auth.uid()) and deleted_at is null and deleted_by is null);
create policy td_customer_update on public.td_customers for update to authenticated using((select public.td_is_active_v32())) with check((select public.td_is_active_v32()));
grant insert on public.td_orders,public.td_parcels,public.td_payments to authenticated;
grant update on public.td_orders to authenticated;
create policy td_order_update on public.td_orders for update to authenticated using((select public.td_is_owner_v32())) with check((select public.td_is_owner_v32()));
DO $$ declare t text; begin
 foreach t in array array['td_orders','td_parcels','td_payments'] loop
 execute format('create policy td_business_insert on public.%I for insert to authenticated with check((select public.td_is_active_v32()) and created_by=(select auth.uid()))',t);
 end loop;
end $$;
grant usage,select on all sequences in schema public to service_role;
grant select on public.td_pickup_balances_v32 to authenticated,service_role;
revoke all on public.td_pickup_balances_v32 from anon;


drop trigger if exists td_guard_members_v32 on public.td_members;
CREATE TRIGGER td_guard_members_v32 BEFORE INSERT OR DELETE OR UPDATE ON public.td_members FOR EACH ROW EXECUTE FUNCTION td_guard_members_v32();

drop trigger if exists td_guard_customers_v32 on public.td_customers;
CREATE TRIGGER td_guard_customers_v32 BEFORE INSERT OR DELETE OR UPDATE ON public.td_customers FOR EACH ROW EXECUTE FUNCTION td_guard_customers_v32();

drop trigger if exists td_guard_archives_v32 on public.td_customer_archives;
CREATE TRIGGER td_guard_archives_v32 BEFORE INSERT OR DELETE OR UPDATE ON public.td_customer_archives FOR EACH ROW EXECUTE FUNCTION td_guard_customers_v32();

drop trigger if exists td_guard_customer_lifecycle_trigger_v36 on public.td_customers;
CREATE TRIGGER td_guard_customer_lifecycle_trigger_v36 BEFORE INSERT OR UPDATE ON public.td_customers FOR EACH ROW EXECUTE FUNCTION td_guard_customer_lifecycle_v36();

drop trigger if exists td_preserve_ledger_v32 on public.td_orders;create trigger td_preserve_ledger_v32 before update or delete on public.td_orders for each row execute function public.td_preserve_ledger_v32();

drop trigger if exists td_preserve_ledger_v32 on public.td_payments;create trigger td_preserve_ledger_v32 before update or delete on public.td_payments for each row execute function public.td_preserve_ledger_v32();

drop trigger if exists td_preserve_ledger_v32 on public.td_pickup_receipts_v32;create trigger td_preserve_ledger_v32 before update or delete on public.td_pickup_receipts_v32 for each row execute function public.td_preserve_ledger_v32();

drop trigger if exists td_preserve_ledger_v32 on public.td_order_deletion_log;create trigger td_preserve_ledger_v32 before update or delete on public.td_order_deletion_log for each row execute function public.td_preserve_ledger_v32();

drop trigger if exists td_preserve_ledger_v32 on public.td_staff_audit_v32;create trigger td_preserve_ledger_v32 before update or delete on public.td_staff_audit_v32 for each row execute function public.td_preserve_ledger_v32();

drop trigger if exists td_guard_inventory_v32 on public.td_parcels;
create trigger td_guard_inventory_v32 before insert or update on public.td_parcels for each row execute function public.td_guard_inventory_v32();
-- Storage bucket stays private; existing objects are retained.
insert into storage.buckets(id,name,public) values('tengda-images','tengda-images',false) on conflict(id) do update set public=false;
drop policy if exists td_images_active_production on storage.objects;
create policy td_images_active_production on storage.objects as restrictive for all to authenticated using(bucket_id<>'tengda-images' or (select public.td_is_active_v32())) with check(bucket_id<>'tengda-images' or (select public.td_is_active_v32()));
drop policy if exists td_images_anon_production on storage.objects;
create policy td_images_anon_production on storage.objects as restrictive for all to anon using(bucket_id<>'tengda-images') with check(bucket_id<>'tengda-images');
drop policy if exists td_images_read_production on storage.objects;
create policy td_images_read_production on storage.objects for select to authenticated using(bucket_id='tengda-images' and (select public.td_is_active_v32()));
drop policy if exists td_images_insert_production on storage.objects;
create policy td_images_insert_production on storage.objects for insert to authenticated with check(bucket_id='tengda-images' and (select public.td_is_active_v32()));
create index if not exists td_orders_customer_v32 on public.td_orders(customer_id);
create index if not exists td_parcels_customer_v32 on public.td_parcels(customer_id);
create index if not exists td_receipts_batch_v32 on public.td_pickup_receipts_v32(batch_id);
create index if not exists td_payments_order_v32 on public.td_payments(order_id);
notify pgrst,'reload schema';

