var txtInputs = [
    'pg2_duration',
    'pg2_stretcher_purpose',
    'pg3_pupil_comments',
    'pg3_sensory_comments',
    'pg3_motor_comments',
    'pg3_airway_comments',
    'pg4_resp_comments',
    'pg4_cardiac_comments',
    'pg4_breath_comments',
    'pg5_trauma_head_comments',
    'pg5_trauma_neck_comments',
    'pg5_trauma_chest_comments',
    'pg5_trauma_ap_appearance',
    'pg5_trauma_ap_palpation',
    'pg5_trauma_ap_bowel_sounds',
    'pg5_trauma_ap_findings',
    'pg5_trauma_pelvis_comments',
    'pg5_trauma_back_comments',
    'pg5_trauma_ex_comments',
    'pg5_trauma_ex_restraints',
    'pg5_trauma_ex_skin_findings',
    'pg5_medical_head_comments',
    'pg5_medical_neck_comments',
    'pg5_medical_chest_comments',
    'pg5_medical_ap_appearance',
    'pg5_medical_ap_palpation',
    'pg5_medical_ap_bowel_sounds',
    'pg5_medical_ap_findings',
    'pg5_medical_pelvis_comments',
    'pg5_medical_back_comments',
    'pg5_medical_ex_comments',
    'pg5_medical_ex_restraints',
    'pg5_medical_ex_skin_findings',
    'pg5_refusal_head_comments',
    'pg5_refusal_neck_comments',
    'pg5_refusal_chest_comments',
    'pg5_refusal_ap_appearance',
    'pg5_refusal_ap_palpation',
    'pg5_refusal_ap_bowel_sounds',
    'pg5_refusal_ap_findings',
    'pg5_refusal_pelvis_comments',
    'pg5_refusal_back_comments',
    'pg5_refusal_ex_comments',
    'pg5_refusal_ex_restraints',
    'pg5_refusal_ex_skin_findings',
];
var pertNegGroups = [
    'pg3_mental_present',
    'pg3_mental_not_present',
    'pg3_neuro_present',
    'pg3_neuro_not_present',
];
var txtAreas = [
    'pg2_chief_complaint',
    'pg2_hpi',
    'pg2_scene_description',
    'pg2_belongings',
    'pg3_neuro_comments',
    'pg8_at_ref',
    'pg8_lv_ref',
    'pg8_at_rec',
    'pg8_can_1',
    'pg8_can_2',
];
var selBoxes = [
    'pg2_duration_units',
    'pg2_level_care',
    'pg2_to_truck',
    'pg2_position',
    'pg2_from_truck',
    'pg2_transassess',
    'stroke_scale',
    'gcs_eye_1',
    'gcs_verbal_1',
    'gcs_motor_1',
    'pg3_pupil_size_l',
    'pg3_pupil_size_r',
    'pg3_pupil_rx_l',
    'pg3_pupil_rx_r',
    'pg3_motor_la',
    'pg3_sensory_la',
    'pg3_motor_ra',
    'pg3_sensory_ra',
    'pg3_motor_ll',
    'pg3_sensory_ll',
    'pg3_motor_rl',
    'pg3_sensory_rl',
    'pg3_airway_status',
    'pg3_air_by',
    'pg3_air_outcome',
    'pg4_resp_effort',
    'pg4_breath_sounds_l',
    'pg4_breath_sounds_r',
    'pg4_carotid_l',
    'pg4_carotid_r',
    'pg4_radial_l',
    'pg4_radial_r',
    'pg4_fem_l',
    'pg4_fem_r',
    'pg4_brachial_l',
    'pg4_brachial_r',
    'pg5_trauma_trachea',
    'pg5_medical_trachea',
    'pg5_refusal_trachea',
    'pg2_first_on_scene',
];

function _all_opts() {
    var opts = {};
    for (var i = 0; i < txtInputs.length; i++) {
        opts[txtInputs[i]] = 'text';
    }
    for (i = 0; i < txtAreas.length; i++) {
        opts[txtAreas[i]] = 'textarea';
    }
    for (i = 0; i < selBoxes.length; i++) {
        opts[selBoxes[i]] = 'select';
    }
    for (i = 0; i < pertNegGroups.length; i++) {
        opts[pertNegGroups[i]] = 'checkgroup';
    }
    return opts;
}

