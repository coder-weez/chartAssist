// Dark mode toggle (header sun/moon button). Shares the `ca_theme` preference
// with the Options page and the injected toolbar, so one control themes the whole
// extension ('dark' | 'light' | unset = follow the OS). Stored in
// chrome.storage.local, with a localStorage fallback so it also works when
// popup.html is opened outside the extension. Wired first so a missing `chrome`
// (preview) can't abort it.
function ca_theme_get(cb) {
    try {
        if (window.chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get('ca_theme', function (r) {
                cb(r && r.ca_theme);
            });
            return;
        }
    } catch {
        /* fall through to localStorage */
    }
    try {
        cb(window.localStorage.getItem('ca_theme'));
    } catch {
        cb(null);
    }
}

function ca_theme_set(val) {
    try {
        if (window.chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ ca_theme: val });
            return;
        }
    } catch {
        /* fall through to localStorage */
    }
    try {
        window.localStorage.setItem('ca_theme', val);
    } catch {
        /* ignore */
    }
}

function ca_theme_effective(stored) {
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
}

function ca_theme_apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var btn = document.getElementById('theme-toggle');
    if (btn) {
        var label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
    }
}

ca_theme_get(function (stored) {
    ca_theme_apply(ca_theme_effective(stored));
});
var themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
    // Null-guard (matches options.js): a missing/renamed #theme-toggle must not throw
    // here and abort the rest of popup.js (the whole sign-in UI is wired below).
    themeToggle.addEventListener('click', function () {
        var current =
            document.documentElement.getAttribute('data-theme') || ca_theme_effective(null);
        var next = current === 'dark' ? 'light' : 'dark';
        ca_theme_apply(next);
        ca_theme_set(next);
    });
}

// --- Login gate -----------------------------------------------------------
// The popup is the sign-in surface. A valid session (see auth.js) reveals the
// tools view; otherwise the sign-in form is shown. The injected toolbar reads
// the same `ca_session` from chrome.storage.local and gates itself.
var viewAuth = document.getElementById('view-auth');
var viewApp = document.getElementById('view-app');
var errEl = document.getElementById('auth_error');

function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.classList.remove('is-success');
}

function showSuccess(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.classList.add('is-success');
}

function formatExpiry(ts) {
    try {
        return new Date(ts).toLocaleString([], {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
        });
    } catch {
        return '';
    }
}

// Read the current session and show the matching view.
function render() {
    caGetSession(function (session) {
        var valid = caSessionValid(session);
        viewAuth.hidden = valid;
        viewApp.hidden = !valid;
        if (valid) {
            var who =
                session.source === 'code'
                    ? 'Signed in with access code'
                    : session.email || 'Signed in';
            document.getElementById('signed_in_as').textContent = who;
            // Only access-code sessions show an expiry; a normal login lasts a
            // month, so the "Access until" line is hidden for user sessions.
            var expEl = document.getElementById('signed_in_expiry');
            if (session.source === 'code') {
                expEl.textContent = 'Access until ' + formatExpiry(session.session_expires_at);
                expEl.hidden = false;
            } else {
                expEl.textContent = '';
                expEl.hidden = true;
            }
            // Admin button + QA Mode row: both role-gated. Reveal instantly from
            // cached flags (local read, no network) so they don't lag the popup
            // opening, then revalidate with caGetProfile and refresh the caches.
            // Fail-closed: hidden by default. The Admin page re-checks role + RLS
            // regardless, so the optimistic reveal is only a shortcut, never a grant;
            // QA Mode isn't a security control, just a review aid.
            var adminBtn = document.getElementById('open_admin');
            var qaRow = document.getElementById('qa_row');
            adminBtn.hidden = true;
            qaRow.hidden = true;
            if (session.source === 'user') {
                var settled = false;
                chrome.storage.local.get(['ca_admin', 'ca_qa_eligible'], function (r) {
                    if (settled || !r) return;
                    if (r.ca_admin) adminBtn.hidden = false;
                    if (r.ca_qa_eligible) qaRow.hidden = false;
                });
                caGetProfile(function (profile, determined) {
                    // A transient failure (network blip, captive portal, briefly
                    // expired token) returns determined=false. Don't revoke Admin/QA
                    // or force QA Mode off on that — keep whatever the cached flags
                    // showed (the optimistic local read above reveals them), and
                    // leave `settled` unset so that read isn't suppressed. Only an
                    // AUTHORITATIVE result flips state. Mirrors the session gate's
                    // deliberate fail-OPEN stance on transient errors.
                    if (!determined) return;
                    settled = true;
                    var isAdmin = !!(profile && caIsAdminRole(profile.role));
                    var canQa = !!(profile && caCanUseQa(profile.role));
                    adminBtn.hidden = !isAdmin;
                    qaRow.hidden = !canQa;
                    chrome.storage.local.set({ ca_admin: isAdmin, ca_qa_eligible: canQa });
                    // If this user can't use QA Mode, make sure it isn't left frozen
                    // on for them (the toggle would be hidden, so unturnoffable).
                    if (!canQa) chrome.storage.local.set({ ca_qa_mode: false });
                });
            } else {
                // Access-code / guest session: no role, so no QA toggle — and don't
                // leave QA Mode frozen on with no way to turn it off.
                chrome.storage.local.set({ ca_qa_mode: false });
            }
        } else {
            // Reset to sign-in mode (hides the sign-up / reset forms, collapses code).
            showAuthMode('signin');
            // Pre-fill the remembered email (email only — never a password).
            caGetRememberedEmail(function (email) {
                var emailEl = document.getElementById('email');
                if (emailEl && !emailEl.value) emailEl.value = email || '';
            });
        }
    });
}

