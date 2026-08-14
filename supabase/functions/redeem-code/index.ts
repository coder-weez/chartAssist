// redeem-code — Supabase Edge Function (Deno)
//
// Validates a time-limited access code and, if usable, returns its expiry. All
// validation and the use-count increment happen server-side in the
// redeem_access_code() SQL function, called here with the SERVICE-ROLE key so
// the access_codes table (RLS-locked) is never exposed to the publishable key.
//
// Deploy:  supabase functions deploy redeem-code --no-verify-jwt
//          (--no-verify-jwt: guests redeeming a code aren't signed in, and the
//          extension's publishable key is not a JWT.)
// The SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are provided
// automatically by the Supabase platform to deployed functions.
//
// Brute-force protection: the SQL function logs every attempt per caller IP and
// locks an IP out after too many recent FAILURES (see redeem_access_code in
// schema.sql). The IP is taken from the x-forwarded-for header the platform sets.
//
// Request:  POST { "code": "ABC12345" }
// Response: 200 { "expires_at": "2026-08-12T14:00:00Z" }   on success
//           400 { "error": "..." }                          invalid/expired/used-up
//           429 { "error": "..." }                          too many attempts (locked)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
    });
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let code = '';
    try {
        const body = await req.json();
        code = typeof body?.code === 'string' ? body.code.trim() : '';
    } catch {
        return json({ error: 'Bad request' }, 400);
    }
    if (!code) return json({ error: 'Missing code' }, 400);

    // Caller IP for per-IP rate limiting. x-forwarded-for may hold a list
    // ("client, proxy1, proxy2"); the first entry is the originating client.
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data, error } = await supabase.rpc('redeem_access_code', {
        p_code: code,
        p_ip: ip,
    });
    if (error) return json({ error: 'Server error' }, 500);
    if (data?.ok) return json({ expires_at: data.expires_at }, 200);
    if (data?.locked) {
        return json({ error: 'Too many attempts. Please wait a few minutes and try again.' }, 429);
    }
    return json({ error: 'That code is invalid, expired, or used up.' }, 400);
});
