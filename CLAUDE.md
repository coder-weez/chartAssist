# GRTech ChartAssist — Claude Code Guide

> **Keep this file and `README.md` up to date.** When behaviour, architecture, or helper APIs change, update both documents in the same commit. CLAUDE.md is the technical reference for contributors and AI assistants; README.md is the user-facing reference. Neither should drift from the actual code.

> **Versioning:** bump `version` and `version_name` in `manifest.json` before publishing to the Chrome Web Store — Chrome rejects uploads where the version hasn't changed. Use semantic versioning: patch (`0.x.x.1`) for bug fixes, minor (`0.x+1.0.0`) for new features, major (`1.0.0.0`) for breaking changes. After merging to `main`, tag the commit to match (e.g. `git tag v0.4.0`). Tags live on `main`; don't tag feature branches.
>
> **1.0.0.0 milestone:** `1.0.0.0` was chosen deliberately as the first stable / feature-complete release (shipping the popup + Options UI refresh), not because of a breaking change. It succeeds `0.9.0.1`; the intermediate `0.10.0.0` was skipped in favour of the 1.0 milestone. Future _breaking_ changes bump the major from here (`2.0.0.0`, …); features and fixes continue as minor/patch (`1.1.0.0`, `1.0.0.1`).

> **Before pushing:** run `npm run format:check` (not a path-scoped `prettier --check`). The `lint` CI job runs both ESLint _and_ Prettier over the **whole tree**, so Markdown files like this one count — an unformatted `CLAUDE.md` or `README.md` will fail CI just like unformatted JS. Run `npm run format` to auto-fix.

## What this project is

