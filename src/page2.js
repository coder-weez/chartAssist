$(document).ready(function () {
    caToolbar().append('<button class="chartfiller ca-btn">AutoComplete</button>');
    caToolbar().append('<button class="ca-clear ca-btn ca-btn-danger">Clear Fields</button>');

    $('.ca-clear').click(function () {
        if (!chrome.runtime || !chrome.runtime.id) return;
        if (!window.confirm('Clear all auto-filled fields on this page? This cannot be undone.'))
            return;
        caClrField('textarea[name=PRMAIN_cc]');
        caClrField('input[name=PRMAIN_ccduration]');
        caClrField('select[name=PRMAIN_ccdurunits]');
        caClrField('textarea[name=PRMAIN_hpi]');
        caClrField('textarea[name=scene_description]');
        caClrField('select[name=PRMAIN_first_on_scene]');
        caClrField('[name=PRMAIN_level_care_per_protocol]');
        caClrField('textarea[name=PRMAIN_belongings]');
        caClrPopup('pt_moved_via');
        caClrPopup('pt_position');
        caClrPopup('pt_moved_from_multi');
        caClrPopup('transassess');
        caClrField('textarea[name=stretcher_purpose_descr]');
    });

    $('.chartfiller').click(function () {
        if (!chrome.runtime || !chrome.runtime.id) return;
        chrome.storage.sync.get(null, function (s) {
            caFill('textarea[name=PRMAIN_cc]', s['pg2_chief_complaint'], 'Chief Complaint');
            caFill('input[name=PRMAIN_ccduration]', s['pg2_duration'], 'Duration');
            caFill('select[name=PRMAIN_ccdurunits]', s['pg2_duration_units'], 'Duration Units');
            caFill('textarea[name=PRMAIN_hpi]', s['pg2_hpi'], 'HPI');
            caFill(
                'textarea[name=scene_description]',
                s['pg2_scene_description'],
                'Scene Description',
            );
            caFill('select[name=PRMAIN_first_on_scene]', s['pg2_first_on_scene'], 'First On Scene');
            caFill(
                '[name=PRMAIN_level_care_per_protocol]',
                s['pg2_level_care'],
                'Level of Care per Protocol',
            );
            caFill('textarea[name=PRMAIN_belongings]', s['pg2_belongings'], 'Patient Belongings');
            caFillPopup('pt_moved_via', s['pg2_to_truck'], 'Moved to Vehicle Via');
            caFillPopup('pt_position', s['pg2_position'], 'Position in Vehicle');
            caFillPopup('pt_moved_from_multi', s['pg2_from_truck'], 'Moved From Vehicle Via');
            caFillPopup('transassess', s['pg2_transassess'], 'Transport Assessment');
            caFill(
                'textarea[name=stretcher_purpose_descr]',
                s['pg2_stretcher_purpose'],
                'Stretcher Purpose',
            );
        });
    });
});
