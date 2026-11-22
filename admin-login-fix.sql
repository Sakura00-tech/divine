-- Divine Mercy: repair admin registration and verification for the exact login email.
-- Run this ONCE in Supabase Dashboard > SQL Editor.
-- This registers reynald17esquerra29@gmail.com using the real Auth UUID.

do $$
declare
  target_user uuid;
begin
  select id into target_user
  from auth.users
  where lower(email) = lower('reynald17esquerra29@gmail.com')
  order by created_at desc
  limit 1;

  if target_user is null then
    raise exception 'The Supabase Auth account reynald17esquerra29@gmail.com was not found. Confirm the email under Authentication > Users.';
  end if;

  insert into public.dm_admins (user_id)
  values (target_user)
  on conflict (user_id) do nothing;
end
$$;

-- Secure admin check. SECURITY DEFINER allows the function to check the roster
-- without relying on the caller's direct SELECT permission on dm_admins.
create or replace function public.dm_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dm_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.dm_is_admin() from public;
grant execute on function public.dm_is_admin() to authenticated;

-- Confirm registration (returns the email and UUID of the registered admin).
select u.email, a.user_id
from public.dm_admins a
join auth.users u on u.id = a.user_id
where lower(u.email) = lower('reynald17esquerra29@gmail.com');
