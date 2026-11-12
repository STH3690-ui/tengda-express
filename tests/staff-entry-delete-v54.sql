-- TEST PROJECT ONLY. Synthetic fixtures and all mutations roll back.
begin;
create temp table v54_results(result text);
do $$
<<fixture>>
declare
 owner_id uuid:=gen_random_uuid(); staff_id uuid:=gen_random_uuid(); customer_id uuid:=gen_random_uuid();
 order_id uuid:=gen_random_uuid(); parcel_id uuid:=gen_random_uuid(); pickup_id uuid:=gen_random_uuid();
 payment_id uuid:=gen_random_uuid(); batch_id uuid:=gen_random_uuid(); second_payment uuid:=gen_random_uuid();
 entries jsonb; before_payment jsonb; before_receipt jsonb; receipt_id uuid; n integer;
begin
 perform set_config('request.jwt.claim.role','service_role',true);
 insert into public.td_members(id,display_name,role,active) values(owner_id,'V54 test owner','owner',true),(staff_id,'V54 test staff','staff',true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 insert into public.td_customers(id,name) values(customer_id,'V54 rollback fixture');
 insert into public.td_orders(id,customer_id,item_name,quantity,total_price) values(order_id,customer_id,'V54 fixture',1,100);
 insert into public.td_parcels(id,customer_id,order_id,pieces,remaining) values(parcel_id,customer_id,order_id,2,1);
 insert into public.td_pickups(id,parcel_id,pieces,receiver_name) values(pickup_id,parcel_id,1,'V54 fixture');
 insert into public.td_payments(id,customer_id,order_id,amount,direction) values(payment_id,customer_id,order_id,100,'收款'),(second_payment,customer_id,order_id,20,'付款');
 insert into public.td_pickup_batches(id,customer_id,total_pieces,total_kg,rate_per_kg,freight_mmk,payment_method,receiver_name,created_by)
 values(batch_id,customer_id,1,1,100,100,'现金','V54 fixture',owner_id);
 insert into public.td_pickup_batch_items(batch_id,parcel_id,pieces) values(batch_id,parcel_id,1);
 insert into public.td_pickup_receipts_v32(batch_id,customer_id,amount_mmk,method) values(batch_id,customer_id,100,'现金') returning id into receipt_id;
 select to_jsonb(p) into before_payment from public.td_payments p where id=payment_id;
 select to_jsonb(r) into before_receipt from public.td_pickup_receipts_v32 r where id=receipt_id;
 entries:=jsonb_build_array(jsonb_build_object('table','td_customers','id',customer_id),jsonb_build_object('table','td_orders','id',order_id),jsonb_build_object('table','td_parcels','id',parcel_id),jsonb_build_object('table','td_pickups','id',pickup_id),jsonb_build_object('table','td_payments','id',payment_id));

 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 begin
  perform public.td_hide_audit_batch_v54(entries,'测试员工越权');
  raise exception 'TEST FAIL: staff accepted';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.td_hide_audit_batch_v54(entries,'测试无身份');
  raise exception 'TEST FAIL: no identity accepted';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 begin
  perform public.td_hide_audit_batch_v54(entries,'短');
  raise exception 'TEST FAIL: short reason accepted';
 exception when raise_exception then if sqlerrm like 'TEST FAIL:%' then raise; end if; end;
 insert into v54_results values('PASS staff/anonymous/short-reason denied');

 -- td_customers sorts before td_payments: ensures an earlier insert rolls back.
 begin
  perform public.td_hide_audit_batch_v54(jsonb_build_array(entries->0,jsonb_build_object('table','td_payments','id',gen_random_uuid())),'测试整批回滚');
  raise exception 'TEST FAIL: missing row accepted';
 exception when raise_exception then if sqlerrm like 'TEST FAIL:%' then raise; end if; end;
 if exists(select 1 from public.td_business_hidden_v54 where source_id=customer_id) or exists(select 1 from public.td_audit_hidden_v52 where source_id=customer_id) then raise exception 'TEST FAIL: partial deletion'; end if;
 insert into v54_results values('PASS missing record rolls back both deletion tables');

 n:=public.td_hide_audit_batch_v54(entries,'测试五类业务删除');
 if n<>5 then raise exception 'TEST FAIL: expected 5, got %',n; end if;
 if (select count(*) from public.td_business_hidden_v54 where source_id in (customer_id,order_id,parcel_id,pickup_id,payment_id) and hidden_by=owner_id and snapshot->>'id'=source_id::text)<>5 then raise exception 'TEST FAIL: snapshots/actor'; end if;
 if (select count(*) from public.td_business_hidden_ids_v54() h where h.source_id in (customer_id,order_id,parcel_id,pickup_id,payment_id,batch_id))<>6 then raise exception 'TEST FAIL: refresh markers'; end if;
 if public.td_hide_audit_batch_v54(entries,'测试重试幂等')<>0 then raise exception 'TEST FAIL: retry not idempotent'; end if;
 insert into v54_results values('PASS mixed five-type batch, actor, snapshots, derived settlement marker, idempotent retry');

 perform public.td_hide_audit_v52('td_payments',second_payment,'测试单条兼容');
 if not exists(select 1 from public.td_audit_hidden_v52 where source_id=second_payment and hidden_by=owner_id) then raise exception 'TEST FAIL: original 4-column INSERT regression'; end if;
 if (select to_jsonb(p) from public.td_payments p where id=payment_id) is distinct from before_payment or (select to_jsonb(r) from public.td_pickup_receipts_v32 r where id=receipt_id) is distinct from before_receipt then raise exception 'TEST FAIL: original ledger changed'; end if;
 if not exists(select 1 from public.td_orders o join public.td_parcels p on p.order_id=o.id join public.td_pickups u on u.parcel_id=p.id where o.id=fixture.order_id and p.remaining=1) then raise exception 'TEST FAIL: links/inventory changed'; end if;
 insert into v54_results values('PASS single-delete INSERT regression; original payment/receipt/links/inventory unchanged');
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 if not exists(select 1 from public.td_business_hidden_ids_v54() h where h.source_id=payment_id) then raise exception 'TEST FAIL: staff cannot filter deleted records'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 if exists(select 1 from public.td_business_hidden_ids_v54()) then raise exception 'TEST FAIL: anonymous marker leak'; end if;
 insert into v54_results values('PASS staff can read marker IDs; anonymous cannot');
end $$;
select result from v54_results;
rollback;
