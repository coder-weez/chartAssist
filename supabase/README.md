# EMSCharts Assist — login backend (Supabase)

This folder holds everything the extension's login needs on the server side. The
extension itself talks to Supabase over plain `fetch` (see `src/auth.js`); there
is no server code to run beyond one Edge Function.

- `schema.sql` — tables, Row-Level Security, the domain-allowlist trigger, and
  the atomic `redeem_access_code()` function.
- `functions/redeem-code/index.ts` — the Edge Function that validates access
  codes with the service-role key.

## One-time setup

1. **Create a project** at [supabase.com](https://supabase.com) (the free tier is
   fine). Name the project **`emscharts-assist`**.

2. **Run the schema.** Open the project's **SQL Editor**, paste all of
   `schema.sql`, and run it.

3. **Enable email/password auth.** Dashboard → **Authentication → Providers →
   Email**: enable it, and keep **"Allow new users to sign up"** ON so crews can
   self-register from the popup's **Create account** form (the
   `enforce_allowed_domain` trigger still limits them to approved domains). For an
   internal EMS tool you'll likely turn **"Confirm email" off** so new accounts can
   sign in immediately; leave it on only if you want address verification (that
   path needs working email delivery). (Passwords are hashed by Supabase — nothing
   to configure.)

4. **Deploy the Edge Function** (needs the [Supabase CLI](https://supabase.com/docs/guides/cli)):

    ```bash
    supabase functions deploy redeem-code --no-verify-jwt --project-ref YOUR-PROJECT-REF
    ```

    `--no-verify-jwt` makes the function callable without a user JWT — guests
    redeeming an access code aren't signed in, and the extension's **publishable
    key** is not a JWT. It stays safe: it only calls the RLS-locked
    `redeem_access_code()` with the service role and returns just an expiry.

    `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically for
    deployed functions — you do **not** put the service-role key anywhere in this
    repo.

5. **Wire the extension to your project.** From Dashboard → **Project Settings**,
   copy the **Project URL** (under **API**) and the **Publishable** key (it starts
   with `sb_publishable_`, under **API Keys**), then set them in two places:

    - `src/auth.js` → `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`
    - `src/manifest.json` → replace `https://YOUR-PROJECT-REF.supabase.co/*` in
      `host_permissions` with your project URL.

    The **publishable key is public by design** and is safe to ship in the
    extension — RLS is what protects the data. **Never** put the **secret /
    service-role** key in the extension or in `auth.js`.

## Admin runbook (dashboard + SQL)

Run these in the SQL Editor.

**Allow an email domain** (anyone at it can then register):

```sql
insert into public.allowed_domains (domain, note)
values ('vfambulence.com', 'VF Ambulance');
```

**Allow a one-off email** whose domain is _not_ approved — a contractor,
ride-along, or partner-agency medic. They can then register/sign in normally:

```sql
insert into public.allowed_emails (email, note)
values (lower('Jane.Contractor@gmail.com'), 'Aug ride-along — remove after');
```

Remove it again when they are done:

```sql
delete from public.allowed_emails where email = lower('Jane.Contractor@gmail.com');
```

**See the allow-lists** (approved domains and one-off emails together):

```sql
select 'domain' as kind, domain as value, note, created_at from public.allowed_domains
union all
select 'email' as kind, email as value, note, created_at from public.allowed_emails
order by kind, value;
```

**Add a user:** either have them self-register in the extension popup (the
trigger enforces the domain), or create them in Dashboard → Authentication →
Users → **Add user**.

**See registered accounts** — user emails live in Supabase's built-in
`auth.users` (not in `allowed_domains`), so list them from there:

```sql
select email, created_at, last_sign_in_at from auth.users order by created_at desc;
```

**Generate a time-limited access code** — change the `interval` to set the TTL
(the "x amount of time"). `max_uses` caps how many redemptions; use `null` for
unlimited within the window:

```sql
insert into public.access_codes (code, label, expires_at, max_uses)
values (
    upper(substr(md5(gen_random_uuid()::text), 1, 8)),
    'Guest crew — Aug ride-along',
    now() + interval '24 hours',   -- <- the TTL you set
    50
)
returning code, expires_at;
```

**Revoke a code early:**

```sql
update public.access_codes set revoked = true where code = 'ABC12345';
```

**See how a code is being used:**

```sql
select code, label, expires_at, uses, max_uses, revoked from public.access_codes
order by created_at desc;
```

**Deactivate a user:** Dashboard → Authentication → Users → delete or ban them.
Their next silent token refresh in the extension then fails, ending the session
ahead of its 1-month cap (see the revocation note in the main README).

## Session length

The extension caps a user login at **~1 month** (`SESSION_TTL_HOURS = 24 * 30` in
`src/auth.js`), refreshing the short-lived access token underneath. For that cap
to actually hold, Supabase's own session limits must not cut it short first — in
Dashboard → Authentication → Sessions, leave **"Time-box user sessions"** and
**"Inactivity timeout"** unset (the defaults), or set them to at least 30 days.
Refresh tokens persist by default, so no other change is needed.

## Password reset

Crews reset their own password from the popup ("Forgot password?") with an
emailed **6-digit code** (OTP) — no hosted web page, because it does not use a
magic link. Two Supabase-side settings are required for it to work:

1. **Email delivery.** For production, configure **Custom SMTP** at Dashboard →
   **Authentication → Emails → SMTP Settings** (Resend, Postmark, SES, …). The
   built-in sender is fine for **testing only**: it is rate-limited to a few per
   hour and, in current Supabase, only delivers to addresses on your Supabase
   org/team — so test with the email you use for Supabase, not an arbitrary crew
   address. (Custom SMTP off = built-in sender.)
2. **Send the code, not a link.** Dashboard → **Authentication → Emails →
   Templates → Reset Password**: the default body links `{{ .ConfirmationURL }}`
   (a magic link), but the popup asks for the OTP, so replace the message body
   with something like:

    ```html
    <h2>Reset your ChartAssist password</h2>
    <p>Enter this code in the ChartAssist extension to set a new password:</p>
    <p style="font-size: 24px; font-weight: bold; letter-spacing: 3px">{{ .Token }}</p>
    <p>If you did not request this, you can ignore this email.</p>
    ```

    The key is `{{ .Token }}` (the 6-digit code) with no `{{ .ConfirmationURL }}`.

The popup flow: request a code (`/auth/v1/recover`) → enter the code + a new
password (`/auth/v1/verify` with `type=recovery`, then `PUT /auth/v1/user`) → the
user is signed straight in. Until SMTP is set up, "Send reset code" errors; the
fallback is admin-driven — delete the user so they re-register, or set a new
password from Dashboard → Authentication → Users.

## Admin console (crew admins)

Crew admins manage their own org's pre-approved emails from a role-gated page in
the extension (the **Admin** button in the popup, or `admin.html` directly). The
multi-tenant model — `orgs`, `profiles` (role + org), org-scoped `allowed_emails`,
and RLS that isolates each admin to their own org — is created by `schema.sql`.

**Bootstrap (super-admin, once per crew)** — create an org, promote its admin, and
point the crew's domain at the org so members self-register into it:

```sql
insert into public.orgs (name) values ('VF Ambulance') returning id;
update public.profiles set role = 'crew_admin', org_id = '<org-id>'
  where user_id = (select id from auth.users where email = 'admin@vfambulance.com');
update public.allowed_domains set org_id = '<org-id>' where domain = 'vfambulence.com';
```

Roles are `member` (default), `crew_admin`, and `super_admin`. Admins add/remove
allow-listed emails for their own org; the people they add then self-register
through the popup's Create-account form. **Removing** an allow-listed email
deletes any account for it (a trigger deletes the `auth.users` row, which cascades
its `profiles` row), so it doubles as "remove and un-approve" — the person loses
access within one refresh cycle and must be re-approved to return. The **Members**
list has a separate **Remove** that deletes the account but **keeps** the
pre-approval, so the person can simply sign up again. RLS (not just the UI) stops
one crew's admin from seeing or touching another crew's data.

## Security notes

- The `access_codes` / `allowed_domains` tables have RLS on with **no public
  policies**, so the publishable key cannot read or write them. Codes are only ever
  checked through `redeem_access_code()` (SECURITY DEFINER), which prevents code
  enumeration.
- The gate is cooperative: it controls access for your own crews and honors
  expiry/revocation, but because an extension runs on the user's machine it is
  not proof against a determined technical bypass. That trade-off is by design.
