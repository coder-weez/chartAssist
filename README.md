EMSCharts Assist
================

EMSCharts Assist is a Chrome browser extension that lets you store defaults for emscharts.com patient care reports and fill them in with one click. Access is gated: the tools are disabled until you sign in with an **approved crew account** (or a time-limited access code). The source in this repository is proprietary — see [LICENSE.txt](LICENSE.txt) — and is published here for authorized crews and contributors, not as open-source software.

## Disclaimer

This is an independent, unofficial tool. It is **not affiliated with,
endorsed by, or supported by emsCharts, Inc.** "emsCharts" and any related
names are trademarks of their respective owners.

This extension fills patient care report fields with the default values you
configure. **You are responsible for reviewing and verifying every auto-filled
value for accuracy before saving or submitting a report.** It does not
guarantee the correctness or appropriateness of any data it enters. Use at your
own risk; the software is provided "AS IS" without warranty of any kind (see
[LICENSE.txt](LICENSE.txt)).

**HIPAA notice:** This extension does not store, transmit, or process protected
health information (PHI). Only the template default values you manually enter
on the Options page are saved — no patient data, no PCR field values, and
nothing from actual reports is ever read or retained by the extension.
Compliance with HIPAA and your organization's privacy policies remains your
responsibility when using EMSCharts and any tools that interact with it.

> **Manifest V3:** This extension targets Chrome's Manifest V3. Defaults are
> stored in `chrome.storage.sync` and read directly by the content scripts.
> A minimal background service worker handles opening the Options page to the
> correct section when the "Page Defaults" button is clicked. It works on
> current versions of Chrome, which no longer load Manifest V2 extensions.
>
> **Dependencies:** The content scripts use jQuery 4.0.0, vendored as
> `src/jquery.min.js`. The Options page has no third-party dependencies — its
> collapsible sections use native HTML `<details>`/`<summary>` (the previous
> jQuery UI accordion was removed).
>
> **Automated dependency updates:** Updates arrive as review-only pull requests
> (nothing is merged to `main` automatically):
>
> - **jQuery** is vendored, so a scheduled GitHub Actions workflow
>   (`.github/workflows/jquery-update.yml`) checks weekly for a newer release,
>   downloads and integrity-verifies the file, and opens a PR bumping
>   `src/jquery.min.js` (and this version note). It can also be run on demand
>   from the **Actions** tab.
> - **GitHub Actions and the npm release tooling** (`chrome-webstore-upload-cli`)
>   are watched by Dependabot (`.github/dependabot.yml`).

## Install (for crew members)

Most crew members don't need the source. Once your crew's admin has published or
shared the extension:

1. **Add it to Chrome** — from the Chrome Web Store listing your admin gives you,
   click **Add to Chrome**. (Pin it: click the puzzle-piece icon in the toolbar and
   the pin next to EMSCharts Assist so its icon stays visible.)
2. **Sign in** — click the EMSCharts Assist icon and sign in with your approved
   crew email and password, or an access code your admin gave you. If your email
   isn't pre-approved, use **Create account**, pick your crew, and your request goes
   to your crew admin — you'll sign in once they approve it.
3. **Set your defaults** — use **Open Options** in the popup to fill in the values
   you want auto-filled. Then open a PCR on emscharts.com and use the toolbar's
   buttons. **Always review every auto-filled value before saving.**

## Install from Source (authorized crews / developers)

The source is proprietary (see [LICENSE.txt](LICENSE.txt)); these steps are for
authorized crews running their own build and for contributors.

1. `git clone https://github.com/coder-weez/emsChartsAssist.git`
2. Open `chrome://extensions/` in your browser
3. Enable `Developer Mode` in the upper-right corner
4. Select `Load Unpacked` in the upper-left corner
5. Find the `emsChartsAssist` folder from the `git clone` step, and open the `src` directory

After loading, click the extension icon and sign in, then use the **Open Options**
button in the popup to fill in your default values. These are saved to
`chrome.storage.sync`.
**Dark mode:** the extension follows your system light/dark theme by default. A
sun/moon button in both the popup header and the Options page header lets you
force either theme — it's a single, remembered setting that applies everywhere:
the popup, the Options page, and the toolbar injected into EMSCharts pages.

## Usage

