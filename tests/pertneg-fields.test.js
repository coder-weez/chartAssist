import { describe, it, expect } from 'vitest';

const { caPertNegFields } = require('../src/chartassist.js');

// caPertNegFields derives the four EMSCharts hidden-field names from a divId.
// This is pure string logic and was a source of the pertneg save bug, so it is
// worth pinning down precisely.
describe('caPertNegFields', () => {
    it('derives present (mental) field names', () => {
        expect(caPertNegFields('mental_text_id')).toEqual({
            typ: 'mental',
            isNeg: false,
            id: 'mental',
            text: 'mental_text',
            cust: 'mental_cmdfacCustId',
            exam: 'mental_examvalId',
        });
    });

    it('derives not-present (mental) field names', () => {
        expect(caPertNegFields('mental_text_neg_id')).toEqual({
            typ: 'mental',
            isNeg: true,
            id: 'mental_neg',
            text: 'mental_text_neg',
            cust: 'mental_cmdfacCustId_neg',
            exam: 'mental_examvalId_negs',
        });
    });

    it('derives present (neuro) field names', () => {
        expect(caPertNegFields('neuro_text_id')).toMatchObject({
            typ: 'neuro',
            isNeg: false,
            id: 'neuro',
            text: 'neuro_text',
        });
    });

    it('derives not-present (neuro) field names', () => {
        expect(caPertNegFields('neuro_text_neg_id')).toMatchObject({
            typ: 'neuro',
            isNeg: true,
            id: 'neuro_neg',
            text: 'neuro_text_neg',
            exam: 'neuro_examvalId_negs',
        });
    });
});
