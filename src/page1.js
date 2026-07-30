/* global getUnitPicklist */

// Return the real Base options to turn into buttons, in dropdown order.
// EMSCharts marks a placeholder row with a blank/0/-1 value (or empty label);
// those are skipped. We deliberately do NOT skip by position — some facilities'
// Base_ID dropdown leads with a real base and has no placeholder row, so
// skipping index 0 dropped that base's button.
function caBaseOptions(selectEl) {
    var out = [];
    if (!selectEl || !selectEl.options) return out;
    for (var i = 0; i < selectEl.options.length; i++) {
        var opt = selectEl.options[i];
        var val = opt.value;
        if (val === '' || val === '0' || val === '-1') continue;
        var label = (opt.textContent || '').trim();
        if (!label) continue;
        out.push({ value: val, label: label });
    }
    return out;
}

function caInitPage1() {
    var bar = caToolbar(true);

    // --- Base section ---
    // Buttons are generated dynamically from the EMSCharts Base_ID dropdown:
    // one button per real option (see caBaseOptions), labelled with the option's
    // own text. The list adapts to whatever bases the dropdown offers.
    bar.append('<div class="ca-section-label">Base</div>');
    var baseSel = $('select[name="Base_ID"]');
    if (baseSel.length) {
        caBaseOptions(baseSel[0]).forEach(function (o) {
            var $btn = $('<button class="ca-btn ca-btn-base"></button>');
            $btn.attr('data-base-id', o.value).text(o.label);
            bar.append($btn);
        });
    }

    bar.on('click', '.ca-btn-base', function () {
        if (!caActive(1)) return;
        var val = $(this).data('base-id').toString();
        var sel = $('select[name="Base_ID"]');
        if (!sel.length) return;
        sel[0].value = val;
        sel[0].dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof getUnitPicklist === 'function') getUnitPicklist();
        caFlash('select[name="Base_ID"]');
        var label = sel
            .find('option[value="' + val + '"]')
            .text()
            .trim();
        var locEl = $('input[name="vehcloc"]');
        if (locEl.length && label) {
            locEl[0].value = label;
            locEl[0].dispatchEvent(new Event('change', { bubbles: true }));
            caFlash('input[name="vehcloc"]');
        }
    });

    // --- Staffing section ---
    bar.append('<div class="ca-section-label">Staffing</div>');
    bar.append('<button class="ca-btn ca-btn-als">ALS</button>');
    bar.append('<button class="ca-btn ca-btn-bls">BLS</button>');

    function caSetStaffing(unitStaffVal) {
        var staff = $('select[name="unit_staff"]');
        if (staff.length) {
            staff[0].value = unitStaffVal;
            staff[0].dispatchEvent(new Event('change', { bubbles: true }));
            caFlash('select[name="unit_staff"]');
        }
        var capability = $('select[name="unit_capability"]');
        if (capability.length) {
            capability[0].value = unitStaffVal === '3' ? '3' : '4';
            capability[0].dispatchEvent(new Event('change', { bubbles: true }));
            caFlash('select[name="unit_capability"]');
        }
        var trans = $('select[name="transcode"]');
        if (trans.length) {
            trans[0].value = '1';
            trans[0].dispatchEvent(new Event('change', { bubbles: true }));
            caFlash('select[name="transcode"]');
        }
        var refMd = $('input[name="ref_md"]');
        if (refMd.length) {
            refMd[0].value = 'Ontario County 911';
            refMd[0].dispatchEvent(new Event('change', { bubbles: true }));
            caFlash('input[name="ref_md"]');
        }
    }

    bar.on('click', '.ca-btn-als', function () {
        if (!caActive(1)) return;
        caSetStaffing('3');
    });

    bar.on('click', '.ca-btn-bls', function () {
        if (!caActive(1)) return;
        caSetStaffing('2');
    });

    bar.append('<button class="ca-clear ca-btn ca-btn-danger">Clear Fields</button>');

    bar.on('click', '.ca-clear', function () {
        if (!caActive(1)) return;
        if (!window.confirm('Clear all auto-filled fields on this page? This cannot be undone.'))
            return;
        caClrField('select[name="Base_ID"]');
        caClrField('input[name="vehcloc"]');
        caClrField('select[name="unit_capability"]');
        caClrField('select[name="unit_staff"]');
        caClrField('select[name="transcode"]');
        caClrField('input[name="ref_md"]');
    });
}

// Under Node/CommonJS (unit tests) export the testable helper and skip the DOM
// wiring; in the browser `module` is undefined, so page1 initialises on ready.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { caBaseOptions };
} else {
    $(document).ready(caInitPage1);
}