function setBusy(btn, busy, busyLabel) {
    if (!btn) return;
    if (busy) {
        btn.dataset.label = btn.textContent;
        btn.textContent = busyLabel || 'Please wait…';
        btn.disabled = true;
    } else {
        if (btn.dataset.label) btn.textContent = btn.dataset.label;
        btn.disabled = false;
    }
}

// Switch the signed-out view between modes: 'signin' | 'signup' | 'reset'. The
// global [hidden] CSS rule is forced, so this reliably hides the .link-btn /
// .divider too (both set an explicit display that would otherwise defeat hidden).
function showAuthMode(mode) {
    var signin = mode === 'signin';
    document.getElementById('auth_intro').hidden = !signin;
    document.getElementById('signin_form').hidden = !signin;
    document.getElementById('auth_alt_links').hidden = !signin;
    document.getElementById('auth_divider').hidden = !signin;
    document.getElementById('code_toggle').hidden = !signin;
    document.getElementById('code_form').hidden = true;
    document.getElementById('signup_form').hidden = mode !== 'signup';
    document.getElementById('reset_form').hidden = mode !== 'reset';
    document.getElementById('confirm_form').hidden = mode !== 'confirm';
}

document.getElementById('signin_form').addEventListener('submit', function (e) {
    e.preventDefault();
    showError('');
    var email = document.getElementById('email').value.trim();
    var passwordEl = document.getElementById('password');
    var password = passwordEl.value;
    var remember = document.getElementById('remember_email').checked;
    if (!email || !password) {
        showError('Enter your email and password.');
        return;
    }
    var btn = document.getElementById('btn_signin');
    setBusy(btn, true, 'Signing in…');
    caSignIn(email, password, function (err) {
        setBusy(btn, false);
        if (err) {
            showError(err);
            return;
        }
        caSetRememberedEmail(email, remember);
        passwordEl.value = '';
        render();
    });
});

// Create-account flow (self-service sign-up, gated by the server domain trigger).
// Populate the "select your crew" dropdown once, lazily, the first time the form is
// opened. Signed-out-safe (list_orgs is anon-callable). On failure it leaves just
// the placeholder — the server still validates the crew.
var caSignupOrgsLoaded = false;
function loadSignupOrgs() {
    if (caSignupOrgsLoaded) return;
    var sel = document.getElementById('signup_org');
    if (!sel) return;
    caListOrgs(function (err, orgs) {
        if (err) return; // leave placeholder; reopening retries
        caSignupOrgsLoaded = true;
        orgs.forEach(function (o) {
            var opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = o.name;
            sel.appendChild(opt);
        });
    });
}

// The "Your crew" field starts hidden and only appears once the typed email turns
// out NOT to be pre-approved (not on allowed_emails and its domain not approved) —
// only such a sign-up needs to pick a crew to route its request to. A pre-approved
// email keeps it hidden. Guards against an out-of-order response if the email is
// edited again before the check returns.
function updateCrewFieldForEmail() {
    var emailEl = document.getElementById('signup_email');
    var field = document.getElementById('signup_org_field');
    if (!emailEl || !field) return;
    var email = emailEl.value.trim();
    if (!email) {
        field.hidden = true; // no email yet — stay hidden until we know
        return;
    }
    caEmailPreapproved(email, function (approved) {
        if (emailEl.value.trim() !== email) return; // stale — email changed since
        field.hidden = approved; // show only when NOT pre-approved
    });
}
document.getElementById('signup_email').addEventListener('blur', updateCrewFieldForEmail);

