export type Bank = 'bca' | 'mandiri';
export type ParsedRow = {
    occurred_at: string;
    merchant: string;
    amount: number;
    type: 'income' | 'expense';
    source_ref: string;
};
export declare function detectBank(headers: string[]): Bank;
export declare function parseBankCsv(input: string, bank?: Bank): ParsedRow[];
export declare const parseCsv: typeof parseBankCsv;