function get_user_values() {
    var vals = {};
    var opts = _all_opts();
    var keys = Object.keys(opts);

    for (var i = 0; i < keys.length; i++) {
        var field_id = keys[i];
        var field_type = opts[field_id];
        if (typeof field_id == 'undefined' || field_id == 'undefined') continue;

        if (field_type == 'checkgroup') {
            var checked = document.querySelectorAll('[data-group="' + field_id + '"]:checked');
            var cbVals = [];
            for (var j = 0; j < checked.length; j++) {
                cbVals.push(checked[j].value);
            }
            vals[field_id] = cbVals.join('|');
            continue;
        }

        var el = document.getElementById(field_id);
        if (!el) {
            console.warn('No element found for key: ' + field_id);
            continue;
        }

        if (field_type == 'text' || field_type == 'textarea') {
            vals[field_id] = el.value;
        } else if (field_type == 'select') {
            var ch = el.children[el.selectedIndex];
            if (typeof ch != 'undefined') {
                vals[field_id] = ch.value;
            }
        } else {
            console.warn('Not sure what to do with field ' + field_type + ':' + field_id);
        }
    }
    return vals;
}

function reset_options() {
    if (!confirm("Clear all values? Click 'Save' afterwards to apply the reset.")) return;
    var opts = _all_opts();
    Object.keys(opts).forEach(function (field_id) {
        if (opts[field_id] === 'checkgroup') {
            var boxes = document.querySelectorAll('[data-group="' + field_id + '"]');
            for (var j = 0; j < boxes.length; j++) {
                boxes[j].checked = false;
            }
            return;
        }
        var el = document.getElementById(field_id);
        if (!el) return;
        if (opts[field_id] === 'select') {
            el.selectedIndex = 0;
        } else {
            el.value = '';
        }
    });
    show_status('ALL FIELDS CLEARED — click Save to apply');
}

function show_status(msg, isError) {
    var status = document.getElementById('status');
    status.innerHTML = msg;
    status.className = isError ? 'error' : '';
    setTimeout(function () {
        status.innerHTML = '';
        status.className = '';
    }, 2500);
}

function save_options() {
    var values = get_user_values();
    console.info('Saving Values');

    chrome.storage.sync.set(values, function () {
        show_status('OPTIONS SAVED');
    });
}

function restore_options() {
    console.info('Restoring Options');
    var opts = _all_opts();
    var opt_keys = Object.keys(opts);

    chrome.storage.sync.get(opt_keys, function (items) {
        for (var i = 0; i < opt_keys.length; i++) {
            var field_id = opt_keys[i];
            var field_type = opts[field_id];
            var user_val = items[field_id];

            if (field_type == 'checkgroup') {
                var selected = (user_val || '').split('|');
                var boxes = document.querySelectorAll('[data-group="' + field_id + '"]');
                for (var j = 0; j < boxes.length; j++) {
                    boxes[j].checked = selected.indexOf(boxes[j].value) !== -1;
                }
                continue;
            }

            var elR = document.getElementById(field_id);
            if (!elR) {
                console.warn('No element found for key: ' + field_id);
                continue;
            }

            if (field_type == 'text' || field_type == 'textarea') {
                elR.value = user_val == null ? '' : user_val;
            } else if (field_type == 'select') {
                var sbox = elR;
                for (j = 0; j < sbox.children.length; j++) {
                    if (sbox.children[j].value == user_val) {
                        sbox.selectedIndex = j;
                        break;
                    }
                }
            } else {
                console.warn("I don't know what to do with " + field_type + ':' + field_id);
            }
        }
        apply_pertneg_mutex();
    });
}

// Storage keys that were renamed across versions. Older builds saved settings
// under the key on the left; the current field name(s) are on the right. This
// map exists because settings were being LOST on update: the Options page used
// to auto-run a "prune" that permanently deleted any stored key the current
// version didn't recognize — and a renamed key is, by definition, unrecognized.
// So the first time an updated user opened Options, their saved defaults for
// every renamed field were silently wiped. Migration copies each legacy value
// forward instead, so nothing is destroyed on update.
//
// Only unambiguous renames are mapped. Fields that were genuinely removed or
// whose meaning changed (the retired page-2 ALS-assessment field, the
// dorsalis-pedis pulse selects that were replaced by brachial — a different
// anatomical site) are deliberately left out: their old values stay untouched
// in storage rather than being guessed into the wrong field.
function legacy_key_map() {
    var map = {
        pg3_gcs_eye: ['gcs_eye_1'],
        pg3_gcs_verbal: ['gcs_verbal_1'],
        pg3_gcs_motor: ['gcs_motor_1'],
        pg3_stroke_scale: ['stroke_scale'],
    };
    // Page 5's single physical-exam section was later split into three preset
    // categories (Trauma / Medical / Refusal). A user who had one set of exam
    // defaults previously had them apply regardless of preset, so copy each
    // legacy value into all three category variants.
    var pg5legacy = [
        'head_comments',
        'neck_comments',
        'chest_comments',
        'ap_appearance',
        'ap_palpation',
        'ap_bowel_sounds',
        'ap_findings',
        'pelvis_comments',
        'back_comments',
        'ex_comments',
        'ex_restraints',
        'ex_skin_findings',
    ];
    pg5legacy.forEach(function (suffix) {
        map['pg5_' + suffix] = [
            'pg5_trauma_' + suffix,
            'pg5_medical_' + suffix,
            'pg5_refusal_' + suffix,
        ];
    });
    return map;
}