document.getElementById('signup_toggle').addEventListener('click', function () {
    showError('');
    showAuthMode('signup');
    loadSignupOrgs();
    updateCrewFieldForEmail(); // re-evaluate for any pre-filled email
    document.getElementById('signup_email').focus();
});
document.getElementById('signup_cancel').addEventListener('click', function () {
    showError('');
    showAuthMode('signin');
});
document.getElementById('signup_form').addEventListener('submit', function (e) {
    e.preventDefault();
    showError('');
    var email = document.getElementById('signup_email').value.trim();
    var pw = document.getElementById('signup_password').value;
    var pw2 = document.getElementById('signup_password2').value;
    var orgSel = document.getElementById('signup_org');
    var orgId = orgSel.value;
    if (!email || !pw) {
        showError('Enter your email and a password.');
        return;
    }
    // Require a crew only when the crew field is shown (a pre-approved email hides
    // it) and the list actually loaded (more than the placeholder), so a
    // non-pre-approved request can be routed to an admin. If no crews are configured
    // yet, let the server decide (pre-approved emails/domains still work).
    var orgField = document.getElementById('signup_org_field');
    var crewShown = orgField && !orgField.hidden;
    if (crewShown && !orgId && orgSel.options.length > 1) {
        showError('Select your crew.');
        return;
    }
    if (pw !== pw2) {
        showError('The passwords do not match.');
        return;
    }
    var btn = document.getElementById('btn_signup');
    setBusy(btn, true, 'Creating…');
    caSignUp(email, pw, orgId, function (err, outcome) {
        setBusy(btn, false);
        if (err) {
            showError(err);
            return;
        }
        caSetRememberedEmail(email, true);
        if (outcome === 'approval') {
            // Account created but awaiting a crew admin's approval — no session.
            showAuthMode('signin');
            document.getElementById('email').value = email;
            showSuccess(
                'Request sent to your crew admin. You can sign in here once they approve it.',
            );
            return;
        }
        if (outcome === 'confirm') {
            // Confirm-email is on: no session yet. Go straight to the code-entry step
            // (the email carries a 6-digit code, not a link), so the user confirms
            // without leaving the popup. The approval check, if any, runs after.
            showAuthMode('confirm');
            document.getElementById('confirm_email').value = email;
            showSuccess(
                'Account created — we emailed a 6-digit code to ' +
                    email +
                    '. Enter it below to confirm your address.',
            );
            document.getElementById('confirm_code').focus();
            return;
        }
        // 'signedin' — pre-approved and confirmation off; signed in immediately.
        document.getElementById('signup_password').value = '';
        document.getElementById('signup_password2').value = '';
        render();
    });
});

// Password reset flow (self-service, via an emailed 6-digit code).
document.getElementById('reset_toggle').addEventListener('click', function () {
    showError('');
    document.getElementById('reset_step2').hidden = true;
    document.getElementById('reset_step1').hidden = false;
    showAuthMode('reset');
    var typed = document.getElementById('email').value.trim();
    if (typed) document.getElementById('reset_email').value = typed;
    document.getElementById('reset_email').focus();
});
document.getElementById('reset_cancel').addEventListener('click', function () {
    showError('');
    showAuthMode('signin');
});
document.getElementById('btn_reset_send').addEventListener('click', function () {
    showError('');
    var email = document.getElementById('reset_email').value.trim();
    if (!email) {
        showError('Enter your email to get a reset code.');
        return;
    }
    var btn = this;
    setBusy(btn, true, 'Sending…');
    caRequestPasswordReset(email, function (err) {
        setBusy(btn, false);
        if (err) {
            showError(err);
            return;
        }
        document.getElementById('reset_step1').hidden = true;
        document.getElementById('reset_step2').hidden = false;
        showSuccess(
            'We emailed a 6-digit code to ' + email + '. Enter it above with a new password.',
        );
        document.getElementById('reset_code').focus();
    });
});
document.getElementById('btn_reset_confirm').addEventListener('click', function () {
    showError('');
    var email = document.getElementById('reset_email').value.trim();
    var code = document.getElementById('reset_code').value.trim();
    var pw = document.getElementById('reset_password').value;
    var pw2 = document.getElementById('reset_password2').value;
    if (!code || !pw) {
        showError('Enter the code and your new password.');
        return;
    }
    if (pw !== pw2) {
        showError('The passwords do not match.');
        return;
    }
    var btn = this;
    setBusy(btn, true, 'Resetting…');
    caConfirmPasswordReset(email, code, pw, function (err) {
        setBusy(btn, false);
        if (err) {
            showError(err);
            return;
        }
        caSetRememberedEmail(email, true);
        document.getElementById('reset_code').value = '';
        document.getElementById('reset_password').value = '';
        document.getElementById('reset_password2').value = '';
        // Reset doesn't sign the user in — return to sign-in and confirm success.
        showAuthMode('signin');
        document.getElementById('email').value = email;
        showSuccess('Your password was changed successfully. Sign in with your new password.');
    });
});

