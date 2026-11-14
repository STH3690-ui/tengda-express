-- ONLY isolated tengda-v32-test / amknufvdvqfhrgtobpwg. Synthetic fixtures roll back.
begin;
set local statement_timeout='25s';set local lock_timeout='3s';set local plpgsql.check_asserts='on';
select set_config('request.jwt.claim.role','service_role',true);
do $$declare o uuid:=gen_random_uuid();s uuid:=gen_random_uuid();begin
 insert into auth.users(id,email) values(o,'v61-'||o||'@example.invalid'),(s,'v61-'||s||'@example.invalid');
 insert into public.td_members(id,display_name,role,active,permissions) values(o,'V61 isolated owner','owner',true,'{}'),(s,'V61 isolated staff','staff',true,'{}');
 perform set_config('v61.owner',o::text,true);perform set_config('v61.staff',s::text,true);perform set_config('request.jwt.claim.sub',o::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
end$$;
set local role authenticated;
do $$declare p jsonb; r jsonb;second jsonb;req uuid:=gen_random_uuid();rejected boolean;checkout jsonb;bid uuid;before_count bigint;begin
 p:=jsonb_build_object('name','Photo HD Test','phone','09929292921','session_id',gen_random_uuid(),'label_digest',repeat('6',64),'shutter',true,'source_kind','native_photo','source_width',4032,'source_height',3024,'roi_width',2400,'roi_height',1400,'agreement_count',2,'ocr_variants',jsonb_build_array('raw','enhanced'),'confidence',98,'min_confidence',95,'corrected',false);
 r:=public.td_photo_intake_v61(req,p,false);assert (r->>'version')::int=61;assert (r->'parcel'->>'pieces')::int=1;assert (r->'parcel'->>'weight_kg')::numeric=0;
 assert public.td_photo_intake_v61(req,p,false)=r,'idempotency';
 rejected:=false;begin perform public.td_photo_intake_v61(gen_random_uuid(),p,false);exception when others then rejected:=true;end;assert rejected,'duplicate label';
 rejected:=false;begin perform public.td_photo_intake_v61(gen_random_uuid(),p||'{"confidence":20,"phone":"09929292922","name":"Photo Blur"}',false);exception when others then rejected:=true;end;assert rejected,'low OCR confidence';
 second:=public.td_photo_intake_v61(gen_random_uuid(),p||jsonb_build_object('label_digest',repeat('7',64)),true);assert second->>'customer_id'=r->>'customer_id','match existing customer';
 assert jsonb_array_length(public.td_scan_lookup_v57(r->>'parcel_number','query'))=1,'generated number query';
 checkout:=public.td_scan_checkout_v57(gen_random_uuid(),jsonb_build_object('customer_id',r->>'customer_id','items',jsonb_build_array(jsonb_build_object('parcel_id',r->>'parcel_id','pieces',1),jsonb_build_object('parcel_id',second->>'parcel_id','pieces',1)),'weight',2,'rate',7000,'paid',5000,'method','现金','name','V61 synthetic receiver'),true);bid:=(checkout->>'batch_id')::uuid;
 assert (select receivable_mmk=14000 and paid_mmk=5000 and due_mmk=9000 from public.td_pickup_balances_authorized_v50() where batch_id=bid),'unified weight and debt';
 select count(*) into before_count from public.td_customers;
 begin perform public.td_photo_intake_v61(gen_random_uuid(),p||'{"name":"Photo Rollback","phone":"09929292923","label_digest":"8888888888888888888888888888888888888888888888888888888888888888"}',false);raise exception 'injected after intake';exception when others then assert sqlerrm='injected after intake';end;
 assert (select count(*) from public.td_customers)=before_count,'failed subtransaction rolled back customer and parcel';
 perform set_config('request.jwt.claim.sub',current_setting('v61.staff'),true);rejected:=false;begin perform public.td_photo_intake_v61(gen_random_uuid(),p,true);exception when others then rejected:=true;end;assert rejected,'staff authorization';
end$$;
reset role;
select 'PASS V61 hosted: HD intake, default one/zero weight, matching, repeat guard, confidence, unified pickup/debt 14000/5000/9000, rollback, staff isolation; fixtures rolled back' result;
rollback;
