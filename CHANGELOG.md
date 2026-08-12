# Changelog

User-facing changes to EMSCharts Assist, newest first.

**On each release:** copy the top entry into the Chrome Web Store listing's
"What's new" block. The store has no separate changelog field, so that block
lives at the **top of the Description — just under the opening tagline, above
"What it does:"**. Keep only the latest one or two versions in the listing; the
full history stays here. Write entries short and for EMS crews (no code or
selector details). When several unreleased versions ship in one store package
(as below), use the combined "What's new" block as the store copy — the store
publishes a single build, not each version separately.

## What's new — 1.3.0.0 — unreleased

**Sign-in now required.** ChartAssist keeps your tools behind a login so only your
authorized crews can use it:

- **Sign in with your work email and password** from the extension popup. Until
  you do, the toolbar on EMSCharts stays locked. You stay signed in for 1 month.
- **Create your own account** right in the popup with your work email — anyone at
  an approved domain can register, so there is no per-person admin setup.
- **Temporary access codes** let an admin grant time-limited access (e.g. a
  24-hour ride-along) without creating an account — just enter the code.
- **Remember my email** pre-fills your address next time; your password is never
  stored.

Signing in sends only your login details to the sign-in service — never any
patient data. See the Privacy Policy for details.

## What's new — combined 1.0.0.0 + 1.1.0.0 + 1.1.0.1 + 1.2.0.0 store release — unreleased

`1.0.0.0`, `1.1.0.0`, `1.1.0.1`, and `1.2.0.0` publish together as one Chrome Web
Store update (crews move straight from `0.9.0.2` to `1.2.0.0`), so this is the
block to paste into the listing's "What's new". Highlights:

- **New Respiratory Effort default on the Cardiac/Respiratory page.** Pick your
  usual effort value in Options and AutoComplete fills it for you; the respiratory
  fields are now grouped under a clear "Respiratory" heading.
- **Your saved defaults now carry over when the extension updates.** Settings
  saved in older versions are kept and moved to their new spots automatically, so
  updating no longer clears your Options.
- **Dark mode** across the popup, Options page, and the toolbar on EMSCharts — one
  toggle that follows your system light/dark theme by default.
- **A refreshed interface** — a cleaner Options page with collapsible sections and
  a fixed Save / Export / Import / Reset bar, a simpler popup with a direct
  "Open Options" button, and a restyled, easier-to-read toolbar.
- **Page 8 vitals comments** now fill the Edit Vitals popup's own comment box when
  that popup is open (instead of the comment field behind it).
- **A toolbar reset button (↺)** — snap the toolbar back to the top-right corner if
  you've dragged it out of the way.
- **A "Report a Problem" link and the version number** in the popup footer.

The per-version detail for each of these is in the entries below.

## 1.4.0.0 — unreleased

### Added

- **Crew-admin console.** A separate, role-gated admin page (`admin.html`) lets a
  crew admin pre-approve people from their own organisation — add/remove
  allow-listed emails and see who has signed up — without a super-admin running
  SQL. Removing an allow-listed email also deletes any account for it, revoking
  that person; a separate Remove in the Members list deletes an account while
  keeping the pre-approval, so they can sign up again. An **Admin** button appears beside **Open Options** in the popup, only for
  admins. Backed by multi-tenant `orgs` + `profiles` (role & org) with Row-Level
  Security isolating each admin to their own org; the people an admin approves
  self-register through the existing Create-account flow.

### Security

- **A crew admin can no longer remove someone in another organisation.** Removing
  an allow-listed email deletes that person's account, but the deletion matched
  only on the email address — so an admin could delete a user in another org by
  adding and then removing that address. Account deletion is now scoped to the
  admin's own org, the same boundary the Members-list Remove already enforces.
  Admins can still add one-off outside addresses that match no approved domain.

## 1.3.0.0 — unreleased

### Added

