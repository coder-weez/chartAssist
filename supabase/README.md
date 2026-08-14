# EMSCharts Assist — login backend (Supabase)

This folder holds everything the extension's login needs on the server side. The
extension itself talks to Supabase over plain `fetch` (see `src/auth.js`); there
is no server code to run beyond one Edge Function.

- `schema.sql` — tables, Row-Level Security, the domain-allowlist trigger, and
  the atomic, rate-limited `redeem_access_code()` function.
- `functions/redeem-code/index.ts` — the Edge Function that validates access
  codes with the service-role key (and forwards the caller IP for rate limiting).
- `functions/notify-approved/index.ts` — the Edge Function that emails a user
  "you've been approved" when a crew admin approves them (sends via the Resend API).

## One-time setup

1. **Create a project** at [supabase.com](https://supabase.com) (the free tier is
   fine). Name the project **`emscharts-assist`**.

2. **Run the schema.** Open the project's **SQL Editor**, paste all of
   `schema.sql`, and run it.

3. **Enable email/password auth.** Dashboard → **Authentication → Providers →
   Email**: enable it, and keep **"Allow new users to sign up"** ON so crews can
   self-register from the popup's **Create account** form. Pre-approved emails and
   domains sign in immediately; anyone else who selects a crew is created as a
   **pending** account their crew admin must approve (see _Account approvals_
   below), so leaving sign-up on doesn't grant open access.

    **"Confirm email":** for a wider / public launch, turn this **ON**. It throttles
    junk sign-ups — each pending request then needs a real, confirmable inbox — and
    pairs with Supabase's built-in per-IP sign-up rate limits and the redeem-code
    lockout below. It needs working email delivery (the built-in SMTP is fine for low
    volume; configure custom SMTP for production). A small, closed internal
    deployment where every address is pre-approved may keep it **off** for one-step
    sign-in. (Passwords are hashed by Supabase — nothing to configure.)

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

    Also deploy the **approval-notification** function — this one **keeps JWT
    verification** (only a signed-in admin may call it) and needs your Resend API
    key so it can send the "you've been approved" email:

    ```bash
    supabase functions deploy notify-approved --project-ref YOUR-PROJECT-REF
    supabase secrets set RESEND_API_KEY=re_your_key --project-ref YOUR-PROJECT-REF
    ```

    It re-checks the caller is a crew admin (via `my_profile()`), derives the
    recipient's email **server-side** from the user id, and sends via the Resend API.
    `admin.js` calls it fire-and-forget right after **Approve**, so a mail hiccup
    never blocks the approval. (The `RESEND_API_KEY` is the same key used as the
    custom-SMTP password — see _Email delivery_ below.)

    This function reads `profiles`/`orgs` **directly** with the service-role key, so
    `service_role` needs `SELECT` on them — `schema.sql` grants this, so just make
    sure you've (re-)run it. If you see `permission denied for table profiles` in the
    function logs, apply the grant on its own:

    ```sql
    grant select on public.profiles to service_role;
    grant select on public.orgs to service_role;
    ```

5. **Wire the extension to your project.** From Dashboard → **Project Settings**,
   copy the **Project URL** (under **API**) and the **Publishable** key (it starts
   with `sb_publishable_`, under **API Keys**), then set them in two places:

    - `src/auth.js` → `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`
    - `src/manifest.json` → replace `https://YOUR-PROJECT-REF.supabase.co/*` in
      `host_permissions` with your project URL.

    The **publishable key is public by design** and is safe to ship in the
    extension — RLS is what protects the data. **Never** put the **secret /
    service-role** key in the extension or in `auth.js`.

## Upgrading an existing install

`schema.sql` is idempotent (`create or replace`, `create table if not exists`,
guarded `drop function if exists`), so upgrading is: **re-run the whole
`schema.sql`** in the SQL Editor, then **redeploy the Edge Function**
(`supabase functions deploy redeem-code --no-verify-jwt …`). The recent security
release changes both: `redeem_access_code()` now takes a caller IP and returns
JSON (a new `redeem_attempts` table backs a **per-IP lockout after 5 failed
attempts within 15 minutes**); `remove_member()` now refuses self-removal, a
`super_admin` target, and the org's last admin; and a pre-approved account no
longer inherits the crew it picked at sign-up (its org comes only from the
allow-list row). Nothing else needs migrating — existing rows are untouched.

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

**Approve a pending sign-up by email** — same effect as the Admin console's
**Approve** button (flips `profiles.status` `pending` → `approved`). The console
RPC can't be called from the SQL Editor (it checks `auth.uid()`), so run the
equivalent update. The `returning` row confirms it (0 rows = not found or not
pending). This does **not** confirm the email — if "Confirm email" is ON, the user
still enters their code (or use the confirm-email update below):

```sql
update public.profiles p
set status = 'approved'
from auth.users u
where u.id = p.user_id
  and lower(u.email) = lower('someone@example.com')
  and p.status = 'pending'
returning p.user_id, u.email, p.status, p.role, p.org_id;
```

