// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';

// caFillPopup / caClrPopup toggle a field's own "ADD +" button. EMSCharts gives
// every multi-pick ADD+ button the same name="add", so the toggle must be scoped
// to the button whose onclick names THIS field — otherwise an unrelated field's
// button (e.g. the patient page's cmscode) gets hidden. These tests lock that in.
let caFillPopup, caClrPopup, caPopupAddButton;
beforeAll(() => {
    const mod = require('../src/jquery.min.js');
    global.jQuery = global.$ = mod.default || mod;
    const ca = require('../src/chartassist.js').default || require('../src/chartassist.js');
    caFillPopup = ca.caFillPopup;
    caClrPopup = ca.caClrPopup;
    caPopupAddButton = ca.caPopupAddButton;
});

// A page-2 popup field and an unrelated cmscode ADD+ button sharing one container.
function twoFieldsInOneContainer() {
    document.body.innerHTML =
        '<div class="section">' +
        '  <input name="pt_moved_via_text" type="hidden">' +
        '  <span id="pt_moved_via_htmlid"></span>' +
        '  <input name="add" class="add-multi-pick-button" id="ptmv_add" ' +
        "     onclick=\"multiPickEnc('General','pt_moved_via','')\">" +
        '  <input name="add" class="add-multi-pick-button" id="cmscode_htmlid" ' +
        "     onclick=\"multiPickEnc('General','cmscode','')\">" +
        '</div>';
}

describe('caPopupAddButton — field-scoped ADD+ lookup', () => {
    it('matches only the button whose onclick names the field', () => {
        twoFieldsInOneContainer();
        const found = caPopupAddButton('pt_moved_via');
        expect(found.length).toBe(1);
        expect(found[0].id).toBe('ptmv_add');
    });

    it('does not prefix-match a longer field name', () => {
        document.body.innerHTML =
            '<input name="add" class="add-multi-pick-button" id="a" ' +
            "onclick=\"multiPickEnc('G','pt_moved','')\">" +
            '<input name="add" class="add-multi-pick-button" id="b" ' +
            "onclick=\"multiPickEnc('G','pt_moved_from_multi','')\">";
        const found = caPopupAddButton('pt_moved');
        expect(found.length).toBe(1);
        expect(found[0].id).toBe('a');
    });
});

describe('caFillPopup — does not touch a sibling field ADD+ button', () => {
    it('hides only the target field button, leaving cmscode alone', () => {
        twoFieldsInOneContainer();
        caFillPopup('pt_moved_via', 'Stretcher', 'Moved to Vehicle Via');
        expect(document.getElementById('ptmv_add').style.display).toBe('none');
        expect(document.getElementById('cmscode_htmlid').style.display).toBe(''); // untouched
    });
});

describe('caClrPopup — restores only the target field ADD+ button', () => {
    it('shows the target button without disturbing cmscode', () => {
        twoFieldsInOneContainer();
        // Both start hidden (as if previously filled); clearing pt_moved_via must
        // only re-show its own button.
        document.getElementById('ptmv_add').style.display = 'none';
        document.getElementById('cmscode_htmlid').style.display = 'none';
        caClrPopup('pt_moved_via');
        expect(document.getElementById('ptmv_add').style.display).not.toBe('none'); // shown
        expect(document.getElementById('cmscode_htmlid').style.display).toBe('none'); // untouched
    });
});
