// Supabase-backed login for GRTech ChartAssist.
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
        // Also drop the cached admin + QA-eligibility flags (popup shortcuts) so a
        // different user signing in next can't briefly inherit them.
        chrome.storage.local.remove(['ca_session', 'ca_admin', 'ca_qa_eligible'], function () {
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

// Read a fetch Response as JSON, tolerating an empty/non-JSON body. `status` is
// surfaced so callers can tell an explicit auth failure (400/401 with a JSON error
// body) apart from an ambiguous 200 that didn't parse (e.g. a captive-portal page).
function caReadJson(res) {
    return res
        .json()
        .catch(function () {
            return {};
        })
        .then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
        });
}

// ---- Network: Supabase Auth + redeem-code -----------------------------------

// Friendly message when an account exists but a crew admin hasn't approved it yet.
// Shared by sign-in and sign-up (a self-registered, non-pre-approved account is
// pending until approved).
function caPendingApprovalMessage() {
    return (
        'Your account is waiting for your crew admin to approve it. ' +
        "You'll be able to sign in once they do."
    );
}

// Fetch just the approval status of the account owning `accessToken`, via the
// my_profile RPC. cb(status): 'approved' | 'pending' | null (unknown). Only an
// explicit 'pending' blocks the gate; an unknown result (e.g. a transient error)
// fails OPEN — my_profile is a reliable self-read right after authenticating and
// the vast majority of accounts are approved, so a hiccup must not lock everyone
// out.
function caFetchProfileStatus(accessToken, cb) {
    fetch(SUPABASE_URL + '/rest/v1/rpc/my_profile', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: 'Bearer ' + accessToken,
        },
        body: '{}',
    })
        .then(caReadJson)
        .then(function (r) {
            var row = r.data && (Array.isArray(r.data) ? r.data[0] : r.data);
            cb((row && row.status) || null);
        })
        .catch(function () {
            cb(null);
        });
}

// Turn a Supabase token response for a user login into a STORED session — but only
// if the account is approved. cb(err, session):
//   * session set          → approved; a working session was stored (signed in)
//   * session null (no err) → the account is pending admin approval; nothing stored
// Centralizing the approval check here means every path that could establish a
// session (sign-in, and the auto-login after sign-up) enforces it, so the PCR-page
// gate stays simple: no ca_session is ever written for a pending account.
function caFinalizeUserSession(tokenData, email, cb) {
    caFetchProfileStatus(tokenData.access_token, function (status) {
        if (status === 'pending') {
            cb(null, null);
            return;
        }
        var session = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            session_expires_at: Date.now() + SESSION_TTL_HOURS * 3600 * 1000,
            email: (tokenData.user && tokenData.user.email) || email,
            source: 'user',
        };
        caStoreSession(session, function () {
            cb(null, session);
        });
    });
}

// Sign in with email + password. On success with an APPROVED account, stores a
// session valid for SESSION_TTL_HOURS; a pending account is reported (no session).
// cb(err, session): err is a human-readable string or null.
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
            // Credentials are valid, but a pending account isn't approved yet — only
            // store a session once approved, otherwise report it as awaiting approval.
            caFinalizeUserSession(r.data, email, function (err, session) {
                if (err) {
                    cb(err, null);
                    return;
                }
                if (!session) {
                    cb(caPendingApprovalMessage(), null);
                    return;
                }
                cb(null, session);
            });
        })
        .catch(function () {
            cb('Network error — could not reach the sign-in server.', null);
        });
}

// List crews (id + name) for the sign-up "select your crew" dropdown. Works while
// signed OUT (the list_orgs RPC is granted to anon). cb(err, orgs): orgs is an
// array of { id, name } (empty on error).
function caListOrgs(cb) {
    fetch(SUPABASE_URL + '/rest/v1/rpc/list_orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
        body: '{}',
    })
        .then(caReadJson)
        .then(function (r) {
            cb(r.ok ? null : 'Could not load crews', Array.isArray(r.data) ? r.data : []);
        })
        .catch(function () {
            cb('Network error — could not reach the sign-in server.', []);
        });
}

