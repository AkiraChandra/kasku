/**
 * Reports: summary, category-breakdown, cashflow, export (CSV streaming).
 * No new dependencies — pure in-memory + SQL via the existing pool.
 */

import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { and, eq, gte, lte, isNull, desc, sql, lt, or } from 'drizzle-orm'
import {
  transactions, accounts, categories, debts, assets, networthSnapshots,
} from '../db/schema/index.js'
import { formatIDR } from './money.js'

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

function periodStart(date: Date, period: ReportPeriod, monthStartDay = 1): Date {
  if (period === 'monthly') {
    const day = monthStartDay
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), day))
    if (date < start) start.setUTCMonth(start.getUTCMonth() - 1)
    return start
  }
  if (period === 'quarterly') {
    const q = Math.floor(date.getUTCMonth() / 3)
    return new Date(Date.UTC(date.getUTCFullYear(), q * 3, 1))
  }
  if (period === 'yearly') {
    return new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  }
  // weekly: Monday
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() + 1)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function periodEnd(period: ReportPeriod, start: Date): Date {
  const end = new Date(start)
  if (period === 'daily') end.setUTCDate(end.getUTCDate() + 1)
  else if (period === 'weekly') end.setUTCDate(end.getUTCDate() + 7)
  else if (period === 'monthly') end.setUTCMonth(end.getUTCMonth() + 1)
  else if (period === 'quarterly') end.setUTCMonth(end.getUTCMonth() + 3)
  else end.setUTCFullYear(end.getUTCFullYear() + 1)
  return end
}

export interface ReportSummary {
  period: { from: string; to: string; label: string }
  income: number
  expense: number
  net: number
  transactionCount: number
  topExpenseCategory: string | null
  topExpenseAmount: number | null
  savingsRate: number
}

export interface CategoryBreakdownItem {
  id: string | null
  name: string
  type: 'income' | 'expense'
  amount: number
  percentage: number
  transactionCount: number
}

export interface CashflowRow {
  label: string
  income: number
  expense: number
  net: number
}

export interface CashflowReport {
  period: ReportPeriod
  totalIncome: number
  totalExpense: number
  net: number
  rows: CashflowRow[]
}

export interface InsightItem {
  kind: 'top_category_change' | 'highest_spend_day' | 'unusual_transaction'
  label: string
  detail: string
  amount?: number
}

export async function buildReportSummary(
  pool: Pool,
  userId: string,
  period: ReportPeriod,
): Promise<ReportSummary> {
  const db = drizzle(pool)
  const now = new Date()
  const pStart = periodStart(now, period)
  const pEnd = periodEnd(period, pStart)

  const rows = await db.select().from(transactions).where(
    and(
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
      gte(transactions.date, pStart),
      lt(transactions.date, pEnd),
    )
  )

  const income = rows.filter(r => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0)
  const expense = rows.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0)

  // Top expense category
  const expenseByCategory = new Map<string, number>()
  for (const r of rows.filter(r => r.type === 'expense')) {
    const catId = r.categoryId ?? 'null'
    expenseByCategory.set(catId, (expenseByCategory.get(catId) ?? 0) + Number(r.amount))
  }
  let topCatId: string | null = null
  let topCatAmt = 0
  for (const [id, amt] of expenseByCategory) {
    if (amt > topCatAmt) { topCatAmt = amt; topCatId = id }
  }
  let topCatName: string | null = null
  if (topCatId && topCatId !== 'null') {
    const [cat] = await db.select({ name: categories.name }).from(categories).where(eq(categories.id, topCatId)).limit(1)
    topCatName = cat?.name ?? null
  }

  return {
    period: {
      from: pStart.toISOString(),
      to: pEnd.toISOString(),
      label: formatPeriodLabel(period, pStart),
    },
    income,
    expense,
    net: income - expense,
    transactionCount: rows.length,
    topExpenseCategory: topCatName,
    topExpenseAmount: topCatAmt || null,
    savingsRate: income === 0 ? 0 : Math.round(((income - expense) / income) * 100),
  }
}

