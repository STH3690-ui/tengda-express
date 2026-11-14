-- Correct legacy photo status precedence and retain legacy lock order; no business writes.
begin;set local lock_timeout='5s';set local statement_timeout='60s';
create or replace function public.td_intake_request_v62(p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior td_private.intake_requests_v62;v jsonb;begin
 perform td_private.scan_auth_v57();if p_request is null then raise exception '请求编号必填';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,6202));select * into prior from td_private.intake_requests_v62 where request_id=p_request;
 if found then if prior.actor<>auth.uid() then raise exception '无权读取此请求';end if;if prior.operation='cancelled' then return null;end if;return case when prior.operation='photo' then prior.result else jsonb_build_object('operation',prior.operation,'result',prior.result) end;end if;
 -- Preserve recovery of existing V57/V59/V61 pending requests during upgrade.
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,5902));perform pg_advisory_xact_lock(hashtextextended(p_request::text,5802));
 if exists(select 1 from td_private.live_requests_v59 where request_id=p_request and actor=auth.uid()) then v:=public.td_live_request_v59(p_request);
 else v:=public.td_scan_request_v57(p_request);if v is null then v:=public.td_live_request_v59(p_request);end if;end if;
 if v is null then insert into td_private.intake_requests_v62 values(p_request,auth.uid(),'cancelled','{}','{}',now());end if;return v;
end$$;
revoke all on function public.td_intake_request_v62(uuid) from public,anon;grant execute on function public.td_intake_request_v62(uuid) to authenticated;
notify pgrst,'reload schema';commit;