// Email-confirmation flow (self-service, via an emailed 6-digit signup code). Kept
// in the popup so the email carries only a code, not a link (no domain mismatch for
// spam filters, no hosted page). Reachable right after sign-up and from the
// "Confirm your email" link, so a user who closed the popup can resume.
document.getElementById('confirm_toggle').addEventListener('click', function () {
    showError('');
    showAuthMode('confirm');
    var typed = document.getElementById('email').value.trim();
    if (typed) document.getElementById('confirm_email').value = typed;
    document.getElementById('confirm_code').focus();
});
document.getElementById('confirm_cancel').addEventListener('click', function () {
    showError('');
    showAuthMode('signin');
});
document.getElementById('confirm_resend').addEventListener('click', function () {
    showError('');
    var email = document.getElementById('confirm_email').value.trim();
    if (!email) {
        showError('Enter your email to resend the code.');
        return;
    }
    var btn = this;
    setBusy(btn, true, 'Sending…');
    caResendConfirmation(email, function (err) {
        setBusy(btn, false);
        if (err) {
            showError(err);
            return;
        }
        showSuccess('We emailed another code to ' + email + '.');
    });
});
document.getElementById('btn_confirm').addEventListener('click', function () {
    showError('');
    var email = document.getElementById('confirm_email').value.trim();
    var code = document.getElementById('confirm_code').value.trim();
    if (!email || !code) {
        showError('Enter your email and the confirmation code.');
        return;
    }
    var btn = this;
    setBusy(btn, true, 'Confirming…');
    caConfirmSignup(email, code, function (err, outcome) {
        setBusy(btn, false);
        if (err) {
            showError(err);
            return;
        }
        caSetRememberedEmail(email, true);
        document.getElementById('confirm_code').value = '';
        if (outcome === 'approval') {
            // Email confirmed, but the account still needs a crew admin's approval.
            showAuthMode('signin');
            document.getElementById('email').value = email;
            showSuccess(
                'Email confirmed! Your access is now waiting for your crew admin to approve it. ' +
                    'You can sign in here once they do.',
            );
            return;
        }
        // 'signedin' — confirmed and approved (or pre-approved); signed straight in.
        render();
    });
});

// Reveal the access-code box only when the user asks for it.
document.getElementById('code_toggle').addEventListener('click', function () {
    this.hidden = true;
    document.getElementById('code_form').hidden = false;
    document.getElementById('access_code').focus();
});

document.getElementById('code_form').addEventListener('submit', function (e) {
    e.preventDefault();
    showError('');
    var codeEl = document.getElementById('access_code');
    var code = codeEl.value.trim();
    if (!code) {
        showError('Enter an access code.');
        return;
    }
    var btn = document.getElementById('btn_redeem');
    setBusy(btn, true, 'Checking…');
    caRedeemCode(code, function (err) {
        setBusy(btn, false);
        if (err) {
            showError(err);
            return;
        }
        codeEl.value = '';
        render();
    });
});

document.getElementById('btn_signout').addEventListener('click', function () {
    caSignOut(function () {
        showError('');
        render();
    });
});

// Initial view. If a user session is present, refresh its token in the
// background so a deactivated account is caught (the refresh fails → sign-out →
// re-render) without waiting for the session cap.
render();
caGetSession(function (session) {
    if (caSessionValid(session) && session.source === 'user') {
        caRefreshSession(function (err) {
            if (err) render();
        });
    }
});

// --- Existing controls (only reachable in the signed-in view) --------------
chrome.storage.local.get('ca_qa_mode', function (r) {
    document.getElementById('qa_mode').checked = !!r.ca_qa_mode;
});
document.getElementById('qa_mode').addEventListener('change', function () {
    chrome.storage.local.set({ ca_qa_mode: this.checked });
});
document.getElementById('open_options').addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
});
document.getElementById('open_admin').addEventListener('click', function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('admin.html') });
});

// Show the running version, read from the manifest so it always matches
// manifest.json (no manual drift). Cosmetic — stays blank outside the extension.
try {
    if (window.chrome && chrome.runtime && chrome.runtime.getManifest) {
        var version = chrome.runtime.getManifest().version;
        var versionEl = document.getElementById('version');
        if (versionEl && version) versionEl.textContent = 'v' + version;
    }
} catch {
    /* ignore — version display is cosmetic */
}
