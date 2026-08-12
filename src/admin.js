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

// ---- REST helper: a PostgREST call carrying the current session token --------
// cb(err, data): err is a human-readable string or null.
function admin_fetch(path, opts, cb) {
    caGetSession(function (session) {
        if (!session || !session.access_token) {
            cb('Not signed in', null);
            return;
        }
        var o = opts || {};
        o.headers = Object.assign(
            {
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: 'Bearer ' + session.access_token,
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
                    return { ok: res.ok, data: data };
                });
            })
            .then(function (r) {
                cb(
                    r.ok ? null : (r.data && (r.data.message || r.data.error)) || 'Request failed',
                    r.data,
                );
            })
            .catch(function () {
                cb('Network error', null);
            });
    });
}

// ---- Console ----------------------------------------------------------------
var caProfile = null; // the signed-in admin's profile (role, org_id, email)
var msgEl = document.getElementById('admin_msg');

function showMsg(text, kind) {
    msgEl.textContent = text || '';
    msgEl.className = 'msg' + (kind ? ' ' + kind : '');
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
        '/rest/v1/profiles?select=user_id,email,role&order=created_at.desc',
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
                var role = document.createElement('td');
                role.textContent = row.role;
                var actions = document.createElement('td');
                // No self-removal button — an admin can't delete their own account here.
                if (!caProfile || row.user_id !== caProfile.user_id) {
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
                showMsg(err, 'err');
                return;
            }
            showMsg('Removed ' + email + '. They remain pre-approved.', 'ok');
            loadMembers();
        },
    );
}

function loadConsole() {
    loadOrgName();
    loadEmails();
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

        caGetProfile(function (profile) {
            caProfile = profile;
            if (profile && caIsAdminRole(profile.role)) {
                gate.hidden = true;
                loadConsole();
            } else {
                title.textContent = 'Not authorized';
                msg.textContent =
                    'This page is for crew admins. Ask your ChartAssist administrator if you ' +
                    'need access.';
                gate.hidden = false;
            }
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
