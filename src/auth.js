// Supabase-backed login for EMSCharts Assist.
//
// Loaded ONLY by the extension popup (popup.html) — the sign-in surface. The
// injected PCR toolbar never calls the network; it only reads the resulting
// session from chrome.storage.local (see chartassist.js). Uses plain `fetch`
// against Supabase's REST endpoints so there is no bundler/SDK to vendor,
// matching the project's vendored-jQuery approach.
//
// SECURITY: SUPABASE_PUBLISHABLE_KEY is a *public* key by design — it is safe to ship in
// the extension. Row-Level Security on the database is what actually protects
// data. The service-role key is NEVER placed here; access-code redemption runs
// server-side in the `redeem-code` Edge Function.

// ---- Project configuration (fill these in for YOUR Supabase project) --------
// Also add "<SUPABASE_URL>/*" to host_permissions in manifest.json.
var SUPABASE_URL = 'https://rzukjjkejtfphvrqnamf.supabase.co';
var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kR01v3qHLK1uSvTNZ2i2gQ_HE4WYSYS';

// How long a successful *user login* stays valid, in hours. The session survives
// popup closes and browser restarts (it lives in chrome.storage.local) and the
// toolbar locks once it lapses. Access codes are capped by their own DB expiry,
// not this constant.
var SESSION_TTL_HOURS = 24 * 30; // 30 days (~1 month)

// Optional client-side hint for self-service sign-up. The AUTHORITATIVE allow-list
// check is the server-side enforce_allowed_domain trigger; this only lets the popup
// say "use your work email" instantly, before any network call. List your approved
// domain(s) lowercase (e.g. 'vfambulance.com'); leave empty to rely on the server.
// NOTE: this is domain-only — if you populate it, a one-off address allow-listed
// server-side (allowed_emails) would be blocked here, so keep it empty when you
// rely on one-off email allow-listing.
var ALLOWED_EMAIL_DOMAINS = [];

// The session object shape stored under chrome.storage.local `ca_session`:
//   { access_token, refresh_token, session_expires_at, email|null, source }
// session_expires_at is epoch-ms; source is 'user' (email+password) or 'code'.

// ---- Session storage --------------------------------------------------------
function caStoreSession(session, cb) {
    try {
        chrome.storage.local.set({ ca_session: session }, function () {
            if (cb) cb(session);
        });
    } catch {
        if (cb) cb(session);
    }
}

function caGetSession(cb) {
    try {
        chrome.storage.local.get('ca_session', function (r) {
            cb((r && r.ca_session) || null);
        });
    } catch {
        cb(null);
    }
}

// Pure predicate — exported for unit tests. A session is valid while its expiry
// is still in the future. chartassist.js mirrors this check locally so PCR pages
// need not load this file.
function caSessionValid(session) {
    return !!(session && session.session_expires_at && session.session_expires_at > Date.now());
}

function caSignOut(cb) {
    try {
        // Also drop the cached admin flag (popup Admin-button shortcut) so a
        // different user signing in next can't briefly inherit it.
        chrome.storage.local.remove(['ca_session', 'ca_admin'], function () {
            if (cb) cb();
        });
    } catch {
        if (cb) cb();
    }
}

// ---- Remember username (email only — never the password) --------------------
function caSetRememberedEmail(email, remember) {
    try {
        if (remember && email) {
            chrome.storage.local.set({ ca_remember_email: email });
        } else {
            chrome.storage.local.remove('ca_remember_email');
        }
    } catch {
        /* ignore — pre-fill is a convenience only */
    }
}

function caGetRememberedEmail(cb) {
    try {
        chrome.storage.local.get('ca_remember_email', function (r) {
            cb((r && r.ca_remember_email) || '');
        });
    } catch {
        cb('');
    }
}

