// Shared UI helpers for EMSCharts Assist content scripts.
// Loaded after jQuery and before each page script.

function caApplyInitialState(bar) {
    chrome.storage.local.get(['ca_qa_mode', 'ca_toolbar_pos'], function (r) {
        var qaOn = !!r.ca_qa_mode;
        bar.toggleClass('ca-frozen', qaOn);
        if (qaOn) {
            bar.css({ left: 'auto', top: '8px', right: '8px' });
        } else if (r.ca_toolbar_pos) {
            var pos = r.ca_toolbar_pos;
            bar.css({ left: pos.left + 'px', top: pos.top + 'px', right: 'auto' });
        }
    });
}

// Returns the extension's floating button bar, creating it once on first use.
// EMSCharts pages no longer expose a stable header element to attach to, so the
// AutoComplete buttons live in their own fixed-position, draggable toolbar.
function caToolbar() {
    var bar = jQuery('#ca-toolbar');
    if (!bar.length) {
        bar = jQuery('<div id="ca-toolbar" class="ca-vertical"></div>').appendTo('body');
        jQuery('<div id="ca-qa-film"></div>').appendTo(bar);
        var handle = jQuery('<div id="ca-drag" title="Drag to move">⠿</div>').appendTo(bar);
        caMakeDraggable(bar, handle);
        caApplyInitialState(bar);
        chrome.storage.onChanged.addListener(function (changes, area) {
            if (area === 'local' && 'ca_qa_mode' in changes) {
                var on = !!changes.ca_qa_mode.newValue;
                bar.toggleClass('ca-frozen', on);
                if (on) {
                    bar.css({ left: 'auto', top: '8px', right: '8px' });
                } else {
                    caSavePosition(bar);
                }
            }
        });
        setTimeout(function () {
            jQuery(
                '<button class="ca-btn" style="font-size:11px;padding:3px 8px;opacity:0.85">Page Defaults</button>',
            )
                .appendTo(bar)
                .on('click', function () {
                    if (chrome.runtime && chrome.runtime.id) {
                        var m = window.location.pathname.match(/page(\d+)\.cfm/i);
                        chrome.runtime.sendMessage({
                            action: 'openOptions',
                            page: m ? m[1] : null,
                        });
                    }
                });
        }, 0);
    }
    return bar;
}

// Let the user reposition the toolbar by dragging its handle.
function caMakeDraggable(bar, handle) {
    var startX,
        startY,
        startLeft,
        startTop,
        dragging = false;

    handle.on('mousedown', function (e) {
        e.preventDefault();
        dragging = true;
        var rect = bar[0].getBoundingClientRect();
        // Switch from right-anchored to left/top so we can move it freely.
        bar.css({ left: rect.left + 'px', top: rect.top + 'px', right: 'auto' });
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        jQuery(document).on('mousemove.ca', onMove).on('mouseup.ca', onUp);
    });

    function onMove(e) {
        if (!dragging) return;
        var left = startLeft + (e.clientX - startX);
        var top = startTop + (e.clientY - startY);
        // Keep the bar within the viewport.
        left = Math.max(0, Math.min(left, window.innerWidth - bar.outerWidth()));
        top = Math.max(0, Math.min(top, window.innerHeight - bar.outerHeight()));
        bar.css({ left: left + 'px', top: top + 'px' });
    }

    function onUp() {
        dragging = false;
        jQuery(document).off('mousemove.ca mouseup.ca');
        caSavePosition(bar);
    }
}

// Remember / restore the toolbar position (per device) so it stays where the
// user dropped it across pages and sessions.
function caSavePosition(bar) {
    var rect = bar[0].getBoundingClientRect();
    chrome.storage.local.set({ ca_toolbar_pos: { left: rect.left, top: rect.top } });
}


// Briefly flash a light-green background on the given fields to confirm
// they were just auto-filled, then fade back to their normal background.
function caFlash(selector) {
    jQuery(selector).each(function () {
        var el = jQuery(this);
        el.css({ transition: 'background-color .5s ease', backgroundColor: '#c8f7c5' });
        setTimeout(function () {
            el.css('background-color', '');
            setTimeout(function () {
                el.css('transition', '');
            }, 500);
        }, 700);
    });
}

// Show a brief non-blocking notification at the bottom of the page.
// Multiple calls stack vertically above the previous toast.
function caToast(message) {
    var container = jQuery('#ca-toast-container');
    if (!container.length) {
        container = jQuery('<div id="ca-toast-container"></div>').appendTo('body');
    }
    var toast = jQuery('<div class="ca-toast"></div>').text(message).appendTo(container);
    setTimeout(function () {
        toast.addClass('ca-toast-show');
    }, 10);
    setTimeout(function () {
        toast.removeClass('ca-toast-show');
        setTimeout(function () {
            toast.remove();
            if (!container.children().length) {
                container.remove();
            }
        }, 300);
    }, 6000);
}