A Chrome MV3 extension that injects an **AutoComplete** toolbar and a **Clear Fields** button into EMSCharts PCR pages. AutoComplete reads user-configured defaults from `chrome.storage.sync` and fills in matching form fields. Clear Fields blanks those same fields after a confirmation prompt. A **QA Mode** toggle (in the extension popup) freezes the toolbar so no buttons can be clicked during chart review. A **login gate** (email+password or a time-limited access code, backed by Supabase) disables the toolbar until an authorized user signs in — see [Authentication / login gate](#authentication--login-gate). No patient data is ever stored or transmitted — only login credentials, at sign-in.

## Architecture

```
src/
  manifest.json      — MV3 manifest; declares content scripts per page
  background.js      — Service worker; opens options tab with page anchor
  chartassist.js     — Shared helpers loaded before every page script
  chartassist.css    — Shared styles injected into EMSCharts pages
  options.html/.js   — Settings UI; saves defaults to chrome.storage.sync
  popup.html/.js     — Extension popup; login UI + QA Mode and dark-mode toggles
  auth.js            — Supabase login helpers (loaded in the popup only)
  page1.js           — Content script for EMSCharts page 1 (incident/unit info)
  page2.js           — Content script for EMSCharts page 2 (dispatch/HPI)
  page3.js           — Content script for page 3 (neuro/airway)
  page4.js           — Content script for page 4 (cardiac/respiratory)
  page5.js           — Content script for page 5 (physical exam)
  page8.js           — Content script for page 8 (billing/narrative)

supabase/            — Login backend (deployed separately; see supabase/README.md)
  schema.sql         — tables, RLS, domain-allowlist trigger, redeem_access_code()
  functions/redeem-code/ — Edge Function that validates access codes server-side
  functions/notify-approved/ — Edge Function that emails a user on approval (Resend API)
  email-templates/   — HTML bodies for the Supabase auth emails (confirm/reset/changed)

site/                — Static marketing site (Cloudflare Workers static assets)
  index.html         — Company home: brand hero + "Our tools" grid (ChartAssist featured)
  chartAssist.html   — ChartAssist product page, served at the clean URL /chartAssist
  styles.css         — Shared design system for index.html + chartAssist.html
  chartassist-logo.png — 128px logo (also the favicon); reused by the email templates
```

### Page 1 (`page1.js`)

Page 1 has a **hard-coded toolbar** with no Options configuration. It uses `caToolbar(true)` (the `skipDefaults` flag) to omit the Page Defaults button. Two labelled sections:

**Base** — buttons are **generated dynamically** from the live `select[name="Base_ID"]` dropdown at page load by the pure helper `caBaseOptions(selectEl)` (exported for tests): one button per real option, each labelled with the option's own text. Only genuine placeholder rows are skipped — a blank/`0`/`-1` value or an empty label. It does **not** skip by position: some facilities' dropdown leads with a real base and has no placeholder row, so skipping index 0 dropped that base's button (bug fixed). Clicking a button sets `select[name="Base_ID"]` to that option's value, triggers EMSCharts' own `getUnitPicklist()` callback, and overwrites `input[name="vehcloc"]` with the option's text label (no appending — always overwrites). Because the list is derived from the dropdown, adding/removing/renaming bases in EMSCharts is reflected automatically with no code change.

**Staffing** — ALS and BLS buttons call a shared `caSetStaffing(val)` helper that always overwrites (no append, no toast-gate) four fields:

| Field               | Selector                         | ALS value          | BLS value          |
| ------------------- | -------------------------------- | ------------------ | ------------------ |
| Unit Staffing Level | `select[name="unit_staff"]`      | `3`                | `2`                |
| Unit Capability     | `select[name="unit_capability"]` | `3`                | `4`                |
| Transport Code      | `select[name="transcode"]`       | `1` (Initial Trip) | `1` (Initial Trip) |
| Referred By         | `input[name="ref_md"]`           | Ontario County 911 | Ontario County 911 |

**Clear Fields** resets all six fields managed by page 1 (Base_ID, vehcloc, unit_capability, unit_staff, transcode, ref_md). Page 1 also runs `caHealthCheck(1, …)` with canaries for both sections, so silent DOM drift is caught here too.

### `caToolbar(skipDefaults)`

`caToolbar` now accepts an optional boolean. When `true`, the Page Defaults button is not appended. Pass `true` from page scripts that have no Options page section (e.g. page 1).

Page 5 and page 8 both use **multiple preset buttons** instead of a single AutoComplete button. Page 5 has Trauma / Medical / Refusal; page 8 has four built-in presets (On Scene / Transport / At Hospital / Refusal) plus four user-defined **custom slots**. Storage keys for page 5 follow the pattern `pg5_{category}_{fieldName}` (e.g. `pg5_trauma_head_comments`). The Options page shows three sub-tables within the single `<details id="section-page5">` block.

**Page 8 preset buttons are data-driven and toggleable.** Rather than a fixed set, page 8 renders its toolbar buttons from saved config via the pure helper `caPage8Presets(s)` (exported for tests; the page-8 analogue of page 1's `caBaseOptions`), using a **delegated** `bar.on('click', '.ca-preset', …)` handler and a per-button `data-preset-id` — the same dynamic-button + delegation pattern as page 1. A preset renders only when it is **enabled** (see below) **and** has non-blank content: a built-in needs non-blank comment text (its own `pg8_at_ref` / `pg8_lv_ref` / `pg8_at_rec` / `pg8_can_1` key); a custom slot needs **both** a non-blank label (`pg8_custom{1..4}_label`) **and** non-blank text (`pg8_custom{1..4}_text`) — "blank" means empty **or whitespace-only** (`.trim()`), so a toggled-on but empty preset shows no button. Built-in **labels are fixed** in `options.html` (toggle-only; only their comment text is editable); custom slots carry a user-typed label. Visibility is stored in the `pg8_enabled` **checkgroup** (a `|`-joined list of enabled ids: `at_ref`/`lv_ref`/`at_rec`/`can_1`/`custom1..4`). When `pg8_enabled` has **never** been saved (a user who predates the toggle, before their first Options visit) `caPage8Presets` defaults the four built-ins **on** and custom slots **off**, so the toolbar is unchanged after an update; `options.js`'s `pg8_seed_enabled` then writes that default the next time Options loads. (The legacy built-in "Custom" preset — old key `pg8_can_2` — was removed once the four custom slots superseded it. `pg8_migrate_custom` in `options.js` carries a user's saved `pg8_can_2` text into **custom slot 1** — titled "Custom" and toggled on — the first Options load after the update, so the old Custom button keeps working; it's skipped when `pg8_can_2` is blank or slot 1 is already in use.) The Clear button is appended synchronously (always present); preset buttons are `insertBefore('.ca-clear')` after the async storage read, so order is presets → Clear. Every fill still routes through `caCommentTarget()` (below).

**Page 8 vitals popup (`caVitalsCommentBox` / `caCommentTarget` in `page8.js`):** the Edit Vitals popup (`EditVS.cfm`) has its own vitals comment box, and it runs in a **same-origin iframe** (its buttons call `window.top.hidePopWin` / `window.top.doSimpleModal2`), so the top-frame content script has to reach into the iframe's `contentDocument` to fill it. **Gotcha:** the main page-8 vitals comment field in the top document carries the **same** `id="fld_vitals_comment"` (and `name="vs_comment"`) as the popup box — the id is _not_ unique — so the popup box can't be distinguished in the top document. `caVitalsCommentBox()` therefore **deliberately skips the top document** (that element is the main field / fallback) and scans same-origin iframes recursively (the subModal wrapper nests `loading.html` frames) for a visible `#fld_vitals_comment`, returning it or `null`. `caCommentTarget()` returns that element or the main `textarea[name=vs_comment]` selector. Every page-8 fill/clear routes through `caCommentTarget()`, so an open popup receives the comment and the main field does otherwise. `caFill`/`caClrField`/`caFlash` accept a DOM element or a selector string interchangeably (both pass through `jQuery(...)`, which works cross-document), which is why no change to those helpers was needed. `caVitalsCommentBox` / `caFindVitalsCommentInFrames` / `caCommentTarget` are local to `page8.js`, not shared globals, so they need no entry in `eslint.config.js`'s `caHelpers`.

Each page script is injected only on its matching EMSCharts URL (defined in `manifest.json`). All page scripts share `chartassist.js` via the `"js"` array in the manifest content script entry.

### QA Mode (`popup.html` / `popup.js`)

The extension popup exposes a **QA Mode** checkbox. **Role-gated:** the whole `#qa_row` is hidden by default and revealed (in `render()`, via `caCanUseQa(profile.role)`) only for `crew_admin`, `qa_auditor`, and `super_admin` — mirroring the Admin button's optimistic-reveal pattern (an instant read of a cached `ca_qa_eligible` flag, then a `caGetProfile` revalidation that rewrites the cache). `caGetProfile` calls back `cb(profile, determined)`: a **transient** failure (network blip, captive portal, briefly expired token) returns `determined=false`, and the popup then **keeps the cached Admin/QA state** rather than revoking it — only an authoritative read flips state. This stops a flaky connection from stripping a QA auditor's toolbar-freeze mid-review. When a signed-in user is authoritatively **not** QA-eligible (including any access-code session), the popup also forces `ca_qa_mode` off, so a hidden toggle can never leave someone's toolbar frozen. QA Mode itself is a review aid, not a security control. Its state is stored in `chrome.storage.local` as `ca_qa_mode` (boolean). When on:

- A `#ca-qa-film` overlay div (absolutely positioned over the toolbar) becomes visible, blocking all pointer events to the buttons beneath it and displaying a centred "QA MODE" label.
- The toolbar snaps to its CSS default position (`top: 8px; right: 8px`) on every page load, overriding any saved drag position.
- The `chrome.storage.onChanged` listener in `chartassist.js` reacts live if QA Mode is toggled while a PCR page is open.

When QA Mode is turned off the toolbar's current position is written to `ca_toolbar_pos` (via `caSavePosition`) so subsequent page loads restore to that location rather than the pre-QA saved position.

**Race condition note:** toolbar position restore and QA Mode check are merged into a single `caApplyInitialState` call (one `chrome.storage.local.get` for both keys). Previously they were two separate async calls whose callbacks could resolve in either order, causing QA Mode's position reset to be undone by a late-resolving position restore.

jQuery is **vendored** at `src/jquery.min.js` (a deliberately version-less filename so updates are an in-place overwrite — the manifest references never change). The actual version lives in the file's banner comment, in `README.md`, and in update PR titles.

## Authentication / login gate

The toolbar is gated on a valid **login session**. Until a user signs in, every page script's actions are inert and a lock overlay covers the toolbar.

**Surfaces:**

- **`popup.html` / `popup.js`** — the sign-in UI. A signed-out view (email + password sign-in, a self-service **Create account** form — with a **Your crew** selector, `#signup_org` inside `#signup_org_field`, placed **below the password fields**, populated from `caListOrgs`, and **hidden by default**; `updateCrewFieldForEmail` (on email blur) reveals it only once the typed email turns out **not** pre-approved — neither on `allowed_emails` nor by domain (via `caEmailPreapproved`) — since only an un-pre-approved sign-up needs to pick a crew to route its request to — and a **Forgot-password** reset flow — all switched via `showAuthMode('signin'|'signup'|'reset')` — a "Remember my email" checkbox, and a collapsible access-code field) and a signed-in view (identity, expiry, Sign out) toggle via `render()` on the `ca_session` state. `popup.html` loads `auth.js` **before** `popup.js`. The theme block stays wired first (unchanged).
- **`auth.js`** — loaded in the popup **only** (PCR pages never call the network). Holds the Supabase config constants (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SESSION_TTL_HOURS = 24 * 30` ~1 month, and the optional `ALLOWED_EMAIL_DOMAINS` client-side hint) and the helpers: `caSignIn`, `caSignUp(email, password, orgId, cb)`, `caListOrgs` (all crews for the sign-up dropdown, from the anon `list_orgs()` RPC), `caEmailPreapproved` (anon `email_preapproved()` — true when the email is on `allowed_emails` **or** its domain is approved; keeps the crew picker hidden for it), `caCanUseQa` (pure — QA-Mode-eligible roles), `caRequestPasswordReset` / `caConfirmPasswordReset` (self-service reset via an emailed 6-digit OTP), `caConfirmSignup` / `caResendConfirmation` (email confirmation via an emailed 6-digit OTP — same code-not-link approach, verified in the popup; `caConfirmSignup` also finalizes through `caFinalizeUserSession`, returning `'signedin' | 'approval'`), `caRefreshSession`, `caRedeemCode`, `caSignOut`, the pure `caSessionValid` / `caEmailDomainAllowed`, and the remember-email helpers. **Approval gate:** both `caSignIn` and sign-up's auto-login route through `caFinalizeUserSession` → `caFetchProfileStatus` (a `my_profile` read), which stores a working session **only for an `approved` account** — a `pending` one is reported without a session (and so no `ca_session` is ever written for it, keeping the PCR-page gate simple). It fails **open** on an unknown status (a transient error must not lock everyone out); only an explicit `pending` blocks. `caSignUp`'s `cb(err, outcome)` returns `'signedin' | 'confirm' | 'approval'`. `caConfirmPasswordReset` (the "Forgot password?" path) changes the password but stores **no session** — the user signs in afterward with the new password, so the approval gate applies normally and the gate can't be bypassed via reset. The popup then shows a green "password changed" success message (not the app view). All network calls are plain `fetch` against Supabase REST endpoints — no SDK, matching the vendored-jQuery approach. Exposes `caSessionValid` / `caEmailDomain` / `caEmailDomainAllowed` / `SESSION_TTL_HOURS` via the CommonJS test shim.
- **`chartassist.js`** — the in-page gate. It caches the session (`caSession`, primed in `caApplyInitialState`, kept fresh by the `storage.onChanged` listener alongside `ca_qa_mode`/`ca_theme`), locks the toolbar via a `#ca-login-film` overlay + `.ca-locked` class (`caApplySessionState`, which also arms a `setTimeout` so the bar locks the instant the session lapses with no storage event), and gates `caActive(page)` with a local `caHasSession()` check. The toolbar is **created with `.ca-locked` (fail-closed)** so it can't flash fully-enabled before the async session read resolves; `caApplySessionState` removes the class once a valid session is confirmed. `caHasSession` **mirrors** `auth.js`'s `caSessionValid` on purpose, so PCR pages need not load `auth.js`. `caSetSession` is exported for tests.
- **`options.html` / `options.js`** — the Options page is reachable outside the popup (Chrome's own "Options" entry, `chrome://extensions`, or a direct URL), so it enforces the same gate: a full-page `#ca-options-gate` overlay (shown by default = **fail-closed**) covers the settings until a valid `ca_session` exists. `ca_apply_options_gate` mirrors `caSessionValid` (like chartassist.js), re-checks on `storage.onChanged` + a timer, and — opened as a plain file with no extension context — shows the settings (nothing to gate). The gate wiring lives in the browser-only `else` branch, so tests are unaffected.

**Session model** (`chrome.storage.local` key `ca_session`): `{ access_token, refresh_token, session_expires_at, email|null, source }`. `session_expires_at` (epoch-ms) is the **single source of truth** for the gate. A user login stamps it 1 month (30 days) ahead; `caRefreshSession` swaps the Supabase access token **without** moving it (so a revoked/deactivated account drops within one refresh cycle while the 1-month cap still holds). It signs the user out **only on an explicit auth failure (400/401)** — an ambiguous non-JSON 200 (a captive-portal / proxy interstitial on venue or hospital Wi-Fi) or a 5xx is treated as a soft network error that keeps the session, so field crews aren't spuriously logged out. An access-code session is capped by the code's own `expires_at`. Remember-email stores **only the email** under `ca_remember_email` — never the password.

**Backend (`supabase/`):** accounts are Supabase's built-in `auth.users`. A BEFORE-INSERT `enforce_allowed_domain` trigger gates sign-up — it admits an email whose full address is in `allowed_emails` (one-off individuals) or whose domain is in `allowed_domains` (both become **approved** accounts); an email matching neither is **still admitted, but only when the sign-up selected a real crew** (passed as `raw_user_meta_data.requested_org_id`), landing as a **pending** account for that crew's admins to approve/deny (no valid crew ⇒ rejected). The AFTER-INSERT `handle_new_user` trigger sets `profiles.status` (`approved`/`pending`) and the org accordingly — a **pre-approved** account's org comes **only from its allow-list row** (NULL until a super-admin assigns it), **never** from the client-supplied `requested_org_id`, so a pre-approved sign-up can't self-assign (approved, unreviewed) into an arbitrary crew's roster; `requested_org_id` is honoured only on the **pending** path where it routes the request. So crews self-register from the popup (needs Supabase Auth's "Allow new users to sign up" on); the anon-callable `list_orgs()` feeds the crew dropdown. **Security note:** admitting non-pre-approved emails broadens who can create an `auth.users` row (previously blocked outright) — but they are inert until approved, exactly the intended request-access flow. `access_codes` + the `redeem_access_code` SQL function implement time-limited codes, invoked by the `redeem-code` Edge Function (deployed `--no-verify-jwt`, using the **service-role** key); RLS with no public policies keeps those tables unreadable by the publishable key. Because that endpoint is anonymous and public, it is **rate-limited**: the Edge Function forwards the caller IP (`x-forwarded-for`) and `redeem_access_code(p_code, p_ip)` logs each attempt to `redeem_attempts` and returns JSON, locking an IP out after **5 failed attempts in 15 minutes** (only failed guesses count; the table self-prunes). The extension ships only the **publishable key** (`sb_publishable_…`, public by design) — the service-role key lives only in the function's env. Configure `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` in `auth.js` and the host in `manifest.json`. Full schema, RLS, and setup: `supabase/README.md`.

**Cooperative model:** the gate runs client-side, so it controls access for cooperative users (your crews) and honors expiry/revocation, but is **not** proof against a determined technical bypass — accepted by design. Do not describe it as bypass-proof.

**Admin console (`admin.html` / `admin.js`):** a separate, role-gated page (not Options) for crew admins to manage their org's allow-list, approve/deny pending sign-ups, and manage members (including changing roles). Reached via an admin-only **Admin** button in the popup (shown from a cached `ca_admin` flag, then revalidated via `caGetProfile`/`caIsAdminRole`) or a direct URL; otherwise a fail-closed `#ca-admin-gate` — like the Options gate but also requiring an admin **role** — covers it. It calls Supabase over PostgREST with the user's token (`admin_fetch`), so **RLS is the real boundary** (the gate is only UX). Because access tokens live ~1h but the gate holds 30 days, `admin_fetch` **silently refreshes once on a 401 and retries** (and the gate refreshes-then-retries `caGetProfile` before declaring the session dead), so a console left open or opened cold shows the data instead of a misleading "Not authorized". Multi-tenancy in `supabase/schema.sql`: `orgs`, `profiles` (`user_id`/`org_id`/`role`/`status`/`email`), `org_id` on the allow-list tables, `auth_org_id()`/`auth_is_admin()` SECURITY-DEFINER helpers (avoid RLS recursion), a `my_profile()` RPC (`caGetProfile`), and a `handle_new_user()` trigger that provisions each profile; super-admins assign the top roles by SQL, crew admins toggle member↔crew_admin from the console. Two removals, both server-side and destructive: deleting an **allowed_email** deletes the account too (revoke); the **Members** Remove (`remove_member` RPC) deletes the account but keeps the pre-approval. `remove_member` is guarded like `set_member_role` — it refuses self-removal, a `super_admin` target, and removing the org's **last remaining admin** (so a crew can't be left with nobody who can approve sign-ups). Details in `supabase/README.md`.

**Account approvals & role management (Pending requests / Members cards):** self-registered users without a pre-approved email/domain arrive as `status='pending'` profiles in the crew they picked. The console lists them with a plain `profiles?status=eq.pending` read (the existing `profiles_org_read` policy already scopes it to the admin's org — no new policy) and acts through admin- and org-gated SECURITY-DEFINER RPCs: `approve_signup(p_user_id)` flips status to `approved` (the person then signs in with the password they set at sign-up), and `deny_signup(p_user_id)` deletes the pending account. `set_member_role(p_user_id, p_role)` switches an **approved** member between `member`, `qa_auditor` (a QA-review role — QA Mode but no admin powers), and `crew_admin` — it refuses `super_admin` (a SQL-only role), a `super_admin` target, and the caller's **own** role (no self-lockout). The Members list filters to `status=eq.approved` and renders an inline role `<select>` for editable rows (plain text for self and super_admins). All three RPCs are `grant execute … to authenticated` **only** — clients never write `profiles` directly (its RLS stays read-only), the same pattern as `remove_member`. `admin.js` calls them via `admin_fetch('/rest/v1/rpc/…')`; each card has its own status line (`showPendingMsg` / `showMembersMsg`). **Live sync across admins:** since there's no realtime SDK (plain `fetch` only), the console re-fetches the shared lists (`loadEmails`/`loadPending`/`loadMembers`) on a 20s `setInterval` (`startConsolePolling`, armed only while the gate is open, cleared when it locks) and on tab focus/visibility, so one admin's approve/deny/role/removal shows up in another admin's open console — `refreshConsole` skips the redraw while a `<select>` is focused so it can't yank a dropdown out from under an in-progress change.

**eslint:** `auth.js`'s exported helpers are registered as `caAuthHelpers` (consumed by `popup.js`); `auth.js` is added to the `varsIgnorePattern: '^ca'` group so its cross-file `ca*` helpers aren't flagged unused. New popup-consumed auth helpers must be added to `caAuthHelpers`.

## Hosting & external services (Supabase · Resend · Cloudflare)

Beyond the Chrome extension itself, the login gate depends on three hosted services. None of them ship in the extension package (`release` uses `--source=src`); they are configured out-of-band, and the full setup lives in `supabase/README.md`.

- **Supabase** — the auth backend. Built-in `auth.users` for accounts/passwords, the `public` schema (`orgs` / `profiles` / allow-lists / `access_codes`) with RLS + SECURITY-DEFINER RPCs (`supabase/schema.sql`), and the `redeem-code` Edge Function. The extension talks to it over plain `fetch` (PostgREST + `/auth/v1`) and ships only the **publishable** key. Configured via `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` in `auth.js` and the host in `manifest.json`.
- **Resend** — transactional email. Supabase's built-in mailer is test-only (rate-limited, org-members only), so Resend is wired as Supabase's **custom SMTP** (`smtp.resend.com`, sender `noreply@grtechsupport.com`) to deliver the email-confirmation and password-reset codes. Both flows use a 6-digit **OTP** (`{{ .Token }}`), not a magic link, so the email carries no URL to mismatch the sending domain — bodies live in `supabase/email-templates/`. No email is ever sent from the extension; Supabase sends it server-side. The `notify-approved` Edge Function additionally sends the "you've been approved" notice **directly via the Resend API** (not SMTP), using the same verified domain and a `RESEND_API_KEY` secret.
- **Cloudflare** — DNS + web hosting across the three domains:
    - **DNS / email-auth records** for the sending domain `grtechsupport.com` — SPF/DKIM/DMARC that make Resend mail pass authentication and stay out of spam.
    - **Email Routing** — receives `support@grtechsupport.com` (forwarding), independent of Resend's `send.` sending subdomain.
    - **Workers static assets** — hosts `site/` on `gardnerrespondertechnologies.com` (config in `site/wrangler.toml`, `[assets] directory = "."`; Workers Builds auto-deploys on push). Pages: the company home `index.html` at `/`, the ChartAssist product page `chartAssist.html` at the clean URL `/chartAssist` (Workers `html_handling` drops the `.html`; the file is mixed-case, so links must use `/chartAssist` exactly). Both pages share `styles.css`. (The former `email-confirmed.html` fallback was removed once email confirmation moved fully to the in-popup 6-digit code; Supabase's **Site URL** now points at `/chartAssist` so any stray auth redirect lands on a live page instead of a 404.)
    - **Redirect Rule** — `grteches.com` 301-redirects to the brand domain.

**Domain roles:** `gardnerrespondertechnologies.com` = brand + site + Supabase Site URL; `grtechsupport.com` = email sending + support; `grteches.com` = short alias / redirect. The gate stays **cooperative** regardless of hosting — these services enforce email delivery and (via RLS) data isolation, not a bypass-proof client.

**When an end user receives email** — every case is a **Supabase Auth event** delivered via Resend; the extension itself never sends mail:

1. **Email-confirmation code** — at sign-up when Supabase "Confirm email" is ON, and on the popup's **Resend code** action. A 6-digit code, verified in the popup (`caConfirmSignup` / `caResendConfirmation`).
2. **Password-reset code** — when the user starts "Forgot password?" (`caRequestPasswordReset` → 6-digit code, `caConfirmPasswordReset`).
3. **Password-changed notice** — Supabase's built-in security notification, sent after a reset sets a new password.

4. **"You've been approved" notice** — when a crew admin **approves** a pending sign-up **from the console**, `admin.js` fire-and-forget calls the JWT-verified `notify-approved` Edge Function, which re-checks the caller is an admin, derives the recipient **server-side** from `user_id`, and sends via the **Resend API** (not SMTP — approval isn't a Supabase Auth event). Best-effort: a send failure never blocks the approve. Ad-hoc **SQL** approvals don't email.

No email is sent for **deny / role change / member removal** — those only change `profiles.status`/`role`, which Supabase Auth knows nothing about. The extension never triggers magic-link, invite, email-change, or reauthentication emails either, and access-code redemption sends nothing.

## Dependency updates (CI)

All dependency updates arrive as **review-only pull requests** — nothing is merged to `main` automatically.

- **EMSCharts itself** is watched by `.github/workflows/emscharts-watch.yml` (weekly, plus `workflow_dispatch` with a `force_baseline` test input). It fetches Zoll's public emsCharts release-notes page, extracts the newest `X.Y (date)` version, and compares it to `.github/emscharts-baseline.txt`. On a new release it bumps the baseline and opens a PR prompting a manual re-check of the form fields the extension binds to. This is an **early-warning signal only** — the authenticated PCR DOM (the actual selectors) is behind login + PHI and can't be scraped in CI; that drift is caught at runtime by `caHealthCheck` (see below). Note the watched page tracks emsCharts **NOW**; repoint `WATCH_URL` if a classic-PCR feed appears.
- **jQuery** is vendored, so Dependabot can't track it. `.github/workflows/jquery-update.yml` runs weekly (and on demand via `workflow_dispatch`), compares `src/jquery.min.js`'s banner version against the npm registry, and on a newer release downloads it from the jQuery CDN, **verifies its SHA-256 against the npm tarball copy** (aborts on mismatch), overwrites the file, bumps the version in `README.md`, and opens a PR. Test it with the `force_version` input (e.g. `3.6.0`).
- **GitHub Actions and the npm release tooling** (`chrome-webstore-upload-cli`) are watched by Dependabot (`.github/dependabot.yml`), `github-actions` + `npm` ecosystems, weekly.
- **One-time setup:** enable _Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"_ or the PR step fails. Dependabot reads its config from the **default branch**, so it activates only once this is on `main`.

## Key shared helpers (`chartassist.js`)

### `caFill(selector, value, friendlyName)`

Standard field filler. Handles text inputs, textareas, and selects. Returns `true` if anything visible happened (fill or toast), `false` for silent no-ops (no element, no value, or field already exactly matches the default).

- **Text/textarea**: reads current value with `el[0].value` (not `.val()` — EMSCharts textarea state can desync with jQuery). Appends if non-empty and value not already present (`indexOf` check). Shows toast on append.
- **Select**: skips silently if `value` is `null`, `""`, `"0"`, or `"null"` (the string) — all treated as blank so that a stored blank option never triggers a fill or flash. The field's _existing_ value is treated as blank when it is any of those **or** equals the first option's value (the placeholder, e.g. Airway Status's `-1`), so a field still on its placeholder is filled, not toasted. Shows toast only if a _different_ non-blank value is already selected.
- Calls `caFlash` on success.

### `caFillPopup(fieldName, value, friendlyName)`

For EMSCharts **popup multi-select** fields — these have no `<select>` element. The pattern is:

- Hidden input: `input[name="{fieldName}_text"]` — stores the text label
- Display span: `#{fieldName}_htmlid` — shows the selected text
- An ADD+ button (`[name="add"]`) that EMSCharts normally hides after a popup save

`caFillPopup` targets the hidden input, sets it via `el[0].value`, triggers `change`, updates the display span, and hides the field's own ADD+ button. Silently skips if `current === value` (case-insensitive). Shows toast if a different value is already present. Returns `true` if anything visible happened, `false` for silent no-ops — same contract as `caFill`.

**Scoping the ADD+ button — `caPopupAddButton(fieldName)`:** EMSCharts reuses `name="add"` for **every** multi-pick ADD+ button on the page, so `span.parent().find('[name="add"]')` (the old approach) could hide an _unrelated_ field's button when two widgets share a container — this is how page-2 fills were silently hiding the patient page's `cmscode` ADD+ button. Each button's onclick names its own field (`multiPickEnc('...', '<fieldName>', ...)`), so `caPopupAddButton` selects only the button whose onclick contains `'<fieldName>'` (quoted on both sides so a prefix like `pt_moved` can't match `pt_moved_from_multi`). Both `caFillPopup` (`.hide()`) and `caClrPopup` (`.show()`) toggle via this helper. Consequence: if EMSCharts ever renders a popup field whose ADD+ button doesn't carry the field name in its onclick, the button simply won't auto-hide (cosmetic) — it will never hide the wrong field's button.

**Important:** popup fields store **text labels**, not numeric IDs. Options in `options.html` for popup fields must use `value="Stretcher"` not `value="4880"`.

### `caFillPertNeg(divId, value, friendlyName)`

For EMSCharts **pertneg** (pertinent positive/negative) multi-select fields such as Mental and Neurological on page 3. These are different from popup fields — they use a `div.multipick-common` containing a `span.pcr-multi-pick-list` for display, plus **four** parallel hidden inputs per group.

**Critical:** the server reloads each selection from the numeric **id** field (`{typ}`), _not_ the text field. Setting only the text label looks correct in the session but is silently discarded on save — the old id reloads when you return to the page. All four hidden fields must be written:

| Variant     | id field    | text field       | cmdfacCustId field       | examvalId field        |
| ----------- | ----------- | ---------------- | ------------------------ | ---------------------- |
| present     | `{typ}`     | `{typ}_text`     | `{typ}_cmdfacCustId`     | `{typ}_examvalId`      |
| not-present | `{typ}_neg` | `{typ}_text_neg` | `{typ}_cmdfacCustId_neg` | `{typ}_examvalId_negs` |

`caPertNegFields(divId)` derives all four names from the divId (`mental_text_id` → present mental; `mental_text_neg_id` → not-present mental; `typ` is `mental`/`neuro`).

- `value` is a **`|`-delimited** string of text labels from Options. `|` is used (not `,`) because some labels contain commas (e.g. `"Altered mental status, unspecified"`); splitting on `,` corrupted them — this was the original save bug.
- IDs are **facility-specific** (the picklist URL carries `cmdfac=...`), so labels are resolved to ids at fill time, not stored. `caPertNegCatalog(typ, params)` fetches `/common/pertneg_picklist.cfm` and parses each `input[name="exam_value_id"]` checkbox's `tmpname` (label), `value` (id), `cmdfaccustid`, and `ex_valid` attributes into a label→attributes map, cached per type. `params` is the 4th argument of the field's `pertnegPick(...)` onclick.
- **Async:** the fetch makes `caFillPertNeg` resolve its work in a promise; it returns `true` synchronously when there is something to fill.
- **Always overwrites** existing content (skips only if the display already matches exactly). EMSCharts' own default (e.g. a stale "Combative") is replaced by the user's configured default.
- Uses **native** DOM events (`dispatchEvent(new Event(...))`), not jQuery `.trigger()` — EMSCharts binds native listeners that jQuery synthetic events don't reach.

### `caClrField(selector)` / `caClrPopup(fieldName)` / `caClrPertNeg(divId)`

Companion clear helpers, called by the **Clear Fields** button on each page. Each mirrors its fill counterpart:

- `caClrField` — sets text/textarea to `""` or select to `""`.
- `caClrPopup` — clears the `_text` hidden input and display span; shows the field's own ADD+ button (via `caPopupAddButton`, see above).
- `caClrPertNeg` — blanks all four hidden fields (id/text/cmdfacCustId/examvalId, present or not-present per the divId) and the display span; shows the ADD+ button.

### `caToast(message)` / `caFlash(selector)`

- Toast: yellow stacking notification, 6s, `⚠` prefix via CSS `::before`. Stacks vertically.
- Flash: brief green background pulse on filled elements. Sets an inline `transition` style then clears both `transition` and `background-color` after the animation completes, leaving no residual inline styles.

### `caToolbar()`

Creates (once) a fixed-position draggable toolbar. The top `#ca-header` row holds the drag handle (`#ca-drag`, ⠿) on the left and a reset button (`#ca-reset`, ↺) on the right. Reset calls `caResetPosition`, which snaps the toolbar back to its CSS default (`top: 8px; right: 8px`) and **clears** `ca_toolbar_pos` (rather than re-saving pixel coordinates, so it stays correct across a window resize) — so the reset also holds on subsequent page loads. Appends a "Page Defaults" button that sends `{ action: 'openOptions', page: N }` to the background service worker, which opens the options page scrolled to `#section-pageN`. Each page script also appends its own action buttons (AutoComplete, Clear Fields, and any preset buttons) to this toolbar.

### `caHealthCheck(page, anchors)`

Runtime DOM-drift detector, called once per page from each page script's `$(document).ready`. `anchors` is a short list of **canary selectors** — one or more representative critical fields per section the page fills. On page load it checks which anchors fail to resolve; any missing ones are shown in a `caToast`, `console.warn`ed (with the specific selectors) to the page's DevTools console, and recorded under `chrome.storage.local` key `ca_health` (keyed `page{N}`, storing `{ missing, path, ts }`). When a previously-broken page resolves cleanly again, its stale report entry is deleted. **Privacy:** only selector strings, page number, URL path, and a timestamp are stored — never field content. Returns the array of missing selectors (empty when healthy).

This is the counterpart to the `emscharts-watch.yml` CI job: the watcher gives advance notice of _announced_ releases, while `caHealthCheck` catches the _silent DOM renames_ the release notes won't mention — since only the extension, running on the authenticated page, ever sees the real selectors. Keep at least one canary per section so drift in that section is still detected.

## Page guard (`caActive` / `caOnPage`)

Every click handler in a page script must open with:

```js
if (!caActive(N)) return; // N = this script's page number
```

`caActive(page)` (in `chartassist.js`) returns `false` — so the handler bails — when **either**:

1. **The extension context was invalidated** (reload/update while the page is open): `!chrome.runtime || !chrome.runtime.id`. This is the original guard, now folded into the helper.
2. **The URL is no longer this script's page**: `caOnPage(page)` is false. EMSCharts can swap page content via history navigation **without a full reload**, which leaves a page script's handlers bound while the user has moved on to another page (e.g. the patient page `pagept.cfm`). Without this check, clicking a still-visible toolbar button would run the wrong page's fills/clears against whatever DOM is now present. `caOnPage` matches `/pr/page{N}.cfm` case-insensitively and requires `.cfm` immediately after the number (so `page1` never matches `page10`/`pagept`).

New page-consumed `ca*` helpers must also be registered in `eslint.config.js` (`caHelpers`) or `no-undef` fails CI.

## Options system (`options.js`)

Fields are declared in five arrays at the top of `options.js`:

- `txtInputs` — `<input type="text">` fields (includes the page-8 custom-slot labels `pg8_custom{1..4}_label`)
- `txtAreas` — `<textarea>` fields (includes the page-8 custom-slot text `pg8_custom{1..4}_text`)
- `selBoxes` — `<select>` fields (includes popup fields, stored as selects in options UI)
- `pertNegGroups` — pertneg checkbox-group fields (Mental/Neurological). These have **no wrapper element with the storage key as id**; instead, each checkbox carries a `data-group="{storageKey}"` attribute. Saved as a **`|`-delimited** string of text labels (not comma — labels can contain commas). A dedicated mutex (`apply_pertneg_mutex`/`wire_pertneg_mutex`) links the Present/Not-Present pairs.
- `checkGroups` — generic checkbox-group fields with the same `data-group` storage shape as `pertNegGroups` but **no mutex**. Currently just `pg8_enabled` (which page-8 preset buttons are shown).

Storage keys follow the pattern `pg{N}_{fieldName}` (e.g. `pg2_chief_complaint`, `pg3_airway_status`).

`_all_opts()` builds a map of `{storageKey: type}` from all five arrays (`pertNegGroups` and `checkGroups` both map to type `"checkgroup"`). `get_user_values`, `restore_options`, and `reset_options` all handle `"checkgroup"` type before the `getElementById` call, using `document.querySelectorAll('[data-group="..."]')` instead. **Page-8 visibility defaults:** the load chain is `migrate_legacy_keys` → `pg8_seed_enabled` → `pg8_migrate_custom` → `restore_options`. `pg8_seed_enabled(done)` seeds `pg8_enabled` with the four built-in ids (`PG8_DEFAULT_ENABLED`) when it is absent, so the built-in buttons stay visible after an update; `pg8_migrate_custom(done)` then carries a removed-built-in "Custom" value (`pg8_can_2`) into custom slot 1 (see the page-8 section above). `reset_options` re-ticks those same built-in boxes (via `pg8_check_default_enabled`) so a Reset restores default page-8 visibility instead of hiding every button.

`migrate_legacy_keys(done)` runs on options load **before** `restore_options` and copies settings saved under old key names forward to the current names (then removes the old key), so renamed fields repopulate rather than being lost. The rename table lives in `legacy_key_map()` (e.g. `pg3_gcs_eye` → `gcs_eye_1`, `pg3_stroke_scale` → `stroke_scale`, and the single page-5 exam keys like `pg5_head_comments` → all three `pg5_{trauma,medical,refusal}_head_comments`). A migrated target that already holds a value is never clobbered. Only unambiguous renames are mapped; genuinely removed or re-purposed fields (the old `pg2_als_assessment`, the `pg4_dors_*` pulse selects) are left untouched in storage, not guessed into the wrong field.

**Do not re-introduce an auto-pruning step.** A previous `prune_stale_keys()` deleted any stored key the current version didn't recognize on every options load — but a _renamed_ key is unrecognized, so it silently wiped users' saved defaults on the first load after an update (the "options not preserved after update" bug). Storage preservation now always wins over tidiness: orphaned keys are harmless (tiny, invisible) and are left in place.

### Theme toggle

The Options page header has a sun/moon **theme toggle** (`#theme-toggle`). `init_theme_toggle()` runs on load: it reads the saved choice and stamps `data-theme="light"|"dark"` on `<html>`. The CSS defines light tokens on `:root`, follows the OS via `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])`, and lets an explicit `:root[data-theme='dark']` / `[data-theme='light']` override win in both directions (each also sets `color-scheme` so native controls match). With no saved choice the page follows the OS; clicking the toggle forces a theme and persists it to `chrome.storage.local` under `ca_theme` (same store as `ca_qa_mode`), with a `localStorage` fallback so the toggle still works when `options.html` is opened outside the extension.

**`ca_theme` is a single, extension-wide dark-mode preference** ('dark' | 'light' | unset = follow the OS). It is shared by three surfaces, so one control themes everything:

- **Options page** — the sun/moon toggle described above.
- **Popup** (`popup.html` / `popup.js`) — a matching sun/moon button in the header. Its theme code is the same pattern as the Options page (guarded `chrome`/`localStorage` access) and is wired _first_ so a missing `chrome` can't abort it. Toggling here writes `ca_theme` and themes the popup (CSS variables with a `:root[data-theme='dark']` override).
- **Injected toolbar** (`chartassist.js` / `chartassist.css`) — `caApplyTheme(bar, stored)` toggles a `.ca-dark` class on `#ca-toolbar` from `caEffectiveTheme(stored)` (unset ⇒ `matchMedia('(prefers-color-scheme: dark)')`). It is applied in `caApplyInitialState` and re-applied live from the `chrome.storage.onChanged` listener, so toggling from the popup restyles an open PCR page's toolbar immediately. Only the toolbar is restyled, never the host EMSCharts page.

## EMSCharts popup multi-select field names (page 2)

| Friendly name          | `caFillPopup` fieldName | Hidden input selector                    |
| ---------------------- | ----------------------- | ---------------------------------------- |
| Moved to Vehicle Via   | `pt_moved_via`          | `input[name="pt_moved_via_text"]`        |
| Position in Vehicle    | `pt_position`           | `input[name="pt_position_text"]`         |
| Moved From Vehicle Via | `pt_moved_from_multi`   | `input[name="pt_moved_from_multi_text"]` |
| Transport Assessment   | `transassess`           | `input[name="transassess_text"]`         |

## EMSCharts pertneg field names (page 3)

These use `caFillPertNeg` / `caClrPertNeg`. The hidden input name equals the divId with `_id` stripped.

| Friendly name              | `divId`              | Hidden input selector           | Storage key              |
| -------------------------- | -------------------- | ------------------------------- | ------------------------ |
| Mental — Present           | `mental_text_id`     | `input[name="mental_text"]`     | `pg3_mental_present`     |
| Mental — Not Present       | `mental_text_neg_id` | `input[name="mental_text_neg"]` | `pg3_mental_not_present` |
| Neurological — Present     | `neuro_text_id`      | `input[name="neuro_text"]`      | `pg3_neuro_present`      |
| Neurological — Not Present | `neuro_text_neg_id`  | `input[name="neuro_text_neg"]`  | `pg3_neuro_not_present`  |

## Adding a new field — checklist

1. **`options.html`**: add a `<tr>` with a label and the appropriate input/select/textarea. Use `id="pg{N}_{fieldName}"`.
2. **`options.js`**: add the key to `txtInputs`, `txtAreas`, or `selBoxes`.
3. **`page{N}.js`**: add a `caFill` or `caFillPopup` call inside the `chrome.storage.sync.get` callback, reading directly from `s["pg{N}_{fieldName}"]`.
4. **`page{N}.js`**: add a matching `caClrField`, `caClrPopup`, or `caClrPertNeg` call inside the `.ca-clear` click handler.
5. For popup fields: use text-label option values in `options.html`, not numeric IDs.
6. If the field belongs to a **new section** not yet represented in that page's `caHealthCheck(N, [...])` canary list, add one selector for it so DOM drift in the section is still detected. (Individual new fields in an already-covered section don't need their own canary.)

## Common pitfalls

- **Wrong element type**: EMSCharts popup fields have no `<select>` — use `caFillPopup`, not `caFill`.
- **Text vs numeric values**: standard selects use numeric IDs (e.g. `"1240"` for Minutes); popup fields use text labels (e.g. `"Stretcher"`). Check the actual EMSCharts DOM before adding options.
- **jQuery `.val()` unreliable for read-back**: always use `el[0].value` to read current content of text inputs and textareas.
- **Blank-option values vary**: GCS/stroke scale blanks use `value="null"` or `value="0"`; Airway Status uses `value="-1"`. For the incoming `value`, `caFill` treats `null`/`""`/`"0"`/`"null"` as blank. For the field's _existing_ value it additionally treats the **first option's value** as blank (the first `<option>` is always the placeholder), so a field still showing its placeholder is correctly seen as empty regardless of that placeholder's value (e.g. `-1`) and gets filled rather than toasted.
- **Background service worker required for `chrome.tabs`**: content scripts cannot call `chrome.tabs.create`. Send a message to `background.js` instead.
