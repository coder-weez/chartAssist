// ChartAssist admin console (admin.html). Loaded after auth.js, which provides
// SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY and the session/profile helpers.
//
// This is a separate, role-gated surface. A full-page, fail-closed overlay
// (#ca-admin-gate) covers everything until a valid session AND an admin role are
// confirmed. RLS on the server is the real security boundary — a crew admin can
// only ever read/write their own org's rows; this gate is only UX.

// ---- Theme (shares the extension-wide `ca_theme` preference) -----------------
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
}

ca_theme_get(function (stored) {
    ca_theme_apply(ca_theme_effective(stored));
});
document.getElementById('theme-toggle').addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme') || ca_theme_effective(null);
    var next = current === 'dark' ? 'light' : 'dark';
    ca_theme_apply(next);
    ca_theme_set(next);
});

// Human-readable message shown when the session can't be renewed (e.g. an admin
// left this page open past the ~1h access-token lifetime and the refresh failed).
var CA_SESSION_EXPIRED_MSG =
    'Your session has expired. Reopen the ChartAssist popup (click the extension icon) ' +
    'and sign in again.';

// One PostgREST call with the given token. cb(err, data, status): status is the
// HTTP status (0 on a network error) so the caller can detect a 401.
function ca_admin_do_fetch(path, opts, token, cb) {
    var o = Object.assign({}, opts || {});
    o.headers = Object.assign(
        {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
        },
        o.headers || {},
    );
    fetch(SUPABASE_URL + path, o)
        .then(function (res) {
            return res.text().then(function (t) {
                var data = null;
                try {
                    data = t ? JSON.parse(t) : null;
                } catch {
                    /* non-JSON body (e.g. an empty 204) — leave data null */
                }
                return { ok: res.ok, status: res.status, data: data };
            });
        })
        .then(function (r) {
            cb(
                r.ok ? null : (r.data && (r.data.message || r.data.error)) || 'Request failed',
                r.data,
                r.status,
            );
        })
        .catch(function () {
            cb('Network error', null, 0);
        });
}

// ---- REST helper: a PostgREST call carrying the current session token --------
// Supabase access tokens live ~1h, but the login gate holds a session for 30 days,
// so a console left open (or opened cold from a bookmark) can carry an expired
// token. On a 401 we silently refresh once (caRefreshSession) and retry, so the
// admin doesn't see a spurious failure. cb(err, data): err is a human-readable
// string or null.
function admin_fetch(path, opts, cb) {
    caGetSession(function (session) {
        if (!session || !session.access_token) {
            cb('Not signed in', null);
            return;
        }
        ca_admin_do_fetch(path, opts, session.access_token, function (err, data, status) {
            if (status !== 401) {
                cb(err, data);
                return;
            }
            caRefreshSession(function (rerr, rsession) {
                if (rerr || !rsession || !rsession.access_token) {
                    cb(CA_SESSION_EXPIRED_MSG, null);
                    return;
                }
                ca_admin_do_fetch(
                    path,
                    opts,
                    rsession.access_token,
                    function (err2, data2, status2) {
                        if (status2 === 401) {
                            cb(CA_SESSION_EXPIRED_MSG, null);
                            return;
                        }
                        cb(err2, data2);
                    },
                );
            });
        });
    });
}

// ---- Console ----------------------------------------------------------------
var caProfile = null; // the signed-in admin's profile (role, org_id, email)
var msgEl = document.getElementById('admin_msg');
var pendingMsgEl = document.getElementById('pending_msg');
var membersMsgEl = document.getElementById('members_msg');

function showMsg(text, kind) {
    msgEl.textContent = text || '';
    msgEl.className = 'msg' + (kind ? ' ' + kind : '');
}

// Each card owns its own status line so an action's message stays with it.
function showPendingMsg(text, kind) {
    pendingMsgEl.textContent = text || '';
    pendingMsgEl.className = 'msg' + (kind ? ' ' + kind : '');
}

function showMembersMsg(text, kind) {
    membersMsgEl.textContent = text || '';
    membersMsgEl.className = 'msg' + (kind ? ' ' + kind : '');
}

// Friendly label for a stored role code.
function roleLabel(role) {
    if (role === 'super_admin') return 'Super Admin';
    if (role === 'crew_admin') return 'Crew Admin';
    if (role === 'qa_auditor') return 'QA Auditor';
    return 'Member';
}

