// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Network auth flows exercised with a mocked global.fetch + chrome.storage.local.
// These guard the security-relevant behavior added in the pre-launch hardening:
// the approval gate, the captive-portal sign-out fix, the determined-vs-errored
// profile read, and the access-code lockout surfacing.
const auth = require('../src/auth.js');

// A minimal fetch Response stand-in (only what caReadJson touches).
function res(ok, status, body) {
    return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

let store;
beforeEach(() => {
    store = {};
    global.chrome = {
        storage: {
            local: {
                get(key, cb) {
                    if (typeof key === 'string') cb({ [key]: store[key] });
                    else if (Array.isArray(key)) {
                        const o = {};
                        key.forEach((k) => (o[k] = store[k]));
                        cb(o);
                    } else cb({ ...store });
                },
                set(obj, cb) {
                    Object.assign(store, obj);
                    if (cb) cb();
                },
                remove(keys, cb) {
                    (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete store[k]);
                    if (cb) cb();
                },
            },
        },
    };
});

const call = (fn, ...args) =>
    new Promise((resolve) => fn(...args, (err, val) => resolve({ err, val })));

describe('caSignIn — approval gate', () => {
    it('stores a session for an approved account', async () => {
        global.fetch = vi.fn((url) => {
            if (url.includes('/auth/v1/token'))
                return res(true, 200, {
                    access_token: 'AT',
                    refresh_token: 'RT',
                    user: { email: 'a@b.com' },
                });
            if (url.includes('/rpc/my_profile'))
                return res(true, 200, [{ status: 'approved', role: 'member' }]);
            return res(false, 404, {});
        });
        const { err, val } = await call(auth.caSignIn, 'a@b.com', 'pw');
        expect(err).toBeNull();
        expect(val).toBeTruthy();
        expect(store.ca_session.access_token).toBe('AT');
        expect(store.ca_session.source).toBe('user');
    });

    it('does NOT store a session for a pending account', async () => {
        global.fetch = vi.fn((url) => {
            if (url.includes('/auth/v1/token'))
                return res(true, 200, { access_token: 'AT', refresh_token: 'RT' });
            if (url.includes('/rpc/my_profile')) return res(true, 200, [{ status: 'pending' }]);
            return res(false, 404, {});
        });
        const { err, val } = await call(auth.caSignIn, 'a@b.com', 'pw');
        expect(val).toBeNull();
        expect(err).toMatch(/approve/i);
        expect(store.ca_session).toBeUndefined();
    });
});

describe('caRefreshSession — captive-portal fix', () => {
    beforeEach(() => {
        store.ca_session = {
            access_token: 'OLD',
            refresh_token: 'RT',
            session_expires_at: Date.now() + 1e6,
            source: 'user',
        };
    });

    it('keeps the session on an ambiguous 200 (captive portal / proxy)', async () => {
        global.fetch = vi.fn(() => res(true, 200, {})); // HTML body parsed to {}
        const { err, val } = await call(auth.caRefreshSession);
        expect(val).toBeNull();
        expect(err).toBe('Network error');
        expect(store.ca_session).toBeTruthy(); // NOT signed out
        expect(store.ca_session.access_token).toBe('OLD');
    });

    it('signs out on an explicit 401 (revoked/expired refresh token)', async () => {
        global.fetch = vi.fn(() => res(false, 401, { error: 'invalid_grant' }));
        const { val } = await call(auth.caRefreshSession);
        expect(val).toBeNull();
        expect(store.ca_session).toBeUndefined(); // signed out
    });

    it('swaps the access token on success without moving expiry', async () => {
        const exp = store.ca_session.session_expires_at;
        global.fetch = vi.fn(() => res(true, 200, { access_token: 'NEW' }));
        const { err } = await call(auth.caRefreshSession);
        expect(err).toBeNull();
        expect(store.ca_session.access_token).toBe('NEW');
        expect(store.ca_session.session_expires_at).toBe(exp);
    });
});

describe('caGetProfile — determined vs errored', () => {
    beforeEach(() => {
        store.ca_session = {
            access_token: 'AT',
            session_expires_at: Date.now() + 1e6,
            source: 'user',
        };
    });

    it('reports determined=true on an authoritative read', async () => {
        global.fetch = vi.fn(() => res(true, 200, [{ role: 'crew_admin', status: 'approved' }]));
        const out = await new Promise((resolve) =>
            auth.caGetProfile((profile, determined) => resolve({ profile, determined })),
        );
        expect(out.determined).toBe(true);
        expect(out.profile.role).toBe('crew_admin');
    });

    it('reports determined=false when the read fails (keep cached state)', async () => {
        global.fetch = vi.fn(() => res(false, 500, {}));
        const out = await new Promise((resolve) =>
            auth.caGetProfile((profile, determined) => resolve({ profile, determined })),
        );
        expect(out.determined).toBe(false);
        expect(out.profile).toBeNull();
    });
});

describe('caRedeemCode — lockout surfacing', () => {
    it('stores a code session on success', async () => {
        const exp = new Date(Date.now() + 3600e3).toISOString();
        global.fetch = vi.fn(() => res(true, 200, { expires_at: exp }));
        const { err } = await call(auth.caRedeemCode, 'ABC12345');
        expect(err).toBeNull();
        expect(store.ca_session.source).toBe('code');
        expect(store.ca_session.session_expires_at).toBe(new Date(exp).getTime());
    });

    it('surfaces a 429 lockout error and stores nothing', async () => {
        global.fetch = vi.fn(() =>
            res(false, 429, {
                error: 'Too many attempts. Please wait a few minutes and try again.',
            }),
        );
        const { err, val } = await call(auth.caRedeemCode, 'WRONG');
        expect(val).toBeNull();
        expect(err).toMatch(/too many/i);
        expect(store.ca_session).toBeUndefined();
    });
});

describe('caConfirmPasswordReset — changes password, stores no session', () => {
    it('reports success and does NOT create a session (user signs in afterward)', async () => {
        global.fetch = vi.fn((url) => {
            if (url.includes('/auth/v1/verify'))
                return res(true, 200, { access_token: 'AT', refresh_token: 'RT' });
            if (url.includes('/auth/v1/user')) return res(true, 200, { id: 'u1' });
            return res(false, 404, {});
        });
        const { err } = await call(auth.caConfirmPasswordReset, 'a@b.com', '123456', 'newpw');
        expect(err).toBeNull();
        expect(store.ca_session).toBeUndefined(); // no bypass — must sign in normally
    });

    it('rejects a bad/expired code with a friendly fallback message', async () => {
        global.fetch = vi.fn(() => res(false, 401, {}));
        const { err } = await call(auth.caConfirmPasswordReset, 'a@b.com', '000000', 'newpw');
        expect(err).toMatch(/incorrect or has expired/i);
        expect(store.ca_session).toBeUndefined();
    });

    it('surfaces a failure to set the new password', async () => {
        global.fetch = vi.fn((url) => {
            if (url.includes('/auth/v1/verify'))
                return res(true, 200, { access_token: 'AT', refresh_token: 'RT' });
            if (url.includes('/auth/v1/user'))
                return res(false, 422, { msg: 'Password should be at least 6 characters' });
            return res(false, 404, {});
        });
        const { err } = await call(auth.caConfirmPasswordReset, 'a@b.com', '123456', 'x');
        expect(err).toMatch(/at least 6 characters/i);
    });
});

describe('caConfirmSignup — email confirmation via code', () => {
    function mockConfirm(profileRows) {
        global.fetch = vi.fn((url) => {
            if (url.includes('/auth/v1/verify'))
                return res(true, 200, {
                    access_token: 'AT',
                    refresh_token: 'RT',
                    user: { email: 'a@b.com' },
                });
            if (url.includes('/rpc/my_profile')) return res(true, 200, profileRows);
            return res(false, 404, {});
        });
    }

    it('confirms and signs in an approved account (outcome "signedin")', async () => {
        mockConfirm([{ status: 'approved' }]);
        const { err, val } = await call(auth.caConfirmSignup, 'a@b.com', '123456');
        expect(err).toBeNull();
        expect(val).toBe('signedin');
        expect(store.ca_session.source).toBe('user');
    });

    it('confirms a pending account WITHOUT signing it in (outcome "approval")', async () => {
        mockConfirm([{ status: 'pending' }]);
        const { err, val } = await call(auth.caConfirmSignup, 'a@b.com', '123456');
        expect(err).toBeNull();
        expect(val).toBe('approval');
        expect(store.ca_session).toBeUndefined();
    });

    it('rejects a bad/expired code with a friendly fallback message', async () => {
        global.fetch = vi.fn(() => res(false, 401, {})); // opaque error body
        const { err, val } = await call(auth.caConfirmSignup, 'a@b.com', '000000');
        expect(val).toBeNull();
        expect(err).toMatch(/incorrect or has expired/i);
    });
});
