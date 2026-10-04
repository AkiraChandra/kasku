import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { accounts, auditLog, categories, idempotencyKeys, transactions } from '../db/schema/index.js'

export type AccountType = 'cash' | 'bank' | 'ewallet' | 'credit_card' | 'investment' | 'other'
export type FinanceTransactionType = 'income' | 'expense' | 'transfer'

export type AccountRow = {
  id: string
  userId: string
  name: string
  type: string
  institution?: string | null
  balance: number
  currency: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export type CategoryRow = {
  id: string
  userId: string | null
  name: string
  type: string
  icon?: string | null
  color?: string | null
  isArchived: boolean
  createdAt: string
}

export type TransactionRow = {
  id: string
  userId: string
  accountId: string
  categoryId: string | null
  type: FinanceTransactionType
  amount: number
  note: string | null
  date: string
  merchant: string | null
  parentId: string | null
  deletedAt: string | null
  createdAt: string
}

export type CreateTransactionInput = {
  accountId: string
  toAccountId?: string
  categoryId?: string
  type: FinanceTransactionType
  amount: number
  note?: string
  date?: string
  merchant?: string
}

export type IdempotencyRow = { response: unknown; statusCode: number; expiresAt: number }

export interface FinanceRepository {
  reset?(): void
  listAccounts(userId: string): Promise<AccountRow[]>
  createAccount(userId: string, input: { name: string; type: string; institution?: string; balance?: number }): Promise<AccountRow>
  archiveAccount(userId: string, id: string): Promise<boolean>
  listCategories(userId: string): Promise<CategoryRow[]>
  createCategory(userId: string, input: { name: string; type: string; icon?: string; color?: string }): Promise<CategoryRow>
  listTransactions(userId: string): Promise<TransactionRow[]>
  createTransaction(userId: string, input: CreateTransactionInput): Promise<TransactionRow | TransactionRow[]>
  deleteTransaction(userId: string, id: string): Promise<boolean>
  getIdempotency(userId: string, key: string): Promise<IdempotencyRow | null>
  saveIdempotency(userId: string, key: string, response: unknown, statusCode: number): Promise<void>
  audit(userId: string, action: string, entityType: string, entityId: string | null, changes?: unknown): Promise<void>
}

const now = () => new Date().toISOString()

const memoryAccounts = new Map<string, AccountRow>()
const memoryCategories = new Map<string, CategoryRow>()
const memoryTransactions = new Map<string, TransactionRow>()
const memoryIdempotency = new Map<string, IdempotencyRow>()
const memoryAudit: Array<{ userId: string; action: string; entityType: string; entityId: string | null; changes?: unknown }> = []

function scopedKey(userId: string, key: string) {
  return `${userId}:${key}`
}

export const inMemoryFinanceRepository: FinanceRepository = {
  reset() {
    memoryAccounts.clear()
    memoryCategories.clear()
    memoryTransactions.clear()
    memoryIdempotency.clear()
    memoryAudit.length = 0
  },

  async listAccounts(userId) {
    return [...memoryAccounts.values()].filter((row) => row.userId === userId && row.isArchived === false)
  },

  async createAccount(userId, input) {
    const timestamp = now()
    const row: AccountRow = {
      id: crypto.randomUUID(), userId, name: input.name, type: input.type,
      institution: input.institution ?? null, balance: input.balance ?? 0,
      currency: 'IDR', isArchived: false, createdAt: timestamp, updatedAt: timestamp,
    }
    memoryAccounts.set(row.id, row)
    return row
  },

  async archiveAccount(userId, id) {
    const row = memoryAccounts.get(id)
    if (!row || row.userId !== userId || row.isArchived) return false
    row.isArchived = true
    row.updatedAt = now()
    return true
  },

  async listCategories(userId) {
    return [...memoryCategories.values()].filter((row) => row.isArchived === false && (row.userId === null || row.userId === userId))
  },

  async createCategory(userId, input) {
    const row: CategoryRow = {
      id: crypto.randomUUID(), userId, name: input.name, type: input.type,
      icon: input.icon ?? null, color: input.color ?? null, isArchived: false, createdAt: now(),
    }
    memoryCategories.set(row.id, row)
    return row
  },

  async listTransactions(userId) {
    return [...memoryTransactions.values()]
      .filter((row) => row.userId === userId && row.deletedAt === null)
      .sort((a, b) => b.date.localeCompare(a.date))
  },

  async createTransaction(userId, input) {
    const account = memoryAccounts.get(input.accountId)
    if (!account || account.userId !== userId || account.isArchived) throw new Error('ACCOUNT_NOT_FOUND')
    if (input.categoryId) {
      const category = memoryCategories.get(input.categoryId)
      if (!category || category.isArchived || (category.userId !== null && category.userId !== userId)) throw new Error('CATEGORY_NOT_FOUND')
    }
    const timestamp = now()
    const date = input.date ? new Date(input.date).toISOString() : timestamp
    if (input.type === 'transfer') {
      const target = input.toAccountId ? memoryAccounts.get(input.toAccountId) : undefined
      if (!target || target.userId !== userId || target.isArchived || target.id === account.id) throw new Error('TARGET_ACCOUNT_REQUIRED')
      const firstId = crypto.randomUUID()
      const first: TransactionRow = {
        id: firstId, userId, accountId: account.id, categoryId: null, type: 'transfer', amount: input.amount,
        note: input.note ?? null, date, merchant: input.merchant ?? null, parentId: null, deletedAt: null, createdAt: timestamp,
      }
      const second: TransactionRow = {
        ...first, id: crypto.randomUUID(), accountId: target.id, parentId: firstId,
      }
      memoryTransactions.set(first.id, first)
      memoryTransactions.set(second.id, second)
      account.balance -= input.amount
      target.balance += input.amount
      account.updatedAt = target.updatedAt = timestamp
      return [first, second]
    }
    const row: TransactionRow = {
      id: crypto.randomUUID(), userId, accountId: account.id, categoryId: input.categoryId ?? null,
      type: input.type, amount: input.amount, note: input.note ?? null, date,
      merchant: input.merchant ?? null, parentId: null, deletedAt: null, createdAt: timestamp,
    }
    memoryTransactions.set(row.id, row)
    account.balance += input.type === 'income' ? input.amount : -input.amount
    account.updatedAt = timestamp
    return row
  },

  async deleteTransaction(userId, id) {
    const row = memoryTransactions.get(id)
    if (!row || row.userId !== userId || row.deletedAt !== null) return false
    const groupId = row.parentId ?? row.id
    const group = [...memoryTransactions.values()].filter((item) => item.id === groupId || item.parentId === groupId)
    for (const item of group) {
      if (item.deletedAt !== null) continue
      const account = memoryAccounts.get(item.accountId)
      if (account) {
        const delta = item.type === 'income' ? -item.amount : item.type === 'expense' ? item.amount : (item.id === groupId ? item.amount : -item.amount)
        account.balance += delta
        account.updatedAt = now()
      }
      item.deletedAt = now()
    }
    return true
  },

  async getIdempotency(userId, key) {
    const row = memoryIdempotency.get(scopedKey(userId, key))
    if (!row || row.expiresAt <= Date.now()) return null
    return row
  },

  async saveIdempotency(userId, key, response, statusCode) {
    memoryIdempotency.set(scopedKey(userId, key), { response, statusCode, expiresAt: Date.now() + 86_400_000 })
  },

  async audit(userId, action, entityType, entityId, changes) {
    memoryAudit.push({ userId, action, entityType, entityId, changes })
  },
}

function accountToRow(row: typeof accounts.$inferSelect): AccountRow {
  return {
    id: row.id, userId: row.userId, name: row.name, type: row.type, institution: row.institution,
    balance: Number(row.balance), currency: row.currency ?? 'IDR', isArchived: row.isArchived ?? false,
    createdAt: (row.createdAt ?? new Date(0)).toISOString(), updatedAt: (row.updatedAt ?? new Date(0)).toISOString(),
  }
}

function categoryToRow(row: typeof categories.$inferSelect): CategoryRow {
  return {
    id: row.id, userId: row.userId, name: row.name, type: row.type, icon: row.icon, color: row.color,
    isArchived: row.isArchived ?? false, createdAt: (row.createdAt ?? new Date(0)).toISOString(),
  }
}

function transactionToRow(row: typeof transactions.$inferSelect): TransactionRow {
  return {
    id: row.id, userId: row.userId, accountId: row.accountId, categoryId: row.categoryId,
    type: row.type as FinanceTransactionType, amount: Number(row.amount), note: row.note, date: row.date.toISOString(),
    merchant: row.merchant, parentId: row.parentId, deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: (row.createdAt ?? new Date(0)).toISOString(),
  }
}

export function createDatabaseFinanceRepository(pool: Pool): FinanceRepository {
  const db = drizzle(pool)
  return {
    async listAccounts(userId) {
      const rows = await db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.isArchived, false)))
      return rows.map(accountToRow)
    },
    async createAccount(userId, input) {
      const rows = await db.insert(accounts).values({ userId, name: input.name, type: input.type, institution: input.institution, balance: input.balance ?? 0 }).returning()
      return accountToRow(rows[0])
    },
    async archiveAccount(userId, id) {
      const rows = await db.update(accounts).set({ isArchived: true, updatedAt: new Date() }).where(and(eq(accounts.id, id), eq(accounts.userId, userId))).returning({ id: accounts.id })
      return rows.length > 0
    },
    async listCategories(userId) {
      const rows = await db.select().from(categories).where(and(eq(categories.isArchived, false), sql`(${categories.userId} IS NULL OR ${categories.userId} = ${userId})`))
      return rows.map(categoryToRow)
    },
    async createCategory(userId, input) {
      const rows = await db.insert(categories).values({ userId, name: input.name, type: input.type as any, icon: input.icon, color: input.color }).returning()
      return categoryToRow(rows[0])
    },
    async listTransactions(userId) {
      const rows = await db.select().from(transactions).where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt))).orderBy(desc(transactions.date))
      return rows.map(transactionToRow)
    },
    async createTransaction(userId, input) {
      return db.transaction(async (tx) => {
        const accountRows = await tx.select().from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId), eq(accounts.isArchived, false))).limit(1)
        const account = accountRows[0]
        if (!account) throw new Error('ACCOUNT_NOT_FOUND')
        if (input.categoryId) {
          const categoryRows = await tx.select().from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.isArchived, false), sql`(${categories.userId} IS NULL OR ${categories.userId} = ${userId})`)).limit(1)
          if (!categoryRows[0]) throw new Error('CATEGORY_NOT_FOUND')
        }
        const date = input.date ? new Date(input.date) : new Date()
        if (Number.isNaN(date.getTime())) throw new Error('INVALID_DATE')
        if (input.type === 'transfer') {
          if (!input.toAccountId || input.toAccountId === input.accountId) throw new Error('TARGET_ACCOUNT_REQUIRED')
          const targetRows = await tx.select().from(accounts).where(and(eq(accounts.id, input.toAccountId), eq(accounts.userId, userId), eq(accounts.isArchived, false))).limit(1)
          if (!targetRows[0]) throw new Error('TARGET_ACCOUNT_REQUIRED')
          const firstRows = await tx.insert(transactions).values({ userId, accountId: input.accountId, type: 'transfer', amount: input.amount, note: input.note, date, merchant: input.merchant }).returning()
          const first = firstRows[0]
          const secondRows = await tx.insert(transactions).values({ userId, accountId: input.toAccountId, type: 'transfer', amount: input.amount, note: input.note, date, merchant: input.merchant, parentId: first.id }).returning()
          await tx.update(accounts).set({ balance: sql`${accounts.balance} - ${input.amount}`, updatedAt: new Date() }).where(eq(accounts.id, input.accountId))
          await tx.update(accounts).set({ balance: sql`${accounts.balance} + ${input.amount}`, updatedAt: new Date() }).where(eq(accounts.id, input.toAccountId))
          return [transactionToRow(first), transactionToRow(secondRows[0])]
        }
        const rows = await tx.insert(transactions).values({ userId, accountId: input.accountId, categoryId: input.categoryId, type: input.type, amount: input.amount, note: input.note, date, merchant: input.merchant }).returning()
        const delta = input.type === 'income' ? input.amount : -input.amount
        await tx.update(accounts).set({ balance: sql`${accounts.balance} + ${delta}`, updatedAt: new Date() }).where(eq(accounts.id, input.accountId))
        return transactionToRow(rows[0])
      })
    },
    async deleteTransaction(userId, id) {
      return db.transaction(async (tx) => {
        const rows = await tx.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId), isNull(transactions.deletedAt))).limit(1)
        const row = rows[0]
        if (!row) return false
        const groupId = row.parentId ?? row.id
        const group = await tx.select().from(transactions).where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt), sql`(${transactions.id} = ${groupId} OR ${transactions.parentId} = ${groupId})`))
        for (const item of group) {
          const delta = item.type === 'income' ? -Number(item.amount) : item.type === 'expense' ? Number(item.amount) : (item.id === groupId ? Number(item.amount) : -Number(item.amount))
          await tx.update(accounts).set({ balance: sql`${accounts.balance} + ${delta}`, updatedAt: new Date() }).where(eq(accounts.id, item.accountId))
        }
        await tx.update(transactions).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt), sql`(${transactions.id} = ${groupId} OR ${transactions.parentId} = ${groupId})`))
        return true
      })
    },
    async getIdempotency(userId, key) {
      const rows = await db.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key))).limit(1)
      const row = rows[0]
      if (!row || !row.response || !row.statusCode || !row.expiresAt || row.expiresAt <= new Date()) return null
      return { response: row.response, statusCode: row.statusCode, expiresAt: row.expiresAt.getTime() }
    },
    async saveIdempotency(userId, key, response, statusCode) {
      await db.insert(idempotencyKeys).values({ userId, key, response, statusCode, expiresAt: new Date(Date.now() + 86_400_000) }).onConflictDoUpdate({ target: [idempotencyKeys.userId, idempotencyKeys.key], set: { response, statusCode, expiresAt: new Date(Date.now() + 86_400_000) } })
    },
    async audit(userId, action, entityType, entityId, changes) {
      await db.insert(auditLog).values({ userId, action, entityType, entityId, changes })
    },
  }
}
