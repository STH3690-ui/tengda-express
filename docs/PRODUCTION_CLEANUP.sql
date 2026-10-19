-- Production TEST BUSINESS DATA cleanup only. Does not delete Auth users,
-- profiles, td_members, permissions, migrations or system configuration.
-- Run only after backups and real isolated-account + browser tests pass.
begin;
set local td.environment='tengda-v32-production';
set local td.project_ref='yvsgawbbnyeyvynwghsc';
DO $$ begin
 if current_setting('td.environment',true)<>'tengda-v32-production' or current_setting('td.project_ref',true)<>'yvsgawbbnyeyvynwghsc' then raise exception 'Wrong target';end if;
 if not exists(select 1 from public.td_members m join auth.users u on u.id=m.id where m.role='owner' and m.active and u.email_confirmed_at is not null and coalesce(u.encrypted_password,'')<>'') then raise exception 'A password-enabled active administrator must be retained';end if;
end $$;
create temporary table v32_protected_accounts as
select (select coalesce(jsonb_agg(jsonb_build_object('id',id,'role',role,'active',active,'username',username) order by id),'[]'::jsonb) from public.td_members) members,
       (select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from auth.users) auth_ids,
       (select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.profiles) profile_ids;
select set_config('request.jwt.claims','{}',true);
delete from public.td_order_hidden_v41;
delete from public.td_order_deletion_log;
delete from public.td_pickup_receipts_v32;
delete from public.td_pickup_v32_batches;
delete from public.td_pickup_batch_items;
delete from public.td_pickups;
delete from public.td_payments;
delete from public.td_parcels;
delete from public.td_orders;
delete from public.td_customer_archives;
delete from public.td_pickup_batches;
delete from public.td_customers;
DO $$ declare expected record;begin
 select * into expected from v32_protected_accounts;
 if expected.members is distinct from (select coalesce(jsonb_agg(jsonb_build_object('id',id,'role',role,'active',active,'username',username) order by id),'[]'::jsonb) from public.td_members)
 or expected.auth_ids is distinct from (select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from auth.users)
 or expected.profile_ids is distinct from (select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.profiles) then raise exception 'Protected account state changed; rollback required';end if;
end $$;
commit;
-- Stored test photos must be backed up and removed using Storage API, not SQL.