export async function buildCategoryBreakdown(
  pool: Pool,
  userId: string,
  period: ReportPeriod,
): Promise<{ income: CategoryBreakdownItem[]; expense: CategoryBreakdownItem[]; total: { income: number; expense: number } }> {
  const db = drizzle(pool)
  const now = new Date()
  const pStart = periodStart(now, period)
  const pEnd = periodEnd(period, pStart)

  const rows = await db.select({
    categoryId: transactions.categoryId,
    type: transactions.type,
    amount: transactions.amount,
  }).from(transactions).where(
    and(
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
      gte(transactions.date, pStart),
      lt(transactions.date, pEnd),
    )
  )

  const catRows = await db.select().from(categories).where(
    or(eq(categories.userId, userId), sql`${categories.userId} IS NULL`)
  )
  const catById = new Map(catRows.map(c => [c.id, c.name]))

  const incomeMap = new Map<string, { amount: number; count: number }>()
  const expenseMap = new Map<string, { amount: number; count: number }>()
  for (const r of rows) {
    const id = r.categoryId ?? 'null'
    const name = r.categoryId ? (catById.get(r.categoryId) ?? 'Lainnya') : 'Lainnya'
    if (r.type === 'income') {
      const e = incomeMap.get(id) ?? { amount: 0, count: 0 }
      incomeMap.set(id, { amount: e.amount + Number(r.amount), count: e.count + 1 })
    } else if (r.type === 'expense') {
      const e = expenseMap.get(id) ?? { amount: 0, count: 0 }
      expenseMap.set(id, { amount: e.amount + Number(r.amount), count: e.count + 1 })
    }
  }

  const totalIncome = [...incomeMap.values()].reduce((s, v) => s + v.amount, 0)
  const totalExpense = [...expenseMap.values()].reduce((s, v) => s + v.amount, 0)

  const mapToItems = (m: Map<string, { amount: number; count: number }>, type: 'income' | 'expense'): CategoryBreakdownItem[] =>
    [...m.entries()]
      .map(([id, v]) => ({
        id: id === 'null' ? null : id,
        name: id === 'null' ? 'Lainnya' : (catById.get(id) ?? 'Lainnya'),
        type,
        amount: v.amount,
        percentage: (type === 'income' ? totalIncome : totalExpense) === 0 ? 0
          : Math.round((v.amount * 100) / (type === 'income' ? totalIncome : totalExpense)),
        transactionCount: v.count,
      }))
      .sort((a, b) => b.amount - a.amount)

  return {
    income: mapToItems(incomeMap, 'income'),
    expense: mapToItems(expenseMap, 'expense'),
    total: { income: totalIncome, expense: totalExpense },
  }
}

export async function buildCashflowReport(
  pool: Pool,
  userId: string,
  period: ReportPeriod,
): Promise<CashflowReport> {
  const db = drizzle(pool)
  const now = new Date()
  const pStart = periodStart(now, period)
  const pEnd = periodEnd(period, pStart)

  // Group by sub-periods within the selected period
  const buckets: Map<string, { income: number; expense: number }> = new Map()
  const step = period === 'monthly' ? 7 : period === 'quarterly' ? 14 : period === 'yearly' ? 30 : 1
  const labelFormat = period === 'daily' ? 'date' : period === 'weekly' ? 'week' : 'month'

  let cursor = new Date(pStart)
  while (cursor < pEnd) {
    const key = cursor.toISOString().slice(0, 10)
    buckets.set(key, { income: 0, expense: 0 })
    cursor.setUTCDate(cursor.getUTCDate() + step)
  }

  const rows = await db.select({ date: transactions.date, type: transactions.type, amount: transactions.amount })
    .from(transactions).where(
      and(eq(transactions.userId, userId), isNull(transactions.deletedAt),
        gte(transactions.date, pStart), lt(transactions.date, pEnd))
    )

  for (const r of rows) {
    const key = new Date(r.date).toISOString().slice(0, 10)
    const bucket = buckets.get(key)
    if (bucket) {
      if (r.type === 'income') bucket.income += Number(r.amount)
      else if (r.type === 'expense') bucket.expense += Number(r.amount)
    }
  }

  const rows_out: CashflowRow[] = [...buckets.entries()].map(([label, v]) => ({
    label,
    income: v.income,
    expense: v.expense,
    net: v.income - v.expense,
  }))

  return {
    period,
    totalIncome: rows_out.reduce((s, r) => s + r.income, 0),
    totalExpense: rows_out.reduce((s, r) => s + r.expense, 0),
    net: rows_out.reduce((s, r) => s + r.net, 0),
    rows: rows_out,
  }
}