Open a patient care report on `emscharts.com`. On the supported pages
(page 1, 2, 3, 4, 5, and 8) the extension adds a floating toolbar:

- **AutoComplete** (teal) — fills form fields with the defaults you saved in Options.
- **Clear Fields** (red) — blanks out any fields the extension manages on that page. Asks for confirmation before clearing.
- **Page Defaults** — opens the Options page scrolled to the section for the current page.
- **Preset buttons** (pages 5 and 8) — page 5 has Trauma / Medical / Refusal; page 8 has On Scene / Transport / At Hospital / Refusal / Custom. On page 8, if the **Edit Vitals** popup is open, the chosen comment is written into that popup's own comment box instead of the main narrative field; with the popup closed it fills the main field as usual.

Drag the toolbar by the **⠿** handle to move it out of the way; the **↺** button next to it snaps it back to the top-right corner.

### Page 1 toolbar

Page 1 (incident/unit info) has a hard-coded toolbar with two sections — no Options configuration required:

**Base** — one button per base, generated automatically from the EMSCharts Base dropdown (so the buttons always match the bases your account offers). Clicking a button sets the Base select and the Vehicle Dispatch Location text field together.

**Staffing** — two buttons that set Unit Staffing Level, Transport Code (always "Initial Trip"), and Referred By (always "Ontario County 911"):

- **ALS** — sets staffing level to ALS
- **BLS** — sets staffing level to BLS

### QA Mode

Click the extension icon in the Chrome toolbar to open the popup. The **QA Mode** toggle freezes the toolbar — all buttons are covered by an overlay and cannot be clicked, preventing accidental form changes while reviewing a completed chart. When QA Mode is enabled the toolbar snaps back to its default position in the top-right corner. When disabled, the toolbar returns to wherever you last left it. The toggle is shown only to **crew admins** and the **QA auditor** role (a crew admin assigns roles from the Admin console); other users don't see it.

## Sign in

To limit use to authorized personnel, ChartAssist sits behind a login. Until you
sign in, the toolbar on EMSCharts stays locked — a "Sign in to enable" overlay
covers the buttons. Click the extension icon and sign in from the popup:

- **Email + password** — each person has their own account. First time? Click
  **Create an account** and enter your work email. If your email (or its domain) is
  already approved you're signed in right away; if not, a **Your crew** picker
  appears — choose your crew and your request goes to its admin, and you can sign in
  once they approve it. Tick **Remember my email** to pre-fill it next time (your
  password is never stored).
- **Access code** — a temporary code an administrator generates that unlocks the
  extension for a set window (e.g. 24 hours), handy for ride-alongs or temporary
  crew. Enter it in the popup instead of an email/password.

A normal sign-in keeps you authorized for **1 month** (across browser restarts);
after that you sign in again. You can sign out any time from the popup. No patient
data is involved in signing in — only your account credentials.

**When you'll get an email.** ChartsAssist only emails you about your own account:
a **code to confirm your email** when you create an account, a **password-reset
code** if you use "Forgot password?", a **notice if your password is changed**, and
a **"you've been approved" notice** once a crew admin approves your access (so you
know you can sign in). Emails come from `grtechsupport.com`.

