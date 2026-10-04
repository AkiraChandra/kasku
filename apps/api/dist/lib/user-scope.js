/** In-memory filter for user-scoped records when no DB is available. */
export function filterByUserId(records, userId) {
    return records.filter((r) => r.userId === userId);
}
