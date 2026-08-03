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
document.getElementById('theme-toggle').addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme') || ca_theme_effective(null);
    var next = current === 'dark' ? 'light' : 'dark';
    ca_theme_apply(next);
    ca_theme_set(next);
});

chrome.storage.local.get('ca_qa_mode', function (r) {
    document.getElementById('qa_mode').checked = !!r.ca_qa_mode;
});
document.getElementById('qa_mode').addEventListener('change', function () {
    chrome.storage.local.set({ ca_qa_mode: this.checked });
});
document.getElementById('open_options').addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
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