**Confirm a user's email by hand** (skip the emailed code):

```sql
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where lower(email) = lower('someone@example.com')
returning email, email_confirmed_at;
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

## Email delivery (Resend + Cloudflare)

Password reset and email confirmation both need Supabase to send real email. The
built-in sender is **testing only** (a few per hour, and it only delivers to your
Supabase org/team), so production uses **Resend** for sending and **Cloudflare**
for DNS + inbound routing. Domain roles:

| Domain                             | Role                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `gardnerrespondertechnologies.com` | Brand site + the email-confirmation landing page + Supabase **Site URL** |
| `grtechsupport.com`                | **Sending domain** (Resend) — `noreply@` sends, `support@` receives      |
| `grteches.com`                     | Short alias, **301-redirects** to the brand domain (no email)            |

Setup:

1. **Verify the sending domain in Resend.** Resend → Domains → add
   `grtechsupport.com`; add the DNS records it shows (MX on `send`, SPF TXT on
   `send`, DKIM TXT on `resend._domainkey`, plus a `_dmarc` TXT) in **Cloudflare →
   grtechsupport.com → DNS** — type just the record **name** (Cloudflare appends the
   zone). Click Verify. Then create a Resend **API key** (the SMTP password below).
2. **Receive `support@` / `noreply@`.** Cloudflare → grtechsupport.com → **Email →
   Email Routing**: enable it (accept the root MX/SPF it adds — separate from
   Resend's `send.` records) and forward `support@` and `noreply@` to a real inbox.
   To _reply_ as `support@`, add it in Gmail via **Send mail as** using
   `smtp.resend.com:587`, user `resend`, password = the Resend API key.
3. **Point Supabase at Resend.** Dashboard → **Authentication → Emails → SMTP
   Settings**, enable custom SMTP:
    - Host `smtp.resend.com`, Port `465` (or `587`), Username `resend`, Password =
      Resend API key
    - Sender email `noreply@grtechsupport.com`, Sender name
      `Gardner Responder Technologies`
4. **Turn on Confirm email.** Authentication → Providers → Email → **Confirm email
   ON** (keep **Allow new users to sign up ON**). With it on, every sign-up returns
   the `confirm` outcome and must verify before signing in; the approval check then
   runs at sign-in.
5. **Send a code, not a link (Confirm signup template).** Like the reset flow, the
   extension confirms email with a **6-digit code** entered in the popup — no magic
   link — so the email carries no URL for a spam filter to flag as a domain mismatch.
   Authentication → **Emails → Templates → Confirm signup**: replace the whole body
   with the ready-to-paste, styled template at
   [`supabase/email-templates/confirm-signup.html`](email-templates/confirm-signup.html)
   (a minimal version is just `{{ .Token }}` with no `{{ .ConfirmationURL }}`).

    The user enters the code on the popup's confirmation step (or the **Confirm your
    email** link). No hosted page or Site URL is required for this flow.
    _(Optional)_ the repo's `site/` folder still deploys a brand
    [`site/index.html`](site/index.html) and an
    [`site/email-confirmed.html`](site/email-confirmed.html) landing page — useful if
    you ever switch confirmation back to a link (`{{ .ConfirmationURL }}` +
    Site URL `https://gardnerrespondertechnologies.com/email-confirmed`).

6. **`grteches.com` → brand (301).** Cloudflare → grteches.com: add a **proxied**
   placeholder `A @ 192.0.2.1` (and `A www 192.0.2.1`), then **Rules → Redirect
   Rules**: match `(http.host eq "grteches.com" or http.host eq "www.grteches.com")`,
   dynamic redirect to
   `concat("https://gardnerrespondertechnologies.com", http.request.uri.path)`,
   preserve query string, **301**. Lock it against spoofing with `TXT @ "v=spf1
-all"` and `TXT _dmarc "v=DMARC1; p=reject;"` (it never sends mail).

## Password reset

Crews reset their own password from the popup ("Forgot password?") with an
emailed **6-digit code** (OTP) — no hosted web page, because it does not use a
magic link. Two Supabase-side settings are required for it to work:

