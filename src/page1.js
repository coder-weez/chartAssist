/* global getUnitPicklist */
$(document).ready(function () {
    var bar = caToolbar(true);

    // --- Base section ---
    bar.append('<div class="ca-section-label">Base</div>');
    bar.append('<button class="ca-btn ca-btn-base" data-base-id="5650">1321 EV Rd</button>');
    bar.append('<button class="ca-btn ca-btn-base" data-base-id="22751">34 Maple</button>');
    bar.append('<button class="ca-btn ca-btn-base" data-base-id="26274">380 High</button>');

    bar.on('click', '.ca-btn-base', function () {
        if (!chrome.runtime || !chrome.runtime.id) return;
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
        if (!chrome.runtime || !chrome.runtime.id) return;
        caSetStaffing('3');
    });

    bar.on('click', '.ca-btn-bls', function () {
        if (!chrome.runtime || !chrome.runtime.id) return;
        caSetStaffing('2');
    });

    bar.append('<button class="ca-clear ca-btn ca-btn-danger">Clear Fields</button>');

    bar.on('click', '.ca-clear', function () {
        if (!chrome.runtime || !chrome.runtime.id) return;
        if (!window.confirm('Clear all auto-filled fields on this page? This cannot be undone.'))
            return;
        caClrField('select[name="Base_ID"]');
        caClrField('input[name="vehcloc"]');
        caClrField('select[name="unit_capability"]');
        caClrField('select[name="unit_staff"]');
        caClrField('select[name="transcode"]');
        caClrField('input[name="ref_md"]');
    });
});
