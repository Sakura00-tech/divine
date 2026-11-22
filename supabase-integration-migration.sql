
-- Allow each signed-in user to verify their own administrator membership.
-- The existing admin policy still controls access to the rest of the roster.
alter table public.dm_admins enable row level security;
drop policy if exists "Users can verify own admin membership" on public.dm_admins;
create policy "Users can verify own admin membership"
  on public.dm_admins
  for select
  to authenticated
  using (user_id = auth.uid() or public.dm_is_admin());

-- Divine Mercy: required integration migration. Run once in Supabase SQL Editor.
-- Safe to re-run. Uses existing public.dm_is_admin() helper.

alter table public.dm_bookings add column if not exists source_id text;
create unique index if not exists dm_bookings_source_id_uidx on public.dm_bookings(source_id);
update public.dm_bookings set source_id = id::text where source_id is null;
alter table public.dm_attendance add column if not exists source_id text;
create unique index if not exists dm_attendance_source_id_uidx on public.dm_attendance(source_id);
update public.dm_attendance set source_id = id::text where source_id is null;

create table if not exists public.dm_attendance_events (
  id text primary key, payload jsonb not null default '{}'::jsonb,
  is_active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.dm_attendance_events enable row level security;

drop policy if exists "Public can read active attendance events" on public.dm_attendance_events;
create policy "Public can read active attendance events" on public.dm_attendance_events
  for select to anon, authenticated using (is_active = true or public.dm_is_admin());
drop policy if exists "Admins manage attendance events" on public.dm_attendance_events;
create policy "Admins manage attendance events" on public.dm_attendance_events
  for all to authenticated using (public.dm_is_admin()) with check (public.dm_is_admin());

drop policy if exists "Visitors can submit attendance" on public.dm_attendance;
create policy "Visitors can submit attendance" on public.dm_attendance
  for insert to anon, authenticated
  with check (exists (select 1 from public.dm_attendance_events e where e.id = event_id and e.is_active = true));
drop policy if exists "Admins read attendance" on public.dm_attendance;
create policy "Admins read attendance" on public.dm_attendance for select to authenticated using (public.dm_is_admin());
drop policy if exists "Admins update attendance" on public.dm_attendance;
create policy "Admins update attendance" on public.dm_attendance for update to authenticated using (public.dm_is_admin()) with check (public.dm_is_admin());
drop policy if exists "Admins delete attendance" on public.dm_attendance;
create policy "Admins delete attendance" on public.dm_attendance for delete to authenticated using (public.dm_is_admin());

drop policy if exists "Visitors can submit bookings" on public.dm_bookings;
create policy "Visitors can submit bookings" on public.dm_bookings for insert to anon, authenticated with check (true);
drop policy if exists "Admins manage bookings" on public.dm_bookings;
create policy "Admins manage bookings" on public.dm_bookings for all to authenticated using (public.dm_is_admin()) with check (public.dm_is_admin());

-- Cross-device check-in/out: no public SELECT permission is needed or granted.
-- The function returns only the action result, never an attendance record.
create or replace function public.dm_record_attendance(
  p_event_id text, p_name text, p_ministry text, p_date text, p_time text
) returns text
language plpgsql security definer set search_path = public as $$
declare existing_id uuid; existing_payload jsonb;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_ministry), '') = '' then return 'invalid_input'; end if;
  if not exists (select 1 from public.dm_attendance_events where id = p_event_id and is_active = true) then return 'invalid_event'; end if;
  perform pg_advisory_xact_lock(hashtext(p_event_id || '|' || lower(trim(p_name)) || '|' || lower(trim(p_ministry)) || '|' || p_date));
  select id, payload into existing_id, existing_payload
    from public.dm_attendance
    where event_id = p_event_id
      and lower(coalesce(payload->>'name','')) = lower(trim(p_name))
      and lower(coalesce(payload->>'ministry','')) = lower(trim(p_ministry))
      and payload->>'date' = p_date
    order by created_at desc limit 1 for update;
  if existing_id is null then
    insert into public.dm_attendance(event_id, source_id, payload)
    values (p_event_id, gen_random_uuid()::text,
      jsonb_build_object('eventId',p_event_id,'name',trim(p_name),'ministry',trim(p_ministry),'date',p_date,'timeIn',p_time,'timeOut',''));
    return 'time_in';
  end if;
  if coalesce(existing_payload->>'timeOut','') = '' then
    update public.dm_attendance
      set payload = jsonb_set(existing_payload, '{timeOut}', to_jsonb(p_time), true)
      where id = existing_id;
    return 'time_out';
  end if;
  return 'already_completed';
end;
$$;
revoke all on function public.dm_record_attendance(text,text,text,text,text) from public;
grant execute on function public.dm_record_attendance(text,text,text,text,text) to anon, authenticated;

create or replace function public.dm_mark_attendance_timeout(p_source_id text, p_time_out text)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_event text;
begin
  select event_id into target_event from public.dm_attendance where source_id = p_source_id;
  if target_event is null then return false; end if;
  if not exists (select 1 from public.dm_attendance_events where id = target_event and is_active = true) then return false; end if;
  update public.dm_attendance set payload = jsonb_set(payload, '{timeOut}', to_jsonb(p_time_out), true) where source_id = p_source_id;
  return found;
end;
$$;
revoke all on function public.dm_mark_attendance_timeout(text,text) from public;
grant execute on function public.dm_mark_attendance_timeout(text,text) to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['dm_content','dm_bookings','dm_attendance','dm_attendance_events'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
