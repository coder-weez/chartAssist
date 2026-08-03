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

## What's new — combined 1.0.0.0 + 1.1.0.0 + 1.1.0.1 store release — unreleased

`1.0.0.0`, `1.1.0.0`, and `1.1.0.1` publish together as one Chrome Web Store
update (crews move straight from `0.9.0.2` to `1.1.0.1`), so this is the block to
paste into the listing's "What's new". Highlights:

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

The per-version detail for each of these is in the two entries below.

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