// Human-readable local date/time, tolerant of a missing/invalid value.
function fmtDateTime(ts) {
    var d = new Date(ts);
    return isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function loadOrgName() {
    admin_fetch('/rest/v1/orgs?select=name', { method: 'GET' }, function (err, data) {
        if (!err && Array.isArray(data) && data[0]) {
            document.getElementById('org_name').textContent = data[0].name;
        }
    });
}

function loadEmails() {
    admin_fetch(
        '/rest/v1/allowed_emails?select=email,note&order=created_at.desc',
        { method: 'GET' },
        function (err, data) {
            var body = document.getElementById('emails_body');
            body.textContent = '';
            var rows = !err && Array.isArray(data) ? data : [];
            document.getElementById('emails_empty').hidden = rows.length > 0;
            rows.forEach(function (row) {
                var tr = document.createElement('tr');
                var email = document.createElement('td');
                email.textContent = row.email;
                var note = document.createElement('td');
                note.textContent = row.note || '';
                var actions = document.createElement('td');
                var btn = document.createElement('button');
                btn.className = 'btn-danger';
                btn.textContent = 'Remove';
                btn.addEventListener('click', function () {
                    removeEmail(row.email);
                });
                actions.appendChild(btn);
                tr.appendChild(email);
                tr.appendChild(note);
                tr.appendChild(actions);
                body.appendChild(tr);
            });
        },
    );
}

function loadMembers() {
    admin_fetch(
        '/rest/v1/profiles?select=user_id,email,role&status=eq.approved&order=created_at.desc',
        { method: 'GET' },
        function (err, data) {
            var body = document.getElementById('members_body');
            body.textContent = '';
            var rows = !err && Array.isArray(data) ? data : [];
            document.getElementById('members_empty').hidden = rows.length > 0;
            rows.forEach(function (row) {
                var tr = document.createElement('tr');

                var email = document.createElement('td');
                email.textContent = row.email || '';

                var isSelf = caProfile && row.user_id === caProfile.user_id;
                var role = document.createElement('td');
                // A crew admin may switch a member between Member and Crew admin — but
                // not their own role (no self-lockout) and not a super_admin's.
                if (!isSelf && row.role !== 'super_admin') {
                    role.appendChild(buildRoleSelect(row));
                } else {
                    role.textContent = roleLabel(row.role) + (isSelf ? ' (you)' : '');
                }

                var actions = document.createElement('td');
                // No self-removal button — an admin can't delete their own account here.
                if (!isSelf) {
                    var btn = document.createElement('button');
                    btn.className = 'btn-danger';
                    btn.textContent = 'Remove';
                    btn.addEventListener('click', function () {
                        removeMember(row.user_id, row.email);
                    });
                    actions.appendChild(btn);
                }

                tr.appendChild(email);
                tr.appendChild(role);
                tr.appendChild(actions);
                body.appendChild(tr);
            });
        },
    );
}

// A role dropdown (Member / QA auditor / Crew admin) that changes the row's role on
// selection.
function buildRoleSelect(row) {
    var sel = document.createElement('select');
    [
        ['member', 'Member'],
        ['qa_auditor', 'QA Auditor'],
        ['crew_admin', 'Crew Admin'],
    ].forEach(function (pair) {
        var opt = document.createElement('option');
        opt.value = pair[0];
        opt.textContent = pair[1];
        sel.appendChild(opt);
    });
    sel.value = row.role;
    sel.addEventListener('change', function () {
        setMemberRole(row.user_id, row.email, sel.value);
    });
    return sel;
}

function removeEmail(email) {
    if (!window.confirm('Remove ' + email + '? This also deletes any account for it.')) {
        return;
    }
    admin_fetch(
        '/rest/v1/allowed_emails?email=eq.' + encodeURIComponent(email),
        { method: 'DELETE' },
        function (err) {
            if (err) {
                showMsg(err, 'err');
                return;
            }
            showMsg('Removed ' + email + ' and any account for it.', 'ok');
            loadEmails();
            loadMembers();
        },
    );
}

// Remove a member's account but KEEP their pre-approval (allowed_emails), so they
// can re-register. Goes through the remove_member RPC (SECURITY DEFINER, which
// checks the caller is an admin and the target is in their org).
function removeMember(userId, email) {
    if (
        !window.confirm(
            'Remove ' + email + '? This deletes their account but keeps them pre-approved.',
        )
    ) {
        return;
    }
    admin_fetch(
        '/rest/v1/rpc/remove_member',
        { method: 'POST', body: JSON.stringify({ p_user_id: userId }) },
        function (err) {
            if (err) {
                showMembersMsg(err, 'err');
                return;
            }
            showMembersMsg('Removed ' + email + '. They remain pre-approved.', 'ok');
            loadMembers();
        },
    );
}

// Change a member's role via the set_member_role RPC (admin + org gated server-side).
function setMemberRole(userId, email, role) {
    admin_fetch(
        '/rest/v1/rpc/set_member_role',
        { method: 'POST', body: JSON.stringify({ p_user_id: userId, p_role: role }) },
        function (err) {
            if (err) {
                showMembersMsg(err, 'err');
                loadMembers(); // reset the dropdown to the actual stored role
                return;
            }
            showMembersMsg('Updated ' + email + ' to ' + roleLabel(role) + '.', 'ok');
            loadMembers();
        },
    );
}

// ---- Pending sign-up requests ----------------------------------------------
// People who self-registered for this crew without a pre-approved email/domain.
// They land as status='pending' profiles in this org; RLS lets the admin read them.
function loadPending() {
    admin_fetch(
        '/rest/v1/profiles?select=user_id,email,created_at&status=eq.pending&order=created_at.desc',
        { method: 'GET' },
        function (err, data) {
            var body = document.getElementById('pending_body');
            body.textContent = '';
            var rows = !err && Array.isArray(data) ? data : [];
            document.getElementById('pending_empty').hidden = rows.length > 0;
            rows.forEach(function (row) {
                var tr = document.createElement('tr');

                var email = document.createElement('td');
                email.textContent = row.email || '';

                var when = document.createElement('td');
                when.textContent = fmtDateTime(row.created_at);

                var actions = document.createElement('td');
                var approve = document.createElement('button');
                approve.className = 'btn-approve';
                approve.textContent = 'Approve';
                approve.addEventListener('click', function () {
                    approveSignup(row.user_id, row.email);
                });
                var deny = document.createElement('button');
                deny.className = 'btn-danger';
                deny.textContent = 'Deny';
                deny.addEventListener('click', function () {
                    denySignup(row.user_id, row.email);
                });
                actions.appendChild(approve);
                actions.appendChild(deny);

                tr.appendChild(email);
                tr.appendChild(when);
                tr.appendChild(actions);
                body.appendChild(tr);
            });
        },
    );
}

function approveSignup(userId, email) {
    admin_fetch(
        '/rest/v1/rpc/approve_signup',
        { method: 'POST', body: JSON.stringify({ p_user_id: userId }) },
        function (err) {
            if (err) {
                showPendingMsg(err, 'err');
                return;
            }
            showPendingMsg('Approved ' + email + '. They can now sign in.', 'ok');
            loadPending();
            loadMembers();
        },
    );
}

function denySignup(userId, email) {
    if (
        !window.confirm('Deny ' + email + '? This removes the request and their pending account.')
    ) {
        return;
    }
    admin_fetch(
        '/rest/v1/rpc/deny_signup',
        { method: 'POST', body: JSON.stringify({ p_user_id: userId }) },
        function (err) {
            if (err) {
                showPendingMsg(err, 'err');
                return;
            }
            showPendingMsg('Denied ' + email + '.', 'ok');
            loadPending();
        },
    );
}

function loadConsole() {
    loadOrgName();
    loadEmails();
    loadPending();
    loadMembers();
}

document.getElementById('add_form').addEventListener('submit', function (e) {
    e.preventDefault();
    var emailEl = document.getElementById('add_email');
    var noteEl = document.getElementById('add_note');
    var email = emailEl.value.trim().toLowerCase();
    if (!email) {
        showMsg('Enter an email address.', 'err');
        return;
    }
    if (!caProfile || !caProfile.org_id) {
        showMsg('Your account is not linked to a crew yet — ask your ChartAssist admin.', 'err');
        return;
    }
    admin_fetch(
        '/rest/v1/allowed_emails',
        {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
                email: email,
                note: noteEl.value.trim() || null,
                org_id: caProfile.org_id,
            }),
        },
        function (err) {
            if (err) {
                // email is globally unique, so a duplicate may belong to another org.
                showMsg(
                    /duplicate|already exists|violates unique/i.test(err)
                        ? 'That email is already approved.'
                        : err,
                    'err',
                );
                return;
            }
            showMsg('Added ' + email + '.', 'ok');
            emailEl.value = '';
            noteEl.value = '';
            loadEmails();
        },
    );
});