// Fill an EMSCharts popup multi-select field.
// These fields store the selected text label in a hidden input ({fieldName}_text)
// and display it in a span (#{fieldName}_htmlid) — there is no standard select element.
// Returns true if anything visible happened (fill or toast), false for silent no-ops.
function caFillPopup(fieldName, value, friendlyName) {
    if (value === undefined || value === null || value === '') return false;
    var input = jQuery('input[name="' + fieldName + '_text"]');
    if (!input.length) return false;
    var current = (input.val() || '').trim();
    if (current) {
        if (current.toLowerCase() === value.toLowerCase()) return false;
        caToast('"' + friendlyName + '" was not updated — field already has content.');
        return true;
    }
    input[0].value = value;
    input.trigger('change');
    var span = jQuery('#' + fieldName + '_htmlid');
    if (span.length) {
        span.text(value);
        span.parent().find('[name="add"]').hide();
    }
    caFlash('input[name="' + fieldName + '_text"]');
    return true;
}

// Clear a text/textarea/select field back to blank.
function caClrField(selector) {
    var el = jQuery(selector);
    if (!el.length) return;
    var tag = (el.prop('tagName') || '').toLowerCase();
    var type = (el.attr('type') || 'text').toLowerCase();
    var isText =
        tag === 'textarea' ||
        (tag === 'input' && type !== 'checkbox' && type !== 'radio' && type !== 'hidden');
    if (isText) {
        el[0].value = '';
    } else {
        el.prop('selectedIndex', 0);
    }
}

// Clear an EMSCharts popup multi-select field (companion to caFillPopup).
function caClrPopup(fieldName) {
    var input = jQuery('input[name="' + fieldName + '_text"]');
    if (!input.length) return;
    input[0].value = '';
    input.trigger('change');
    var span = jQuery('#' + fieldName + '_htmlid');
    if (span.length) {
        span.text('');
        span.parent().find('[name="add"]').show();
    }
}

// Derive the four hidden field names EMSCharts uses for a pertneg group from its divId.
// divId is like "mental_text_id" (present) or "mental_text_neg_id" (not-present).
// EMSCharts stores each selection across four parallel hidden inputs:
//   present:     {typ}            {typ}_text            {typ}_cmdfacCustId       {typ}_examvalId
//   not-present: {typ}_neg        {typ}_text_neg        {typ}_cmdfacCustId_neg   {typ}_examvalId_negs
// The server reloads from the numeric {typ} (id) field — NOT the text field — so all
// four must be set for a default to persist after leaving and returning to the page.
function caPertNegFields(divId) {
    var inputName = divId.replace(/_id$/, ''); // mental_text | mental_text_neg
    var isNeg = /_neg$/.test(inputName);
    var typ = inputName.replace('_text', '').replace('_neg', ''); // mental | neuro
    return {
        typ: typ,
        isNeg: isNeg,
        id: isNeg ? typ + '_neg' : typ,
        text: isNeg ? typ + '_text_neg' : typ + '_text',
        cust: isNeg ? typ + '_cmdfacCustId_neg' : typ + '_cmdfacCustId',
        exam: isNeg ? typ + '_examvalId_negs' : typ + '_examvalId',
    };
}

// Cache of pertneg picklist catalogs, keyed by type ("mental", "neuro").
// Each value is a Promise resolving to { lowercaseLabel: {label, id, custId, examVal} }.
var caPertNegCatalogs = {};

// Fetch and parse the EMSCharts pertneg picklist, the authoritative source of the
// numeric IDs the server actually saves. IDs are facility-specific (note cmdfac=...),
// so text labels stored in Options must be resolved against the live catalog at fill time.
// `params` is the 4th argument of the field's pertnegPick(...) onclick (facility params).
function caPertNegCatalog(typ, params) {
    if (caPertNegCatalogs[typ]) return caPertNegCatalogs[typ];
    var url =
        '/common/pertneg_picklist.cfm?typ=' +
        encodeURIComponent(typ) +
        '&ids=&ids_neg=&cmdfacCustIds=&cmdfacCustIds_neg=&' +
        params;
    caPertNegCatalogs[typ] = fetch(url, { credentials: 'include' })
        .then(function (r) {
            return r.text();
        })
        .then(function (html) {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var boxes = doc.querySelectorAll('input[name="exam_value_id"]');
            var map = {};
            boxes.forEach(function (cb) {
                var label = (cb.getAttribute('tmpname') || '').trim();
                if (!label) return;
                map[label.toLowerCase()] = {
                    label: label,
                    id: cb.getAttribute('value') || '',
                    custId: cb.getAttribute('cmdfaccustid') || '',
                    examVal: cb.getAttribute('ex_valid') || '',
                };
            });
            return map;
        })
        .catch(function (err) {
            console.warn('caPertNegCatalog: failed to load picklist for', typ, err);
            caPertNegCatalogs[typ] = null; // allow retry on next call
            return {};
        });
    return caPertNegCatalogs[typ];
}

