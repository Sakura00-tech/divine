DIVINE MERCY — SUPABASE REALTIME SETUP PACKAGE

WHAT'S INCLUDED
- Your original 11 HTML pages, unchanged.
- supabase-setup.sql: secure database tables, Row Level Security (RLS), and Realtime publication setup.
- README.txt: setup and safety notes.

IMPORTANT STATUS
This is a safe database setup package, NOT yet a fully connected real-time website.
The current HTML pages still use browser localStorage for their application data.
Running the SQL creates the database foundation but does not automatically switch the pages to Supabase.
Do not upload this package expecting cross-device sync to work until the front-end integration is completed and tested.

SUPABASE PROJECT
Project URL: https://zkjyukyqwiwbqnvcxijs.supabase.co
Publishable key: use the publishable key already supplied in your project configuration.
Never put a service_role or secret key in HTML, JavaScript, or this ZIP.

SETUP
1. Open https://supabase.com/dashboard and select project zkjyukyqwiwbqnvcxijs.
2. Open SQL Editor > New query.
3. Open supabase-setup.sql from this ZIP, copy all its contents, paste into SQL Editor, and click Run.
4. In Authentication > Settings, turn OFF public sign-ups. Admin accounts should be created manually by the project owner.
5. Create your admin user in Authentication > Users.
6. Copy that user's UUID.
7. In SQL Editor run this command, replacing the UUID:
   insert into public.dm_admins (user_id) values ('PASTE-ADMIN-USER-UUID-HERE');
8. Keep the admin UUID private.

SECURITY NOTES
- Public visitors can read announcements/schedule/posts.
- Public visitors can submit a booking or attendance record, but cannot read booking or attendance records.
- Only user IDs explicitly added to dm_admins can manage content or view/manage booking records.
- Never use the service_role key in a browser.
- Review and test policies before collecting real personal information.

NEXT FRONT-END INTEGRATION
The current site stores a combined dm_church_data object in localStorage. A proper migration must replace that storage layer with Supabase queries for dm_content, dm_bookings, and dm_attendance, add authenticated admin login, and subscribe to Supabase Realtime changes. The old hard-coded admin/viewer credentials in admin.html/admin-login.html must be removed before deployment.