// ---- Live sync across admins -----------------------------------------------
// Two admins in the same org should see each other's changes (approvals, denials,
// role changes, removals, pre-approved emails) without a manual reload. There's no
// realtime SDK here (plain fetch only), so re-fetch the shared lists on a short
// interval while the console is open, and immediately when the tab regains focus.
var caConsolePollTimer = null;

function refreshConsole() {
    // Don't yank a <select> out from under an admin who's mid-change.
    var ae = document.activeElement;
    if (ae && ae.tagName === 'SELECT') return;
    loadEmails();
    loadPending();
    loadMembers();
}

function startConsolePolling() {
    if (caConsolePollTimer) return; // already running — don't stack intervals
    caConsolePollTimer = setInterval(refreshConsole, 20000);
}

function stopConsolePolling() {
    if (caConsolePollTimer) {
        clearInterval(caConsolePollTimer);
        caConsolePollTimer = null;
    }
}

// Refresh on tab focus / becoming visible, but only while the console is unlocked.
function refreshConsoleIfActive() {
    var gate = document.getElementById('ca-admin-gate');
    if (gate && gate.hidden) refreshConsole();
}
document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshConsoleIfActive();
});
window.addEventListener('focus', refreshConsoleIfActive);

// ---- Role gate (fail-closed) -------------------------------------------------
var caAdminGateTimer = null;

