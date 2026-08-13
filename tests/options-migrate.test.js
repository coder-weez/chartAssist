// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

// options.js exports migrate_legacy_keys under CommonJS. This guards the fix for
// the bug where saved options were deleted on update: keys renamed across
// versions were dropped by the old prune step, so their values had to be
// migrated forward to the current key names instead of pruned away.
const opts = require('../src/options.js');

beforeEach(() => {
    global.chrome = {
        // The real options page always has chrome.runtime; save/migrate consult
        // chrome.runtime.lastError to detect a failed (e.g. over-quota) write.
        runtime: { lastError: undefined },
        storage: {
            sync: {
                _data: {},
                get(keys, cb) {
                    cb({ ...this._data });
                },
                set(v, cb) {
                    Object.assign(this._data, v);
                    if (cb) cb();
                },
                remove(keys, cb) {
                    (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
                        delete this._data[k];
                    });
                    if (cb) cb();
                },
            },
        },
    };
});

describe('options.js legacy key migration', () => {
    it('copies a renamed key forward and removes the old key', async () => {
        chrome.storage.sync._data = { pg3_stroke_scale: '3', pg2_chief_complaint: 'CP' };

        await new Promise((res) => opts.migrate_legacy_keys(res));

        // Value preserved under the new name...
        expect(chrome.storage.sync._data.stroke_scale).toBe('3');
        // ...old key removed, unrelated key untouched.
        expect('pg3_stroke_scale' in chrome.storage.sync._data).toBe(false);
        expect(chrome.storage.sync._data.pg2_chief_complaint).toBe('CP');
    });

    it('fans a single legacy page-5 exam value into all three preset categories', async () => {
        chrome.storage.sync._data = { pg5_head_comments: 'No DCAP-BTLS' };

        await new Promise((res) => opts.migrate_legacy_keys(res));

        expect(chrome.storage.sync._data.pg5_trauma_head_comments).toBe('No DCAP-BTLS');
        expect(chrome.storage.sync._data.pg5_medical_head_comments).toBe('No DCAP-BTLS');
        expect(chrome.storage.sync._data.pg5_refusal_head_comments).toBe('No DCAP-BTLS');
        expect('pg5_head_comments' in chrome.storage.sync._data).toBe(false);
    });

    it('does not clobber a value already set under the new key name', async () => {
        chrome.storage.sync._data = { pg3_gcs_eye: '2', gcs_eye_1: '4' };

        await new Promise((res) => opts.migrate_legacy_keys(res));

        // Existing new-key value wins; legacy key is still cleaned up.
        expect(chrome.storage.sync._data.gcs_eye_1).toBe('4');
        expect('pg3_gcs_eye' in chrome.storage.sync._data).toBe(false);
    });

    it('leaves unmapped / current keys completely alone', async () => {
        chrome.storage.sync._data = {
            pg2_als_assessment: 'legacy', // removed field, intentionally unmapped
            pg4_brachial_l: '2', // current key
            pg2_hpi: 'text', // current key
        };

        await new Promise((res) => opts.migrate_legacy_keys(res));

        expect(chrome.storage.sync._data).toEqual({
            pg2_als_assessment: 'legacy',
            pg4_brachial_l: '2',
            pg2_hpi: 'text',
        });
    });
});
