import { describe, expect, it } from 'vitest';
import { AmountParseError, formatIDR, parseAmount } from '../lib/money';
describe('parseAmount', () => {
    it('parses supported thousand units without floating point arithmetic', () => {
        expect(parseAmount('2rb')).toBe(2000);
        expect(parseAmount('2 ribu')).toBe(2000);
        expect(parseAmount('2,5k')).toBe(2500);
    });
    it('parses juta decimals, grouping, and Indonesian slang', () => {
        expect(parseAmount('1,5jt')).toBe(1_500_000);
        expect(parseAmount('25.000')).toBe(25_000);
        expect(parseAmount('setengah juta')).toBe(500_000);
        expect(parseAmount('goceng')).toBe(5_000);
        expect(parseAmount('ceban')).toBe(10_000);
        expect(parseAmount('noban')).toBe(20_000);
        expect(parseAmount('gocap')).toBe(50_000);
        expect(parseAmount('cepe')).toBe(100_000);
    });
    it('accepts only safe non-negative integer numbers', () => {
        expect(parseAmount(0)).toBe(0);
        expect(parseAmount(1250000)).toBe(1_250_000);
        expect(() => parseAmount(1.5)).toThrowError(AmountParseError);
        expect(() => parseAmount(-1)).toThrowError(AmountParseError);
        expect(() => parseAmount(Number.NaN)).toThrowError(AmountParseError);
        expect(() => parseAmount(Number.MAX_SAFE_INTEGER + 1)).toThrowError(AmountParseError);
    });
    it('rejects ambiguous bare positive strings with a typed error', () => {
        expect(() => parseAmount('25')).toThrowError(AmountParseError);
        try {
            parseAmount('25');
        }
        catch (error) {
            expect(error).toMatchObject({ code: 'AMBIGUOUS_AMOUNT' });
        }
    });
    it('rejects malformed, negative, and unsafe string amounts', () => {
        for (const value of ['', 'abc', '-2rb', '1,2,3jt', '9007199254741jt']) {
            expect(() => parseAmount(value)).toThrowError(AmountParseError);
        }
        expect(() => parseAmount('abc')).toThrowError(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
    });
});
describe('formatIDR', () => {
    it('formats integer Rupiah with Indonesian grouping and no decimals', () => {
        expect(formatIDR(0)).toBe('Rp0');
        expect(formatIDR(1_250_000)).toBe('Rp1.250.000');
        expect(formatIDR(Number.MAX_SAFE_INTEGER)).toBe('Rp9.007.199.254.740.991');
    });
    it('rejects non-integer and unsafe values', () => {
        expect(() => formatIDR(1.5)).toThrowError(AmountParseError);
        expect(() => formatIDR(-1)).toThrowError(AmountParseError);
    });
});
