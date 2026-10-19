-- TEST PROJECT ONLY. Deployment must explicitly set td.environment for this connection.
begin;
do $$
begin
  if current_setting('td.environment', true) is distinct from 'tengda-v32-test' then
    raise exception 'Set td.environment=tengda-v32-test on a verified TEST connection first';
  end if;
  if to_regclass('public.td_members') is null or to_regclass('public.td_customers') is null
     or to_regclass('public.td_customer_archives') is null then
    raise exception 'Existing V3.1 schema is required; this migration does not create business tables';
  end if;
  perform id, role, active, display_name from public.td_members limit 0;
  perform id, name, phone, notes, deleted_at, created_by from public.td_customers limit 0;
  perform customer_id from public.td_customer_archives limit 0;
end $$;

alter table public.td_members add column if not exists username text;
alter table public.td_members add column if not exists contact_email text;
alter table public.td_members add column if not exists contact_phone text;
create unique index if not exists td_members_username_v32 on public.td_members(lower(username)) where username is not null;
alter table public.td_members add constraint td_username_format_v32
  check (username is null or username ~ '^[a-z0-9_]{3,30}$');

-- Backfill unambiguous legacy usernames only. Never change passwords or role/active.
with candidates as (
  select m.id, lower(coalesce(nullif(u.raw_user_meta_data->>'username',''),
    case when u.email like '%@staff.tengda.example.com' then split_part(u.email,'@',1) end)) as username
  from public.td_members m join auth.users u on u.id=m.id where m.username is null
), unique_names as (
  select username from candidates where username ~ '^[a-z0-9_]{3,30}$' group by username having count(*)=1
)
update public.td_members m set username=c.username from candidates c join unique_names n using(username)
where m.id=c.id and not exists(select 1 from public.td_members e where lower(e.username)=c.username);

create schema if not exists td_private;
revoke all on schema td_private from public, anon, authenticated;
create table td_private.login_attempts_v32 (
  login_hash text primary key,
  started_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 1
);
revoke all on td_private.login_attempts_v32 from public, anon, authenticated;

create or replace function public.td_is_active_v32() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.td_members where id=auth.uid() and active=true)
$$;
create or replace function public.td_is_owner_v32() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.td_members where id=auth.uid() and active=true and role='owner')
$$;
revoke all on function public.td_is_active_v32(), public.td_is_owner_v32() from public;
grant execute on function public.td_is_active_v32(), public.td_is_owner_v32() to anon, authenticated, service_role;

create or replace function public.td_login_attempt_v32(p_login text) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  -- The RPC is service-role-only. Limits survive cold starts and concurrent requests.
  delete from td_private.login_attempts_v32 where started_at < clock_timestamp()-interval '15 minutes';
  insert into td_private.login_attempts_v32(login_hash) values(md5(lower(p_login)))
    on conflict(login_hash) do update set attempts=td_private.login_attempts_v32.attempts+1
    returning attempts into n;
  return n<=10;
end $$;
create or replace function public.td_login_identity_v32(p_login text)
returns table(id uuid, auth_email text)
language sql stable security definer set search_path='' as $$
  select m.id,u.email::text from public.td_members m join auth.users u on u.id=m.id
  where lower(m.username)=lower(p_login)
     or (position('@' in p_login)>0 and lower(u.email)=lower(p_login))
  limit 1
$$;
revoke all on function public.td_login_attempt_v32(text), public.td_login_identity_v32(text) from public, anon, authenticated;
grant execute on function public.td_login_attempt_v32(text), public.td_login_identity_v32(text) to service_role;

-- A JWT cannot edit members or promote itself, including through old SECURITY DEFINER RPCs.
create or replace function public.td_guard_members_v32() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.role()='service_role' then
    if TG_OP='DELETE' then return old; else return new; end if;
  end if;
  if TG_OP='INSERT' and auth.uid() is null then
    -- Existing Auth signup triggers may still run. They may only create pending staff.
    new.role := 'staff'; new.active := false; return new;
  end if;
  -- Trusted SQL maintenance can bootstrap an owner; browser JWTs cannot use this path.
  if auth.uid() is null and coalesce(auth.role(),'') not in ('anon','authenticated') then
    if TG_OP='DELETE' then return old; else return new; end if;
  end if;
  if not public.td_is_owner_v32() then raise exception 'Only active owners can manage members' using errcode='42501'; end if;
  if TG_OP <> 'INSERT' and old.role='owner' then raise exception 'Owner accounts are protected' using errcode='42501'; end if;
  if TG_OP <> 'DELETE' and new.role='owner' then raise exception 'Owner promotion is not permitted here' using errcode='42501'; end if;
  if TG_OP='DELETE' then return old; else return new; end if;
end $$;
create trigger td_guard_members_v32 before insert or update or delete on public.td_members
for each row execute function public.td_guard_members_v32();