// Copy any legacy-named settings forward to their current key names, then drop
// the legacy key. A target that already holds a value (one the user set under
// the new name) is never clobbered. Runs once on Options load, before restore,
// so migrated values populate the form. `done` is invoked when finished.
function migrate_legacy_keys(done) {
    var map = legacy_key_map();
    chrome.storage.sync.get(null, function (items) {
        var toSet = {};
        var toRemove = [];
        Object.keys(map).forEach(function (oldKey) {
            if (!(oldKey in items)) return;
            var val = items[oldKey];
            map[oldKey].forEach(function (newKey) {
                var existing = items[newKey];
                var newEmpty = existing === undefined || existing === null || existing === '';
                if (newEmpty && !(newKey in toSet)) toSet[newKey] = val;
            });
            // The legacy value is now preserved under its new name(s); the old
            // key is superseded and can be removed.
            toRemove.push(oldKey);
        });

        function finish() {
            if (toRemove.length) {
                chrome.storage.sync.remove(toRemove, function () {
                    if (done) done();
                });
            } else if (done) {
                done();
            }
        }

        if (toRemove.length) {
            console.info('Migrating legacy option keys:', toRemove);
        }
        if (Object.keys(toSet).length) {
            chrome.storage.sync.set(toSet, finish);
        } else {
            finish();
        }
    });
}

