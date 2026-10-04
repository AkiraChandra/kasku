export declare const SESSION_TOKEN_BYTES = 32;
export declare function hashPassword(password: string): Promise<string>;
export declare function verifyPassword(hash_: string, password: string): Promise<boolean>;
export declare function generateSessionToken(): string;
export declare function hashToken(token: string): string;
