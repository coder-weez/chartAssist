// The page 8 "Edit Vitals" popup (EditVS.cfm) has its OWN comment box, and it runs
// in a same-origin iframe (its buttons call window.top.hidePopWin /
// window.top.doSimpleModal2). Crucially, the MAIN page-8 vitals comment field in the
// top document carries the SAME id="fld_vitals_comment" (and name="vs_comment") as the
// popup box — so the popup box can NOT be told apart in the top document. We therefore
// deliberately skip the top document (that element is the main field, i.e. our
// fallback) and scan the same-origin iframes for the popup's box, recursing through
// the subModal infrastructure frames. Returns the popup's comment <textarea> when the
// popup is open and visible, otherwise null so fills fall back to the main field.
function caVitalsCommentBox() {
    return caFindVitalsCommentInFrames(document);
}

function caFindVitalsCommentInFrames(doc) {
    var frames = doc.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
        var sub;
        try {
            sub = frames[i].contentDocument;
        } catch (e) {
            continue; // cross-origin frame — not ours
        }
        if (!sub) continue;
        var box = sub.getElementById('fld_vitals_comment');
        if (box && box.offsetParent !== null) return box; // visible popup box
        var nested = caFindVitalsCommentInFrames(sub);
        if (nested) return nested;
    }
    return null;
}

// The fill/clear target for page-8 comments: the Edit Vitals popup's comment box
// while that popup is open, otherwise the main narrative field. caFill/caClrField
// accept a DOM element or a selector string interchangeably (both go through jQuery).
function caCommentTarget() {
    return caVitalsCommentBox() || 'textarea[name=vs_comment]';
}

// Built-in page-8 presets: fixed labels, toggle-only. Each fills the vitals comment
// box from its own stored textarea key. Order here is the on-toolbar order.
var CA_PG8_BUILTINS = [
    { id: 'at_ref', label: 'On Scene', key: 'pg8_at_ref' },
    { id: 'lv_ref', label: 'Transport', key: 'pg8_lv_ref' },
    { id: 'at_rec', label: 'At Hospital', key: 'pg8_at_rec' },
    { id: 'can_1', label: 'Refusal', key: 'pg8_can_1' },
];
// Four spare "custom" slots. Each carries a user-defined label (pg8_customN_label)
// and comment text (pg8_customN_text) configured on the Options page.
var CA_PG8_CUSTOM_IDS = ['custom1', 'custom2', 'custom3', 'custom4'];

// Build the ordered list of page-8 preset buttons to render, from the full
// chrome.storage.sync object `s`. A preset renders only when it is enabled AND
// has non-blank content: a built-in needs non-blank text; a custom slot needs
// BOTH a non-blank label and non-blank text. "Blank" means empty or whitespace-
// only (so a toggled-on but empty preset still shows no button). Visibility comes
// from the `pg8_enabled` checkgroup (a pipe-joined list of enabled ids). When
// `pg8_enabled` has never been saved (undefined — the user hasn't opened Options
// since updating) the built-ins default ON and the custom slots default OFF, so
// the toolbar keeps working before the first Options visit. This is the page-8
// analogue of page 1's caBaseOptions. Returns [{ id, label, text, friendly }];
// `friendly` is the toast name shown by caFill.
function caPage8Presets(s) {
    s = s || {};
    function blank(v) {
        return typeof v !== 'string' || v.trim() === '';
    }
    var raw = s.pg8_enabled;
    var seeded = typeof raw === 'undefined';
    var enabled = seeded ? [] : ('' + raw).split('|');
    function on(id, defaultOn) {
        return seeded ? defaultOn : enabled.indexOf(id) !== -1;
    }

    var out = [];
    CA_PG8_BUILTINS.forEach(function (b) {
        if (!on(b.id, true)) return;
        var text = s[b.key];
        if (blank(text)) return;
        out.push({ id: b.id, label: b.label, text: text, friendly: b.label + ' Comment' });
    });
    CA_PG8_CUSTOM_IDS.forEach(function (id) {
        if (!on(id, false)) return;
        var label = s['pg8_' + id + '_label'];
        var text = s['pg8_' + id + '_text'];
        if (blank(label) || blank(text)) return;
        label = label.trim();
        out.push({ id: id, label: label, text: text, friendly: label + ' Comment' });
    });
    return out;
}

function caInitPage8() {
    var bar = caToolbar();
    // Clear is appended synchronously so it is always present (even if the async
    // storage read below fails); preset buttons are inserted before it.
    bar.append('<button class="ca-clear ca-btn ca-btn-danger">Clear Fields</button>');

    // Canary selector — flags EMSCharts DOM changes (all buttons target this field).
    caHealthCheck(8, ['textarea[name=vs_comment]']);

    bar.on('click', '.ca-clear', function () {
        if (!caActive(8)) return;
        if (!window.confirm('Clear all auto-filled fields on this page? This cannot be undone.'))
            return;
        caClrField(caCommentTarget());
    });

    // Preset buttons are generated from the user's saved config (see
    // caPage8Presets). A single DELEGATED handler covers them because the buttons
    // are added dynamically — a direct .click() would miss them. It re-reads
    // storage on click so the latest text is used, matching the old behaviour.
    bar.on('click', '.ca-preset', function () {
        if (!caActive(8)) return;
        var id = $(this).attr('data-preset-id');
        chrome.storage.sync.get(null, function (s) {
            if (chrome.runtime.lastError || !s) {
                caToast('Could not read your saved defaults — please try again.');
                return;
            }
            if (caNoDefaultsHint(s)) return;
            var match = caPage8Presets(s).filter(function (p) {
                return p.id === id;
            })[0];
            if (!match) return;
            caFill(caCommentTarget(), match.text, match.friendly);
        });
    });

    // Render the enabled, non-blank preset buttons ahead of the Clear button.
    chrome.storage.sync.get(null, function (s) {
        if (chrome.runtime.lastError || !s) return;
        caPage8Presets(s).forEach(function (p) {
            var $btn = $('<button class="ca-preset ca-btn"></button>');
            $btn.attr('data-preset-id', p.id).text(p.label);
            $btn.insertBefore(bar.find('.ca-clear'));
        });
    });
}

// Under Node/CommonJS (unit tests) export the pure helper and skip DOM wiring; in
// the browser `module` is undefined, so page 8 initialises on ready.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { caPage8Presets };
} else {
    $(document).ready(caInitPage8);
}
