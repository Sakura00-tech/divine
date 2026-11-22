-- Divine Mercy: secure Supabase database foundation
-- Run in Supabase Dashboard > SQL Editor.
-- IMPORTANT: Disable public sign-ups in Authentication settings.
-- Add admin users manually; see README.txt.

create extension if not exists pgcrypto;

create table if not exists public.dm_content (
  id text primary key check (id in ('announcements','schedule','posts')),
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.dm_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.dm_bookings (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.dm_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.dm_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dm_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.dm_is_admin() from public;
grant execute on function public.dm_is_admin() to anon, authenticated;

alter table public.dm_content enable row level security;
alter table public.dm_admins enable row level security;
alter table public.dm_bookings enable row level security;
alter table public.dm_attendance enable row level security;

drop policy if exists "Public can read published content" on public.dm_content;
create policy "Public can read published content"
on public.dm_content for select to anon, authenticated using (true);

drop policy if exists "Admins manage content" on public.dm_content;
create policy "Admins manage content"
on public.dm_content for all to authenticated
using (public.dm_is_admin())
with check (public.dm_is_admin());

drop policy if exists "Admins can read admin roster" on public.dm_admins;
create policy "Admins can read admin roster"
on public.dm_admins for select to authenticated
using (public.dm_is_admin());

drop policy if exists "Visitors can submit bookings" on public.dm_bookings;
create policy "Visitors can submit bookings"
on public.dm_bookings for insert to anon, authenticated
with check (true);

drop policy if exists "Admins manage bookings" on public.dm_bookings;
create policy "Admins manage bookings"
on public.dm_bookings for all to authenticated
using (public.dm_is_admin())
with check (public.dm_is_admin());

drop policy if exists "Visitors can submit attendance" on public.dm_attendance;
create policy "Visitors can submit attendance"
on public.dm_attendance for insert to anon, authenticated
with check (true);

drop policy if exists "Admins read attendance" on public.dm_attendance;
create policy "Admins read attendance"
on public.dm_attendance for select to authenticated
using (public.dm_is_admin());

-- Enable Realtime for the tables that need live updates.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_content'
  ) then
    alter publication supabase_realtime add table public.dm_content;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_bookings'
  ) then
    alter publication supabase_realtime add table public.dm_bookings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_attendance'
  ) then
    alter publication supabase_realtime add table public.dm_attendance;
  end if;
end $$;

-- Seed empty content records only. Existing sample data remains in the HTML/local browser
-- until a deliberate migration is performed.
insert into public.dm_content (id, items)
values ('announcements','[]'::jsonb), ('schedule','[]'::jsonb), ('posts','[]'::jsonb)
on conflict (id) do nothing;
