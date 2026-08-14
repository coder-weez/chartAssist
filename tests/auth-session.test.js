import { describe, it, expect } from 'vitest';

// Pure helpers from the auth module — no chrome/fetch needed (those are only
// touched inside the network functions, which these tests don't call).
const auth = require('../src/auth.js');
const {
    caSessionValid,
    caEmailDomain,
    caEmailDomainAllowed,
    caIsAdminRole,
    caCanUseQa,
    SESSION_TTL_HOURS,
} = auth.default || auth;

describe('caSessionValid', () => {
    it('is false for a missing or empty session', () => {
        expect(caSessionValid(null)).toBe(false);
        expect(caSessionValid(undefined)).toBe(false);
        expect(caSessionValid({})).toBe(false);
    });

    it('is true while the expiry is in the future', () => {
        expect(caSessionValid({ session_expires_at: Date.now() + 60000 })).toBe(true);
    });

    it('is false once the expiry has passed', () => {
        expect(caSessionValid({ session_expires_at: Date.now() - 1000 })).toBe(false);
    });

    it('is false without an expiry field, even with a token', () => {
        expect(caSessionValid({ access_token: 'x' })).toBe(false);
    });
});

describe('caEmailDomain', () => {
    it('returns the lowercased domain', () => {
        expect(caEmailDomain('Medic@VFAmbulence.com')).toBe('vfambulence.com');
    });

    it('uses the last @ so odd local-parts still resolve', () => {
        expect(caEmailDomain('a@b@vfambulence.com')).toBe('vfambulence.com');
    });

    it('returns empty string when there is no domain', () => {
        expect(caEmailDomain('nobody')).toBe('');
        expect(caEmailDomain('')).toBe('');
        expect(caEmailDomain(null)).toBe('');
    });
});

describe('caEmailDomainAllowed', () => {
    it('allows anything when the list is empty (server stays authoritative)', () => {
        expect(caEmailDomainAllowed('x@anywhere.com', [])).toBe(true);
        expect(caEmailDomainAllowed('x@anywhere.com', undefined)).toBe(true);
    });

    it('matches an approved domain case-insensitively', () => {
        expect(caEmailDomainAllowed('Medic@VFAmbulence.com', ['vfambulence.com'])).toBe(true);
        expect(caEmailDomainAllowed('medic@vfambulence.com', ['VFAmbulence.com'])).toBe(true);
    });

    it('rejects a domain that is not on the list', () => {
        expect(caEmailDomainAllowed('medic@gmail.com', ['vfambulence.com'])).toBe(false);
        expect(caEmailDomainAllowed('nobody', ['vfambulence.com'])).toBe(false);
    });
});

describe('caIsAdminRole', () => {
    it('is true for crew_admin and super_admin', () => {
        expect(caIsAdminRole('crew_admin')).toBe(true);
        expect(caIsAdminRole('super_admin')).toBe(true);
    });

    it('is false for member, empty, or unknown roles', () => {
        expect(caIsAdminRole('member')).toBe(false);
        expect(caIsAdminRole('')).toBe(false);
        expect(caIsAdminRole(undefined)).toBe(false);
    });
});

describe('caCanUseQa', () => {
    it('is true for qa_auditor, crew_admin, and super_admin', () => {
        expect(caCanUseQa('qa_auditor')).toBe(true);
        expect(caCanUseQa('crew_admin')).toBe(true);
        expect(caCanUseQa('super_admin')).toBe(true);
    });

    it('is false for member, empty, or unknown roles', () => {
        expect(caCanUseQa('member')).toBe(false);
        expect(caCanUseQa('')).toBe(false);
        expect(caCanUseQa(undefined)).toBe(false);
    });
});

describe('SESSION_TTL_HOURS', () => {
    it('keeps a user logged in for ~1 month (30 days)', () => {
        expect(SESSION_TTL_HOURS).toBe(24 * 30);
    });
});