// ---- Helpers ----------------------------------------------------------------
// Lowercased domain of an email. Exported for tests; the authoritative allow-list
// check is server-side (the enforce_allowed_domain DB trigger) — this is only for
// client-side messaging/pre-checks.
function caEmailDomain(email) {
    var at = String(email || '').lastIndexOf('@');
    return at === -1
        ? ''
        : email
              .slice(at + 1)
              .trim()
              .toLowerCase();
}

// True when `email`'s domain is in `allowed`. An empty `allowed` disables the
// check (returns true) — the server trigger stays authoritative. Pure; for tests.
function caEmailDomainAllowed(email, allowed) {
    if (!allowed || !allowed.length) return true;
    var domain = caEmailDomain(email);
    return (
        allowed
            .map(function (d) {
                return String(d).trim().toLowerCase();
            })
            .indexOf(domain) !== -1
    );
}

// Read a fetch Response as JSON, tolerating an empty/non-JSON body.
function caReadJson(res) {
    return res
        .json()
        .catch(function () {
            return {};
        })
        .then(function (data) {
            return { ok: res.ok, data: data };
        });
}

// ---- Network: Supabase Auth + redeem-code -----------------------------------
// Sign in with email + password. On success, stores a session that stays valid
// for SESSION_TTL_HOURS. cb(err, session): err is a human-readable string or null.
function caSignIn(email, password, cb) {
    fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ email: email, password: password }),
    })
        .then(caReadJson)
        .then(function (r) {
            if (!r.ok || !r.data.access_token) {
                cb(caSignInError(r.data), null);
                return;
            }
            var session = {
                access_token: r.data.access_token,
                refresh_token: r.data.refresh_token,
                session_expires_at: Date.now() + SESSION_TTL_HOURS * 3600 * 1000,
                email: (r.data.user && r.data.user.email) || email,
                source: 'user',
            };
            caStoreSession(session, function () {
                cb(null, session);
            });
        })
        .catch(function () {
            cb('Network error — could not reach the sign-in server.', null);
        });
}

// Map a Supabase sign-in error to a friendly message. NOTE: Supabase returns the
// SAME "invalid_credentials" for a wrong password AND an unregistered email — this
// is deliberate (it prevents account enumeration), so we cannot truthfully single
// out "not registered" without a wrong verdict for someone who just mistyped their
// password. We instead point the user at "Create an account", which covers both.
function caSignInError(data) {
    var code = (data && data.error_code) || '';
    var msg = (data && (data.error_description || data.msg || data.error)) || '';
    var low = (code + ' ' + msg).toLowerCase();
    if (
        low.indexOf('invalid_credentials') !== -1 ||
        low.indexOf('invalid login credentials') !== -1
    ) {
        return 'Incorrect email or password. If you do not have an account, use "Create an account" above.';
    }
    if (low.indexOf('not confirmed') !== -1) {
        return 'Your email is not confirmed yet — check your inbox for the confirmation link.';
    }
    return msg || 'Sign-in failed. Check your email and password.';
}

// Create a new account with email + password, then (when the project has email
// confirmation OFF) sign in immediately. The email domain is enforced server-side
// by the enforce_allowed_domain trigger; ALLOWED_EMAIL_DOMAINS is only a local
// pre-check. cb(err, pending): err is a string or null; pending is true when the
// account was created but needs email confirmation before it can sign in.
function caSignUp(email, password, cb) {
    if (!caEmailDomainAllowed(email, ALLOWED_EMAIL_DOMAINS)) {
        cb(
            'The email domain entered is not approved. Please check the spelling or file a support case.',
            false,
        );
        return;
    }
    fetch(SUPABASE_URL + '/auth/v1/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ email: email, password: password }),
    })
        .then(caReadJson)
        .then(function (r) {
            if (!r.ok) {
                cb(caSignUpError(r.data), false);
                return;
            }
            // Confirmation OFF → signup returns a session; store it (signed in).
            if (r.data.access_token) {
                var session = {
                    access_token: r.data.access_token,
                    refresh_token: r.data.refresh_token,
                    session_expires_at: Date.now() + SESSION_TTL_HOURS * 3600 * 1000,
                    email: (r.data.user && r.data.user.email) || email,
                    source: 'user',
                };
                caStoreSession(session, function () {
                    cb(null, false);
                });
                return;
            }
            // Confirmation ON → account created, but must be verified first.
            cb(null, true);
        })
        .catch(function () {
            cb('Network error — could not reach the sign-in server.', false);
        });
}

