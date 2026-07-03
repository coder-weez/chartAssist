$(document).ready(function () {
    caToolbar().append('<button class="chartfiller ca-btn">AutoComplete</button>');
    caToolbar().append('<button class="ca-clear ca-btn ca-btn-danger">Clear Fields</button>');

    $('.ca-clear').click(function () {
        if (!chrome.runtime || !chrome.runtime.id) return;
        if (!window.confirm('Clear all auto-filled fields on this page? This cannot be undone.'))
            return;
        caClrPertNeg('mental_text_id');
        caClrPertNeg('mental_text_neg_id');
        caClrPertNeg('neuro_text_id');
        caClrPertNeg('neuro_text_neg_id');
        caClrField('select[name=stroke_scale]');
        caClrField('select[name=gcs_eye_1]');
        caClrField('select[name=gcs_verbal_1]');
        caClrField('select[name=gcs_motor_1]');
        caClrField('[name=pupil_size_l]');
        caClrField('[name=pupil_size_r]');
        caClrField('[name=pupil_rx_l]');
        caClrField('[name=pupil_rx_r]');
        caClrField('input[name=head_reactive]');
        caClrField('[name=motor_la]');
        caClrField('[name=sensory_la]');
        caClrField('[name=motor_ra]');
        caClrField('[name=sensory_ra]');
        caClrField('[name=motor_ll]');
        caClrField('[name=sensory_ll]');
        caClrField('[name=motor_rl]');
        caClrField('[name=sensory_rl]');
        caClrField('input[name=head_sensory]');
        caClrField('input[name=motor_comments]');
        caClrField('select[name=AIR_STATUS]');
        caClrField('textarea[name=AIR_COMMENTS]');
        caClrField('select[name=air_by]');
        caClrField('select[name=air_outcome]');
    });

    $('.chartfiller').click(function () {
        if (!chrome.runtime || !chrome.runtime.id) return;
        chrome.storage.sync.get(null, function (s) {
            caFillPertNeg('mental_text_id', s['pg3_mental_present'], 'Mental — Present');
            caFillPertNeg(
                'mental_text_neg_id',
                s['pg3_mental_not_present'],
                'Mental — Not Present',
            );
            caFillPertNeg('neuro_text_id', s['pg3_neuro_present'], 'Neurological — Present');
            caFillPertNeg(
                'neuro_text_neg_id',
                s['pg3_neuro_not_present'],
                'Neurological — Not Present',
            );
            caFill('select[name=stroke_scale]', s['stroke_scale'], 'Stroke Scale');
            caFill('select[name=gcs_eye_1]', s['gcs_eye_1'], 'GCS Eye');
            caFill('select[name=gcs_verbal_1]', s['gcs_verbal_1'], 'GCS Verbal');
            caFill('select[name=gcs_motor_1]', s['gcs_motor_1'], 'GCS Motor');
            caFill('[name=pupil_size_l]', s['pg3_pupil_size_l'], 'Pupil Size (L)');
            caFill('[name=pupil_size_r]', s['pg3_pupil_size_r'], 'Pupil Size (R)');
            caFill('[name=pupil_rx_l]', s['pg3_pupil_rx_l'], 'Pupil React (L)');
            caFill('[name=pupil_rx_r]', s['pg3_pupil_rx_r'], 'Pupil React (R)');
            caFill('input[name=head_reactive]', s['pg3_pupil_comments'], 'Pupil Comments');
            caFill('[name=motor_la]', s['pg3_motor_la'], 'Motor (LA)');
            caFill('[name=sensory_la]', s['pg3_sensory_la'], 'Sensory (LA)');
            caFill('[name=motor_ra]', s['pg3_motor_ra'], 'Motor (RA)');
            caFill('[name=sensory_ra]', s['pg3_sensory_ra'], 'Sensory (RA)');
            caFill('[name=motor_ll]', s['pg3_motor_ll'], 'Motor (LL)');
            caFill('[name=sensory_ll]', s['pg3_sensory_ll'], 'Sensory (LL)');
            caFill('[name=motor_rl]', s['pg3_motor_rl'], 'Motor (RL)');
            caFill('[name=sensory_rl]', s['pg3_sensory_rl'], 'Sensory (RL)');
            caFill('input[name=head_sensory]', s['pg3_sensory_comments'], 'Sensory Comments');
            caFill('input[name=motor_comments]', s['pg3_motor_comments'], 'Motor Comments');
            caFill('select[name=AIR_STATUS]', s['pg3_airway_status'], 'Airway Status');
            caFill('textarea[name=AIR_COMMENTS]', s['pg3_airway_comments'], 'Airway Comments');
            caFill('select[name=air_by]', s['pg3_air_by'], 'Airway Performed By');
            caFill('select[name=air_outcome]', s['pg3_air_outcome'], 'Airway Outcome');
        });
    });
});
