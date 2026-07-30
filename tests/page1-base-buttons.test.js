import { describe, it, expect, beforeAll } from 'vitest';

// page1 builds the "Base" buttons from the Base_ID <select>. caBaseOptions is the
// pure filter behind that. Regression: a facility whose dropdown leads with a
// REAL base (no placeholder row) must keep that first option — earlier code
// skipped index 0 as a presumed placeholder and silently dropped it.
let caBaseOptions;
beforeAll(() => {
    const mod = require('../src/page1.js');
    caBaseOptions = (mod.default || mod).caBaseOptions;
});

// Minimal stand-in for a <select>: caBaseOptions only reads option.value and
// option.textContent, so a plain object is enough (no DOM needed).
function selectOf(pairs) {
    return { options: pairs.map(([value, label]) => ({ value, textContent: label })) };
}

describe('caBaseOptions — real Base options from the dropdown', () => {
    it('keeps the first option when there is no placeholder row', () => {
        const result = caBaseOptions(
            selectOf([
                ['5650', '1321 East Victor Road '],
                ['22751', '34 Maple Avenue '],
                ['26274', '380 High Street'],
            ]),
        );
        expect(result).toEqual([
            { value: '5650', label: '1321 East Victor Road' },
            { value: '22751', label: '34 Maple Avenue' },
            { value: '26274', label: '380 High Street' },
        ]);
    });

    it('skips genuine placeholder rows (blank / 0 / -1 value or empty label)', () => {
        const result = caBaseOptions(
            selectOf([
                ['', 'Select a base…'],
                ['5650', '1321 East Victor Road'],
                ['0', 'N/A'],
                ['-1', 'None'],
                ['9999', '   '],
            ]),
        );
        expect(result).toEqual([{ value: '5650', label: '1321 East Victor Road' }]);
    });

    it('returns an empty list when the select is missing', () => {
        expect(caBaseOptions(null)).toEqual([]);
        expect(caBaseOptions({})).toEqual([]);
    });
});
