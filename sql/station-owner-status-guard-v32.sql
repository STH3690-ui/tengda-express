create or replace function public.td_station_guard_status_v32()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if tg_op='INSERT' then
   if new.is_active is distinct from true then
     raise exception 'New station must be active';
   end if;
 elsif new.is_active is distinct from old.is_active then
   if not exists(select 1 from public.td_members m where m.id=auth.uid() and m.active=true and m.role='owner') then
     raise exception 'Only owner may change station status';
   end if;
 end if;
 return new;
end $$;
drop trigger if exists td_station_guard_status_v32 on public.td_station_addresses;
create trigger td_station_guard_status_v32 before insert or update on public.td_station_addresses
for each row execute function public.td_station_guard_status_v32();