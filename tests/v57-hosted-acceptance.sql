-- TEST PROJECT ONLY: amknufvdvqfhrgtobpwg. All fixtures roll back.
-- Use the project-scoped SQL tool with this exact test ref; never select production.
-- Save a scoped backup and verify RPC/RLS permissions before running.
begin;
set local plpgsql.check_asserts='on';
set local statement_timeout='20s';
set local lock_timeout='3s';
set local idle_in_transaction_session_timeout='30s';
select set_config('request.jwt.claim.role','service_role',true);
do $$declare o uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) values(o,'v57-'||o||'@example.invalid'),(s,'v57-'||s||'@example.invalid');
 insert into public.td_members(id,display_name,role,active,permissions) values(o,'V57 isolated owner','owner',true,'{}'),(s,'V57 isolated staff','staff',true,'{}');
 insert into public.td_customers(id,name,phone) values(c,'V57-ACCEPT-CUSTOMER','private-test-phone'),(d,'V57-OTHER-CUSTOMER','other-test-phone');
 perform set_config('v57.owner',o::text,true); perform set_config('v57.staff',s::text,true); perform set_config('v57.customer',c::text,true); perform set_config('v57.other',d::text,true);
 perform set_config('request.jwt.claim.sub',o::text,true);
end$$;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$declare c uuid:=current_setting('v57.customer')::uuid; d uuid:=current_setting('v57.other')::uuid; req uuid:=gen_random_uuid(); items jsonb; r jsonb; p uuid; p2 uuid; b uuid; payload jsonb; result jsonb; rejected boolean; begin
 assert (public.td_scan_capabilities_v57()->>'version')::int=57,'capabilities';
 r:=public.td_scan_customers_v57('V57-ACCEPT-CUSTOMER');
 assert jsonb_array_length(r)=1 and (r->0->>'id')::uuid=c,'explicit customer matching';
 assert public.td_scan_customers_v57('V57-NO-SUCH-CUSTOMER')='[]'::jsonb,'unmatched customer';
 items:=jsonb_build_array(jsonb_build_object('tracking_no','V57ACCEPT001','customer_id',c,'pieces',2,'weight_kg',1.5),jsonb_build_object('tracking_no','V57ACCEPT002','customer_id',c,'pieces',1,'weight_kg',0.5),jsonb_build_object('tracking_no','V57INVALID001','customer_id',gen_random_uuid(),'pieces',1,'weight_kg',1));
 r:=public.td_scan_intake_v57(req,items);
 assert (r->0->>'success')::boolean and (r->1->>'success')::boolean and not (r->2->>'success')::boolean,'mixed intake';
 assert public.td_scan_intake_v57(req,items)=r,'idempotent intake';
 p:=(r->0->>'parcel_id')::uuid; p2:=(r->1->>'parcel_id')::uuid;
 r:=public.td_scan_intake_v57(gen_random_uuid(),jsonb_build_array(jsonb_build_object('tracking_no',' v57accept001 ','customer_id',c,'pieces',1,'weight_kg',1)));
 assert not (r->0->>'success')::boolean,'normalized duplicate intake';
 r:=public.td_scan_lookup_v57('v57accept001','pickup');
 assert jsonb_array_length(r)=1 and (r->0->>'customer_id')::uuid=c and (r->0->>'remaining')::int=2,'tracking customer and inventory';
 payload:=jsonb_build_object('customer_id',c,'items',jsonb_build_array(jsonb_build_object('parcel_id',p,'pieces',2),jsonb_build_object('parcel_id',p2,'pieces',1)),'weight',2,'rate',7000,'paid',5000,'method','现金','name','V57 test receiver');
 rejected:=false; begin perform public.td_scan_checkout_v57(gen_random_uuid(),payload,false); exception when others then rejected:=true; end; assert rejected,'confirmation required';
 rejected:=false; begin perform public.td_scan_checkout_v57(gen_random_uuid(),jsonb_set(payload,'{customer_id}',to_jsonb(d)),true); exception when others then rejected:=true; end; assert rejected,'wrong customer rejected';
 rejected:=false; begin perform public.td_scan_checkout_v57(gen_random_uuid(),jsonb_set(payload,'{items}',jsonb_build_array(jsonb_build_object('parcel_id',p,'pieces',2),jsonb_build_object('parcel_id',p,'pieces',2))),true); exception when others then rejected:=true; end; assert rejected,'duplicate checkout list';
 req:=gen_random_uuid(); result:=public.td_scan_checkout_v57(req,payload,true); b:=(result->>'batch_id')::uuid;
 assert (result->>'success')::boolean,'continuous multi-parcel checkout';
 assert public.td_scan_checkout_v57(req,payload,true)=result,'idempotent checkout';
 assert (select remaining=0 from public.td_parcels where id=p) and (select remaining=0 from public.td_parcels where id=p2),'inventory exhausted';
 assert (select count(*)=2 from public.td_pickup_batch_items where batch_id=b),'two parcel batch';
 assert coalesce((select receivable_mmk=14000 and paid_mmk=5000 and due_mmk=9000 from public.td_pickup_balances_authorized_v50() where batch_id=b),false),'freight payment debt';
 rejected:=false; begin perform public.td_scan_checkout_v57(gen_random_uuid(),payload,true); exception when others then rejected:=true; end; assert rejected,'picked parcel rejected';
 assert public.td_scan_lookup_v57('V57ACCEPT001','query')->0->>'status'='picked','picked lookup';
 perform set_config('v57.hosted_result','PASS: customer matching, mixed intake, continuous two-parcel checkout, normalized duplicates, confirmation, wrong customer, repeated checkout, idempotency, freight 14000 / paid 5000 / debt 9000',true);