**For administrators:** the login is backed by a small
[Supabase](https://supabase.com) project (managed Postgres + authentication),
which must be configured before the extension can be used. Once it's running,
**crew admins** run their crew from an in-extension **Admin console** (the _Admin_
button in the popup): pre-approve emails, **approve or deny** people who requested
access, and **change a member's role** to grant or remove admin. See
[`supabase/README.md`](supabase/README.md) for the one-time setup, the SQL snippets
for the super-admin tasks that stay out of the console (approving a whole domain,
creating crews, assigning the top-level roles), and generating time-limited access
codes. Once set up, put your project URL and publishable key in `src/auth.js` and
`src/manifest.json`.

**Hosting & services (for administrators).** The login and its emails rely on three
hosted services — none of which ship inside the extension; they're configured once
(full setup in [`supabase/README.md`](supabase/README.md)):

- **Supabase** — stores accounts, crews, roles, and access codes and handles
  sign-in. The extension talks to it directly and ships only its public key.
- **Resend** — sends the email-confirmation and password-reset messages (each a
  6-digit code, not a link), wired in as Supabase's email provider and sent from
  `grtechsupport.com`.
- **Cloudflare** — runs DNS for the domains — including the SPF/DKIM/DMARC records
  that keep those emails out of spam — receives `support@grtechsupport.com`, and
  hosts the small landing pages under `site/` (on `gardnerrespondertechnologies.com`).

The three domains split by purpose: `gardnerrespondertechnologies.com` is the brand
site, `grtechsupport.com` sends the email and receives support, and `grteches.com`
is a short alias that redirects to the brand. No patient data touches any of these —
only account credentials at sign-in.

## How settings are stored

Your defaults are saved with Chrome's built-in
[`chrome.storage.sync`](https://developer.chrome.com/docs/extensions/reference/api/storage)
(the `storage` permission in the manifest). Notes for users and contributors:

- **Defaults only.** Only the template values you enter on the Options page are
  stored, and they never leave your browser except through Chrome's own sync. No
  patient data and nothing from actual PCRs is ever saved or transmitted. (The
  extension does contact its authentication service when you **sign in** — see the
  section above — but that carries only your login credentials, never any report
  data.)
- **Synced across devices.** Because it uses `storage.sync`, your defaults
  follow you to any Chrome where you're signed into the same profile with sync
  enabled (otherwise it behaves like local storage).
- **Flat key/value layout.** Settings are stored as a single flat object whose
  keys are page-prefixed strings (e.g. `pg2_chief_complaint`, `gcs_motor_1`).
  Values are plain strings — a field's text, a `<select>` option value, or a
  `|`-delimited list of labels for multi-select (Mental/Neurological) fields.
- **Size limits.** `storage.sync` allows roughly 100 KB total and ~8 KB per
  item; the short text defaults here stay well within that.
- **Not encrypted at rest.** Values are stored as-is and are readable by anyone
  with access to the Chrome profile, so avoid putting sensitive information in
  the default fields.

`options.js` writes the values and the page content scripts read them straight
from `chrome.storage.sync` when an AutoComplete button is clicked.

### Back up, restore, or share your defaults

The Options page's action bar has **Export** and **Import** buttons:

- **Export** downloads all of your saved settings as a single
  `emscharts-assist-defaults.json` file.
- **Import** loads settings from a previously exported file and saves
  them. Only keys the extension recognizes are imported, so an unrelated or
  malformed file is rejected with an error message. Importing overwrites any
  existing value for the same field.

This makes it easy to back up your defaults, move them to another computer, or
share a standard set with colleagues.

## Troubleshooting

If the AutoComplete button doesn't fill anything:

1. **Make sure you're signed in.** The toolbar stays locked (a 🔒 "Sign in to
   enable" overlay) until you sign in from the extension popup.
2. **Set your defaults first.** On a fresh install nothing is configured, so a fill
   click shows a _"No defaults configured yet"_ toast — open **Page Defaults** (or
   **Options**) and fill in the values you want auto-filled.
3. **Watch for a yellow warning toast** on the page (see below) — it means
   EMSCharts changed and some fields couldn't be found.
4. Reload the extension after changing settings.
5. _Advanced:_ open Chrome's DevTools console (right-click the page &rarr;
   **Inspect** &rarr; **Console**) to see the detailed errors the extension logs.

### "Expected field(s) were not found" warning

EMSCharts is maintained by Zoll, and updates on their side can rename or move
form fields. When the extension loads a PCR page it quietly checks that the
fields it fills still exist; if some are missing it shows a yellow warning toast
and AutoComplete may not work correctly on that page. The specific missing field
selectors are also logged to the page's DevTools console (a
`EMSCharts Assist: … Missing selectors:` warning), so you can see exactly which
ones failed. If you see this, the page likely changed on Zoll's end — please
open an Issue noting which page it was (and the logged selectors, if handy) so
the selectors can be updated. (A weekly CI job also watches Zoll's public
[release notes](https://help.zollonline.com/emscharts/Content/Subfolders%20for%20Whats%20New/NOW.htm)
and opens a pull request whenever a new emsCharts version ships, as an early
heads-up to re-check the fields.)

## Contributing & support

Report bugs, questions, or field-drift warnings from the **Issues** tab above. For
a **security or privacy vulnerability**, use the private channel described in
[SECURITY.md](SECURITY.md) rather than a public issue.

This project is maintained through this repository. If you'd like to help with
maintaining, testing, or onboarding a crew, open an issue to reach the maintainers.
