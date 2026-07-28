$(document).ready(function () {
    caToolbar().append('<button class="pg5trauma ca-btn">Trauma</button>');
    caToolbar().append('<button class="pg5medical ca-btn">Medical</button>');
    caToolbar().append('<button class="pg5refusal ca-btn">Refusal</button>');
    caToolbar().append('<button class="ca-clear ca-btn ca-btn-danger">Clear Fields</button>');

    // Canary selectors — one or more per section — flag EMSCharts DOM changes.
    caHealthCheck(5, [
        'input[name=head_comments]',
        'select[name=trachea]',
        'input[name=ap_appearance]',
        'input[name=ex_comments]',
    ]);

    $('.ca-clear').click(function () {
        if (!chrome.runtime || !chrome.runtime.id) return;
        if (!window.confirm('Clear all auto-filled fields on this page? This cannot be undone.'))
            return;
        caClrField('input[name=head_comments]');
        caClrField('input[name=neck_comments]');
        caClrField('select[name=trachea]');
        caClrField('input[name=chest_comments]');
        caClrField('input[name=ap_appearance]');
        caClrField('input[name=ap_palpation]');
        caClrField('input[name=ap_bowel_sounds]');
        caClrField('input[name=ap_findings]');
        caClrField('input[name=pelvis_comments]');
        caClrField('input[name=back_comments]');
        caClrField('input[name=ex_comments]');
        caClrField('input[name=ex_restraints]');
        caClrField('input[name=ex_skin_findings]');
    });

    function fillPage5(prefix) {
        chrome.storage.sync.get(null, function (s) {
            caFill('input[name=head_comments]', s[prefix + 'head_comments'], 'Head Findings');
            caFill('input[name=neck_comments]', s[prefix + 'neck_comments'], 'Neck Findings');
            caFill('select[name=trachea]', s[prefix + 'trachea'], 'Trachea');
            caFill('input[name=chest_comments]', s[prefix + 'chest_comments'], 'Chest Findings');
            caFill(
                'input[name=ap_appearance]',
                s[prefix + 'ap_appearance'],
                'Abdomen (Appearance)',
            );
            caFill('input[name=ap_palpation]', s[prefix + 'ap_palpation'], 'Abdomen (Palpation)');
            caFill(
                'input[name=ap_bowel_sounds]',
                s[prefix + 'ap_bowel_sounds'],
                'Abdomen (Bowel Sounds)',
            );
            caFill('input[name=ap_findings]', s[prefix + 'ap_findings'], 'Abdomen (Comments)');
            caFill('input[name=pelvis_comments]', s[prefix + 'pelvis_comments'], 'Pelvis Findings');
            caFill('input[name=back_comments]', s[prefix + 'back_comments'], 'Back Findings');
            caFill('input[name=ex_comments]', s[prefix + 'ex_comments'], 'Extremity Findings');
            caFill('input[name=ex_restraints]', s[prefix + 'ex_restraints'], 'Restraints');
            caFill('input[name=ex_skin_findings]', s[prefix + 'ex_skin_findings'], 'Skin Findings');
        });
    }

    $('.pg5trauma').click(function () {
        if (!chrome.runtime || !chrome.runtime.id) return;
        fillPage5('pg5_trauma_');
    });
    $('.pg5medical').click(function () {
        if (!chrome.runtime || !chrome.runtime.id) return;
        fillPage5('pg5_medical_');
    });
    $('.pg5refusal').click(function () {
        if (!chrome.runtime || !chrome.runtime.id) return;
        fillPage5('pg5_refusal_');
    });
});
