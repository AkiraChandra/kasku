export class AmountParseError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'AmountParseError';
        this.code = code;
    }
}
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const SLANG_AMOUNTS = {
    goceng: 5000n,
    ceban: 10000n,
    noban: 20000n,
    gocap: 50000n,
    cepe: 100000n,
};
const UNITS = {
    k: 1000n,
    rb: 1000n,
    ribu: 1000n,
    jt: 1000000n,
    juta: 1000000n,
};
function invalid(message) {
    throw new AmountParseError('INVALID_AMOUNT', message);
}
function finish(amount) {
    if (amount < 0n || amount > MAX_SAFE_BIGINT) {
        return invalid('Jumlah di luar rentang Rupiah yang aman');
    }
    return Number(amount);
}
function parseNumber(value) {
    if (!Number.isSafeInteger(value) || value < 0) {
        return invalid('Jumlah harus bilangan bulat Rupiah yang aman dan tidak negatif');
    }
    return value;
}
function parseUnitAmount(value, unit) {
    const match = /^(\d+)(?:,(\d+))?$/.exec(value);
    if (!match)
        return invalid('Format jumlah tidak valid');
    const whole = BigInt(match[1]);
    const fraction = match[2] ?? '';
    const denominator = 10n ** BigInt(fraction.length);
    const numerator = whole * denominator + (fraction ? BigInt(fraction) : 0n);
    const product = numerator * unit;
    if (product % denominator !== 0n) {
        return invalid('Jumlah menghasilkan pecahan Rupiah');
    }
    return finish(product / denominator);
}
export function parseAmount(value) {
    if (typeof value === 'number')
        return parseNumber(value);
    if (typeof value !== 'string')
        return invalid('Jumlah harus teks atau angka');
    const normalized = value.trim().toLowerCase().replace(/^rp\s*/, '').replace(/\s+/g, '');
    if (!normalized)
        return invalid('Jumlah tidak boleh kosong');
    if (SLANG_AMOUNTS[normalized] !== undefined)
        return finish(SLANG_AMOUNTS[normalized]);
    if (normalized === 'setengahjuta')
        return 500_000;
    const unitMatch = /^(.*?)(k|rb|ribu|jt|juta)$/.exec(normalized);
    if (unitMatch)
        return parseUnitAmount(unitMatch[1], UNITS[unitMatch[2]]);
    if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
        return finish(BigInt(normalized.replaceAll('.', '')));
    }
    if (/^\d+$/.test(normalized)) {
        if (normalized === '0')
            return 0;
        throw new AmountParseError('AMBIGUOUS_AMOUNT', 'Jumlah tanpa satuan tidak jelas; gunakan rb, jt, atau format Rupiah');
    }
    return invalid('Format jumlah tidak valid');
}
export function formatIDR(amount) {
    parseNumber(amount);
    return `Rp${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}
