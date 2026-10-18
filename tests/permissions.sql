-- Run only on the VERIFIED tengda-v32-test connection AFTER the migration.
-- Fixtures are rolled back. Requires SQL maintenance privileges, not a browser JWT.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_setting('td.environment',true) is distinct from 'tengda-v32-test' then
    raise exception 'Verified TEST connection required';
  end if;
end $$;
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','',true);
insert into auth.users(id,email,raw_user_meta_data) values
 ('f3200000-0000-4000-8000-000000000001','v32-owner-fixture@supabase.co','{"display_name":"V32 test owner"}'),
 ('f3200000-0000-4000-8000-000000000002','v32-staff-fixture@supabase.co','{"display_name":"V32 test staff"}');
insert into public.td_members(id,display_name,role,active) values
 ('f3200000-0000-4000-8000-000000000001','V32 test owner','staff',false),
 ('f3200000-0000-4000-8000-000000000002','V32 test staff','staff',false)
on conflict(id) do nothing;
update public.td_members set role='owner',active=true where id='f3200000-0000-4000-8000-000000000001';
update public.td_members set role='staff',active=true where id='f3200000-0000-4000-8000-000000000002';
insert into public.td_customers(id,name,phone,notes,created_by) values
 ('f3200000-0000-4000-8000-000000000011','V32 live fixture','','','f3200000-0000-4000-8000-000000000001'),
 ('f3200000-0000-4000-8000-000000000012','V32 deleted fixture','','','f3200000-0000-4000-8000-000000000001'),
 ('f3200000-0000-4000-8000-000000000013','V32 archive fixture','','','f3200000-0000-4000-8000-000000000001');
update public.td_customers set deleted_at=now() where id='f3200000-0000-4000-8000-000000000012';

create function pg_temp.expect_unchanged(p_table regclass,p_where text,p_statement text) returns void
language plpgsql as $$ declare before_row jsonb; after_row jsonb; begin
  execute format('select jsonb_agg(to_jsonb(t)) from %s t where %s',p_table,p_where) into before_row;
  begin execute p_statement; exception when others then null; end;
  execute format('select jsonb_agg(to_jsonb(t)) from %s t where %s',p_table,p_where) into after_row;
  if before_row is distinct from after_row then raise exception 'UNAUTHORIZED CHANGE: %',p_statement; end if;
end $$;
create function pg_temp.expect_denied(p_statement text) returns void
language plpgsql as $$ begin
  begin execute p_statement; exception when insufficient_privilege then return; end;
  raise exception 'Expected permission denial: %',p_statement;
end $$;

-- Exercise the EXISTING archive RPC as an owner; this also checks legacy compatibility.
select set_config('request.jwt.claims','{"sub":"f3200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.td_owner_archive_customer_v29('f3200000-0000-4000-8000-000000000013');

-- Active staff: create/edit works, destructive operations cannot change any row.
select set_config('request.jwt.claims','{"sub":"f3200000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into public.td_customers(id,name,created_by) values
 ('f3200000-0000-4000-8000-000000000014','V32 staff creation','f3200000-0000-4000-8000-000000000002');
update public.td_customers set name='V32 staff edit',phone='123',notes='allowed'
 where id='f3200000-0000-4000-8000-000000000011';
do $$ begin
  if not exists(select 1 from public.td_customers where id='f3200000-0000-4000-8000-000000000011' and name='V32 staff edit') then
    raise exception 'Staff edit failed'; end if;
end $$;
select pg_temp.expect_unchanged('public.td_customers','id=''f3200000-0000-4000-8000-000000000011''',
 $$delete from public.td_customers where id='f3200000-0000-4000-8000-000000000011'$$);
select pg_temp.expect_unchanged('public.td_customers','id=''f3200000-0000-4000-8000-000000000011''',
 $$update public.td_customers set deleted_at=now() where id='f3200000-0000-4000-8000-000000000011'$$);
select pg_temp.expect_unchanged('public.td_customers','id=''f3200000-0000-4000-8000-000000000011''',
 $$select public.td_soft_delete_customer_v31('f3200000-0000-4000-8000-000000000011')$$);
select pg_temp.expect_unchanged('public.td_customers','id=''f3200000-0000-4000-8000-000000000012''',
 $$update public.td_customers set deleted_at=null where id='f3200000-0000-4000-8000-000000000012'$$);
select pg_temp.expect_unchanged('public.td_customers','id=''f3200000-0000-4000-8000-000000000012''',
 $$select public.td_restore_customer_v31('f3200000-0000-4000-8000-000000000012')$$);
select pg_temp.expect_unchanged('public.td_customers','id=''f3200000-0000-4000-8000-000000000013''',
 $$update public.td_customers set name='unauthorized' where id='f3200000-0000-4000-8000-000000000013'$$);
select pg_temp.expect_unchanged('public.td_customer_archives','customer_id=''f3200000-0000-4000-8000-000000000013''',
 $$delete from public.td_customer_archives where customer_id='f3200000-0000-4000-8000-000000000013'$$);
select pg_temp.expect_unchanged('public.td_customer_archives','customer_id=''f3200000-0000-4000-8000-000000000013''',
 $$select public.td_owner_restore_customer_v29('f3200000-0000-4000-8000-000000000013')$$);
select pg_temp.expect_unchanged('public.td_customer_archives','customer_id=''f3200000-0000-4000-8000-000000000011''',
 $$select public.td_owner_archive_customer_v29('f3200000-0000-4000-8000-000000000011')$$);
select pg_temp.expect_unchanged('public.td_members','id=auth.uid()',
 $$update public.td_members set role='owner',active=true where id=auth.uid()$$);
select pg_temp.expect_denied($$select * from public.td_login_identity_v32('staff')$$);
select pg_temp.expect_denied($$select public.td_login_attempt_v32('staff')$$);
select pg_temp.expect_denied($$select public.td_set_staff_active_v32('f3200000-0000-4000-8000-000000000002',true)$$);

-- Disable under owner JWT; retain the old employee JWT to prove DB enforcement.
select set_config('request.jwt.claims','{"sub":"f3200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.td_set_staff_active_v32('f3200000-0000-4000-8000-000000000002',false);
select pg_temp.expect_denied($$select public.td_set_staff_active_v32('f3200000-0000-4000-8000-000000000001',false)$$);
select set_config('request.jwt.claims','{"sub":"f3200000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  if public.td_is_active_v32() then raise exception 'Disabled membership still active'; end if;
  if exists(select 1 from public.td_customers) then raise exception 'Disabled JWT can read customers'; end if;
end $$;
select pg_temp.expect_denied($$insert into public.td_customers(name,created_by) values('disabled','f3200000-0000-4000-8000-000000000002')$$);
-- No fixture persists, including Auth users and archive records.
reset role;
rollback;
