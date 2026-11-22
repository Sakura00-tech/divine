-- Divine Mercy: register the supplied Auth user as a parish administrator.
-- Run this in Supabase SQL Editor AFTER confirming this UUID belongs to
-- the intended account in Authentication > Users.
do $$
declare
  target_user uuid := 'c74103c7-ceda-4f11-af99-151ebff5a758';
begin
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'No Supabase Auth user found with UUID %. Create/confirm the account in Authentication > Users first.', target_user;
  end if;

  insert into public.dm_admins (user_id)
  values (target_user)
  on conflict (user_id) do nothing;
end
$$;
