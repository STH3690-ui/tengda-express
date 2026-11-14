-- V62 additive unified intake; no existing business row migration.
begin;set local lock_timeout='5s';set local statement_timeout='60s';
do $$begin if to_regprocedure('public.td_scan_intake_v57(uuid,jsonb)') is null or to_regprocedure('td_private.live_match_v59(text,text)') is null then raise exception 'V57/V59 dependencies required';end if;end$$;
create table td_private.intake_requests_v62(request_id uuid primary key,actor uuid not null references auth.users(id),operation text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now());
alter table td_private.intake_requests_v62 enable row level security;
revoke all on td_private.intake_requests_v62 from public,anon,authenticated;
create function public.td_intake_v62(p_request uuid,p_payload jsonb,p_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior td_private.intake_requests_v62;c public.td_customers;n text;p text;tracking text;m jsonb;created boolean:=false;r jsonb;pieces int;weight numeric;notes text;begin
 perform td_private.scan_auth_v57('parcel_create');
 if p_request is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception '入库请求无效';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,6202));
 select * into prior from td_private.intake_requests_v62 where request_id=p_request;
 if found then if prior.actor<>auth.uid() or prior.operation<>'photo' or prior.payload<>p_payload then raise exception '请求编号已使用或已封存';end if;return prior.result;end if;
 if coalesce(p_payload->>'pieces','1')!~'^[1-9][0-9]{0,5}$' or coalesce(nullif(p_payload->>'weight_kg',''),'0')!~'^[0-9]{1,6}(\.[0-9]{1,3})?$' then raise exception '件数或重量不合法，重量最多3位小数';end if;
 pieces:=coalesce(p_payload->>'pieces','1')::int;weight:=coalesce(nullif(p_payload->>'weight_kg',''),'0')::numeric;notes:=coalesce(p_payload->>'notes','');
 if length(notes)>2000 or position('[TD_ORDER_IDS:' in notes)>0 then raise exception '备注无效或过长';end if;
 n:=td_private.label_name_v58(p_payload->>'name');p:=td_private.label_phone_v58(p_payload->>'phone');
 lock table public.td_business_hidden_v54,public.td_parcel_hidden_v51,public.td_order_hidden_v41,public.td_customer_archives in share mode;
 lock table public.td_customers in share row exclusive mode;
 if p_confirmed is distinct from true then
  perform td_private.scan_auth_v57('customer_edit');
  if coalesce(p_payload->>'label_digest','')!~'^[a-f0-9]{64}$' then raise exception '缺少照片识别信息';end if;
  if p_payload->>'shutter' is distinct from 'true' or p_payload->>'corrected' is distinct from 'false'
   or coalesce(p_payload->>'source_kind','') not in ('native_photo','system_photo','video_native')
   or coalesce(p_payload->>'source_width','')!~'^[0-9]{3,5}$' or coalesce(p_payload->>'source_height','')!~'^[0-9]{3,5}$'
   or greatest((p_payload->>'source_width')::int,(p_payload->>'source_height')::int)<1920 or least((p_payload->>'source_width')::int,(p_payload->>'source_height')::int)<1080
   or coalesce(p_payload->>'roi_width','')!~'^[0-9]{3,4}$' or (p_payload->>'roi_width')::int<800
   or coalesce(p_payload->>'roi_height','')!~'^[0-9]{3,4}$' or (p_payload->>'roi_height')::int<250
   or coalesce(p_payload->>'agreement_count','') not in ('2','3') or jsonb_typeof(p_payload->'ocr_variants') is distinct from 'array'
   or jsonb_array_length(p_payload->'ocr_variants')<>(p_payload->>'agreement_count')::int
   or (select count(distinct x) from jsonb_array_elements_text(p_payload->'ocr_variants') x where x in ('raw','enhanced','binary'))<>(p_payload->>'agreement_count')::int
   or coalesce(p_payload->>'confidence','')!~'^(9[5-9]|100)(\.[0-9]+)?$' or (p_payload->>'confidence')::numeric>100
   or coalesce(p_payload->>'min_confidence','')!~'^(9[0-9]|100)(\.[0-9]+)?$' or (p_payload->>'min_confidence')::numeric>100
   or p~'^1(62|65|67|70|71)' then raise exception '原始高清照片或多次识别不可靠，请人工核对';end if;
  if exists(select 1 from td_private.intake_requests_v62 x where x.operation='photo' and (x.payload->>'label_digest'=p_payload->>'label_digest' or (x.actor=auth.uid() and x.created_at>now()-interval '15 minutes' and td_private.label_phone_v58(x.payload->>'phone')=p))) then raise exception '近期同客户或同面单已入库，请确认是另一件';end if;
  if exists(select 1 from td_private.live_requests_v59 x where x.label_digest=p_payload->>'label_digest' or (x.actor=auth.uid() and x.customer_key=md5(lower(regexp_replace(n,'[[:space:]]','','g'))||'|'||p) and x.created_at>now()-interval '15 minutes')) then raise exception '近期同客户或面单已入库，请确认另一件';end if;
 end if;
 if nullif(p_payload->>'customer_id','') is not null then
  if p_confirmed is distinct from true then raise exception '选择客户后须人工确认';end if;
  select * into c from public.td_customers where id=(p_payload->>'customer_id')::uuid;
  if not found or c.deleted_at is not null or exists(select 1 from public.td_customer_archives a where a.customer_id=c.id) or exists(select 1 from public.td_business_hidden_v54 h where h.source_table='td_customers' and h.source_id=c.id) then raise exception '客户不可用';end if;
  if n<>'' and lower(regexp_replace(n,'[[:space:]]','','g'))<>lower(regexp_replace(td_private.label_name_v58(c.name),'[[:space:]]','','g')) then raise exception '姓名已修改，请重新匹配客户，不会覆盖原档案';end if;
  if coalesce(p_payload->>'phone','')<>'' and (not public.td_has_permission_v50('customer_edit') or coalesce(nullif(p,''),p_payload->>'phone')<>coalesce(nullif(td_private.label_phone_v58(c.phone),''),c.phone)) then raise exception '电话已修改，请重新匹配客户';end if;
 else
  perform td_private.scan_auth_v57('customer_edit');
  if length(n) not between 2 and 60 or n~'[0-9<>:*×#]' or p='' or td_private.live_station_phone_v59(p) then raise exception '请核对客户姓名和完整手机号，不能使用仓库号码';end if;
  m:=td_private.live_match_v59(n,p);if m->>'status'='review' then raise exception '%',m->>'reason';end if;
  if m->>'status'='new' then
   perform td_private.scan_auth_v57('customer_create');insert into public.td_customers(name,phone,notes,created_by) values(n,p,'统一入库创建 V62',auth.uid()) returning * into c;created:=true;
  else select * into c from public.td_customers where lower(regexp_replace(td_private.label_name_v58(name),'[[:space:]]','','g'))=lower(regexp_replace(n,'[[:space:]]','','g')) and td_private.label_phone_v58(phone)=p;end if;
 end if;
 tracking:=case when nullif(p_payload->>'tracking_no','') is null then 'TD62'||replace(p_request::text,'-','') else td_private.scan_valid_v57(p_payload->>'tracking_no') end;
 r:=public.td_scan_intake_v57(p_request,jsonb_build_array(jsonb_build_object('tracking_no',tracking,'customer_id',c.id,'pieces',pieces,'weight_kg',weight,'category',coalesce(nullif(p_payload->>'category',''),'普通包裹'),'notes',notes)));
 if (r->0->>'success')::boolean is distinct from true then raise exception '%',coalesce(r->0->>'error','入库失败');end if;
 r:=jsonb_build_object('version',62,'operation','intake','success',true,'parcel_id',r->0->>'parcel_id','customer_id',c.id,'customer_created',created,'tracking_no',tracking,'parcel_number',tracking,'parcel',(select to_jsonb(x) from public.td_parcels x where x.id=(r->0->>'parcel_id')::uuid),'customer',jsonb_build_object('id',c.id,'name',c.name,'phone',case when public.td_has_permission_v50('customer_edit') then c.phone else '' end,'deleted_at',null));
 insert into td_private.intake_requests_v62 values(p_request,auth.uid(),'photo',p_payload,r,now());return r;