- **Login gate.** The injected toolbar is disabled until the user signs in
  (email + password) from the popup; a "Sign in to enable" lock overlay covers the
  buttons otherwise, and every fill/clear also bails without a valid session. The
  Options page is gated the same way (it is reachable outside the popup), so
  defaults cannot be edited while signed out.
  Accounts are restricted to configured email domains, a sign-in lasts 1 month
  (with silent access-token refresh so revoked accounts drop within a refresh
  cycle), and a "Remember my email" checkbox pre-fills the address — email only,
  never the password.
- **Self-service account creation.** A "Create account" form in the popup lets
  crews register with their email (`caSignUp` → Supabase sign-up); the server-side
  `enforce_allowed_domain` trigger limits it to approved domains — or to one-off
  individual addresses an admin allow-lists in `allowed_emails` (contractors,
  ride-alongs) — so no per-person admin provisioning is needed.
- **Self-service password reset.** "Forgot password?" in the popup emails a
  6-digit code (no web page needed); entering it with a new password resets it and
  signs the user in. Needs custom SMTP and the Reset-Password email template set to
  send `{{ .Token }}` — see `supabase/README.md`.
- **Time-limited access codes.** A code redeemed in the popup unlocks the
  extension until the code's own expiry, for guests/temporary crew. Admins mint
  codes with a settable TTL via one SQL insert.
- **Supabase auth backend.** Schema, RLS, the allow-list trigger (approved domains
  plus one-off `allowed_emails`), and a `redeem-code` Edge Function live under
  `supabase/`; the extension (`src/auth.js`) talks to it with plain `fetch` (no SDK).

### Changed

- The extension now makes network requests to its authentication service at
  sign-in. No patient data is transmitted — only login credentials. See the
  updated Privacy Policy and README.

## 1.2.0.0 — unreleased

### Added

- **Respiratory Effort default (Cardiac/Respiratory page).** A new Effort option
  in the Page 4 settings lets you save a default respiratory effort value
  (Normal, Labored, Retractions, Tachypnea, and the rest); AutoComplete fills it
  and Clear Fields resets it. The respiratory fields are now grouped under a
  "Respiratory" heading.

### Changed

- **Renamed the "Respiratory Comments" field to just "Comments"** in Options,
  under the new Respiratory heading. Anything you'd already saved there carries
  over unchanged.

## 1.1.0.1 — unreleased

### Fixed

- **Saved Options are no longer lost when the extension updates.** Some settings
  were stored under names that changed in earlier releases; on the first Options
  open after updating, those saved values were being deleted. The extension now
  moves settings saved under old names to their current spots automatically, so
  your defaults survive updates. (Fields that were removed or replaced entirely in
  past releases can't be recovered, but nothing you've saved is deleted anymore.)

## 1.1.0.0 — unreleased

### Added

- **A reset button (↺) on the toolbar.** Next to the drag handle — click it to
  snap the toolbar back to the top-right corner if you've moved it.

### Fixed

- **Page 8 vitals comments now land in the Edit Vitals popup.** When that popup
  is open, the On Scene / Transport / At Hospital / Refusal / Custom buttons fill
  the popup's own comment box instead of the comment field behind it. With the
  popup closed, they fill the main field as before.

### Changed

- **The popup footer now has a "Report a Problem" link** for sending feedback,
  and shows the extension version. (The old Source link was removed.)

## 1.0.0.0 — unreleased

First stable release — an interface refresh across the whole extension.

### Added

- **Dark mode.** A sun/moon toggle in both the popup and the Options page. It's
  one setting that themes the popup, the Options page, and the toolbar injected
  into EMSCharts — and it follows your system light/dark theme by default.

### Changed

- **Refreshed the Options page** — cleaner layout, collapsible sections, a fixed
  Save/Export/Import/Reset bar, and light/dark themes.
- **Refreshed the popup** — a direct "Open Options" button replaces the old
  right-click instruction.
- **Restyled the injected toolbar** to match, with clearer, more legible buttons.

## 0.9.0.2 — 2026-07-29

### Fixed

- **Base toolbar (Incident / Unit Information page):** every base in your
  agency's Base dropdown now gets a button. Previously, if your base list had
  no blank "placeholder" row, the first base was skipped and never appeared.

## 0.9.0.1 and earlier

Released before this changelog was started.