// Fill an EMSCharts "pertneg" multi-select field (Mental / Neurological exam sections).
// `value` is a |-delimited string of text labels from Options (| avoids clashing with
// commas inside labels like "Altered mental status, unspecified"). Each label is resolved
// to its numeric id/custId/examVal via the picklist catalog, then written to all four
// hidden fields so the selection persists server-side. Always overwrites existing content.
function caFillPertNeg(divId, value, friendlyName) {
    if (value === undefined || value === null || value === '') return false;
    var div = jQuery('#' + divId);
    if (!div.length) return false;
    var span = div.find('span.pcr-multi-pick-list');
    if (!span.length) return false;

    var f = caPertNegFields(divId);
    var labels = value
        .split('|')
        .map(function (s) {
            return s.trim();
        })
        .filter(Boolean);

    // The onclick on the span (or ADD+ button) carries the facility params for the picklist.
    var trigger = span.attr('onclick') || div.find('.add-multi-pick-button').attr('onclick') || '';
    var pm = trigger.match(/,\s*'([^']*)'\s*\)/);
    var params = pm ? pm[1] : '';

    caPertNegCatalog(f.typ, params).then(function (catalog) {
        var ids = [],
            texts = [],
            custIds = [],
            examVals = [],
            missing = [];
        labels.forEach(function (label) {
            var entry = catalog[label.toLowerCase()];
            if (!entry) {
                missing.push(label);
                return;
            }
            ids.push(entry.id);
            texts.push(entry.label);
            custIds.push(entry.custId);
            examVals.push(entry.examVal);
        });
        if (missing.length)
            console.warn('caFillPertNeg: no catalog match for', missing, 'in', f.typ);
        if (!texts.length) return;

        var newText = texts.join(',');
        if (span.text().trim().toLowerCase() === newText.toLowerCase()) return;

        function setField(name, val) {
            var el = jQuery('input[name="' + name + '"]');
            if (el.length) el[0].value = val;
            return el;
        }
        setField(f.id, ids.join(','));
        setField(f.cust, custIds.join(','));
        setField(f.exam, examVals.join(','));
        var textEl = setField(f.text, newText);
        // Native events so EMSCharts' own (non-jQuery) listeners fire.
        if (textEl && textEl.length) {
            ['keyup', 'blur', 'change'].forEach(function (t) {
                textEl[0].dispatchEvent(new Event(t, { bubbles: true }));
            });
        }
        span.text(newText);
        div.find('.add-multi-pick-button').hide();
        caFlash('#' + divId + ' span.pcr-multi-pick-list');
    });
    return true;
}

// Clear an EMSCharts "pertneg" multi-select field (companion to caFillPertNeg).
// Blanks all four hidden fields so the cleared state persists server-side.
function caClrPertNeg(divId) {
    var div = jQuery('#' + divId);
    if (!div.length) return;
    var f = caPertNegFields(divId);
    [f.id, f.text, f.cust, f.exam].forEach(function (name) {
        var el = jQuery('input[name="' + name + '"]');
        if (el.length) el[0].value = '';
    });
    var textEl = jQuery('input[name="' + f.text + '"]');
    if (textEl.length) {
        ['keyup', 'blur', 'change'].forEach(function (t) {
            textEl[0].dispatchEvent(new Event(t, { bubbles: true }));
        });
    }
    div.find('span.pcr-multi-pick-list').text('');
    div.find('.add-multi-pick-button').show();
}

// Fill a field with value.
// Text inputs / textareas: appends to any existing content (space-separated).
// Selects: skips and shows a toast if the field already has a value.
// Returns true if anything visible happened (fill or toast), false for silent no-ops.
function caFill(selector, value, friendlyName) {
    var el = jQuery(selector);
    if (!el.length || value === undefined || value === null || value === '') return false;
    var tag = (el.prop('tagName') || '').toLowerCase();
    var type = (el.attr('type') || 'text').toLowerCase();
    var isText =
        tag === 'textarea' ||
        (tag === 'input' && type !== 'checkbox' && type !== 'radio' && type !== 'hidden');
    if (isText) {
        var current = ((el[0] && el[0].value) || '').trim();
        var trimmedValue = value.trim();
        if (current) {
            if (current.toLowerCase().indexOf(trimmedValue.toLowerCase()) !== -1) return false;
            el[0].value = current + ' ' + trimmedValue;
            caToast('"' + friendlyName + '" already had content — options default appended.');
        } else {
            el[0].value = trimmedValue;
        }
    } else {
        // The first <option> is the blank/placeholder. Its value varies across
        // EMSCharts selects ('', '0', 'null', or '-1' for Airway Status), so treat
        // whatever it is as "blank" rather than hard-coding the known values.
        var blankVal = el.find('option:first').val();
        if (blankVal === value) return false;
        var existing = el.val();
        var existingBlank =
            existing === null ||
            existing === '' ||
            existing === '0' ||
            existing === 'null' ||
            existing === blankVal;
        if (!existingBlank) {
            if (existing === value) return false;
            caToast('"' + friendlyName + '" was not updated — field already has content.');
            return true;
        }
        el.val(value);
    }
    caFlash(selector);
    return true;
}

// Exported for unit tests (Node/CommonJS). No-op in the browser content-script
// context, where `module` is undefined and these functions are plain globals.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        caFill,
        caFillPopup,
        caFillPertNeg,
        caPertNegFields,
        caPertNegCatalog,
        caClrField,
        caClrPopup,
        caClrPertNeg,
        caToast,
        caFlash,
        caToolbar,
    };
}