1. **Email delivery.** Configure custom SMTP as in
   [Email delivery (Resend + Cloudflare)](#email-delivery-resend--cloudflare)
   above. Until it's set up, "Send reset code" errors and the built-in sender only
   reaches your Supabase org/team — so test with the email you use for Supabase, not
   an arbitrary crew address.
2. **Send the code, not a link.** Dashboard → **Authentication → Emails →
   Templates → Reset Password**: the default body links `{{ .ConfirmationURL }}`
   (a magic link), but the popup asks for the OTP, so replace the whole body with
   the styled template at
   [`supabase/email-templates/reset-password.html`](email-templates/reset-password.html)
   (the key is `{{ .Token }}` — the 6-digit code — with no `{{ .ConfirmationURL }}`).

The popup flow: request a code (`/auth/v1/recover`) → enter the code + a new
password (`/auth/v1/verify` with `type=recovery`, then `PUT /auth/v1/user`) → the
password is changed and the popup shows a green success message. No session is
stored, so the user signs in with the new password and the approval gate applies
normally (a pending account still can't get in via reset). Until SMTP is set up, "Send reset code" errors; the
fallback is admin-driven — delete the user so they re-register, or set a new
password from Dashboard → Authentication → Users.

## Admin console (crew admins)

Crew admins manage their own org's pre-approved emails, **approve or deny pending
sign-up requests**, and **change members' roles** from a role-gated page in the
extension (the **Admin** button in the popup, or `admin.html` directly). The
multi-tenant model — `orgs`, `profiles` (role + org + `status`), org-scoped
`allowed_emails`, and RLS that isolates each admin to their own org — is created by
`schema.sql`.

**Bootstrap (super-admin, once per crew)** — create an org, promote its admin, and
point the crew's domain at the org so members self-register into it:

```sql
insert into public.orgs (name) values ('VF Ambulance') returning id;
update public.profiles set role = 'crew_admin', org_id = '<org-id>'
  where user_id = (select id from auth.users where email = 'admin@vfambulance.com');
update public.allowed_domains set org_id = '<org-id>' where domain = 'vfambulence.com';
```

Roles are `member` (default), `qa_auditor` (QA Mode only, no admin powers),
`crew_admin`, and `super_admin`. Admins add/remove
allow-listed emails for their own org; the people they add then self-register
through the popup's Create-account form. **Removing** an allow-listed email
deletes any account for it (a trigger deletes the `auth.users` row, which cascades
its `profiles` row), so it doubles as "remove and un-approve" — the person loses
access within one refresh cycle and must be re-approved to return. The **Members**
list has a separate **Remove** that deletes the account but **keeps** the
pre-approval, so the person can simply sign up again. RLS (not just the UI) stops
one crew's admin from seeing or touching another crew's data.

### Account approvals (pending sign-ups)

When someone creates an account whose email **isn't** pre-approved (no matching
`allowed_emails` or `allowed_domains`), the sign-up now succeeds as a **pending**
request instead of being rejected — provided they picked a crew in the popup's
**Your crew** dropdown (that crew's id rides along as sign-up metadata). The account
exists but **can't sign in**: the extension only stores a working session once the
account is `approved`. Their chosen crew's admins see them under **Pending
requests** and either:

- **Approve** (`approve_signup`) — flips the profile to `approved`; the person then
  signs in with the password they already set at sign-up. No second password step.
  Approving from the console also emails them a "you've been approved" notice (the
  `notify-approved` function, best-effort). Approving via the SQL runbook does not.
- **Deny** (`deny_signup`) — deletes the pending account (they can request again).

Pre-approved emails/domains skip all of this and are `approved` immediately. The
crew list comes from the anon-callable `list_orgs()`, and the sign-up form keeps the
crew picker **hidden until the typed email turns out not to be pre-approved** —
neither on `allowed_emails` nor by its domain on `allowed_domains` (checked via the
anon-callable `email_preapproved()`, which returns only a yes/no for the exact
address, so it can't enumerate the lists). A domain-approved crew therefore gets its
org from the domain's `org_id` (set at bootstrap), not from the picker.

### Changing a member's role

In the **Members** list, each approved member (other than yourself and any
super-admin) has a **Member / QA auditor / Crew admin** dropdown. Changing it calls
`set_member_role`, which — server-side, not just in the UI — lets a crew admin move
someone between `member`, `qa_auditor`, and `crew_admin` **within their own org
only**. It refuses to assign `super_admin` (still a SQL-only, super-admin task), to
touch a `super_admin`, or to change your **own** role (so you can't accidentally
lock yourself out). Promote a member to `crew_admin` to give them the Admin console;
`qa_auditor` grants only the popup's **QA Mode** toggle (chart-review freeze), no
admin powers; demote back to `member` to take either away.

`approve_signup`, `deny_signup`, and `set_member_role` are all `SECURITY DEFINER`
functions that re-check the caller is an admin acting inside their own org, so RLS —
not the console — is the real boundary. `profiles` stays read-only to clients (all
writes go through these functions).

## Security notes

- The `access_codes` / `allowed_domains` tables have RLS on with **no public
  policies**, so the publishable key cannot read or write them. Codes are only ever
  checked through `redeem_access_code()` (SECURITY DEFINER), which prevents code
  enumeration.
- **Access-code brute force** is throttled: `redeem_access_code()` logs each attempt
  per caller IP in `redeem_attempts` and locks an IP out after **5 failed attempts
  in 15 minutes** (successful redemptions are unaffected). The Edge Function forwards
  the client IP via `x-forwarded-for`; the table is RLS-locked (function/service-role
  only) and self-prunes rows older than a day.
- The gate is cooperative: it controls access for your own crews and honors
  expiry/revocation, but because an extension runs on the user's machine it is
  not proof against a determined technical bypass. That trade-off is by design.