// Is this email already pre-approved — on allowed_emails OR by its domain on
// allowed_domains? Anon-callable; used by the sign-up form to keep the crew dropdown
// hidden for someone who doesn't need to request access. cb(approved): boolean,
// false on any error.
function caEmailPreapproved(email, cb) {
    fetch(SUPABASE_URL + '/rest/v1/rpc/email_preapproved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ p_email: email }),
    })
        .then(caReadJson)
        .then(function (r) {
            cb(r.ok && r.data === true);
        })
        .catch(function () {
            cb(false);
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
        return 'Your email is not confirmed yet — click "Confirm your email" below and enter the 6-digit code we emailed you.';
    }
    return msg || 'Sign-in failed. Check your email and password.';
}

// Create a new account with email + password. `orgId` is the crew the user picked
// in the sign-up form; it rides along as sign-up metadata (requested_org_id) so the
// server can route a NON-pre-approved sign-up to that crew's admins as a pending
// request. The email domain is enforced server-side by enforce_allowed_domain;
// ALLOWED_EMAIL_DOMAINS is only a local pre-check. cb(err, outcome): err is a
// string or null; outcome is one of
//   'signedin' → pre-approved (email/domain) and signed in immediately
//   'confirm'  → account created, but email confirmation is required first
//   'approval' → account created, awaiting a crew admin's approval (not signed in)
function caSignUp(email, password, orgId, cb) {
    if (!caEmailDomainAllowed(email, ALLOWED_EMAIL_DOMAINS)) {
        cb(
            'The email domain entered is not approved. Please check the spelling or file a support case.',
            null,
        );
        return;
    }
    fetch(SUPABASE_URL + '/auth/v1/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({
            email: email,
            password: password,
            data: orgId ? { requested_org_id: orgId } : {},
        }),
    })
        .then(caReadJson)
        .then(function (r) {
            if (!r.ok) {
                cb(caSignUpError(r.data), null);
                return;
            }
            // Confirmation OFF → signup returns a session. Finalize through the
            // approval check: a pre-approved account is signed in; a non-pre-approved
            // one is pending, so no session is stored and the user is told it's
            // awaiting approval.
            if (r.data.access_token) {
                caFinalizeUserSession(r.data, email, function (err, session) {
                    if (err) {
                        cb(err, null);
                        return;
                    }
                    cb(null, session ? 'signedin' : 'approval');
                });
                return;
            }
            // Confirmation ON → account created, but must be verified first.
            cb(null, 'confirm');
        })
        .catch(function () {
            cb('Network error — could not reach the sign-in server.', null);
        });
}

// Map a Supabase sign-up error body to a friendly, crew-readable message. The
// allow-list trigger's exception surfaces through GoTrue as a generic "Database
// error saving new user", so that case is treated as a probable wrong-domain email.
function caSignUpError(data) {
    var msg = (data && (data.msg || data.error_description || data.error || data.message)) || '';
    var low = msg.toLowerCase();
    if (low.indexOf('domain') !== -1) {
        return 'That email address does not look right — please check the spelling. If it is correct, select your crew above to request access.';
    }
    if (low.indexOf('crew') !== -1 || low.indexOf('select your crew') !== -1) {
        return 'Select your crew above so your request can be sent to its admin for approval.';
    }
    if (low.indexOf('database error') !== -1) {
        return 'Could not create your account — select your crew above and check your email is spelled correctly.';
    }
    if (low.indexOf('already registered') !== -1 || low.indexOf('already exists') !== -1) {
        return 'An account with that email already exists — try signing in instead.';
    }
    return msg || 'Could not create your account. Please try again.';
}

// ---- Email confirmation (self-service, via an emailed 6-digit code) ----------
// Like the password-reset flow, we use the signup OTP rather than a magic link, so
// the email carries no clickable URL (nothing for a spam filter to flag as a
// domain mismatch, and no hosted page needed). Supabase prerequisite: the
// "Confirm signup" template must send {{ .Token }} (the 6-digit code) instead of
// {{ .ConfirmationURL }} — see supabase/README.md.

// Verify the emailed signup code, confirming the address. On success the account's
// email is confirmed and a session is returned; we finalize it through the SAME
// approval gate as sign-in, so a pending account is confirmed but NOT signed in
// until approved. cb(err, outcome): outcome is 'signedin' | 'approval'.
function caConfirmSignup(email, code, cb) {
    fetch(SUPABASE_URL + '/auth/v1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ type: 'signup', email: email, token: code }),
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
            caFinalizeUserSession(r.data, email, function (err, session) {
                if (err) {
                    cb(err, null);
                    return;
                }
                cb(null, session ? 'signedin' : 'approval');
            });
        })
        .catch(function () {
            cb('Network error — could not reach the sign-in server.', null);
        });
}

