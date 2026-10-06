const REQUIRED_HEADERS = ['tanggal', 'keterangan', 'jumlah', 'saldo'];
function normalizeHeader(value) {
    return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_/-]+/g, '');
}
function parseCsvRows(input) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < input.length; i += 1) {
        const char = input[i];
        if (quoted) {
            if (char === '"' && input[i + 1] === '"') {
                field += '"';
                i += 1;
            }
            else if (char === '"') {
                quoted = false;
            }
            else {
                field += char;
            }
        }
        else if (char === '"' && field.length === 0) {
            quoted = true;
        }
        else if (char === ',' || char === ';' || char === '\t') {
            row.push(field.trim());
            field = '';
        }
        else if (char === '\n' || char === '\r') {
            if (char === '\r' && input[i + 1] === '\n')
                i += 1;
            row.push(field.trim());
            if (row.some(value => value !== ''))
                rows.push(row);
            row = [];
            field = '';
        }
        else {
            field += char;
        }
    }
    if (field !== '' || row.length > 0) {
        row.push(field.trim());
        if (row.some(value => value !== ''))
            rows.push(row);
    }
    if (quoted)
        throw new Error('CSV tidak valid: tanda kutip tidak ditutup');
    return rows;
}
export function detectBank(headers) {
    const normalized = headers.map(normalizeHeader);
    if (!REQUIRED_HEADERS.every(header => normalized.includes(header))) {
        throw new Error('Kolom CSV tidak dikenali: wajib ada Tanggal, Keterangan, Jumlah, dan Saldo');
    }
    if (normalized.includes('dk'))
        return 'bca';
    if (normalized.includes('jenis'))
        return 'mandiri';
    throw new Error('Bank tidak dikenali: kolom D/K atau Jenis tidak ditemukan');
}
function parseDate(value) {
    const normalized = value.trim();
    let match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(normalized);
    if (match) {
        const [, day, month, year] = match;
        return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString();
    }
    match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(normalized);
    if (match) {
        const [, year, month, day] = match;
        return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString();
    }
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime()))
        throw new Error(`Tanggal tidak valid: ${value}`);
    return date.toISOString();
}
function parseAmount(value) {
    const normalized = value.trim().replace(/^rp\s*/i, '').replace(/\s/g, '');
    if (!normalized)
        throw new Error('Jumlah tidak boleh kosong');
    const digits = normalized.replace(/[^0-9,.-]/g, '');
    const number = digits.includes('.') && digits.includes(',')
        ? Number(digits.replace(/\./g, '').replace(',', '.'))
        : /\.\d{1,2}$/.test(digits)
            ? Number(digits)
            : Number(digits.replace(/[.,]/g, ''));
    if (!Number.isSafeInteger(number) || number === 0 && !/^[-+]?0(?:[.,]0+)?$/.test(digits)) {
        throw new Error(`Jumlah tidak valid: ${value}`);
    }
    return Math.abs(number);
}
function transactionType(value, bank) {
    const normalized = value.trim().toLowerCase();
    if (bank === 'bca') {
        if (['k', 'kredit', 'credit', 'cr'].includes(normalized))
            return 'income';
        if (['d', 'debit', 'db'].includes(normalized))
            return 'expense';
    }
    else {
        if (['k', 'kredit', 'credit', 'cr', 'c'].includes(normalized))
            return 'income';
        if (['d', 'debit', 'db', 'dr'].includes(normalized))
            return 'expense';
    }
    throw new Error(`Jenis transaksi tidak valid: ${value}`);
}
export function parseBankCsv(input, bank) {
    const rows = parseCsvRows(input);
    if (rows.length < 2)
        return [];
    const headers = rows[0].map(normalizeHeader);
    const detectedBank = bank ?? detectBank(rows[0]);
    const column = (name) => {
        const index = headers.indexOf(name);
        if (index < 0)
            throw new Error(`Kolom CSV tidak ditemukan: ${name}`);
        return index;
    };
    const dateIndex = column('tanggal');
    const merchantIndex = column('keterangan');
    const amountIndex = column('jumlah');
    const typeIndex = column(detectedBank === 'bca' ? 'dk' : 'jenis');
    return rows.slice(1).flatMap((row, index) => {
        if (row.every(value => value === ''))
            return [];
        const date = row[dateIndex]?.trim() ?? '';
        const merchant = row[merchantIndex]?.trim() ?? '';
        const amount = row[amountIndex]?.trim() ?? '';
        const kind = row[typeIndex]?.trim() ?? '';
        if (!date && !merchant && !amount && !kind)
            return [];
        if (!date || !amount || !kind)
            throw new Error(`Baris ${index + 2} tidak lengkap`);
        return [{
                occurred_at: parseDate(date),
                merchant,
                amount: parseAmount(amount),
                type: transactionType(kind, detectedBank),
                source_ref: `${detectedBank}:${index + 1}`,
            }];
    });
}
export const parseCsv = parseBankCsv;