function applyAdminGate() {
    var gate = document.getElementById('ca-admin-gate');
    var title = document.getElementById('gate_title');
    var msg = document.getElementById('gate_msg');

    // Opened as a plain file (no extension context) — nothing to gate.
    var store = null;
    try {
        store = window.chrome && chrome.storage && chrome.storage.local;
    } catch {
        /* window.chrome access threw — treat as no extension context */
    }
    if (!store) {
        gate.hidden = true;
        return;
    }

    if (caAdminGateTimer) {
        clearTimeout(caAdminGateTimer);
        caAdminGateTimer = null;
    }

    caGetSession(function (session) {
        if (!caSessionValid(session)) {
            caProfile = null;
            stopConsolePolling();
            title.textContent = 'Sign in required';
            msg.textContent =
                'Open the ChartAssist popup (click the extension icon) and sign in as an admin. ' +
                'This page unlocks automatically once you do.';
            gate.hidden = false;
            return;
        }
        // Re-lock the moment the session lapses, even with no storage event.
        var ms = Math.min(session.session_expires_at - Date.now(), 0x7fffffff);
        if (ms > 0) caAdminGateTimer = setTimeout(applyAdminGate, ms);

        function unlockOrDeny(profile) {
            caProfile = profile;
            if (profile && caIsAdminRole(profile.role)) {
                gate.hidden = true;
                loadConsole();
                startConsolePolling();
            } else {
                stopConsolePolling();
                title.textContent = 'Not authorized';
                msg.textContent =
                    'This page is for crew admins. Ask your ChartAssist administrator if you ' +
                    'need access.';
                gate.hidden = false;
            }
        }
        function showExpired() {
            caProfile = null;
            stopConsolePolling();
            title.textContent = 'Sign in required';
            msg.textContent = CA_SESSION_EXPIRED_MSG;
            gate.hidden = false;
        }
        caGetProfile(function (profile, determined) {
            if (determined) {
                unlockOrDeny(profile);
                return;
            }
            // Couldn't read the profile — most likely the ~1h access token expired
            // while the 30-day gate still holds. Refresh once and retry before
            // declaring the session dead, so a stale token isn't misreported as a
            // permissions problem ("Not authorized").
            caRefreshSession(function (rerr, rsession) {
                if (rerr || !rsession || !rsession.access_token) {
                    showExpired();
                    return;
                }
                caGetProfile(function (p2, d2) {
                    if (d2) unlockOrDeny(p2);
                    else showExpired();
                });
            });
        });
    });
}

applyAdminGate();
try {
    if (window.chrome && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(function (changes, area) {
            if (area === 'local' && 'ca_session' in changes) applyAdminGate();
        });
    }
} catch {
    /* not an extension context */
}