// Download all saved defaults as a JSON file the user can back up or share.
function export_options() {
    chrome.storage.sync.get(null, function (items) {
        var json = JSON.stringify(items, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'emscharts-assist-defaults.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

// Load defaults from a previously exported JSON file.
function import_options(ev) {
    var file = ev.target.files[0];
    ev.target.value = ''; // allow re-importing the same file later
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
        var data;
        try {
            data = JSON.parse(reader.result);
        } catch (e) {
            show_status('IMPORT FAILED: NOT VALID JSON', true);
            return;
        }
        if (!data || typeof data != 'object') {
            show_status('IMPORT FAILED: UNRECOGNIZED FILE', true);
            return;
        }

        // Only import keys this extension recognizes.
        var opts = _all_opts();
        var values = {};
        var imported = 0;
        Object.keys(data).forEach(function (k) {
            if (opts.hasOwnProperty(k)) {
                values[k] = data[k];
                imported++;
            }
        });

        if (imported == 0) {
            show_status('IMPORT FAILED: NO RECOGNIZED SETTINGS', true);
            return;
        }

        chrome.storage.sync.set(values, function () {
            if (chrome.runtime.lastError) {
                show_status('IMPORT FAILED: ' + chrome.runtime.lastError.message, true);
                return;
            }
            restore_options();
            show_status('IMPORTED ' + imported + ' SETTINGS');
        });
    };
    reader.readAsText(file);
}

function open_section_from_hash() {
    var hash = window.location.hash;
    if (!hash) return;
    var target = document.querySelector(hash);
    if (!target) return;
    document.querySelectorAll('details').forEach(function (d) {
        d.open = false;
    });
    target.open = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function apply_pertneg_mutex() {
    var pairs = [
        ['pg3_mental_present', 'pg3_mental_not_present'],
        ['pg3_neuro_present', 'pg3_neuro_not_present'],
    ];
    pairs.forEach(function (pair) {
        var presentBoxes = document.querySelectorAll('[data-group="' + pair[0] + '"]:checked');
        for (var i = 0; i < presentBoxes.length; i++) {
            var val = presentBoxes[i].value;
            var notPresentBoxes = document.querySelectorAll('[data-group="' + pair[1] + '"]');
            for (var j = 0; j < notPresentBoxes.length; j++) {
                if (notPresentBoxes[j].value === val) {
                    notPresentBoxes[j].checked = false;
                    break;
                }
            }
        }
    });
}

function wire_pertneg_mutex() {
    var pairs = [
        ['pg3_mental_present', 'pg3_mental_not_present'],
        ['pg3_neuro_present', 'pg3_neuro_not_present'],
    ];
    pairs.forEach(function (pair) {
        pair.forEach(function (group, i) {
            var opposite = pair[1 - i];
            var boxes = document.querySelectorAll('[data-group="' + group + '"]');
            for (var j = 0; j < boxes.length; j++) {
                boxes[j].addEventListener('change', function () {
                    if (!this.checked) return;
                    var val = this.value;
                    var others = document.querySelectorAll('[data-group="' + opposite + '"]');
                    for (var k = 0; k < others.length; k++) {
                        if (others[k].value === val) {
                            others[k].checked = false;
                            break;
                        }
                    }
                });
            }
        });
    });
}

// Theme toggle (header sun/moon button). Defaults to the OS preference and
// remembers an explicit choice in chrome.storage.local (key `ca_theme`), with a
// localStorage fallback so the toggle still works when opened outside the
// extension (e.g. previewing options.html directly).
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

function ca_theme_apply(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    var btn = document.getElementById('theme-toggle');
    if (btn) {
        var label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
    }
    if (persist) ca_theme_set(theme);
}

function init_theme_toggle() {
    ca_theme_get(function (stored) {
        ca_theme_apply(ca_theme_effective(stored), false);
    });
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
        var current =
            document.documentElement.getAttribute('data-theme') || ca_theme_effective(null);
        ca_theme_apply(current === 'dark' ? 'light' : 'dark', true);
    });
}

// --- Login gate ------------------------------------------------------------
// The Options page is reachable outside the popup (right-click the icon →
// Options, chrome://extensions, or a direct URL), so it enforces the same login
// as the toolbar: a full-page overlay (#ca-options-gate, shown by default =
// fail-closed) covers the settings until a valid session exists. Mirrors
// auth.js's caSessionValid so this page need not load auth.js. With no extension
// context at all (options.html opened directly for preview) there is no session
// boundary to enforce, so the settings are shown.
var ca_options_gate_timer = null;

function ca_options_session_valid(session) {
    return !!(session && session.session_expires_at > Date.now());
}

function ca_apply_options_gate() {
    var gate = document.getElementById('ca-options-gate');
    if (!gate) return;
    var store = null;
    try {
        store = window.chrome && chrome.storage && chrome.storage.local;
    } catch {
        /* window.chrome access threw — treat as no extension context */
    }
    if (!store) {
        gate.hidden = true; // not an extension context (preview) — nothing to gate
        return;
    }
    store.get('ca_session', function (r) {
        var session = r && r.ca_session;
        var ok = ca_options_session_valid(session);
        gate.hidden = ok;
        if (ca_options_gate_timer) {
            clearTimeout(ca_options_gate_timer);
            ca_options_gate_timer = null;
        }
        if (ok) {
            var ms = Math.min(session.session_expires_at - Date.now(), 0x7fffffff);
            if (ms > 0) ca_options_gate_timer = setTimeout(ca_apply_options_gate, ms);
        }
    });
}

// Under Node/CommonJS (unit tests) export the functions and skip the DOM wiring;
// the tests set up their own DOM. In the browser `module` is undefined, so the
// else branch runs and wires up the Options page exactly as before.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        _all_opts,
        get_user_values,
        restore_options,
        reset_options,
        legacy_key_map,
        migrate_legacy_keys,
    };
} else {
    document.addEventListener('DOMContentLoaded', init_theme_toggle);
    document.addEventListener('DOMContentLoaded', ca_apply_options_gate);
    // Keep the gate in sync if the user signs in/out from the popup while this
    // Options page is open.
    try {
        if (window.chrome && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener(function (changes, area) {
                if (area === 'local' && 'ca_session' in changes) ca_apply_options_gate();
            });
        }
    } catch {
        /* not in an extension context */
    }
    // Migrate any legacy-named settings forward BEFORE restoring, so renamed
    // fields repopulate. Restore is chained so it reads post-migration storage.
    // (The old destructive prune_stale_keys was removed — it was deleting these
    // very keys on update, which is how saved options were being lost.)
    document.addEventListener('DOMContentLoaded', function () {
        migrate_legacy_keys(restore_options);
    });
    document.addEventListener('DOMContentLoaded', open_section_from_hash);
    document.addEventListener('DOMContentLoaded', wire_pertneg_mutex);
    document.querySelector('#save').addEventListener('click', save_options);
    document.querySelector('#export').addEventListener('click', export_options);
    document.querySelector('#import-btn').addEventListener('click', function () {
        document.getElementById('import-file').click();
    });
    document.querySelector('#import-file').addEventListener('change', import_options);
    document.querySelector('#reset').addEventListener('click', reset_options);
}
