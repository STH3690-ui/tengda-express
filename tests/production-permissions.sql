-- Integration assertions. Run inside a transaction on PRODUCTION and always ROLLBACK.
-- Existing identities are selected; no auth user or password is inserted, removed or reset.
create temporary table v32_fixture(owner_id uuid,staff_id uuid,customer_id uuid default gen_random_uuid(),order_id uuid default gen_random_uuid(),parcel_id uuid default gen_random_uuid(),batch_id uuid);
insert into v32_fixture(owner_id,staff_id) select (select id from public.td_members where role='owner' and active order by id limit 1),(select id from public.td_members where role='staff' order by id limit 1);
DO $$ begin if exists(select 1 from v32_fixture where owner_id is null or staff_id is null) then raise exception 'Owner and staff fixtures are required';end if;end $$;
grant all on v32_fixture to authenticated;
create function pg_temp.require_denied(statement text) returns void language plpgsql as $$ begin
 begin execute statement;exception when insufficient_privilege then return;end;
 raise exception 'Expected permission denial: %',statement;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true) from v32_fixture;
set local role authenticated;
select public.td_set_staff_active_v32(staff_id,true) from v32_fixture;
select public.td_owner_set_order_hide_permission(staff_id,false) from v32_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated')::text,true) from v32_fixture;
insert into public.td_customers(id,name,phone,created_by) select customer_id,'V32 transactional validation','123',staff_id from v32_fixture;
update public.td_customers set notes='staff edit accepted' where id=(select customer_id from v32_fixture);
insert into public.td_orders(id,customer_id,item_name,quantity,total_price,notes,created_by) select order_id,customer_id,'V32 original order',1,100,'[代买] fixture',staff_id from v32_fixture;
insert into public.td_parcels(id,customer_id,order_id,pieces,remaining,created_by) select parcel_id,customer_id,order_id,3,3,staff_id from v32_fixture;
insert into public.td_payments(customer_id,order_id,amount,direction,method,created_by) select customer_id,order_id,10,'收款','现金',staff_id from v32_fixture;
select pg_temp.require_denied(format('select public.td_staff_hide_order(%L)',order_id)) from v32_fixture;
select pg_temp.require_denied(format('delete from public.td_orders where id=%L',order_id)) from v32_fixture;
select pg_temp.require_denied(format('update public.td_payments set amount=1 where order_id=%L',order_id)) from v32_fixture;
select pg_temp.require_denied(format('select public.td_soft_delete_customer_v31(%L)',customer_id)) from v32_fixture;
select pg_temp.require_denied(format('select public.td_owner_set_order_hide_permission(%L,true)',staff_id)) from v32_fixture;
select pg_temp.require_denied('select * from public.td_login_identity_v32(''admin'')');
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true) from v32_fixture;
select public.td_owner_set_order_hide_permission(staff_id,true) from v32_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated')::text,true) from v32_fixture;
select public.td_staff_hide_order(order_id) from v32_fixture;
DO $$ begin
 if not exists(select 1 from public.td_order_hidden_v41 where order_id=(select order_id from v32_fixture)) then raise exception 'Hidden state missing';end if;
 if (select total_price from public.td_orders where id=(select order_id from v32_fixture))<>100 then raise exception 'Original order modified';end if;
 if (select sum(amount) from public.td_payments where order_id=(select order_id from v32_fixture))<>10 then raise exception 'Original finance modified';end if;
end $$;
-- 0 initial payment / credit pickup must pass production's strict total_pieces > 0 check.
update v32_fixture set batch_id=public.td_batch_pickup_v32(customer_id,jsonb_build_array(jsonb_build_object('parcel_id',parcel_id,'pieces',1)),2,100,0,'赊账','Test receiver','','rollback fixture');
DO $$ declare r record;begin
 select * into r from public.td_pickup_balances_v32 where batch_id=(select batch_id from v32_fixture);
 if r.receivable_mmk<>200 or r.paid_mmk<>0 or r.due_mmk<>200 then raise exception 'Initial debt wrong';end if;
 if (select remaining from public.td_parcels where id=(select parcel_id from v32_fixture))<>2 then raise exception 'Inventory decrement wrong';end if;
end $$;
select public.td_pickup_repay_v32(batch_id,50,'现金','first') from v32_fixture;
select public.td_pickup_repay_v32(batch_id,150,'KBZ Pay','final') from v32_fixture;
DO $$ declare r record;begin
 select * into r from public.td_pickup_balances_v32 where batch_id=(select batch_id from v32_fixture);
 if r.paid_mmk<>200 or r.due_mmk<>0 then raise exception 'Repayment balance wrong';end if;
 if (select count(*) from public.td_pickup_receipts_v32 where batch_id=r.batch_id)<>2 then raise exception 'Receipt count wrong';end if;
end $$;
-- Rejected oversell/overpayment must not leave partial rows or inventory changes.
DO $$ declare c integer;before_count bigint;begin
 select remaining into c from public.td_parcels where id=(select parcel_id from v32_fixture);
 select count(*) into before_count from public.td_pickup_batches;
 begin
  perform public.td_batch_pickup_v32(customer_id,jsonb_build_array(jsonb_build_object('parcel_id',parcel_id,'pieces',999)),1,100,0,'赊账','R','','') from v32_fixture;
  raise exception 'Oversell accepted' using errcode='ZX001';
 exception when sqlstate 'ZX001' then raise;when others then null;end;
 if (select remaining from public.td_parcels where id=(select parcel_id from v32_fixture))<>c or (select count(*) from public.td_pickup_batches)<>before_count then raise exception 'Failed pickup was not atomic';end if;
 begin
  perform public.td_pickup_repay_v32(batch_id,1,'现金','too much') from v32_fixture;
  raise exception 'Overpayment accepted' using errcode='ZX001';
 exception when sqlstate 'ZX001' then raise;when others then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true) from v32_fixture;
select public.td_owner_restore_hidden_order_v42(order_id) from v32_fixture;
select public.td_owner_delete_order(order_id) from v32_fixture;
DO $$ begin if not exists(select 1 from public.td_orders where id=(select order_id from v32_fixture)) then raise exception 'Legacy delete destroyed original order';end if;end $$;
select public.td_set_staff_active_v32(staff_id,false) from v32_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated')::text,true) from v32_fixture;
DO $$ begin if exists(select 1 from public.td_orders) or exists(select 1 from public.td_pickup_balances_v32) then raise exception 'Disabled JWT can read business data';end if;end $$;
select pg_temp.require_denied('insert into public.td_customers(name,created_by) values(''disabled'',auth.uid())');
reset role;
select 'PASS: staff CRUD restrictions, owner grants, non-destructive order removal, credit pickup, stock, repayments, atomic failures, disabled JWT' as validation;
