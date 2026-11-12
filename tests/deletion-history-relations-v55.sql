-- TEST PROJECT ONLY. Uses synthetic UUIDs; every mutation rolls back.
begin;
create temp table v55_results(result text);
do $$
<<f>>
declare
 owner_id uuid:=gen_random_uuid(); staff_id uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 o uuid:=gen_random_uuid(); other_o uuid:=gen_random_uuid(); exclusive_p uuid:=gen_random_uuid(); shared_p uuid:=gen_random_uuid(); other_p uuid:=gen_random_uuid();
 pickup uuid:=gen_random_uuid(); pay uuid:=gen_random_uuid(); independent_pay uuid:=gen_random_uuid(); freight_pay uuid:=gen_random_uuid();
 shared_payment uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); o2 uuid:=gen_random_uuid();
 batch uuid:=gen_random_uuid(); mixed_batch uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid();
 preview jsonb; again jsonb; result jsonb; token uuid; saved jsonb; n integer; before_receipt jsonb; before_payment jsonb;
begin
 perform set_config('request.jwt.claim.role','service_role',true);
 insert into public.td_members(id,display_name,role,active) values(owner_id,'V55 fixture owner','owner',true),(staff_id,'V55 fixture staff','staff',true);
 perform set_config('request.jwt.claim.role','authenticated',true);perform set_config('request.jwt.claim.sub',owner_id::text,true);
 insert into public.td_customers(id,name) values(c,'V55 shared fixture');
 insert into public.td_orders(id,customer_id,item_name,quantity,total_price) values(o,c,'V55 delete',1,100),(other_o,c,'V55 keep',1,200);
 insert into public.td_parcels(id,customer_id,order_id,pieces,remaining,notes) values(exclusive_p,c,o,2,1,''),(shared_p,c,o,2,1,'[TD_ORDER_IDS:'||o||','||other_o||']'),(other_p,c,other_o,2,2,'');
 insert into public.td_pickups(id,parcel_id,pieces,receiver_name) values(pickup,exclusive_p,1,'V55 fixture');
 insert into public.td_payments(id,customer_id,order_id,amount,direction) values(pay,c,o,100,'收款'),(independent_pay,c,null,50,'收款'),(freight_pay,c,null,30,'收款');
 insert into public.td_pickup_batches(id,customer_id,total_pieces,total_kg,rate_per_kg,freight_mmk,payment_method,receiver_name,created_by)
 values(batch,c,1,1,30,30,'现金','V55 fixture',owner_id),(mixed_batch,c,2,2,30,60,'现金','V55 shared fixture',owner_id);
 insert into public.td_pickup_batch_items(batch_id,parcel_id,pieces) values(batch,exclusive_p,1),(mixed_batch,exclusive_p,1),(mixed_batch,other_p,1);
 insert into public.td_pickup_receipts_v32(id,batch_id,customer_id,payment_id,amount_mmk,method) values(receipt,batch,c,freight_pay,30,'现金');
 insert into public.td_payments(id,customer_id,amount,direction) values(shared_payment,c,10,'收款');
 insert into public.td_pickup_receipts_v32(batch_id,customer_id,payment_id,amount_mmk,method) values(batch,c,shared_payment,5,'现金'),(mixed_batch,c,shared_payment,5,'现金');
 select to_jsonb(t) into before_receipt from public.td_pickup_receipts_v32 t where id=receipt;
 select to_jsonb(t) into before_payment from public.td_payments t where id=freight_pay;
 preview:=public.td_preview_history_delete_v55(jsonb_build_array(jsonb_build_object('table','td_orders','id',o)));
 token:=(preview->>'token')::uuid;
 if not exists(select 1 from jsonb_array_elements(preview->'records') x where x->>'id'=shared_p::text and not (x->>'remove')::boolean) then raise exception 'FAIL shared parcel';end if;
 if not exists(select 1 from jsonb_array_elements(preview->'records') x where x->>'id'=c::text and not (x->>'remove')::boolean) then raise exception 'FAIL shared customer';end if;
 if exists(select 1 from jsonb_array_elements(preview->'records') x where x->>'id'=independent_pay::text and (x->>'remove')::boolean) then raise exception 'FAIL independent payment';end if;
 if not exists(select 1 from jsonb_array_elements(preview->'records') x where x->>'id'=mixed_batch::text and not (x->>'remove')::boolean) then raise exception 'FAIL shared settlement';end if;
 if not exists(select 1 from jsonb_array_elements(preview->'records') x where x->>'id'=freight_pay::text and (x->>'remove')::boolean) then raise exception 'FAIL receipt payment FK';end if;
 if exists(select 1 from jsonb_array_elements(preview->'records') x where x->>'id'=shared_payment::text and (x->>'remove')::boolean) then raise exception 'FAIL shared payment';end if;
 insert into v55_results values('PASS exact order/parcel/receipt relations; shared customer/parcel/settlement and independent payment protected');
 begin
  perform public.td_confirm_history_delete_v55(token,'测试原因','不确认');raise exception 'FAIL confirmation accepted';
 exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin
  perform public.td_confirm_history_delete_v55(token,'短','确认关联删除');raise exception 'FAIL short reason';
 exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 begin
  perform public.td_confirm_history_delete_v55(token,'测试越权','确认关联删除');raise exception 'FAIL staff accepted';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 insert into v55_results values('PASS database enforces owner, reason and typed second confirmation');
 -- A new relation between preview and confirmation must reject the entire operation.
 insert into public.td_payments(customer_id,order_id,amount,direction) values(c,o,1,'付款');
 begin
  perform public.td_confirm_history_delete_v55(token,'测试预览变化','确认关联删除');raise exception 'FAIL stale preview';
 exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 if exists(select 1 from public.td_business_hidden_v54 where source_id=o) then raise exception 'FAIL stale preview partially applied';end if;
 insert into v55_results values('PASS relation changes invalidate preview before any deletion');
 preview:=public.td_preview_history_delete_v55(jsonb_build_array(jsonb_build_object('table','td_orders','id',o)));
 token:=(preview->>'token')::uuid;
 -- Force failure after V54 core has run, while writing an extra settlement marker.
 begin
  execute 'create function pg_temp.v55_fail() returns trigger language plpgsql as $t$begin if new.source_table=''td_pickup_batches'' then raise exception ''injected write failure'';end if;return new;end$t$';
  execute 'create trigger v55_fail before insert on public.td_business_hidden_v54 for each row execute function pg_temp.v55_fail()';
  perform public.td_confirm_history_delete_v55(token,'测试中途失败','确认关联删除');
  raise exception 'FAIL injected failure not reached';
 exception when raise_exception then if sqlerrm<>'injected write failure' then raise;end if;end;
 if exists(select 1 from public.td_business_hidden_v54 where source_id=o) or exists(select 1 from public.td_audit_hidden_v52 where source_id=o) then raise exception 'FAIL partial transaction';end if;
 if exists(select 1 from td_private.deletion_previews_v55 v where v.token=f.token and v.completed_at is not null) then raise exception 'FAIL preview consumed';end if;
 insert into v55_results values('PASS injected late write failure rolls back V54 markers, audit markers and preview consumption');
 result:=public.td_confirm_history_delete_v55(token,'测试关联删除','确认关联删除');
 again:=public.td_confirm_history_delete_v55(token,'测试幂等重试','确认关联删除');
 if result is distinct from again then raise exception 'FAIL retry changed result';end if;
 if not exists(select 1 from public.td_business_hidden_ids_v54() h where h.source_table='td_pickup_receipts_v32' and h.source_id=receipt) then raise exception 'FAIL receipt marker persistence';end if;
 if not exists(select 1 from public.td_business_hidden_ids_v54() h where h.source_table='td_pickup_batches' and h.source_id=batch) then raise exception 'FAIL settlement marker persistence';end if;
 if exists(select 1 from public.td_business_hidden_v54 where source_id in (shared_p,c,other_o,other_p,independent_pay,mixed_batch)) then raise exception 'FAIL protected records hidden';end if;
 if (select remaining from public.td_parcels where id=exclusive_p)<>1 then raise exception 'FAIL inventory altered';end if;
 if (select to_jsonb(t) from public.td_pickup_receipts_v32 t where id=receipt) is distinct from before_receipt or (select to_jsonb(t) from public.td_payments t where id=freight_pay) is distinct from before_payment then raise exception 'FAIL ledger changed';end if;
 insert into v55_results values('PASS atomic success, repeated confirmation idempotent, refresh markers persist, originals/inventory unchanged');
 -- New preview after completion remains safe, with no new markers.
 preview:=public.td_preview_history_delete_v55(jsonb_build_array(jsonb_build_object('table','td_orders','id',o)));
 result:=public.td_confirm_history_delete_v55((preview->>'token')::uuid,'测试重复清理','确认关联删除');
 if (result->>'deleted')::int<>0 then raise exception 'FAIL repeated cleanup adds markers';end if;
 insert into v55_results values('PASS re-preview/re-delete changes zero records');
 -- Every supported root is checked separately: no reverse cascade to parent orders.
 for saved in select jsonb_build_object('table',t,'id',i) from (values('td_parcels',other_p),('td_pickups',pickup),('td_payments',independent_pay),('td_customers',c),('td_pickup_batches',mixed_batch)) roots(t,i) loop
  preview:=public.td_preview_history_delete_v55(jsonb_build_array(saved));
  if exists(select 1 from jsonb_array_elements(preview->'records') x where x->>'table'='td_orders' and x->>'id'=other_o::text and (x->>'remove')::boolean) then raise exception 'FAIL reverse cascade';end if;
 end loop;
 -- A truly exclusive customer can leave normal lists, but a bare customer root never cascades all its business.
 insert into public.td_customers(id,name) values(c2,'V55 exclusive customer');
 insert into public.td_orders(id,customer_id,item_name,quantity) values(o2,c2,'V55 exclusive order',1);
 preview:=public.td_preview_history_delete_v55(jsonb_build_array(jsonb_build_object('table','td_orders','id',o2)));
 if not exists(select 1 from jsonb_array_elements(preview->'records') x where x->>'id'=c2::text and (x->>'remove')::boolean) then raise exception 'FAIL exclusive customer omitted';end if;
 token:=(preview->>'token')::uuid;
 update td_private.deletion_previews_v55 v set expires_at=now()-interval '1 second' where v.token=f.token;
 begin
  perform public.td_confirm_history_delete_v55(token,'测试过期预览','确认关联删除');raise exception 'FAIL expired preview';
 exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 insert into v55_results values('PASS all six root types, no reverse parent cascade, exclusive customer, expired preview denied');
end $$;
select result from v55_results;
rollback;
