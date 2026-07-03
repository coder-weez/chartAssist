// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';

// caFill needs jQuery and a DOM. Load the vendored jQuery against the jsdom
// window, then require chartassist (which resolves the global `jQuery` at call
// time), so we exercise the real caFill logic.
let caFill;
beforeAll(() => {
    const mod = require('../src/jquery.min.js');
    global.jQuery = global.$ = mod.default || mod;
    caFill = (require('../src/chartassist.js').default || require('../src/chartassist.js')).caFill;
});

describe('caFill — select blank handling', () => {
    it('fills a select still on its "-1" placeholder (Airway Status)', () => {
        document.body.innerHTML =
            '<select id="air"><option value="-1"> </option>' +
            '<option value="2">Compromised</option><option value="1">Patent</option></select>';
        const el = document.getElementById('air');
        el.value = '-1'; // blank/placeholder selected
        const changed = caFill('#air', '1', 'Airway Status');
        expect(el.value).toBe('1');
        expect(changed).toBe(true);
    });

    it('does not overwrite a select that already holds a real value', () => {
        document.body.innerHTML =
            '<select id="air2"><option value="-1"> </option>' +
            '<option value="2">Compromised</option><option value="1">Patent</option></select>';
        const el = document.getElementById('air2');
        el.value = '2'; // "Compromised" already chosen
        caFill('#air2', '1', 'Airway Status');
        expect(el.value).toBe('2'); // unchanged
    });

    it('treats "null"/"0" placeholders as blank as well', () => {
        document.body.innerHTML =
            '<select id="gcs"><option value="null"></option><option value="4">4</option></select>';
        const el = document.getElementById('gcs');
        el.value = 'null';
        caFill('#gcs', '4', 'GCS');
        expect(el.value).toBe('4');
    });
});
