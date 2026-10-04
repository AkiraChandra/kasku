export type AmountErrorCode = 'AMBIGUOUS_AMOUNT' | 'INVALID_AMOUNT';
export declare class AmountParseError extends Error {
    readonly code: AmountErrorCode;
    constructor(code: AmountErrorCode, message: string);
}
export declare function parseAmount(value: string | number): number;
export declare function formatIDR(amount: number): string;
