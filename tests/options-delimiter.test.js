// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

// options.js exports its functions under CommonJS and skips the DOM wiring, so
// we can drive get_user_values / restore_options directly against a jsdom DOM.
const opts = require('../src/options.js');

beforeEach(() => {
    // Minimal synchronous chrome.storage.sync stub.
    global.chrome = {
        storage: {
            sync: {
                _data: {},
                get(keys, cb) {
                    cb(this._data);
                },
                set(v, cb) {
                    Object.assign(this._data, v);
                    if (cb) cb();
                },
                remove() {},
            },
        },
    };
    document.body.innerHTML = '';
});

// The original save bug: joining checkgroup values with "," corrupted labels
// that themselves contain commas. The fix uses "|" as the delimiter.
describe('options.js checkgroup | delimiter', () => {
    const COMMA_LABEL = 'Altered mental status, unspecified';

    it('joins selected values with | so comma-containing labels stay intact', () => {
        document.body.innerHTML =
            '<input type="checkbox" data-group="pg3_mental_present" value="Combative" checked>' +
            '<input type="checkbox" data-group="pg3_mental_present" value="' +
            COMMA_LABEL +
            '" checked>' +
            '<input type="checkbox" data-group="pg3_mental_present" value="Confused">';
        const vals = opts.get_user_values();
        expect(vals.pg3_mental_present).toBe('Combative|' + COMMA_LABEL);
    });

    it('restores selections by splitting on | (comma-containing label matched whole)', () => {
        document.body.innerHTML =
            '<input type="checkbox" data-group="pg3_mental_present" value="Combative">' +
            '<input type="checkbox" data-group="pg3_mental_present" value="' +
            COMMA_LABEL +
            '">' +
            '<input type="checkbox" data-group="pg3_mental_present" value="Confused">';
        chrome.storage.sync._data = { pg3_mental_present: 'Combative|' + COMMA_LABEL };

        opts.restore_options();

        const checked = [...document.querySelectorAll('[data-group="pg3_mental_present"]')]
            .filter((b) => b.checked)
            .map((b) => b.value);
        expect(checked).toEqual(['Combative', COMMA_LABEL]);
    });
});
