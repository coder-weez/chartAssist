$(document).ready(function () {
    caToolbar().append('<button class="chartfiller ca-btn">AutoComplete</button>');
    caToolbar().append('<button class="ca-clear ca-btn ca-btn-danger">Clear Fields</button>');

    // Canary selectors — one or more per section — flag EMSCharts DOM changes.
    caHealthCheck(4, [
        'textarea[name=RESP_COMMENTS]',
        'select[name=cv_breath_sounds_l]',
        'select[name=PULSE_CAROTID]',
        'input[name=cv_comments]',
    ]);

    $('.ca-clear').click(function () {
        if (!chrome.runtime || !chrome.runtime.id) return;
        if (!window.confirm('Clear all auto-filled fields on this page? This cannot be undone.'))
            return;
        caClrField('textarea[name=RESP_COMMENTS]');
        caClrField('select[name=cv_breath_sounds_l]');
        caClrField('select[name=cv_breath_sounds_r]');
        caClrField('[name=cv_breath_comments]');
        caClrField('select[name=PULSE_CAROTID]');
        caClrField('select[name=PULSE_CAROTID_R]');
        caClrField('select[name=PULSE_RAD_L]');
        caClrField('select[name=PULSE_RAD_R]');
        caClrField('select[name=PULSE_BRA_L]');
        caClrField('select[name=PULSE_BRA_R]');
        caClrField('select[name=PULSE_FEM_L]');
        caClrField('select[name=PULSE_FEM_R]');
        caClrField('input[name=cv_comments]');
    });

    $('.chartfiller').click(function () {
        if (!chrome.runtime || !chrome.runtime.id) return;
        chrome.storage.sync.get(null, function (s) {
            caFill('textarea[name=RESP_COMMENTS]', s['pg4_resp_comments'], 'Respiratory Comments');
            caFill(
                'select[name=cv_breath_sounds_l]',
                s['pg4_breath_sounds_l'],
                'Breath Sounds (L)',
            );
            caFill(
                'select[name=cv_breath_sounds_r]',
                s['pg4_breath_sounds_r'],
                'Breath Sounds (R)',
            );
            caFill('[name=cv_breath_comments]', s['pg4_breath_comments'], 'Breath Comments');
            caFill('select[name=PULSE_CAROTID]', s['pg4_carotid_l'], 'Carotid (L)');
            caFill('select[name=PULSE_CAROTID_R]', s['pg4_carotid_r'], 'Carotid (R)');
            caFill('select[name=PULSE_RAD_L]', s['pg4_radial_l'], 'Radial (L)');
            caFill('select[name=PULSE_RAD_R]', s['pg4_radial_r'], 'Radial (R)');
            caFill('select[name=PULSE_BRA_L]', s['pg4_brachial_l'], 'Brachial (L)');
            caFill('select[name=PULSE_BRA_R]', s['pg4_brachial_r'], 'Brachial (R)');
            caFill('select[name=PULSE_FEM_L]', s['pg4_fem_l'], 'Femoral (L)');
            caFill('select[name=PULSE_FEM_R]', s['pg4_fem_r'], 'Femoral (R)');
            caFill('input[name=cv_comments]', s['pg4_cardiac_comments'], 'Cardiovascular Comments');
        });
    });
});
