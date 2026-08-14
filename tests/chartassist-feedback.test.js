// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

// Exercises the pre-launch robustness fixes in chartassist.js: the first-run
// "no defaults" hint, the whole-segment append match (so a short default like
// "No" isn't seen inside "Now…"), the popup trim, and the select read-back that
// avoids a false "filled" flash for a stale option.
let ca;
beforeAll(() => {
    const mod = require('../src/jquery.min.js');
    global.jQuery = global.$ = mod.default || mod;
    ca = require('../src/chartassist.js').default || require('../src/chartassist.js');
});

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('caNoDefaultsHint', () => {
    it('toasts and returns true when nothing is configured', () => {
        expect(ca.caNoDefaultsHint({})).toBe(true);
        expect(document.querySelector('#ca-toast-container .ca-toast')).toBeTruthy();
    });

    it('treats all-blank values as nothing configured', () => {
        expect(ca.caNoDefaultsHint({ a: '', b: '   ', c: null })).toBe(true);
    });

    it('returns false and does not toast once any default is set', () => {
        expect(ca.caNoDefaultsHint({ pg2_chief_complaint: 'CP' })).toBe(false);
        expect(document.querySelector('#ca-toast-container')).toBeFalsy();
    });
});

describe('caFill — whole-segment append match', () => {
    it('appends a short default that only appears mid-word', () => {
        document.body.innerHTML = '<textarea id="t">Now denies chest pain</textarea>';
        const changed = ca.caFill('#t', 'No', 'X');
        expect(document.getElementById('t').value).toBe('Now denies chest pain No');
        expect(changed).toBe(true);
    });

    it('does not re-append a default already present as a whole segment', () => {
        document.body.innerHTML = '<textarea id="t2">Patient is No</textarea>';
        const changed = ca.caFill('#t2', 'No', 'X');
        expect(document.getElementById('t2').value).toBe('Patient is No');
        expect(changed).toBe(false);
    });
});

describe('caFill — stale select value', () => {
    it('does not claim success/flash when the value is not a real option', () => {
        document.body.innerHTML =
            '<select id="s"><option value="">--</option><option value="1">One</option></select>';
        const changed = ca.caFill('#s', '999', 'X');
        expect(changed).toBe(false);
    });
});

describe('caFillPopup — trims the value', () => {
    it('treats a trailing-space value as an exact match (silent no-op, no toast)', () => {
        document.body.innerHTML = '<input name="pt_moved_via_text" value="Stretcher">';
        const changed = ca.caFillPopup('pt_moved_via', 'Stretcher ', 'Moved Via');
        expect(changed).toBe(false);
        expect(document.querySelector('.ca-toast')).toBeFalsy();
    });
});
