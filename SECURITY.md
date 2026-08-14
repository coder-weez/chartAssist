# Security Policy

EMSCharts Assist gates a toolbar behind a login and stores user accounts (email, crew, role) in a Supabase backend, with Row-Level Security as the real boundary between crews. If you believe you've found a vulnerability — for example a way to read or change another crew's data, bypass the approval gate, or escalate a role — we want to hear about it **privately**, not in a public issue.

## Reporting a vulnerability

Email **support@grtechsupport.com** with the details — please do **not** open a public issue. In your report, include:

- what the issue is, its impact, and the steps to reproduce it;
- the extension version (from the popup footer or `manifest.json`);
- whether it involves the Supabase backend (`schema.sql` RLS/RPCs) or the extension itself.

Please do **not** include real patient data (PHI) in any report; the extension never handles PHI and neither should a report.

## Scope

- The Chrome extension in `src/` (content scripts, popup, options, admin console).
- The Supabase backend in `supabase/` (schema, RLS policies, SECURITY DEFINER functions, the `redeem-code` Edge Function).

The client-side login gate is **cooperative** by design — it controls access for your own crews and honors expiry/revocation, but because an extension runs on the user's own machine it is not proof against a determined technical bypass. Reports about that specific, documented trade-off are unlikely to be treated as vulnerabilities; the RLS/RPC server boundary is where the real guarantees live, and issues there are in scope.

## What to expect

We aim to acknowledge a report within a few days, confirm the issue, and coordinate a fix and disclosure timeline with you. Thank you for helping keep crews' data safe.
