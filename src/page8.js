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

$(document).ready(function () {
    caToolbar().append('<button class="atref ca-btn">On Scene</button>');
    caToolbar().append('<button class="lvref ca-btn">Transport</button>');
    caToolbar().append('<button class="atrec ca-btn">At Hospital</button>');
    caToolbar().append('<button class="can1 ca-btn">Refusal</button>');
    caToolbar().append('<button class="can2 ca-btn">Custom</button>');
    caToolbar().append('<button class="ca-clear ca-btn ca-btn-danger">Clear Fields</button>');

    // Canary selector — flags EMSCharts DOM changes (all buttons target this field).
    caHealthCheck(8, ['textarea[name=vs_comment]']);

    $('.ca-clear').click(function () {
        if (!caActive(8)) return;
        if (!window.confirm('Clear all auto-filled fields on this page? This cannot be undone.'))
            return;
        caClrField(caCommentTarget());
    });

    // Each page-8 preset fills one comment field from a single stored key. Shared
    // read path so the storage-error guard and first-run hint live in one place.
    function fillPage8(key, friendly) {
        chrome.storage.sync.get(null, function (s) {
            if (chrome.runtime.lastError || !s) {
                caToast('Could not read your saved defaults — please try again.');
                return;
            }
            if (caNoDefaultsHint(s)) return;
            caFill(caCommentTarget(), s[key], friendly);
        });
    }

    $('.atref').click(function () {
        if (!caActive(8)) return;
        fillPage8('pg8_at_ref', 'On Scene Comment');
    });

    $('.lvref').click(function () {
        if (!caActive(8)) return;
        fillPage8('pg8_lv_ref', 'Transport Comment');
    });

    $('.atrec').click(function () {
        if (!caActive(8)) return;
        fillPage8('pg8_at_rec', 'At Hospital Comment');
    });

    $('.can1').click(function () {
        if (!caActive(8)) return;
        fillPage8('pg8_can_1', 'Refusal Comment');
    });

    $('.can2').click(function () {
        if (!caActive(8)) return;
        fillPage8('pg8_can_2', 'Custom Comment');
    });
});
