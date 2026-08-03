EMSCharts Assist
================

EMSCharts Assist is a free extension for the Chrome browser which allows you to store defaults for emscharts.com patient care reports.

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

## Install from Source

1. `git clone https://github.com/coder-weez/emsChartsAssist.git`
2. Open `chrome://extensions/` in your browser
3. Enable `Developer Mode` in the upper-right corner
4. Select `Load Unpacked` in the upper-left corner
5. Find the `emsChartsAssist` folder from the `git clone` step, and open the `src` directory

After loading, click the extension icon and use the **Open Options** button in
the popup to fill in your default values. These are saved to `chrome.storage.sync`.
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
- **Preset buttons** (pages 5 and 8) — page 5 has Trauma / Medical / Refusal; page 8 has On Scene / Transport / At Hospital / Refusal / Custom.

### Page 1 toolbar

Page 1 (incident/unit info) has a hard-coded toolbar with two sections — no Options configuration required:

**Base** — one button per base, generated automatically from the EMSCharts Base dropdown (so the buttons always match the bases your account offers). Clicking a button sets the Base select and the Vehicle Dispatch Location text field together.

**Staffing** — two buttons that set Unit Staffing Level, Transport Code (always "Initial Trip"), and Referred By (always "Ontario County 911"):

- **ALS** — sets staffing level to ALS
- **BLS** — sets staffing level to BLS

### QA Mode

Click the extension icon in the Chrome toolbar to open the popup. The **QA Mode** toggle freezes the toolbar — all buttons are covered by an overlay and cannot be clicked, preventing accidental form changes while reviewing a completed chart. When QA Mode is enabled the toolbar snaps back to its default position in the top-right corner. When disabled, the toolbar returns to wherever you last left it.

## How settings are stored

Your defaults are saved with Chrome's built-in
[`chrome.storage.sync`](https://developer.chrome.com/docs/extensions/reference/api/storage)
(the `storage` permission in the manifest). Notes for users and contributors:

- **Defaults only.** Only the template values you enter on the Options page are
  stored. No patient data and nothing from actual PCRs is ever saved or
  transmitted — the extension has no backend.
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

1. Make sure you've saved defaults in the **Options** page first.
2. Open a supported PCR page, then open Chrome's DevTools console
   (right-click the page &rarr; **Inspect** &rarr; **Console**) to check for
   any errors logged by the extension.
3. Reload the extension after making changes.

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

## Contributing

Please report any issues by using the "Issues" tab above.

The original author is no longer active in EMS. If you're interested in
maintaining/contributing/testing, see the contact in the project history.
