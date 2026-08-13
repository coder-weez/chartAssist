// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The Postgres guards added in the pre-launch hardening can't be executed in CI
// (no database), so these assert the SQL text still ENCODES them — a tripwire so a
// future edit can't silently drop a security guard. Behavioral verification is the
// manual smoke test in supabase/README.md.
let sql;
beforeAll(() => {
    sql = readFileSync(join(__dirname, '../supabase/schema.sql'), 'utf8');
});

// Collapse whitespace so assertions don't depend on formatting.
const flat = (s) => s.replace(/\s+/g, ' ');

describe('remove_member guards', () => {
    it('refuses self-removal, a super_admin target, and the last admin', () => {
        const body = flat(sql.match(/function public\.remove_member[\s\S]*?\$\$;/)[0]);
        expect(body).toContain('p_user_id = auth.uid()');
        expect(body).toContain("v_role = 'super_admin'");
        expect(body).toMatch(/last admin/i);
        expect(body).toContain("role in ('crew_admin', 'super_admin')");
    });
});

describe('handle_new_user — no org self-assignment', () => {
    it('does not coalesce the user-supplied requested_org_id on approved paths', () => {
        const body = flat(sql.match(/function public\.handle_new_user[\s\S]*?\$\$;/)[0]);
        // The self-assign bug was `v_org := coalesce(v_org, v_requested)` on the
        // approved branches; the pending branch still uses v_requested directly.
        expect(body).not.toContain('coalesce(v_org, v_requested)');
        expect(body).toContain('v_org := v_requested');
    });
});

describe('redeem_access_code — per-IP rate limiting', () => {
    it('takes a caller IP, logs attempts, and locks out after a threshold', () => {
        expect(sql).toContain('create table if not exists public.redeem_attempts');
        const body = flat(sql.match(/function public\.redeem_access_code[\s\S]*?\$\$;/)[0]);
        expect(body).toContain('p_ip text');
        expect(body).toContain('public.redeem_attempts');
        expect(body).toContain('v_max_fails');
        expect(body).toContain("jsonb_build_object('ok', false, 'locked', true)");
    });
});