// Map a Supabase sign-up error body to a friendly, crew-readable message. The
// allow-list trigger's exception surfaces through GoTrue as a generic "Database
// error saving new user", so that case is treated as a probable wrong-domain email.
function caSignUpError(data) {
    var msg = (data && (data.msg || data.error_description || data.error || data.message)) || '';
    var low = msg.toLowerCase();
    if (low.indexOf('domain') !== -1) {
        return 'The email domain entered is not approved. Please check the spelling or file a support case.';
    }
    if (low.indexOf('database error') !== -1) {
        return 'Could not create your account — check that you are using an approved work email address.';
    }
    if (low.indexOf('already registered') !== -1 || low.indexOf('already exists') !== -1) {
        return 'An account with that email already exists — try signing in instead.';
    }
    return msg || 'Could not create your account. Please try again.';
}

// Refresh the Supabase access token WITHOUT moving session_expires_at (the
// SESSION_TTL_HOURS cap is preserved). If the refresh token was revoked (e.g. the
// user was deactivated), the session is signed out — this is how revocation takes
// effect ahead of the natural expiry.
function caRefreshSession(cb) {
    caGetSession(function (session) {
        if (!session || session.source !== 'user' || !session.refresh_token) {
            if (cb) cb('No refreshable session', null);
            return;
        }
        fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
            body: JSON.stringify({ refresh_token: session.refresh_token }),
        })
            .then(caReadJson)
            .then(function (r) {
                if (!r.ok || !r.data.access_token) {
                    caSignOut(function () {
                        if (cb) cb('Session ended', null);
                    });
                    return;
                }
                session.access_token = r.data.access_token;
                if (r.data.refresh_token) session.refresh_token = r.data.refresh_token;
                caStoreSession(session, function () {
                    if (cb) cb(null, session);
                });
            })
            .catch(function () {
                if (cb) cb('Network error', null);
            });
    });
}

// Redeem a time-limited access code via the redeem-code Edge Function. On
// success, stores a session capped by the code's own expires_at (from the DB).
function caRedeemCode(code, cb) {
    fetch(SUPABASE_URL + '/functions/v1/redeem-code', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            // Publishable key (sb_publishable_*) identifies the project but is NOT
            // a JWT, so redeem-code is deployed with --no-verify-jwt (guests
            // redeeming a code have no user session). The function itself does the
            // real check against the DB with the service-role key.
            apikey: SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ code: code }),
    })
        .then(caReadJson)
        .then(function (r) {
            if (!r.ok || !r.data.expires_at) {
                cb(
                    (r.data && (r.data.error || r.data.message)) ||
                        'That code is invalid, expired, or used up.',
                    null,
                );
                return;
            }
            var session = {
                access_token: null,
                refresh_token: null,
                session_expires_at: new Date(r.data.expires_at).getTime(),
                email: null,
                source: 'code',
            };
            caStoreSession(session, function () {
                cb(null, session);
            });
        })
        .catch(function () {
            cb('Network error — could not reach the sign-in server.', null);
        });
}

// ---- Password reset (self-service, via an emailed 6-digit code) -------------
// No hosted web page is needed because we use the recovery *OTP* rather than a
// magic link. Two Supabase-side prerequisites (see supabase/README.md): custom
// SMTP must be configured, and the "Reset Password" email template must send
// {{ .Token }} (the 6-digit code) instead of {{ .ConfirmationURL }}.