end$$;
create function public.td_intake_batch_v62(p_request uuid,p_items jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior td_private.intake_requests_v62;x record;one jsonb;result jsonb:='[]';child uuid;begin
 perform td_private.scan_auth_v57('parcel_create');if p_request is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception '入库清单无效';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,6202));select * into prior from td_private.intake_requests_v62 where request_id=p_request;
 if found then if prior.actor<>auth.uid() or prior.operation<>'intake' or prior.payload<>p_items then raise exception '请求编号已使用或已封存';end if;return prior.result;end if;
 for x in select value item,ordinality-1 idx from jsonb_array_elements(p_items) with ordinality loop
  begin child:=md5(p_request::text||':'||x.idx::text)::uuid;one:=public.td_intake_v62(child,x.item,true)||jsonb_build_object('index',x.idx);
  exception when others then one:=jsonb_build_object('index',x.idx,'tracking_no',x.item->>'tracking_no','success',false,'error',sqlerrm);end;
  result:=result||jsonb_build_array(one);
 end loop;
 insert into td_private.intake_requests_v62 values(p_request,auth.uid(),'intake',p_items,result,now());return result;
end$$;
create function public.td_intake_request_v62(p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior td_private.intake_requests_v62;v jsonb;begin
 perform td_private.scan_auth_v57();if p_request is null then raise exception '请求编号必填';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,6202));select * into prior from td_private.intake_requests_v62 where request_id=p_request;
 if found then if prior.actor<>auth.uid() then raise exception '无权读取此请求';end if;if prior.operation='cancelled' then return null;end if;return case when prior.operation='photo' then prior.result else jsonb_build_object('operation',prior.operation,'result',prior.result) end;end if;
 -- Preserve recovery of existing V57/V59/V61 pending requests during upgrade.
 v:=public.td_scan_request_v57(p_request);if v is null then v:=public.td_live_request_v59(p_request);end if;
 if v is null then insert into td_private.intake_requests_v62 values(p_request,auth.uid(),'cancelled','{}','{}',now());end if;return v;
end$$;
do $$declare sig text;begin foreach sig in array array['td_intake_v62(uuid,jsonb,boolean)','td_intake_batch_v62(uuid,jsonb)','td_intake_request_v62(uuid)'] loop execute 'revoke all on function public.'||sig||' from public,anon';execute 'grant execute on function public.'||sig||' to authenticated';end loop;end$$;
notify pgrst,'reload schema';commit;
