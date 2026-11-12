-- TEST PROJECT ONLY. All synthetic fixtures, trigger injection and mutations ROLLBACK.
begin;
create temp table v56_results(result text);
do $$
<<f>>
declare
 owner_id uuid:=gen_random_uuid();staff_id uuid:=gen_random_uuid();c uuid:=gen_random_uuid();
 live_o uuid:=gen_random_uuid();keep_o uuid:=gen_random_uuid();gone_o uuid:=gen_random_uuid();empty_o uuid:=gen_random_uuid();
 gone_parcel uuid:=gen_random_uuid();gone_pickup uuid:=gen_random_uuid();
 p uuid:=gen_random_uuid();shared_p uuid:=gen_random_uuid();orphan_p uuid:=gen_random_uuid();u uuid:=gen_random_uuid();
 independent uuid:=gen_random_uuid();pay uuid:=gen_random_uuid();orphan_pay uuid:=gen_random_uuid();
 entries jsonb;req uuid:=gen_random_uuid();result jsonb;retry jsonb;markers bigint;histories bigint;k record;
begin
 perform set_config('request.jwt.claim.role','service_role',true);
 insert into public.td_members(id,display_name,role,active) values(owner_id,'V56 fixture owner','owner',true),(staff_id,'V56 fixture staff','staff',true);
 perform set_config('request.jwt.claim.role','authenticated',true);perform set_config('request.jwt.claim.sub',owner_id::text,true);
 insert into public.td_customers(id,name) values(c,'V56 fixture shared');
 insert into public.td_orders(id,customer_id,item_name,quantity,total_price) values(live_o,c,'V56 delete',1,100),(keep_o,c,'V56 protected',1,200);
 insert into public.td_parcels(id,customer_id,order_id,pieces,remaining,notes) values(p,c,live_o,2,1,''),(shared_p,c,live_o,2,2,'[TD_ORDER_IDS:'||live_o||','||keep_o||']');
 insert into public.td_pickups(id,parcel_id,pieces,receiver_name) values(u,p,1,'V56 fixture');
 insert into public.td_payments(id,customer_id,order_id,amount,direction) values(pay,c,live_o,100,'收款'),(independent,c,null,50,'收款');
 -- Reproduce historical NOT VALID/dangling FK data without deleting any source fixture.
 -- Temporarily remove only test-project order FKs in this transaction; ROLLBACK restores them.
 for k in select c.relname,t.conname from pg_constraint t join pg_class c on c.oid=t.conrelid where t.contype='f' and t.confrelid='public.td_orders'::regclass and c.relname in ('td_parcels','td_payments') loop
 execute format('alter table public.%I drop constraint %I',k.relname,k.conname);
 end loop;
 insert into public.td_parcels(id,customer_id,order_id,pieces,remaining) values(orphan_p,c,gone_o,1,1);
 insert into public.td_payments(id,customer_id,order_id,amount,direction) values(orphan_pay,c,gone_o,10,'付款');

 for k in select c.relname,t.conname from pg_constraint t join pg_class c on c.oid=t.conrelid where t.contype='f' and t.confrelid='public.td_parcels'::regclass and c.relname='td_pickups' loop
 execute format('alter table public.%I drop constraint %I',k.relname,k.conname);
 end loop;
 insert into public.td_pickups(id,parcel_id,pieces,receiver_name) values(gone_pickup,gone_parcel,1,'V56 orphan pickup');
 insert into public.td_business_hidden_v54(source_table,source_id,reason,hidden_by,batch_id,snapshot)
 values('td_parcels',gone_parcel,'历史缺失包裹',owner_id,gen_random_uuid(),jsonb_build_object('order_id',keep_o));
 insert into public.td_order_deletion_log(order_id,deleted_by,snapshot) values(live_o,owner_id,jsonb_build_object('id',live_o)),(gone_o,owner_id,jsonb_build_object('customer_id',c,'item_name','Old snapshot must not infer relations')),(empty_o,owner_id,jsonb_build_object('customer_id',c,'parcel_id',shared_p));
 entries:=jsonb_build_array(jsonb_build_object('table','td_orders','id',live_o),jsonb_build_object('table','td_orders','id',gone_o),jsonb_build_object('table','td_orders','id',empty_o),jsonb_build_object('table','td_parcels','id',gone_parcel));
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 begin
  perform public.td_delete_history_batch_v56(entries,'测试员工越权',true,req);raise exception 'FAIL staff allowed';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 begin
  perform public.td_delete_history_batch_v56(entries,'测试未确认',false,req);raise exception 'FAIL unconfirmed';
 exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin
  perform public.td_delete_history_batch_v56(entries,'短',true,req);raise exception 'FAIL short reason';
 exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 insert into v56_results values('PASS database enforces administrator, shared reason and confirmation');
 begin
  perform public.td_delete_history_batch_v56(entries||jsonb_build_array(jsonb_build_object('table','td_orders','id',gen_random_uuid())),'测试非法历史',true,req);raise exception 'FAIL invalid history';
 exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 if exists(select 1 from public.td_business_hidden_v54 where source_id=live_o) then raise exception 'FAIL partial batch';end if;
 -- Inject failure after core V54 markers: all business/history/idempotency writes must roll back.
 begin
  execute 'create function pg_temp.v56_fail() returns trigger language plpgsql as $t$begin raise exception ''V56 injected failure'';end$t$';
  execute 'create trigger v56_fail before insert on public.td_history_hidden_v56 for each row execute function pg_temp.v56_fail()';
  perform public.td_delete_history_batch_v56(entries,'统一测试原因',true,req);raise exception 'FAIL injected failure not reached';
 exception when raise_exception then if sqlerrm<>'V56 injected failure' then raise;end if;end;
 if exists(select 1 from public.td_business_hidden_v54 where source_id=live_o) or exists(select 1 from public.td_history_hidden_v56 where source_id=live_o) or exists(select 1 from td_private.history_requests_v56 where request_id=req) then raise exception 'FAIL late rollback';end if;
 insert into v56_results values('PASS invalid history and late injected failure roll back entire mixed batch');
 result:=public.td_delete_history_batch_v56(entries,'统一测试原因',true,req);
 if not exists(select 1 from public.td_history_hidden_v56 where source_id=empty_o) or not exists(select 1 from public.td_history_hidden_v56 where source_id=gone_o) then raise exception 'FAIL missing original history';end if;
 if not exists(select 1 from public.td_business_hidden_v54 where source_id=gone_pickup) then raise exception 'FAIL missing parcel exact pickup FK';end if;
 if not exists(select 1 from public.td_business_hidden_v54 where source_id=orphan_p) or not exists(select 1 from public.td_business_hidden_v54 where source_id=orphan_pay) then raise exception 'FAIL exact orphan FK links';end if;
 if exists(select 1 from public.td_business_hidden_v54 where source_id in(keep_o,shared_p,independent,c)) then raise exception 'FAIL protected normal business';end if;
 if not exists(select 1 from public.td_history_hidden_v56 where source_id=p) or not exists(select 1 from public.td_history_hidden_v56 where source_id=pay) then raise exception 'FAIL replacement cascade history cards';end if;
 if exists(select 1 from public.td_history_hidden_v56 where request_id=req and reason<>'统一测试原因') then raise exception 'FAIL multiple reasons';end if;
 insert into v56_results values('PASS mixed existing/missing roots, empty history cleanup, exact orphan FK relations, shared/independent protection and one reason');
 select count(*) into markers from public.td_business_hidden_v54;select count(*) into histories from public.td_history_hidden_v56;
 retry:=public.td_delete_history_batch_v56(entries,'统一测试原因',true,req);
 if result<>retry or markers<>(select count(*) from public.td_business_hidden_v54) then raise exception 'FAIL retry idempotence';end if;
 result:=public.td_delete_history_batch_v56(entries,'重新勾选删除',true,gen_random_uuid());
 if (result->>'business_hidden')::int<>0 or (result->>'history_hidden')::int<>0 then raise exception 'FAIL repeat changes';end if;
 if (select remaining from public.td_parcels where id=p)<>1 or (select amount from public.td_payments where id=pay)<>100 then raise exception 'FAIL original inventory/money';end if;
 if (select count(*) from public.td_order_deletion_log where order_id in(live_o,gone_o,empty_o))<>3 then raise exception 'FAIL original audit logs erased';end if;
 insert into v56_results values('PASS same/new request idempotence, persistent history suppression and original inventory/money/audit preservation');
end $$;
select result from v56_results;
rollback;
