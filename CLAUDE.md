# EMSCharts Assist — Claude Code Guide

> **Keep this file and `README.md` up to date.** When behaviour, architecture, or helper APIs change, update both documents in the same commit. CLAUDE.md is the technical reference for contributors and AI assistants; README.md is the user-facing reference. Neither should drift from the actual code.

> **Versioning:** bump `version` and `version_name` in `manifest.json` before publishing to the Chrome Web Store — Chrome rejects uploads where the version hasn't changed. Use semantic versioning: patch (`0.x.x.1`) for bug fixes, minor (`0.x+1.0.0`) for new features, major (`1.0.0.0`) for breaking changes. After merging to `main`, tag the commit to match (e.g. `git tag v0.4.0`). Tags live on `main`; don't tag feature branches.

## What this project is

A Chrome MV3 extension that injects an **AutoComplete** toolbar and a **Clear Fields** button into EMSCharts PCR pages. AutoComplete reads user-configured defaults from `chrome.storage.sync` and fills in matching form fields. Clear Fields blanks those same fields after a confirmation prompt. A **QA Mode** toggle (in the extension popup) freezes the toolbar so no buttons can be clicked during chart review. No patient data is ever stored or transmitted.

## Architecture

```
src/
  manifest.json      — MV3 manifest; declares content scripts per page
  background.js      — Service worker; opens options tab with page anchor
  chartassist.js     — Shared helpers loaded before every page script
  chartassist.css    — Shared styles injected into EMSCharts pages
  options.html/.js   — Settings UI; saves defaults to chrome.storage.sync
  popup.html/.js     — Extension popup; hosts the QA Mode toggle
  page1.js           — Content script for EMSCharts page 1 (incident/unit info)
  page2.js           — Content script for EMSCharts page 2 (dispatch/HPI)
  page3.js           — Content script for page 3 (neuro/airway)
  page4.js           — Content script for page 4 (cardiac/respiratory)
  page5.js           — Content script for page 5 (physical exam)
  page8.js           — Content script for page 8 (billing/narrative)
```

### Page 1 (`page1.js`)

Page 1 has a **hard-coded toolbar** with no Options configuration. It uses `caToolbar(true)` (the `skipDefaults` flag) to omit the Page Defaults button. Two labelled sections:

**Base** — three preset buttons set `select[name="Base_ID"]` to the matching option value, trigger EMSCharts' own `getUnitPicklist()` callback, and overwrite `input[name="vehcloc"]` with the option's text label (no appending — always overwrites):

| Button label | `Base_ID` value | Address text written to `vehcloc` |
| ------------ | --------------- | --------------------------------- |
| 1321 EV Rd   | `5650`          | 1321 East Victor Road             |
| 34 Maple     | `22751`         | 34 Maple Avenue                   |
| 380 High     | `26274`         | 380 High Street                   |

**Staffing** — ALS and BLS buttons call a shared `caSetStaffing(val)` helper that always overwrites (no append, no toast-gate) three fields:

| Field               | Selector                    | ALS value          | BLS value          |
| ------------------- | --------------------------- | ------------------ | ------------------ |
| Unit Staffing Level | `select[name="unit_staff"]` | `3`                | `2`                |
| Transport Code      | `select[name="transcode"]`  | `1` (Initial Trip) | `1` (Initial Trip) |
| Referred By         | `input[name="ref_md"]`      | Ontario County 911 | Ontario County 911 |

**Clear Fields** resets all five fields managed by page 1 (Base_ID, vehcloc, unit_staff, transcode, ref_md).

### `caToolbar(skipDefaults)`

`caToolbar` now accepts an optional boolean. When `true`, the Page Defaults button is not appended. Pass `true` from page scripts that have no Options page section (e.g. page 1).

Page 5 and page 8 both use **multiple preset buttons** instead of a single AutoComplete button. Page 5 has Trauma / Medical / Refusal; page 8 has On Scene / Transport / At Hospital / Refusal / Custom. Storage keys for page 5 follow the pattern `pg5_{category}_{fieldName}` (e.g. `pg5_trauma_head_comments`). The Options page shows three sub-tables within the single `<details id="section-page5">` block.

Each page script is injected only on its matching EMSCharts URL (defined in `manifest.json`). All page scripts share `chartassist.js` via the `"js"` array in the manifest content script entry.

### QA Mode (`popup.html` / `popup.js`)

The extension popup exposes a **QA Mode** checkbox. Its state is stored in `chrome.storage.local` as `ca_qa_mode` (boolean). When on:

- A `#ca-qa-film` overlay div (absolutely positioned over the toolbar) becomes visible, blocking all pointer events to the buttons beneath it and displaying a centred "QA MODE" label.
- The toolbar snaps to its CSS default position (`top: 8px; right: 8px`) on every page load, overriding any saved drag position.
- The `chrome.storage.onChanged` listener in `chartassist.js` reacts live if QA Mode is toggled while a PCR page is open.

When QA Mode is turned off the toolbar's current position is written to `ca_toolbar_pos` (via `caSavePosition`) so subsequent page loads restore to that location rather than the pre-QA saved position.

**Race condition note:** toolbar position restore and QA Mode check are merged into a single `caApplyInitialState` call (one `chrome.storage.local.get` for both keys). Previously they were two separate async calls whose callbacks could resolve in either order, causing QA Mode's position reset to be undone by a late-resolving position restore.

jQuery is **vendored** at `src/jquery.min.js` (a deliberately version-less filename so updates are an in-place overwrite — the manifest references never change). The actual version lives in the file's banner comment, in `README.md`, and in update PR titles.

## Dependency updates (CI)

All dependency updates arrive as **review-only pull requests** — nothing is merged to `main` automatically.

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

`caFillPopup` targets the hidden input, sets it via `el[0].value`, triggers `change`, updates the display span, and hides the ADD+ button. Silently skips if `current === value` (case-insensitive). Shows toast if a different value is already present. Returns `true` if anything visible happened, `false` for silent no-ops — same contract as `caFill`.

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
- `caClrPopup` — clears the `_text` hidden input and display span; shows the ADD+ button.
- `caClrPertNeg` — blanks all four hidden fields (id/text/cmdfacCustId/examvalId, present or not-present per the divId) and the display span; shows the ADD+ button.

### `caToast(message)` / `caFlash(selector)`

- Toast: yellow stacking notification, 6s, `⚠` prefix via CSS `::before`. Stacks vertically.
- Flash: brief green background pulse on filled elements. Sets an inline `transition` style then clears both `transition` and `background-color` after the animation completes, leaving no residual inline styles.

### `caToolbar()`

Creates (once) a fixed-position draggable toolbar. Appends a "Page Defaults" button that sends `{ action: 'openOptions', page: N }` to the background service worker, which opens the options page scrolled to `#section-pageN`. Each page script also appends its own action buttons (AutoComplete, Clear Fields, and any preset buttons) to this toolbar.

## Extension context guard

All click handlers in page scripts must guard against extension reload:

```js
if (!chrome.runtime || !chrome.runtime.id) return;
```

## Options system (`options.js`)

Fields are declared in four arrays at the top of `options.js`:

- `txtInputs` — `<input type="text">` fields
- `txtAreas` — `<textarea>` fields
- `selBoxes` — `<select>` fields (includes popup fields, stored as selects in options UI)
- `pertNegGroups` — pertneg checkbox-group fields (Mental/Neurological). These have **no wrapper element with the storage key as id**; instead, each checkbox carries a `data-group="{storageKey}"` attribute. Saved as a **`|`-delimited** string of text labels (not comma — labels can contain commas).

Storage keys follow the pattern `pg{N}_{fieldName}` (e.g. `pg2_chief_complaint`, `pg3_airway_status`).

`_all_opts()` builds a map of `{storageKey: type}` from all four arrays. `get_user_values`, `restore_options`, and `reset_options` all handle `"checkgroup"` type before the `getElementById` call, using `document.querySelectorAll('[data-group="..."]')` instead.

`prune_stale_keys()` runs on options load and removes any stored keys not in the current field lists — keeps storage tidy after fields are renamed or removed.

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

## Common pitfalls

- **Wrong element type**: EMSCharts popup fields have no `<select>` — use `caFillPopup`, not `caFill`.
- **Text vs numeric values**: standard selects use numeric IDs (e.g. `"1240"` for Minutes); popup fields use text labels (e.g. `"Stretcher"`). Check the actual EMSCharts DOM before adding options.
- **jQuery `.val()` unreliable for read-back**: always use `el[0].value` to read current content of text inputs and textareas.
- **Blank-option values vary**: GCS/stroke scale blanks use `value="null"` or `value="0"`; Airway Status uses `value="-1"`. For the incoming `value`, `caFill` treats `null`/`""`/`"0"`/`"null"` as blank. For the field's _existing_ value it additionally treats the **first option's value** as blank (the first `<option>` is always the placeholder), so a field still showing its placeholder is correctly seen as empty regardless of that placeholder's value (e.g. `-1`) and gets filled rather than toasted.
- **Background service worker required for `chrome.tabs`**: content scripts cannot call `chrome.tabs.create`. Send a message to `background.js` instead.
