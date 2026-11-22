DIVINE MERCY — SUPABASE REALTIME BUILD
======================================

Project URL configured: https://zkjyukyqwiwbqnvcxijs.supabase.co
The browser bundle uses the supplied Supabase publishable key only.
NEVER put a service_role or secret key in website files.

WHAT IS INCLUDED
- Original parish website pages
- supabase-bridge.js shared connection and realtime adapter
- supabase-setup.sql (base schema reference)
- supabase-integration-migration.sql (required compatibility migration)
- This README

IMPORTANT: DATABASE STEP BEFORE DEPLOY
1. Open Supabase Dashboard > SQL Editor.
2. Create a NEW query.
3. Copy the COMPLETE contents of supabase-integration-migration.sql from this ZIP.
4. Run it once. It is designed to be safe to run again.
5. Confirm the query reports Success. The migration also fixes the admin-membership read policy required by the login page.
6. In Supabase SQL Editor, run the complete contents of register-admin.sql to register the supplied Auth user UUID as an administrator. This script checks that the UUID exists before inserting it.
7. Confirm Authentication > Users contains the intended account and public.dm_admins contains that same user's UUID.
7. In Authentication URL Configuration, set Site URL to your live GitHub Pages URL and add it to Redirect URLs.
8. Disable public sign-ups if you do not want visitors creating accounts.

GITHUB DEPLOY
1. Keep a backup of the current repository first.
2. Extract this ZIP on your device.
3. Upload the extracted FILES (not the ZIP itself) into the repository root, preserving filenames.
4. Keep supabase-bridge.js beside all HTML files.
5. Commit the changes and wait for GitHub Pages to publish.

FEATURE / PRIVACY DESIGN
- Announcements, schedule and posts: public read, authenticated admins write; updates use Supabase Realtime.
- Bookings: public insert only; only authenticated admins can read/manage.
- Attendance: public QR form calls a restricted database function for Time In/Time Out; only authenticated admins can read/manage private rows. The function supports scanning from a different phone without public attendance SELECT access.
- Public QR pages read active event definitions but do not read private attendance rows. A restricted database function handles check-in/out and supports a second scan from a different phone.
- Admin dashboard requires a current Supabase Auth session AND a matching row in public.dm_admins.
- Parish sacramental records remain local in this version and are not multi-device synced.

VALIDATION PERFORMED ON THIS PACKAGE
- JavaScript syntax check passed for the shared bridge.
- Inline JavaScript syntax check passed for all HTML pages.
- Verified all 11 pages load Supabase JS before the bridge.
- Verified admin dashboard now checks Supabase admin membership before initialization.
- Login flow uses Supabase Auth rather than the old demo admin/viewer passwords.

IMPORTANT TEST LIMITATION
This workspace cannot sign in to your private Supabase project or test GitHub Pages in your browser. Therefore, do not treat the live workflow as confirmed until you complete the checks below.

POST-DEPLOY TESTS
A. Open admin-login.html and sign in with the Supabase admin email/password.
B. Confirm admin.html opens; sign out and confirm it returns to login.
C. Create a TEST announcement, schedule item and post; open public pages in another browser/device and confirm they update.
D. Submit a TEST booking; confirm it appears in the admin dashboard only.
E. Create an attendance event in the admin dashboard, open its QR, submit a TEST Time In, then scan again (even from another phone/browser) for Time Out.
F. Check Supabase Table Editor and browser console for errors.
G. Delete test entries after successful verification.

If a step fails, keep the previous GitHub deployment available for rollback and share the exact error message (never share passwords or secret keys).

ADMIN LOGIN REPAIR (IMPORTANT)
1. Open Supabase Dashboard > SQL Editor.
2. Open admin-login-fix.sql from this ZIP, copy the entire file, and Run it once.
3. The final SELECT should show reynald17esquerra29@gmail.com and its user UUID.
4. Upload/replace all website files from this ZIP in the GitHub repository root.
5. Open the website in Chrome and refresh the admin login page.
The website bridge now verifies admin membership using dm_is_admin() RPC instead of a direct dm_admins table SELECT.
