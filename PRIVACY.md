# Privacy Policy — GRTech ChartAssist

_Last updated: August 2026_

## What this extension does

GRTech ChartAssist is a Chrome browser extension that fills in fields on EMSCharts patient care reports (PCRs) with default values you configure. To restrict use to authorized personnel, it requires you to sign in before the tools are enabled.

## Data we collect

To verify that you're authorized to use the extension, signing in sends the following to the extension's authentication service (hosted on [Supabase](https://supabase.com)) over HTTPS:

- **Your email address and password**, when you create an account or sign in; or
- **A temporary access code**, if you sign in with one instead.

That is the only data transmitted, and only at sign-in.

- **No patient data.** No PCR field values, report content, or protected health information (PHI) is ever read, recorded, or transmitted. The login carries only your account credentials — never anything from any report.
- **Passwords are never stored by the extension.** Your password is sent to the authentication service (which hashes it) and is not kept on your device. After a successful sign-in, only a session token — and, if you tick "Remember my email", your email address — are stored locally in your browser (`chrome.storage.local`).
- **Sessions.** A successful sign-in keeps you authorized for 1 month (or, for an access code, until the code expires), after which you sign in again.

## Account data, retention, and deletion

Your account record — email address, the crew (organization) you belong to, your role, and approval status — is held in the extension's authentication backend (Supabase). It is the minimum needed to run the sign-in gate and the crew-admin approval workflow; **no patient data and no PCR content is ever part of it.**

- **Who controls it.** The account data is administered by the crew/organization that operates this deployment of the extension; the maintainer of this repository operates the shared backend on their behalf.
- **Retention.** Account data is kept while your account is active. It is removed when a crew admin removes you as a member or deletes your pre-approval, or when you ask for deletion (below). Access-code sessions store no account record at all — only a local session token that expires on its own.
- **How to request deletion.** Ask your crew admin to remove your account from the crew-admin console, or contact the maintainer through the channels in **Contact** below. Removing your account deletes the associated login record.
- **Local data** (session token, remembered email, and your saved template defaults) is cleared when you sign out, remove the extension, or clear your browser data.

## Permissions this extension requests

- **`storage`** — to save your template defaults and your session/theme preferences in your own browser. Nothing in this storage is transmitted anywhere except through Chrome's own optional sync.
- **Host access to `*.emscharts.com/pr/*`** — so the toolbar can read and fill fields on EMSCharts PCR pages. This is the only site the content scripts run on.
- **Host access to the Supabase project URL** — so the popup can perform sign-in and (for admins) the crew console. Only the popup/admin pages talk to it; PCR pages never make network calls.

## Data you store locally

The only data saved by this extension is the **default template values you manually enter** on the Options page (e.g. a default chief complaint or physical exam finding). These are stored using Chrome's built-in `chrome.storage.sync`, which keeps them in your Chrome profile and optionally syncs them across your signed-in Chrome devices. This data never leaves your Chrome profile except through Chrome's own sync mechanism, which is governed by [Google's Privacy Policy](https://policies.google.com/privacy).

These stored defaults contain no patient information — they are generic template text you choose to pre-fill, not data from any actual report.

## HIPAA

This extension is not a covered entity or business associate under HIPAA. It does not access, store, transmit, or process protected health information (PHI). Compliance with HIPAA and your organization's privacy policies when using EMSCharts remains your responsibility.

## Changes to this policy

If this policy changes, the updated version will be posted in this repository with a revised date above.

## Contact

For questions, privacy requests, or account deletion, email **[support@grtechsupport.com](mailto:support@grtechsupport.com)**. For a **security or privacy vulnerability**, use the private channel described in [SECURITY.md](SECURITY.md) rather than a public report.
