-- V58 incremental only. Requires the installed V57 transaction adapter.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin
 if to_regprocedure('public.td_scan_intake_v57(uuid,jsonb)') is null or to_regprocedure('public.td_scan_checkout_v57(uuid,jsonb,boolean)') is null then raise exception 'V57 prerequisites missing';end if;
end$$;
create table td_private.label_requests_v58(
 request_id uuid primary key,actor uuid not null references auth.users(id),operation text not null,
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
alter table td_private.label_requests_v58 enable row level security;
revoke all on td_private.label_requests_v58 from public,anon,authenticated;
create function td_private.label_phone_v58(v text) returns text language plpgsql immutable set search_path='' as $$
declare p text:=btrim(normalize(coalesce(v,''),NFKC));begin
 if p ~ '[^+0-9[:space:]()-]' then return '';end if;
 p:=regexp_replace(p,'[[:space:]()-]','','g');
 if p like '0095%' then p:='0'||substring(p from 5);elsif p like '+95%' then p:='0'||substring(p from 4);elsif p ~ '^959[0-9]{7,9}$' then p:='0'||substring(p from 3);end if;
 if p like '+86%' then p:=substring(p from 4);end if;
 if p !~ '^(09[0-9]{7,9}|1[3-9][0-9]{9}|\+[1-9][0-9]{7,14})$' then return '';end if;return p;
end$$;
create function td_private.label_name_v58(v text) returns text language sql immutable set search_path='' as $$select btrim(normalize(coalesce(v,''),NFKC))$$;
create function td_private.label_match_v58(n text,p text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare total integer;exact integer;c uuid;blocked boolean;begin
 select count(*),count(*) filter(where td_private.label_name_v58(x.name)=n and td_private.label_phone_v58(x.phone)=p),
 bool_or(x.deleted_at is not null or exists(select 1 from public.td_customer_archives a where a.customer_id=x.id) or exists(select 1 from public.td_business_hidden_v54 h where h.source_table='td_customers' and h.source_id=x.id))
 into total,exact,blocked from public.td_customers x where td_private.label_name_v58(x.name)=n or td_private.label_phone_v58(x.phone)=p;
 if blocked then return jsonb_build_object('status','review','reason','有关客户已删除或归档，请管理员核对');end if;
 if total=1 and exact=1 then select id into c from public.td_customers where td_private.label_name_v58(name)=n and td_private.label_phone_v58(phone)=p;return jsonb_build_object('status','matched','customer_id',c,'reason','姓名和完整手机号唯一匹配');end if;
 if total>0 then return jsonb_build_object('status','review','reason','存在同名、同号或多客户冲突，必须人工核对');end if;
 return jsonb_build_object('status','new','reason','未找到无冲突客户，可在授权后创建');
end$$;
create function public.td_label_capabilities_v58() returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform td_private.scan_auth_v57();return jsonb_build_object('version',58,'intake',public.td_has_permission_v50('parcel_create') and public.td_has_permission_v50('customer_edit'),'create_customer',public.td_has_permission_v50('customer_create'),'parcel_edit',public.td_has_permission_v50('parcel_edit'));
end$$;
create function public.td_label_resolve_v58(p_name text,p_phone text,p_tracking text) returns jsonb language plpgsql security definer set search_path='' as $$
declare n text:=td_private.label_name_v58(p_name);p text:=td_private.label_phone_v58(p_phone);k text;begin
 perform td_private.scan_auth_v57('parcel_create');perform td_private.scan_auth_v57('customer_edit');
 k:=td_private.scan_valid_v57(p_tracking);
 if length(k)<8 or length(n) not between 2 and 60 or n ~ '[0-9<>:*×#]' or p='' then return jsonb_build_object('status','review','reason','姓名、完整手机号或运单无效，需人工核对');end if;
 if exists(select 1 from public.td_parcels x where x.tracking_no<>'' and td_private.scan_key_v57(x.tracking_no)=k) then return jsonb_build_object('status','review','reason','运单已登记或存在历史重复，禁止再次入库');end if;
 return td_private.label_match_v58(n,p);
end$$;
create function public.td_label_intake_v58(p_request uuid,p_payload jsonb,p_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior td_private.label_requests_v58;n text;p text;k text;m jsonb;r jsonb;c uuid;created boolean:=false;begin
 perform td_private.scan_auth_v57('parcel_create');perform td_private.scan_auth_v57('customer_edit');
 if p_request is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception '请求或清单无效';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,5802));
 select * into prior from td_private.label_requests_v58 where request_id=p_request;
 if found then if prior.actor<>auth.uid() or prior.operation<>'intake' or prior.payload<>p_payload then raise exception '请求编号已用于其他操作';end if;return prior.result;end if;
 if p_confirmed is distinct from true then
  if (p_payload->>'automatic')::boolean is distinct from true or coalesce(p_payload->>'confidence','') !~ '^(9[7-9]|100)(\.[0-9]+)?$' or coalesce(p_payload->>'min_confidence','') !~ '^(9[0-9]|100)(\.[0-9]+)?$' or (p_payload->>'confidence')::numeric>100 or (p_payload->>'min_confidence')::numeric>100 or p_payload->>'barcode' is distinct from p_payload->>'tracking_no' then raise exception '不确定识别必须人工核对确认';end if;
 end if;
 n:=td_private.label_name_v58(p_payload->>'name');p:=td_private.label_phone_v58(p_payload->>'phone');k:=td_private.scan_valid_v57(p_payload->>'tracking_no');
 if length(k)<8 or length(n) not between 2 and 60 or n ~ '[0-9<>:*×#]' or p='' then raise exception '隐藏号码、姓名或运单无效，禁止自动关联';end if;
 if coalesce(p_payload->>'pieces','') !~ '^[1-9][0-9]{0,5}$' or coalesce(p_payload->>'weight_kg','') !~ '^[0-9]{1,6}(\.[0-9]{1,3})?$' then raise exception '件数或重量不合法';end if;
 lock table public.td_business_hidden_v54,public.td_parcel_hidden_v51,public.td_order_hidden_v41,public.td_customer_archives in share mode;
 lock table public.td_customers in share row exclusive mode;
 perform pg_advisory_xact_lock(hashtextextended('name:'||n,5801));perform pg_advisory_xact_lock(hashtextextended('phone:'||p,5801));
 m:=td_private.label_match_v58(n,p);
 if m->>'status'='review' then raise exception '%',m->>'reason';end if;
 if m->>'status'='new' then
  perform td_private.scan_auth_v57('customer_create');if (p_payload->>'allow_create')::boolean is distinct from true then raise exception '新客户必须明确允许创建';end if;
  insert into public.td_customers(name,phone,notes,created_by) values(n,p,'面单入库创建 V58',auth.uid()) returning id into c;created:=true;
 else c:=(m->>'customer_id')::uuid;end if;
 r:=public.td_scan_intake_v57(p_request,jsonb_build_array(jsonb_build_object('tracking_no',k,'customer_id',c,'pieces',(p_payload->>'pieces')::int,'weight_kg',(p_payload->>'weight_kg')::numeric,'category','普通包裹','notes','面单识别 V58')));
 if (r->0->>'success')::boolean is distinct from true then raise exception '%',coalesce(r->0->>'error','入库失败');end if;
 r:=jsonb_build_object('operation','intake','success',true,'parcel_id',r->0->>'parcel_id','customer_id',c,'customer_created',created,'tracking_no',k);
 insert into td_private.label_requests_v58 values(p_request,auth.uid(),'intake',p_payload,r,now());return r;
end$$;
create function td_private.parcel_snapshot_v58(p public.td_parcels) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('tracking_no',p.tracking_no,'description',p.description,'category',p.category,'weight_kg',p.weight_kg,'fee_per_kg',p.fee_per_kg,'fee_per_piece',p.fee_per_piece,'notes',p.notes,'pieces',p.pieces,'remaining',p.remaining,'customer_id',p.customer_id,'order_id',p.order_id)$$;
create function public.td_parcel_edit_v58(p_request uuid,p_parcel uuid,p_expected jsonb,p_changes jsonb,p_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior td_private.label_requests_v58;payload jsonb:=jsonb_build_object('parcel_id',p_parcel,'expected',p_expected,'changes',p_changes);p public.td_parcels;r jsonb;key text;begin
 perform td_private.scan_auth_v57('parcel_edit');
 if p_request is null or p_confirmed is distinct from true or jsonb_typeof(p_changes) is distinct from 'object' then raise exception '编辑必须确认并提供请求编号';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,5802));select * into prior from td_private.label_requests_v58 where request_id=p_request;
 if found then if prior.actor<>auth.uid() or prior.operation<>'edit' or prior.payload<>payload then raise exception '请求编号已用于其他操作';end if;return prior.result;end if;
 lock table public.td_business_hidden_v54,public.td_parcel_hidden_v51,public.td_order_hidden_v41,public.td_customer_archives in share mode;
 select * into p from public.td_parcels where id=p_parcel for update;
 if not found or td_private.scan_hidden_v57(p) then raise exception '包裹不可编辑';end if;
 if p.remaining<>p.pieces or exists(select 1 from public.td_pickups where parcel_id=p.id) or exists(select 1 from public.td_pickup_batch_items where parcel_id=p.id) then raise exception '已有取件关联，不能修改入库数据或原账目';end if;
 if td_private.parcel_snapshot_v58(p) is distinct from p_expected then raise exception '包裹已变化，请刷新后重新编辑';end if;
 if exists(select 1 from jsonb_object_keys(p_changes) x where x not in ('tracking_no','description','category','weight_kg','fee_per_kg','fee_per_piece','notes')) then raise exception '不允许修改客户、件数、剩余或关联记录';end if;
 key:=p_changes->>'tracking_no';if key<>'' then key:=td_private.scan_valid_v57(key);end if;
 if key is null or length(coalesce(p_changes->>'description',''))>500 or length(coalesce(p_changes->>'category',''))>80 or length(coalesce(p_changes->>'notes',''))>2000 then raise exception '编辑内容无效';end if;
 if coalesce(p_changes->>'weight_kg','') !~ '^[0-9]{1,6}(\.[0-9]{1,3})?$' or coalesce(p_changes->>'fee_per_kg','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' or coalesce(p_changes->>'fee_per_piece','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception '重量或收费无效';end if;
 update public.td_parcels set tracking_no=key,description=coalesce(p_changes->>'description',''),category=coalesce(p_changes->>'category',''),notes=coalesce(p_changes->>'notes',''),weight_kg=(p_changes->>'weight_kg')::numeric,fee_per_kg=(p_changes->>'fee_per_kg')::numeric,fee_per_piece=(p_changes->>'fee_per_piece')::numeric where id=p.id;
 r:=jsonb_build_object('operation','edit','success',true,'parcel_id',p.id);insert into td_private.label_requests_v58 values(p_request,auth.uid(),'edit',payload,r,now());return r;
end$$;
create function public.td_label_request_v58(p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 perform td_private.scan_auth_v57();if p_request is null then raise exception '请求编号必填';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,5802));
 select result into r from td_private.label_requests_v58 where request_id=p_request and actor=auth.uid() and operation in ('intake','edit');
 if r is null then insert into td_private.label_requests_v58 values(p_request,auth.uid(),'cancelled','{}','{}',now()) on conflict do nothing;end if;return r;
end$$;
revoke all on function td_private.label_phone_v58(text),td_private.label_name_v58(text),td_private.label_match_v58(text,text),td_private.parcel_snapshot_v58(public.td_parcels) from public,anon,authenticated;
do $$declare s text;begin foreach s in array array['td_label_capabilities_v58()','td_label_resolve_v58(text,text,text)','td_label_intake_v58(uuid,jsonb,boolean)','td_parcel_edit_v58(uuid,uuid,jsonb,jsonb,boolean)','td_label_request_v58(uuid)'] loop execute 'revoke all on function public.'||s||' from public,anon';execute 'grant execute on function public.'||s||' to authenticated';end loop;end$$;
notify pgrst,'reload schema';
commit;
