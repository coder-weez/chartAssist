import { describe, it, expect, beforeAll } from 'vitest';

// page8 builds its toolbar preset buttons from saved config. caPage8Presets is the
// pure filter behind that: given the full chrome.storage.sync object it returns the
// ordered list of buttons to render. A preset shows only when it is enabled AND
// non-blank (a built-in needs text; a custom slot needs both label and text), where
// "blank" means empty or whitespace-only.
let caPage8Presets;
beforeAll(() => {
    const mod = require('../src/page8.js');
    caPage8Presets = (mod.default || mod).caPage8Presets;
});

describe('caPage8Presets — page-8 preset buttons from saved config', () => {
    it('defaults built-ins ON (customs OFF) when pg8_enabled has never been saved', () => {
        const result = caPage8Presets({
            pg8_at_ref: 'On scene text',
            pg8_lv_ref: 'Transport text',
            // pg8_at_rec intentionally absent (blank) → no button
            pg8_can_1: 'Refusal text',
            // a configured custom slot stays hidden because pg8_enabled is unset
            pg8_custom1_label: 'test',
            pg8_custom1_text: 'hello',
        });
        expect(result.map((p) => p.id)).toEqual(['at_ref', 'lv_ref', 'can_1']);
        expect(result[0]).toEqual({
            id: 'at_ref',
            label: 'On Scene',
            text: 'On scene text',
            friendly: 'On Scene Comment',
        });
    });

    it('shows only the toggled-on presets, hiding unchecked built-ins', () => {
        const result = caPage8Presets({
            pg8_enabled: 'at_ref|can_1',
            pg8_at_ref: 'On scene text',
            pg8_lv_ref: 'Transport text', // has text but not enabled → hidden
            pg8_can_1: 'Refusal text',
        });
        expect(result.map((p) => p.id)).toEqual(['at_ref', 'can_1']);
    });

    it('skips an enabled preset whose label or text is empty or whitespace-only', () => {
        const result = caPage8Presets({
            pg8_enabled: 'at_ref|lv_ref|custom1|custom2',
            pg8_at_ref: '   ', // whitespace-only text → hidden
            pg8_lv_ref: '', // empty text → hidden
            pg8_custom1_label: 'ok',
            pg8_custom1_text: '   ', // whitespace-only text → hidden
            pg8_custom2_label: '   ', // whitespace-only label → hidden
            pg8_custom2_text: 'body',
        });
        expect(result).toEqual([]);
    });

    it('includes a custom slot only when enabled with both label and text, trimming the label', () => {
        const result = caPage8Presets({
            pg8_enabled: 'custom1',
            pg8_custom1_label: '  test  ',
            pg8_custom1_text: 'my custom value',
        });
        expect(result).toEqual([
            { id: 'custom1', label: 'test', text: 'my custom value', friendly: 'test Comment' },
        ]);
    });

    it('orders built-ins (in declared order) before custom slots', () => {
        const result = caPage8Presets({
            pg8_enabled: 'custom1|can_1|at_ref',
            pg8_at_ref: 'a',
            pg8_can_1: 'r',
            pg8_custom1_label: 'X',
            pg8_custom1_text: 'x',
        });
        expect(result.map((p) => p.id)).toEqual(['at_ref', 'can_1', 'custom1']);
    });

    it('is safe when called with no/empty storage', () => {
        expect(caPage8Presets()).toEqual([]);
        expect(caPage8Presets({})).toEqual([]);
    });
});
