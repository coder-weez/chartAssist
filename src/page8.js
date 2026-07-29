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
        caClrField('textarea[name=vs_comment]');
    });

    $('.atref').click(function () {
        if (!caActive(8)) return;
        chrome.storage.sync.get(null, function (s) {
            caFill('textarea[name=vs_comment]', s['pg8_at_ref'], 'On Scene Comment');
        });
    });

    $('.lvref').click(function () {
        if (!caActive(8)) return;
        chrome.storage.sync.get(null, function (s) {
            caFill('textarea[name=vs_comment]', s['pg8_lv_ref'], 'Transport Comment');
        });
    });

    $('.atrec').click(function () {
        if (!caActive(8)) return;
        chrome.storage.sync.get(null, function (s) {
            caFill('textarea[name=vs_comment]', s['pg8_at_rec'], 'At Hospital Comment');
        });
    });

    $('.can1').click(function () {
        if (!caActive(8)) return;
        chrome.storage.sync.get(null, function (s) {
            caFill('textarea[name=vs_comment]', s['pg8_can_1'], 'Refusal Comment');
        });
    });

    $('.can2').click(function () {
        if (!caActive(8)) return;
        chrome.storage.sync.get(null, function (s) {
            caFill('textarea[name=vs_comment]', s['pg8_can_2'], 'Custom Comment');
        });
    });
});
