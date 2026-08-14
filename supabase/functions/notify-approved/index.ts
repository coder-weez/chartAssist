// notify-approved — Supabase Edge Function (Deno)
//
// Emails a user "you've been approved" when a crew admin approves their pending
// sign-up. Called by the Admin console (src/admin.js) right after the approve_signup
// RPC succeeds. Approval itself is a custom profiles.status change (not a Supabase
// Auth event), so there is no built-in email — we send it via the Resend API.
//
// Deployed WITH JWT verification (NOT --no-verify-jwt), so only a signed-in caller
// reaches it; on top of that we require the caller to be an admin and derive the
// recipient email SERVER-SIDE from user_id, so it can't be used to email arbitrary
// addresses. Email is best-effort: the approval already happened, so admin.js
// ignores a failure here.
//
// Deploy:  supabase functions deploy notify-approved
//          supabase secrets set RESEND_API_KEY=re_...
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by the
// platform.
//
// Request:  POST { "user_id": "<uuid>" }   (Authorization: Bearer <admin JWT>)
// Response: 200 { ok: true }               email sent
//           401/403/404/409 { error }      not signed in / not admin / not in your
//                                          org / not approved
//           502 { error }                  email provider failed (approval stands)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FROM = 'Gardner Responder Technologies <noreply@grtechsupport.com>';
const SUBJECT = "You've been approved for ChartsAssist";

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
    });
}

function escapeHtml(s: string): string {
    return s.replace(
        /[&<>"']/g,
        (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
    );
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return json({ error: 'Not signed in' }, 401);

    let userId = '';
    try {
        const body = await req.json();
        userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
    } catch {
        return json({ error: 'Bad request' }, 400);
    }
    if (!userId) return json({ error: 'Missing user_id' }, 400);

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';

    // 1. Confirm the CALLER is an admin, using their own token so auth.uid() is them
    //    (my_profile() is RLS-safe and returns their role + org).
    const caller = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: profData, error: profErr } = await caller.rpc('my_profile');
    const callerProfile = Array.isArray(profData) ? profData[0] : profData;
    if (profErr || !callerProfile) return json({ error: 'Not authorized' }, 403);
    const isSuper = callerProfile.role === 'super_admin';
    if (!isSuper && callerProfile.role !== 'crew_admin') {
        return json({ error: 'Not authorized' }, 403);
    }

    // 2. Read the TARGET server-side (service role). The recipient email is taken
    //    from here, never from the client, and must be in the caller's org (a
    //    super_admin may act across orgs) and actually approved.
    if (!serviceKey) {
        console.error('notify-approved: SUPABASE_SERVICE_ROLE_KEY is not set');
        return json({ error: 'Server not configured' }, 500);
    }
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: target, error: targetErr } = await admin
        .from('profiles')
        .select('email, org_id, status')
        .eq('user_id', userId)
        .maybeSingle();
    if (targetErr) {
        // A query error (e.g. the service-role key can't read profiles) — log the
        // real reason instead of masking it as "User not found".
        console.error('notify-approved: profiles read failed for', userId, targetErr);
        return json({ error: 'Directory lookup failed', detail: targetErr.message }, 500);
    }
    if (!target) {
        console.error('notify-approved: no profile row for user_id', userId);
        return json({ error: 'User not found' }, 404);
    }
    if (!isSuper && target.org_id !== callerProfile.org_id) {
        return json({ error: 'Not in your organization' }, 403);
    }
    if (target.status !== 'approved') return json({ error: 'User is not approved' }, 409);
    if (!target.email) return json({ error: 'No email on file for that user' }, 422);

    // Crew name for the message body (best-effort).
    let crew = 'your crew';
    if (target.org_id) {
        const { data: org } = await admin
            .from('orgs')
            .select('name')
            .eq('id', target.org_id)
            .maybeSingle();
        if (org?.name) crew = org.name;
    }

    // 3. Render + send via Resend.
    if (!resendKey) return json({ error: 'Email is not configured' }, 502);
    // The template ships as a bundled static file — declared in supabase/config.toml
    // under [functions.notify-approved].static_files. Read it by a path relative to
    // the function directory; `new URL(..., import.meta.url)` does NOT resolve in the
    // deployed runtime (that path fails even when the file is bundled).
    let html: string;
    try {
        html = await Deno.readTextFile('./access-approved.html');
    } catch (e) {
        console.error('notify-approved: template read failed', e);
        return json({ error: 'Email template unavailable' }, 502);
    }
    html = html.replaceAll('{{crew}}', escapeHtml(crew));

    const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [target.email], subject: SUBJECT, html }),
    });
    if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        console.error('notify-approved: Resend failed', resp.status, detail);
        return json({ error: 'Email provider error' }, 502);
    }
    return json({ ok: true }, 200);
});
