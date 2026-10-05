import { and, desc, eq, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { bills, billOccurrences } from '../db/schema/index.js';
// ── In-memory store ──────────────────────────────────────────────────────────
const memoryBills = new Map();
const memoryOccurrences = new Map();
function ts() { return new Date().toISOString(); }
function computeDueDate(recurrence, dueDay, baseDate) {
    const d = new Date(baseDate);
    if (recurrence === 'weekly')
        d.setUTCDate(d.getUTCDate() + 7);
    else if (recurrence === 'monthly')
        d.setUTCMonth(d.getUTCMonth() + 1);
    else if (recurrence === 'quarterly')
        d.setUTCMonth(d.getUTCMonth() + 3);
    else
        d.setUTCFullYear(d.getUTCFullYear() + 1);
    if (dueDay !== null)
        d.setUTCDate(Math.min(dueDay, 28));
    return d;
}
function getBillOccurrences(bill, days, existingDates) {
    const now = new Date();
    const results = [];
    let cursor = new Date(now);
    // start from bill's last updated or now
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    let count = 0;
    while (count < days + 5) {
        const next = computeDueDate(bill.recurrence, bill.dueDay, cursor);
        if (next > now) {
            const dateKey = next.toISOString().slice(0, 10);
            if (!existingDates.has(dateKey)) {
                results.push({
                    id: crypto.randomUUID(),
                    userId: bill.userId,
                    billId: bill.id,
                    dueDate: next.toISOString(),
                    expectedAmount: bill.amount,
                    status: 'upcoming',
                    transactionId: null,
                    paidDate: null,
                    createdAt: ts(),
                    billName: bill.name,
                    billAmount: bill.amount,
                    billCategoryId: bill.categoryId,
                    billAccountId: bill.accountId,
                });
                if (results.length >= days)
                    break;
            }
        }
        cursor.setTime(next.getTime());
        count++;
    }
    return results;
}
export const inMemoryBillsRepository = {
    reset() {
        memoryBills.clear();
        memoryOccurrences.clear();
    },
    async listBills(userId) {
        return [...memoryBills.values()]
            .filter(b => b.userId === userId && b.isActive)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async createBill(userId, input) {
        if (input.amount < 0)
            throw new Error('INVALID_AMOUNT');
        const now = ts();
        const dueDay = input.dueDay ?? null;
        const row = {
            id: crypto.randomUUID(),
            userId,
            name: input.name,
            categoryId: input.categoryId ?? null,
            accountId: input.accountId ?? null,
            amountType: input.amountType ?? 'fixed',
            amount: input.amount,
            recurrence: input.recurrence,
            dueDay,
            reminderDaysBefore: input.reminderDaysBefore ?? [3, 1, 0],
            isActive: true,
            notes: input.notes ?? null,
            createdAt: now,
            updatedAt: now,
        };
        memoryBills.set(row.id, row);
        return row;
    },
    async getBill(userId, id) {
        const b = memoryBills.get(id);
        return b?.userId === userId ? b : null;
    },
    async updateBill(userId, id, input) {
        const b = memoryBills.get(id);
        if (!b || b.userId !== userId)
            throw new Error('BILL_NOT_FOUND');
        const updated = {
            ...b,
            name: input.name ?? b.name,
            categoryId: input.categoryId !== undefined ? input.categoryId : b.categoryId,
            accountId: input.accountId !== undefined ? input.accountId : b.accountId,
            amountType: input.amountType ?? b.amountType,
            amount: input.amount ?? b.amount,
            recurrence: input.recurrence ?? b.recurrence,
            dueDay: input.dueDay !== undefined ? input.dueDay : b.dueDay,
            reminderDaysBefore: input.reminderDaysBefore ?? b.reminderDaysBefore,
            isActive: input.isActive ?? b.isActive,
            notes: input.notes !== undefined ? input.notes : b.notes,
            updatedAt: ts(),
        };
        memoryBills.set(id, updated);
        return updated;
    },
    async deleteBill(userId, id) {
        const b = memoryBills.get(id);
        if (!b || b.userId !== userId)
            return false;
        memoryBills.delete(id);
        return true;
    },
    async listOccurrences(userId, billId) {
        const b = memoryBills.get(billId);
        if (!b || b.userId !== userId)
            return [];
        return [...memoryOccurrences.values()]
            .filter(o => o.userId === userId && o.billId === billId)
            .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
    },
    async generateOccurrences(userId, billId, days = 35) {
        const b = memoryBills.get(billId);
        if (!b || b.userId !== userId)
            throw new Error('BILL_NOT_FOUND');
        const existing = [...memoryOccurrences.values()].filter(o => o.billId === billId);
        const existingDates = new Set(existing.map(o => o.dueDate.slice(0, 10)));
        const newOnes = getBillOccurrences(b, days, existingDates);
        for (const occ of newOnes) {
            memoryOccurrences.set(occ.id, occ);
        }
        return [...memoryOccurrences.values()]
            .filter(o => o.billId === billId)
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    },
    async getUpcoming(userId, days) {
        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setUTCDate(cutoff.getUTCDate() + days);
        const userBills = [...memoryBills.values()].filter(b => b.userId === userId && b.isActive);
        // generate for each bill
        const results = [];
        for (const bill of userBills) {
            const existing = [...memoryOccurrences.values()].filter(o => o.billId === bill.id);
            const existingDates = new Set(existing.map(o => o.dueDate.slice(0, 10)));
            const generated = getBillOccurrences(bill, days, existingDates);
            for (const occ of generated) {
                const d = new Date(occ.dueDate);
                if (d <= cutoff) {
                    memoryOccurrences.set(occ.id, occ);
                    results.push(occ);
                }
            }
        }
        return results.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    },
    async markPaid(userId, billId, occurrenceId, input) {
        const occ = memoryOccurrences.get(occurrenceId);
        if (!occ || occ.userId !== userId || occ.billId !== billId)
            throw new Error('OCCURRENCE_NOT_FOUND');
        const now = ts();
        const updated = {
            ...occ,
            status: 'paid',
            transactionId: input?.transactionId ?? occ.transactionId,
            paidDate: input?.paidDate ?? now,
        };
        memoryOccurrences.set(occurrenceId, updated);
        return updated;
    },
    async markSkipped(userId, billId, occurrenceId) {
        const occ = memoryOccurrences.get(occurrenceId);
        if (!occ || occ.userId !== userId || occ.billId !== billId)
            throw new Error('OCCURRENCE_NOT_FOUND');
        const updated = {
            ...occ,
            status: 'skipped',
        };
        memoryOccurrences.set(occurrenceId, updated);
        return updated;
    },
};
// ── Drizzle implementation ────────────────────────────────────────────────────
function billRowToRow(row) {
    return {
        id: row.id,
        userId: row.userId,
        name: row.name,
        categoryId: row.categoryId ?? null,
        accountId: row.accountId ?? null,
        amountType: row.amountType ?? 'fixed',
        amount: Number(row.amount),
        recurrence: row.recurrence ?? 'monthly',
        dueDay: row.dueDay ?? null,
        reminderDaysBefore: row.reminderDaysBefore ?? [3, 1, 0],
        isActive: row.isActive ?? true,
        notes: row.notes ?? null,
        createdAt: (row.createdAt ?? new Date(0)).toISOString(),
        updatedAt: (row.updatedAt ?? new Date(0)).toISOString(),
    };
}
function occRowToRow(row, billName, billAmount, billCategoryId, billAccountId) {
    return {
        id: row.id,
        userId: row.userId,
        billId: row.billId,
        dueDate: (row.dueDate ?? new Date(0)).toISOString(),
        expectedAmount: Number(row.expectedAmount),
        status: row.status ?? 'upcoming',
        transactionId: row.transactionId ?? null,
        paidDate: (row.paidDate ?? null) ? row.paidDate.toISOString() : null,
        createdAt: (row.createdAt ?? new Date(0)).toISOString(),
        billName,
        billAmount,
        billCategoryId,
        billAccountId,
    };
}
function dueDateFromRecurrence(recurrence, dueDay, base) {
    const d = new Date(base);
    if (recurrence === 'weekly')
        d.setUTCDate(d.getUTCDate() + 7);
    else if (recurrence === 'monthly')
        d.setUTCMonth(d.getUTCMonth() + 1);
    else if (recurrence === 'quarterly')
        d.setUTCMonth(d.getUTCMonth() + 3);
    else
        d.setUTCFullYear(d.getUTCFullYear() + 1);
    if (dueDay !== null)
        d.setUTCDate(Math.min(dueDay, 28));
    return d;
}
export function createDatabaseBillsRepository(pool) {
    const db = drizzle(pool);
    return {
        async listBills(userId) {
            const rows = await db.select().from(bills).where(and(eq(bills.userId, userId), eq(bills.isActive, true))).orderBy(desc(bills.createdAt));
            return rows.map(billRowToRow);
        },
        async createBill(userId, input) {
            const rows = await db.insert(bills).values({
                userId,
                name: input.name,
                categoryId: input.categoryId ?? null,
                accountId: input.accountId ?? null,
                amountType: input.amountType ?? 'fixed',
                amount: input.amount,
                recurrence: input.recurrence,
                dueDay: input.dueDay ?? null,
                reminderDaysBefore: input.reminderDaysBefore ?? [3, 1, 0],
                notes: input.notes ?? null,
            }).returning();
            return billRowToRow(rows[0]);
        },
        async getBill(userId, id) {
            const rows = await db.select().from(bills).where(and(eq(bills.id, id), eq(bills.userId, userId))).limit(1);
            return rows[0] ? billRowToRow(rows[0]) : null;
        },
        async updateBill(userId, id, input) {
            const existing = await db.select().from(bills).where(and(eq(bills.id, id), eq(bills.userId, userId))).limit(1);
            if (!existing[0])
                throw new Error('BILL_NOT_FOUND');
            const setCols = { updatedAt: new Date() };
            if (input.name !== undefined)
                setCols.name = input.name;
            if (input.categoryId !== undefined)
                setCols.categoryId = input.categoryId;
            if (input.accountId !== undefined)
                setCols.accountId = input.accountId;
            if (input.amountType !== undefined)
                setCols.amountType = input.amountType;
            if (input.amount !== undefined)
                setCols.amount = input.amount;
            if (input.recurrence !== undefined)
                setCols.recurrence = input.recurrence;
            if (input.dueDay !== undefined)
                setCols.dueDay = input.dueDay;
            if (input.reminderDaysBefore !== undefined)
                setCols.reminderDaysBefore = input.reminderDaysBefore;
            if (input.isActive !== undefined)
                setCols.isActive = input.isActive;
            if (input.notes !== undefined)
                setCols.notes = input.notes;
            const updated = await db.update(bills).set(setCols)
                .where(and(eq(bills.id, id), eq(bills.userId, userId))).returning();
            return billRowToRow(updated[0]);
        },
        async deleteBill(userId, id) {
            const rows = await db.update(bills).set({ isActive: false, updatedAt: new Date() })
                .where(and(eq(bills.id, id), eq(bills.userId, userId))).returning({ id: bills.id });
            return rows.length > 0;
        },
        async listOccurrences(userId, billId) {
            const rows = await db.select().from(billOccurrences).where(and(eq(billOccurrences.userId, userId), eq(billOccurrences.billId, billId))).orderBy(desc(billOccurrences.dueDate));
            return rows.map(r => occRowToRow(r));
        },
        async generateOccurrences(userId, billId, days = 35) {
            const billRows = await db.select().from(bills).where(and(eq(bills.id, billId), eq(bills.userId, userId))).limit(1);
            if (!billRows[0])
                throw new Error('BILL_NOT_FOUND');
            const bill = billRowToRow(billRows[0]);
            const now = new Date();
            const cutoff = new Date(now);
            cutoff.setUTCDate(cutoff.getUTCDate() + days);
            // Find existing occurrence dates for this bill
            const existingRows = await db.select({ dueDate: billOccurrences.dueDate }).from(billOccurrences)
                .where(eq(billOccurrences.billId, billId));
            const existingDates = new Set(existingRows.map(r => r.dueDate.toISOString().slice(0, 10)));
            const newOccurrences = [];
            let cursor = new Date(now);
            cursor.setUTCDate(cursor.getUTCDate() - 1);
            let count = 0;
            while (count < days + 10) {
                const next = dueDateFromRecurrence(bill.recurrence, bill.dueDay, cursor);
                if (next > now) {
                    const dateKey = next.toISOString().slice(0, 10);
                    if (!existingDates.has(dateKey) && next <= cutoff) {
                        newOccurrences.push({
                            userId,
                            billId,
                            dueDate: next,
                            expectedAmount: bill.amount,
                            status: 'upcoming',
                        });
                    }
                }
                cursor.setTime(next.getTime());
                count++;
            }
            if (newOccurrences.length > 0) {
                await db.insert(billOccurrences).values(newOccurrences);
            }
            const allRows = await db.select().from(billOccurrences).where(eq(billOccurrences.billId, billId)).orderBy(billOccurrences.dueDate);
            return allRows.map(r => occRowToRow(r));
        },
        async getUpcoming(userId, days) {
            const now = new Date();
            const cutoff = new Date(now);
            cutoff.setUTCDate(cutoff.getUTCDate() + days);
            const billRows = await db.select().from(bills).where(and(eq(bills.userId, userId), eq(bills.isActive, true)));
            const results = [];
            for (const bill of billRows) {
                const existingRows = await db.select({ dueDate: billOccurrences.dueDate }).from(billOccurrences)
                    .where(and(eq(billOccurrences.billId, bill.id), lte(billOccurrences.dueDate, cutoff)));
                const existingDates = new Set(existingRows.map(r => r.dueDate.toISOString().slice(0, 10)));
                let cursor = new Date(now);
                cursor.setUTCDate(cursor.getUTCDate() - 1);
                let count = 0;
                while (count < days + 10) {
                    const next = dueDateFromRecurrence(bill.recurrence ?? 'monthly', bill.dueDay ?? null, cursor);
                    if (next > now && next <= cutoff) {
                        const dateKey = next.toISOString().slice(0, 10);
                        if (!existingDates.has(dateKey)) {
                            await db.insert(billOccurrences).values({
                                userId,
                                billId: bill.id,
                                dueDate: next,
                                expectedAmount: Number(bill.amount),
                                status: 'upcoming',
                            });
                        }
                    }
                    cursor.setTime(next.getTime());
                    count++;
                }
                const occs = await db.select().from(billOccurrences).where(and(eq(billOccurrences.billId, bill.id), lte(billOccurrences.dueDate, cutoff))).orderBy(billOccurrences.dueDate);
                for (const occ of occs) {
                    results.push(occRowToRow(occ, bill.name, Number(bill.amount), bill.categoryId ?? null, bill.accountId ?? null));
                }
            }
            return results.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        },
        async markPaid(userId, billId, occurrenceId, input) {
            const occRows = await db.select().from(billOccurrences).where(and(eq(billOccurrences.id, occurrenceId), eq(billOccurrences.userId, userId), eq(billOccurrences.billId, billId))).limit(1);
            if (!occRows[0])
                throw new Error('OCCURRENCE_NOT_FOUND');
            const now = new Date();
            const updated = await db.update(billOccurrences).set({
                status: 'paid',
                transactionId: input?.transactionId ?? occRows[0].transactionId,
                paidDate: input?.paidDate ? new Date(input.paidDate) : now,
            }).where(and(eq(billOccurrences.id, occurrenceId), eq(billOccurrences.userId, userId))).returning();
            return occRowToRow(updated[0]);
        },
        async markSkipped(userId, billId, occurrenceId) {
            const occRows = await db.select().from(billOccurrences).where(and(eq(billOccurrences.id, occurrenceId), eq(billOccurrences.userId, userId), eq(billOccurrences.billId, billId))).limit(1);
            if (!occRows[0])
                throw new Error('OCCURRENCE_NOT_FOUND');
            const updated = await db.update(billOccurrences).set({ status: 'skipped' })
                .where(and(eq(billOccurrences.id, occurrenceId), eq(billOccurrences.userId, userId))).returning();
            return occRowToRow(updated[0]);
        },
    };
}
