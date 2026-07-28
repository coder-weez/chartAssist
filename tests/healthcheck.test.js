// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

// caHealthCheck needs jQuery, a DOM, and a minimal chrome API. Load the vendored
// jQuery against jsdom, stub chrome.storage.local + chrome.runtime, then require
// chartassist so we exercise the real detection logic.
let caHealthCheck;
let store;
beforeAll(() => {
    const mod = require('../src/jquery.min.js');
    global.jQuery = global.$ = mod.default || mod;
    store = {};
    global.chrome = {
        runtime: { id: 'test' },
        storage: {
            local: {
                get: (keys, cb) => cb({ ca_health: store.ca_health }),
                set: (obj, cb) => {
                    Object.assign(store, obj);
                    if (cb) cb();
                },
            },
        },
    };
    caHealthCheck = (require('../src/chartassist.js').default || require('../src/chartassist.js'))
        .caHealthCheck;
});

beforeEach(() => {
    store = {};
});

describe('caHealthCheck — DOM drift detection', () => {
    it('returns [] and records nothing when every anchor resolves', () => {
        document.body.innerHTML = '<input name="a"><select name="b"></select>';
        const missing = caHealthCheck(3, ['input[name=a]', 'select[name=b]']);
        expect(missing).toEqual([]);
        expect(store.ca_health && store.ca_health.page3).toBeUndefined();
    });

    it('returns and records the missing selectors when an anchor is gone', () => {
        document.body.innerHTML = '<input name="a">';
        const missing = caHealthCheck(3, ['input[name=a]', 'select[name=b]']);
        expect(missing).toEqual(['select[name=b]']);
        expect(store.ca_health.page3.missing).toEqual(['select[name=b]']);
        expect(store.ca_health.page3.ts).toBeTruthy();
    });

    it('clears a stale report once the page recovers', () => {
        store.ca_health = { page3: { missing: ['select[name=b]'], ts: 'old' } };
        document.body.innerHTML = '<input name="a"><select name="b"></select>';
        caHealthCheck(3, ['input[name=a]', 'select[name=b]']);
        expect(store.ca_health.page3).toBeUndefined();
    });

    it('no-ops without a valid extension context', () => {
        const saved = global.chrome.runtime;
        global.chrome.runtime = {}; // no id — extension reloaded
        document.body.innerHTML = '';
        expect(caHealthCheck(3, ['select[name=b]'])).toEqual([]);
        global.chrome.runtime = saved;
    });
});
