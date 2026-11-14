-- V61 manual HD photo adapter. Adds no business table and changes no existing rows/functions.
begin;set local lock_timeout='5s';set local statement_timeout='60s';
do $$begin if to_regprocedure('public.td_live_intake_v59(uuid,jsonb,boolean)') is null then raise exception 'V59 required';end if;end$$;
create function public.td_photo_intake_v61(p_request uuid,p_payload jsonb,p_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior td_private.live_requests_v59;n text;p text;k text;d text;s uuid;m jsonb;prepared jsonb;r jsonb;begin
 perform td_private.scan_auth_v57('parcel_create');perform td_private.scan_auth_v57('customer_edit');
 if p_request is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception '无效冻结入库请求';end if;
 prepared:=p_payload||jsonb_build_object('mode','manual_shutter_v61','stable_frames',0);
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,5902));
 select * into prior from td_private.live_requests_v59 where request_id=p_request;
 if found then if prior.actor<>auth.uid() or prior.payload<>prepared then raise exception '请求编号已使用';end if;return prior.result||jsonb_build_object('version',61);end if;
 n:=td_private.label_name_v58(p_payload->>'name');p:=td_private.label_phone_v58(p_payload->>'phone');d:=p_payload->>'label_digest';s:=(p_payload->>'session_id')::uuid;
 if d is null or d!~'^[a-f0-9]{64}$' or s is null then raise exception '缺少冻结识别信息';end if;
 k:=md5(lower(regexp_replace(n,'[[:space:]]','','g'))||'|'||p);
 perform pg_advisory_xact_lock(hashtextextended('customer:'||k,5901));perform pg_advisory_xact_lock(hashtextextended('label:'||d,5901));
 lock table public.td_customers in share row exclusive mode;
 m:=public.td_live_resolve_v59(n,p,d,s);if m->>'status'='review' then raise exception '%',m->>'reason';end if;
 if p_confirmed is distinct from true then
  if (m->>'needs_distinct_confirmation')::boolean then raise exception '相同面单或同客户近期已入库，请确认这是另一件';end if;
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
 end if;
 -- V61 validates a manual shutter and distinct agreeing OCR variants, never stability. Delegate ledger/idempotency to V59.
 r:=public.td_live_intake_v59(p_request,prepared,true);return r||jsonb_build_object('version',61);
end$$;
revoke all on function public.td_photo_intake_v61(uuid,jsonb,boolean) from public,anon;
grant execute on function public.td_photo_intake_v61(uuid,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';commit;
