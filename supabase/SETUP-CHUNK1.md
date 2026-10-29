# Chunk 1 setup: logins and crew roles (about 15 minutes)

Do these in your Supabase project (`jirvugtgclgdbysrfjsc`, Sydney), in order.

## 1. Make logins invite-only
**Authentication › Sign In / Providers** (on some screens it's under **Authentication › Settings**):
- **Email** provider: **Enabled**.
- **Allow new users to sign up**: **OFF**. Only people you invite can get a login.
- **Confirm email**: **ON**.
- Click **Save**.

## 1b. Where the email links go back to
**Authentication › URL Configuration**:
- **Site URL:** `https://planner.wakingdreamfpv.com`
- **Redirect URLs:** add `https://planner.wakingdreamfpv.com/**` and `https://dream-planner-6f6.pages.dev/**`
- Click **Save**. Without this, invite and password-reset links open the wrong address.

## 2. Create the tables and security rules
1. Open **SQL Editor › New query**.
2. Paste the whole of `supabase/migrations/0001_chunk1_auth_roles.sql`.
3. At the bottom, replace **both** `CHANGE-ME@example.com` with the email you'll log in with (e.g. your business email).
4. Click **Run**. You should see *Success. No rows returned*. It's safe to run again if you need to.

## 3. Add the invite function
1. Go to **Edge Functions › Deploy a new function › Via Editor**.
2. Name it exactly `invite-user`.
3. Delete the sample code, paste the whole of `supabase/functions/invite-user/index.ts`, then click **Deploy function**.
4. Open the function's **Details / Settings** and turn **Enforce JWT verification** (sometimes "Verify JWT") **OFF**, then save.
   The function checks who's calling itself, and only an active CRP can invite. Turning this off avoids sign-in token
   mismatches with Supabase's new API keys.

## 4. Give yourself a login (as CRP)
1. Go to **Authentication › Users › Add user › Send invitation** and enter the same email you used in step 2.3.
2. Open the email and click the link. It opens `planner.wakingdreamfpv.com` and asks you to **set a password**.
3. Click the account button at the top of the planner, next to **New Operation**. It should show your name with **CRP**,
   and the **Account & crew** window shows **Invite crew**.

Until Resend is set up, Supabase's built-in email sends only a few emails an hour. That's fine for testing; it can be
slow or land in spam.

## 5. Acceptance test: a test pilot can't see anyone else
1. In **Account & crew › Invite crew**, invite a test pilot using a second email address. A Gmail alias works,
   e.g. `michaelrubio15+pilot@gmail.com`.
2. Open the invite email in a **private / incognito window**, set a password, then click the account button.
   - It should show **Pilot** and **only their own details**: no crew list, no invites.
3. Back in your own window, **Account & crew** lists the pilot, and you can change their role or deactivate them.

Tell Claude the results (screenshots help). If something fails, note the step and the message shown.

## What not to share
Never paste the database password, the `sb_secret_…` / service_role key or the Resend API key into chat or code.
The publishable key in `src/cloud/config.js` is designed to be public.
