-- Divine Mercy: repair admin verification and register the supplied admin UID.
-- Run once in Supabase Dashboard > SQL Editor.
-- This function checks auth.uid() without requiring the browser to SELECT dm_admins.

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
grant execute on function public.dm_is_admin() to anon, authenticated;

-- Register the UUID supplied for the newly created admin account.
-- IMPORTANT: this must be the exact UID shown for the email used on the login page.
do $$
declare
  target_user uuid := 'c74103c7-ceda-4f11-af99-151ebff5a758';
begin
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'The supplied admin UID was not found in auth.users. Verify the UID in Authentication > Users.';
  end if;

  insert into public.dm_admins (user_id)
  values (target_user)
  on conflict (user_id) do nothing;
end
$$;