end$$;
-- Inject an application failure AFTER the real V32/V57 writes, inside a
-- PL/pgSQL exception subtransaction. Verify all business effects roll back.
-- The local PostgreSQL suite separately injects an audit-trigger failure INSIDE V57.
do $$declare c uuid:=current_setting('v57.customer')::uuid; p uuid; req uuid:=gen_random_uuid(); r jsonb; payload jsonb; before_counts jsonb; after_counts jsonb; failed boolean:=false; begin
 r:=public.td_scan_intake_v57(gen_random_uuid(),jsonb_build_array(jsonb_build_object('tracking_no','V57ROLLBACK001','customer_id',c,'pieces',2,'weight_kg',1.5)));
 assert coalesce((r->0->>'success')::boolean,false),'rollback fixture intake'; p:=(r->0->>'parcel_id')::uuid;
 payload:=jsonb_build_object('customer_id',c,'items',jsonb_build_array(jsonb_build_object('parcel_id',p,'pieces',2)),'weight',1.5,'rate',7000,'paid',5000,'method','现金','name','V57 rollback receiver');
 select jsonb_build_object('payments',(select count(*) from public.td_payments),'batches',(select count(*) from public.td_pickup_batches),'items',(select count(*) from public.td_pickup_batch_items),'receipts',(select count(*) from public.td_pickup_receipts_v32),'events',(select count(*) from public.td_scan_events_v57)) into before_counts;
 begin
  r:=public.td_scan_checkout_v57(req,payload,true);
  assert coalesce((r->>'success')::boolean,false),'checkout before injected failure';
  raise exception 'V57 acceptance injected failure after checkout' using errcode='P5701';
 exception when sqlstate 'P5701' then failed:=true;
 end;
 assert failed,'failure injection reached';
 assert coalesce((select remaining=2 from public.td_parcels where id=p),false),'rollback restores inventory';
 select jsonb_build_object('payments',(select count(*) from public.td_payments),'batches',(select count(*) from public.td_pickup_batches),'items',(select count(*) from public.td_pickup_batch_items),'receipts',(select count(*) from public.td_pickup_receipts_v32),'events',(select count(*) from public.td_scan_events_v57)) into after_counts;
 assert before_counts=after_counts,'rollback restores ledger receipts batches and audit';
 assert public.td_scan_request_v57(req) is null,'rolled back request has no settled result';
 perform set_config('v57.rollback_result','PASS: injected failure after real checkout rolls back inventory, payments, batches, items, receipts, audit and idempotent result',true);
end$$;
select set_config('request.jwt.claim.sub',current_setting('v57.staff'),true);
do $$declare r jsonb; rejected boolean:=false; begin
 r:=public.td_scan_lookup_v57('V57ACCEPT001','query'); assert r->0->>'customer_phone'='','phone privacy';
 assert not exists(select 1 from public.td_scan_events_v57 where actor<>auth.uid()),'history RLS';
 begin perform public.td_scan_intake_v57(gen_random_uuid(),'[]'); exception when insufficient_privilege then rejected:=true; end; assert rejected,'staff write permissions';
 rejected:=false; begin insert into public.td_scan_events_v57(tracking_no,operation,actor,result) values('V57FORGE001','query',auth.uid(),'forged'); exception when insufficient_privilege then rejected:=true; end; assert rejected,'audit forgery rejected';
end$$;
reset role;
select current_setting('v57.hosted_result') as business_result,current_setting('v57.rollback_result') as rollback_result,'PASS: hosted auth.uid claims / authenticated role / RLS / phone privacy / denied writes; fixture transaction rolls back' as security_result;
rollback;
