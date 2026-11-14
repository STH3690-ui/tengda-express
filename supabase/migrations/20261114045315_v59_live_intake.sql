-- V59 additive adapter. No updates/deletes of existing business or financial records.
begin;
set local lock_timeout='5s';set local statement_timeout='60s';
do $$begin if to_regprocedure('public.td_label_intake_v58(uuid,jsonb,boolean)') is null then raise exception 'V58 required';end if;end$$;
create table td_private.live_requests_v59(
 request_id uuid primary key,actor uuid not null references auth.users(id),session_id uuid not null,
 customer_key text not null,label_digest text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
alter table td_private.live_requests_v59 enable row level security;
revoke all on td_private.live_requests_v59 from public,anon,authenticated;
create index live_digest_v59 on td_private.live_requests_v59(label_digest);
create index live_actor_customer_v59 on td_private.live_requests_v59(actor,customer_key,created_at);
create function td_private.live_station_phone_v59(p text) returns boolean language plpgsql stable security definer set search_path='' as $$declare hit boolean:=false;begin
 if to_regclass('public.td_station_addresses') is not null then
  execute $q$select exists(select 1 from public.td_station_addresses s cross join lateral regexp_split_to_table(coalesce(s.phones,''),'[,，;；/|\n]+') x(v) where td_private.label_phone_v58(x.v)=$1)$q$ into hit using p;
 end if;return hit;
end$$;
revoke all on function td_private.live_station_phone_v59(text) from public,anon,authenticated;
create function td_private.live_match_v59(n text,p text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare k text:=lower(regexp_replace(n,'[[:space:]]','','g'));total int;exact int;blocked boolean;stored text;begin
 select count(*),count(*) filter(where lower(regexp_replace(td_private.label_name_v58(x.name),'[[:space:]]','','g'))=k and td_private.label_phone_v58(x.phone)=p),bool_or(x.deleted_at is not null or exists(select 1 from public.td_customer_archives a where a.customer_id=x.id) or exists(select 1 from public.td_business_hidden_v54 h where h.source_table='td_customers' and h.source_id=x.id)) into total,exact,blocked from public.td_customers x where lower(regexp_replace(td_private.label_name_v58(x.name),'[[:space:]]','','g'))=k or td_private.label_phone_v58(x.phone)=p;
 if blocked or (total>0 and (total<>1 or exact<>1)) then return jsonb_build_object('status','review','reason','客户存在同名同号冲突或已归档，请人工核对');end if;
 if total=1 then select x.name into stored from public.td_customers x where lower(regexp_replace(td_private.label_name_v58(x.name),'[[:space:]]','','g'))=k and td_private.label_phone_v58(x.phone)=p;return jsonb_build_object('status','matched','canonical_name',stored,'reason','姓名与完整号码唯一匹配');end if;
 return jsonb_build_object('status','new','reason','无冲突，可按权限创建客户');
end$$;
revoke all on function td_private.live_match_v59(text,text) from public,anon,authenticated;
create function public.td_live_capabilities_v59() returns jsonb language plpgsql security definer set search_path='' as $$begin return public.td_label_capabilities_v58()||jsonb_build_object('version',59);end$$;
create function public.td_live_resolve_v59(p_name text,p_phone text,p_digest text,p_session uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare n text:=td_private.label_name_v58(p_name);p text:=td_private.label_phone_v58(p_phone);k text;begin
 perform td_private.scan_auth_v57('parcel_create');perform td_private.scan_auth_v57('customer_edit');
 if length(n) not between 2 and 60 or n~'[0-9<>:*×#]' or p='' or p_digest is null or p_digest!~'^[a-f0-9]{64}$' or p_session is null then raise exception '请核对末尾客户姓名和完整号码';end if;
 if td_private.live_station_phone_v59(p) then return jsonb_build_object('status','review','reason','该号码属于已配置站点或仓库，请核对地址末尾客户');end if;
 k:=md5(lower(regexp_replace(n,'[[:space:]]','','g'))||'|'||p);
 return td_private.live_match_v59(n,p)||jsonb_build_object('needs_distinct_confirmation',exists(select 1 from td_private.live_requests_v59 x where x.label_digest=p_digest or (x.actor=auth.uid() and x.customer_key=k and (x.session_id=p_session or x.created_at>now()-interval '15 minutes'))));
end$$;
create function public.td_live_intake_v59(p_request uuid,p_payload jsonb,p_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior td_private.live_requests_v59;s uuid;n text;p text;k text;d text;m jsonb;r jsonb;number text;begin
 perform td_private.scan_auth_v57('parcel_create');perform td_private.scan_auth_v57('customer_edit');
 if p_request is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception '无效入库请求';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,5902));
 select * into prior from td_private.live_requests_v59 where request_id=p_request;
 if found then if prior.actor<>auth.uid() or prior.payload<>p_payload then raise exception '请求编号已使用';end if;return prior.result;end if;
 s:=(p_payload->>'session_id')::uuid;d:=p_payload->>'label_digest';n:=td_private.label_name_v58(p_payload->>'name');p:=td_private.label_phone_v58(p_payload->>'phone');k:=md5(lower(regexp_replace(n,'[[:space:]]','','g'))||'|'||p);
 if s is null or d is null or d!~'^[a-f0-9]{64}$' then raise exception '缺少识别会话';end if;
 perform pg_advisory_xact_lock(hashtextextended('customer:'||k,5901));perform pg_advisory_xact_lock(hashtextextended('label:'||d,5901));
 m:=public.td_live_resolve_v59(n,p,d,s);
 if m->>'status'='review' then raise exception '%',m->>'reason';end if;
 if p_confirmed is distinct from true then
  if (m->>'needs_distinct_confirmation')::boolean then raise exception '同一面单或同客户近期已入库，请确认这是另一件包裹';end if;
  if coalesce(p_payload->>'stable_frames','')!~'^[3-9]$' or coalesce(p_payload->>'confidence','')!~'^(9[5-9]|100)(\.[0-9]+)?$' or coalesce(p_payload->>'min_confidence','')!~'^(9[0-9]|100)(\.[0-9]+)?$' or (p_payload->>'confidence')::numeric>100 or (p_payload->>'min_confidence')::numeric>100 then raise exception '识别不稳定，请手动核对';end if;
 end if;
 if m->>'status'='matched' then n:=m->>'canonical_name';end if;
 number:='TD59'||replace(p_request::text,'-','');
 r:=public.td_label_intake_v58(p_request,jsonb_build_object('name',n,'phone',p,'tracking_no',number,'pieces',1,'weight_kg',0,'allow_create',true),true);
 r:=r||jsonb_build_object('version',59,'parcel_number',number,'parcel',(select to_jsonb(x) from public.td_parcels x where x.id=(r->>'parcel_id')::uuid),'customer',jsonb_build_object('id',r->>'customer_id','name',n,'phone',p,'deleted_at',null));
 insert into td_private.live_requests_v59 values(p_request,auth.uid(),s,k,d,p_payload,r,now());return r;
end$$;
create function public.td_live_request_v59(p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 perform td_private.scan_auth_v57();if p_request is null then raise exception '请求编号必填';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,5902));
 select result into r from td_private.live_requests_v59 where request_id=p_request and actor=auth.uid();
 if r is null then r:=public.td_label_request_v58(p_request);end if;return r;
end$$;
do $$declare s text;begin foreach s in array array['td_live_capabilities_v59()','td_live_resolve_v59(text,text,text,uuid)','td_live_intake_v59(uuid,jsonb,boolean)','td_live_request_v59(uuid)'] loop execute 'revoke all on function public.'||s||' from public,anon';execute 'grant execute on function public.'||s||' to authenticated';end loop;end$$;
notify pgrst,'reload schema';commit;
