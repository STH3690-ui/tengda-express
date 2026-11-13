-- REVIEW ONLY. NOT part of V57; requires separate approval before production use.
-- Least-privilege repair for legacy marker tables. RLS does not restrict TRUNCATE.
-- This narrowly removes those privileges; it does not change any rows or RLS.
-- Retained for review and isolated regression, not automatic deployment.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
revoke truncate on public.td_parcel_hidden_v51,public.td_pickup_hidden_v53 from authenticated;
do $$begin
 if has_table_privilege('authenticated','public.td_parcel_hidden_v51','TRUNCATE')
 or has_table_privilege('authenticated','public.td_pickup_hidden_v53','TRUNCATE') then
  raise exception 'TRUNCATE still inherited: stop and review role grants';
 end if;
end$$;
commit;