// Step 1 — email a reset code. cb(err): err is a string or null. Supabase returns
// 200 even for an unknown email (anti-enumeration), so a non-ok is a real error
// (rate limit, or SMTP not configured).
function caRequestPasswordReset(email, cb) {
    fetch(SUPABASE_URL + '/auth/v1/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ email: email }),
    })
        .then(caReadJson)
        .then(function (r) {
            if (!r.ok) {
                cb(
                    (r.data && (r.data.error_description || r.data.msg || r.data.error)) ||
                        'Could not send a reset code. Please try again in a moment.',
                );
                return;
            }
            cb(null);
        })
        .catch(function () {
            cb('Network error — could not reach the sign-in server.');
        });
}

// Step 2 — verify the code and set the new password. Verifying the recovery OTP
// returns a session; we use its access token to update the password, then store
// the session so the user is signed straight in. cb(err, session).
function caConfirmPasswordReset(email, code, newPassword, cb) {
    fetch(SUPABASE_URL + '/auth/v1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ type: 'recovery', email: email, token: code }),
    })
        .then(caReadJson)
        .then(function (r) {
            if (!r.ok || !r.data.access_token) {
                cb(
                    (r.data && (r.data.error_description || r.data.msg || r.data.error)) ||
                        'That code is incorrect or has expired. Request a new one.',
                    null,
                );
                return;
            }
            fetch(SUPABASE_URL + '/auth/v1/user', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: SUPABASE_PUBLISHABLE_KEY,
                    Authorization: 'Bearer ' + r.data.access_token,
                },
                body: JSON.stringify({ password: newPassword }),
            })
                .then(caReadJson)
                .then(function (r2) {
                    if (!r2.ok) {
                        cb(
                            (r2.data &&
                                (r2.data.error_description || r2.data.msg || r2.data.error)) ||
                                'Could not set the new password. Please try again.',
                            null,
                        );
                        return;
                    }
                    var session = {
                        access_token: r.data.access_token,
                        refresh_token: r.data.refresh_token,
                        session_expires_at: Date.now() + SESSION_TTL_HOURS * 3600 * 1000,
                        email: (r.data.user && r.data.user.email) || email,
                        source: 'user',
                    };
                    caStoreSession(session, function () {
                        cb(null, session);
                    });
                })
                .catch(function () {
                    cb('Network error — could not reach the sign-in server.', null);
                });
        })
        .catch(function () {
            cb('Network error — could not reach the sign-in server.', null);
        });
}

// ---- Profile / role --------------------------------------------------------
// The signed-in user's own profile (role, org_id, email) via the my_profile()
// RPC — RLS-safe and needs no user id client-side. Used by the popup to decide
// whether to show the Admin button and by admin.js's role gate. Returns null when
// signed out, on an access-code session, or on any error (fail-closed).
function caGetProfile(cb) {
    caGetSession(function (session) {
        if (!session || !session.access_token) {
            cb(null);
            return;
        }
        fetch(SUPABASE_URL + '/rest/v1/rpc/my_profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: 'Bearer ' + session.access_token,
            },
            body: '{}',
        })
            .then(caReadJson)
            .then(function (r) {
                if (!r.ok || !r.data) {
                    cb(null);
                    return;
                }
                // my_profile() returns setof → an array of 0 or 1 rows.
                cb((Array.isArray(r.data) ? r.data[0] : r.data) || null);
            })
            .catch(function () {
                cb(null);
            });
    });
}

// True when a profile role grants admin access. Pure; exported for tests.
function caIsAdminRole(role) {
    return role === 'crew_admin' || role === 'super_admin';
}

// Exported for unit tests (Node/CommonJS). No-op in the browser popup context,
// where `module` is undefined and these are plain globals.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        caSessionValid,
        caEmailDomain,
        caEmailDomainAllowed,
        caIsAdminRole,
        SESSION_TTL_HOURS,
    };
}