export async function buildInsights(
  pool: Pool,
  userId: string,
  period: ReportPeriod,
): Promise<InsightItem[]> {
  const db = drizzle(pool)
  const now = new Date()
  const pStart = periodStart(now, period)
  const pEnd = periodEnd(period, pStart)

  const rows = await db.select({
    date: transactions.date, type: transactions.type,
    amount: transactions.amount, categoryId: transactions.categoryId, merchant: transactions.merchant,
  }).from(transactions).where(
    and(eq(transactions.userId, userId), isNull(transactions.deletedAt),
      gte(transactions.date, pStart), lt(transactions.date, pEnd))
  )

  const insights: InsightItem[] = []

  // Highest spend day
  const byDay = new Map<string, number>()
  for (const r of rows.filter(r => r.type === 'expense')) {
    const day = new Date(r.date).toISOString().slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + Number(r.amount))
  }
  let topDay = ''
  let topDayAmt = 0
  for (const [d, a] of byDay) { if (a > topDayAmt) { topDayAmt = a; topDay = d } }
  if (topDay) {
    insights.push({
      kind: 'highest_spend_day',
      label: `Hari pengeluaran tertinggi`,
      detail: formatDateLabel(topDay),
      amount: topDayAmt,
    })
  }

  // Unusual transaction: single expense > 10% of total expenses
  const totalExpense = rows.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0)
  for (const r of rows.filter(r => r.type === 'expense')) {
    if (Number(r.amount) > totalExpense * 0.3 && totalExpense > 0) {
      insights.push({
        kind: 'unusual_transaction',
        label: `Transaksi tidak biasa`,
        detail: r.merchant ?? r.date.toString(),
        amount: Number(r.amount),
      })
      break
    }
  }

  return insights
}

export async function* streamCsvExport(
  pool: Pool,
  userId: string,
  from: Date,
  to: Date,
): AsyncGenerator<string> {
  const db = drizzle(pool)
  yield 'Tanggal,Jenis,Nominal,Kategori,Merchant,Akun,Catatan,Status\n'

  const rows = await db.select({
    date: transactions.date, type: transactions.type, amount: transactions.amount,
    categoryId: transactions.categoryId, merchant: transactions.merchant,
    note: transactions.note, status: transactions.status,
    accountId: transactions.accountId,
  }).from(transactions).where(
    and(eq(transactions.userId, userId), isNull(transactions.deletedAt),
      gte(transactions.date, from), lte(transactions.date, to))
  ).orderBy(desc(transactions.date))

  const catRows = await db.select({ id: categories.id, name: categories.name }).from(categories)
  const catById = new Map(catRows.map(c => [c.id, c.name]))
  const accRows = await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.userId, userId))
  const accById = new Map(accRows.map(a => [a.id, a.name]))

  for (const r of rows) {
    const cat = r.categoryId ? catById.get(r.categoryId) ?? '' : ''
    const acc = accById.get(r.accountId) ?? ''
    const merchant = (r.merchant ?? '').replace(/"/g, '""')
    const note = (r.note ?? '').replace(/"/g, '""')
    yield `"${r.date.toISOString()}","${r.type}",${r.amount},"${cat}","${merchant}","${acc}","${note}","${r.status ?? 'confirmed'}"\n`
  }
}

function formatPeriodLabel(period: ReportPeriod, start: Date): string {
  const opts: Intl.DateTimeFormatOptions = { year: 'numeric' }
  if (period === 'monthly' || period === 'quarterly') opts.month = 'long'
  return new Intl.DateTimeFormat('id-ID', opts).format(start)
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d))
}