// Re-send the signup confirmation code (e.g. it expired or never arrived). cb(err).
function caResendConfirmation(email, cb) {
    fetch(SUPABASE_URL + '/auth/v1/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ type: 'signup', email: email }),
    })
        .then(caReadJson)
        .then(function (r) {
            if (!r.ok) {
                cb(
                    (r.data && (r.data.error_description || r.data.msg || r.data.error)) ||
                        'Could not resend the code. Please try again in a moment.',
                );
                return;
            }
            cb(null);
        })
        .catch(function () {
            cb('Network error — could not reach the sign-in server.');
        });
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
                if (r.ok && r.data.access_token) {
                    session.access_token = r.data.access_token;
                    if (r.data.refresh_token) session.refresh_token = r.data.refresh_token;
                    caStoreSession(session, function () {
                        if (cb) cb(null, session);
                    });
                    return;
                }
                // Only an explicit auth failure (revoked/expired refresh token →
                // 400/401) signs the user out — that's how deactivation takes effect.
                // A 200 with an unparseable/HTML body (a captive portal or proxy
                // interstitial on venue/hospital Wi-Fi), or any other non-auth status
                // (5xx gateway), is NOT proof the account is gone: keep the session
                // and report a soft error so field users aren't kicked out.
                if (r.status === 400 || r.status === 401) {
                    caSignOut(function () {
                        if (cb) cb('Session ended', null);
                    });
                    return;
                }
                if (cb) cb('Network error', null);
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

// Step 2 — verify the recovery code and set the new password. On success the
// password is changed but NO session is stored: the user then signs in with the
// new password, so the approval gate applies normally (a pending account can't
// bypass it via "Forgot password?"). cb(err): a string on failure, null on success.
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
                    // Password changed. Deliberately store NO session — the user
                    // signs in afterward with their new password, so the approval
                    // gate applies normally (a pending account still can't get in via
                    // "Forgot password?"). cb(null) = the reset succeeded.
                    cb(null);
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
// whether to show the Admin button and by admin.js's role gate.
//
// cb(profile, determined):
//   * determined=true  → the read was AUTHORITATIVE. profile is the row, or null
//                        when the account genuinely has no profile. Callers may act
//                        on it (reveal/hide, cache).
//   * determined=false → the read could NOT be completed (no user session/token, a
//                        network error, an expired token, or a non-OK response).
//                        profile is null; callers should KEEP their cached state
//                        rather than revoke, so a transient blip doesn't strip a
//                        user's Admin/QA access.
function caGetProfile(cb) {
    caGetSession(function (session) {
        if (!session || !session.access_token) {
            cb(null, false);
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
                    cb(null, false);
                    return;
                }
                // my_profile() returns setof → an array of 0 or 1 rows.
                cb((Array.isArray(r.data) ? r.data[0] : r.data) || null, true);
            })
            .catch(function () {
                cb(null, false);
            });
    });
}

// True when a profile role grants admin access. Pure; exported for tests.
function caIsAdminRole(role) {
    return role === 'crew_admin' || role === 'super_admin';
}

// True when a profile role may use QA Mode (the popup toggle): the dedicated
// qa_auditor role and crew_admin, plus super_admin as the superset admin. Pure;
// exported for tests.
function caCanUseQa(role) {
    return role === 'crew_admin' || role === 'qa_auditor' || role === 'super_admin';
}

// Exported for unit tests (Node/CommonJS). No-op in the browser popup context,
// where `module` is undefined and these are plain globals.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        caSessionValid,
        caEmailDomain,
        caEmailDomainAllowed,
        caIsAdminRole,
        caCanUseQa,
        SESSION_TTL_HOURS,
        // Network flows (tested with a mocked global.fetch + chrome.storage.local).
        caSignIn,
        caRefreshSession,
        caGetProfile,
        caRedeemCode,
        caConfirmPasswordReset,
        caConfirmSignup,
    };
}