create or replace function public.td_provision_staff_v32(p_user uuid,p_username text,p_name text,p_email text,p_phone text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.td_is_owner_v32() then raise exception 'Owner required' using errcode='42501'; end if;
  if p_username !~ '^[a-z0-9_]{3,30}$' or length(trim(p_name)) not between 1 and 60
    or length(coalesce(p_email,''))>254 or length(coalesce(p_phone,''))>30 then raise exception 'Invalid profile'; end if;
  -- Only finalize newly created Auth users with an internal project identity.
  if not exists(select 1 from auth.users u where u.id=p_user and u.created_at>now()-interval '5 minutes'
      and u.email ~ '^[0-9a-f-]{36}@[a-z0-9]+\.supabase\.co$') then raise exception 'New Auth user required'; end if;
  if exists(select 1 from public.td_members where id=p_user and (role='owner' or active=true or username is not null)) then
    raise exception 'Existing account is protected';
  end if;
  insert into public.td_members(id,display_name,role,active,username,contact_email,contact_phone)
    values(p_user,trim(p_name),'staff',false,p_username,nullif(trim(p_email),''),trim(p_phone))
    on conflict(id) do update set display_name=excluded.display_name,role='staff',active=false,
      username=excluded.username,contact_email=excluded.contact_email,contact_phone=excluded.contact_phone;
end $$;
create or replace function public.td_set_staff_active_v32(p_member uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.td_is_owner_v32() then raise exception 'Owner required' using errcode='42501'; end if;
  if p_active is null then raise exception 'Status required'; end if;
  update public.td_members set active=p_active where id=p_member and role<>'owner';
  if not found then raise exception 'Staff account not found'; end if;
end $$;
revoke all on function public.td_provision_staff_v32(uuid,text,text,text,text),public.td_set_staff_active_v32(uuid,boolean) from public,anon;
grant execute on function public.td_provision_staff_v32(uuid,text,text,text,text),public.td_set_staff_active_v32(uuid,boolean) to authenticated;

-- Trigger guards also apply inside existing SECURITY DEFINER customer RPCs.
create or replace function public.td_guard_customers_v32() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.role()='service_role' or (auth.uid() is null and coalesce(auth.role(),'') not in ('anon','authenticated')) then
    if TG_OP='DELETE' then return old; else return new; end if;
  end if;
  if not public.td_is_active_v32() then raise exception 'Active account required' using errcode='42501'; end if;
  if public.td_is_owner_v32() then
    if TG_OP='DELETE' then return old; else return new; end if;
  end if;
  if TG_TABLE_NAME='td_customer_archives' or TG_OP='DELETE' then
    raise exception 'Only owners can delete, restore or archive customers' using errcode='42501';
  end if;
  if TG_OP='INSERT' then
    if new.deleted_at is not null or new.created_by is distinct from auth.uid() then
      raise exception 'Invalid customer creation' using errcode='42501'; end if;
  else
    if old.deleted_at is not null or exists(select 1 from public.td_customer_archives where customer_id=old.id)
      or (to_jsonb(new)-array['name','phone','notes','updated_at']) is distinct from
         (to_jsonb(old)-array['name','phone','notes','updated_at']) then
      raise exception 'Staff can only edit live customer details' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
create trigger td_guard_customers_v32 before insert or update or delete on public.td_customers
for each row execute function public.td_guard_customers_v32();
create trigger td_guard_archives_v32 before insert or update or delete on public.td_customer_archives
for each row execute function public.td_guard_customers_v32();

-- A disabled JWT cannot keep writing via old RPCs, even if those RPCs bypass RLS.
create or replace function public.td_guard_active_write_v32() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() in ('anon','authenticated') and not public.td_is_active_v32() then
    raise exception 'Active account required' using errcode='42501'; end if;
  if TG_OP='DELETE' then return old; else return new; end if;
end $$;

-- Restrictive policies add a ceiling to existing permissive policies; they do not replace business rules.
do $$ declare t record; v record; begin
  for t in select tablename from pg_tables where schemaname='public' and tablename like 'td\_%' escape '\' loop
    execute format('alter table public.%I enable row level security',t.tablename);
    execute format('create policy td_no_anonymous_v32 on public.%I as restrictive for all to anon using(false) with check(false)',t.tablename);
    if t.tablename='td_members' then
      execute 'create policy td_members_scope_v32 on public.td_members as restrictive for select to authenticated using(id=auth.uid() or public.td_is_owner_v32())';
      execute 'create policy td_members_self_read_v32 on public.td_members for select to authenticated using(id=auth.uid() or public.td_is_owner_v32())';
    else
      execute format('create policy td_active_scope_v32 on public.%I as restrictive for all to authenticated using(public.td_is_active_v32()) with check(public.td_is_active_v32())',t.tablename);
      execute format('create trigger td_active_write_v32 before insert or update or delete on public.%I for each row execute function public.td_guard_active_write_v32()',t.tablename);
    end if;
  end loop;
  -- PostgreSQL 15+: views must honor caller RLS, including financial views.
  for v in select viewname from pg_views where schemaname='public' and viewname like 'td\_%' escape '\' loop
    execute format('alter view public.%I set (security_invoker=true)',v.viewname);
  end loop;
end $$;
grant select, insert, update on public.td_customers to authenticated;
grant select on public.td_customer_archives, public.td_members to authenticated;
-- Add known customer capabilities even if legacy policies only allowed owners.
create policy td_customers_read_v32 on public.td_customers for select to authenticated using(public.td_is_active_v32());
create policy td_customers_insert_v32 on public.td_customers for insert to authenticated with check(public.td_is_active_v32());
create policy td_customers_update_v32 on public.td_customers for update to authenticated using(public.td_is_active_v32()) with check(public.td_is_active_v32());
create policy td_archives_read_v32 on public.td_customer_archives for select to authenticated using(public.td_is_active_v32());
-- Photos remain private for disabled/pending accounts; unrelated buckets are unaffected.
create policy td_images_active_v32 on storage.objects as restrictive for all to authenticated
  using(bucket_id<>'tengda-images' or public.td_is_active_v32())
  with check(bucket_id<>'tengda-images' or public.td_is_active_v32());
create policy td_images_no_anon_v32 on storage.objects as restrictive for all to anon
  using(bucket_id<>'tengda-images') with check(bucket_id<>'tengda-images');

revoke all on function public.td_guard_members_v32(),public.td_guard_customers_v32(),public.td_guard_active_write_v32() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
