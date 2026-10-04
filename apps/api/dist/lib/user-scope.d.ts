type Owned = {
    userId: string;
};
/** In-memory filter for user-scoped records when no DB is available. */
export declare function filterByUserId<T extends Owned>(records: T[], userId: string): T[];
export {};
