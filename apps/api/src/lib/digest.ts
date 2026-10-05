/**
 * Digest: weekly and monthly summaries with text field ready for WhatsApp.
 * Indonesian text, formatted numbers, insight highlights.
 */

import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { and, eq, gte, lt, isNull, desc, sql } from 'drizzle-orm'
import { transactions, accounts, budgets, categories, debts } from '../db/schema/index.js'
import { formatIDR } from './money.js'

export interface DigestResult {
  period: { from: string; to: string; label: string }
  income: number
  expense: number
  net: number
  savingsRate: number
  transactionCount: number
  topCategories: Array<{ name: string; amount: number; percentage: number }>
  insights: Array<{ kind: string; label: string; detail: string; amount?: number }>
  budgets: Array<{ name: string; spent: number; budget: number; percentage: number }>
  text: string  // Indonesian text ready for WhatsApp
}

function periodStartWeekly(now: Date): Date {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() + 1)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function periodStartMonthly(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function periodEnd(periodStart: Date, weekly: boolean): Date {
  const end = new Date(periodStart)
  end.setUTCDate(end.getUTCDate() + (weekly ? 7 : 0))
  end.setUTCMonth(end.getUTCMonth() + (weekly ? 0 : 1))
  return end
}

function fmtDate(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

function fmtMoney(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}jt`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}rb`
  return String(amount)
}

function fmtMoneyFull(amount: number): string {
  return formatIDR(amount)
}

function computeWeekLabel(start: Date): string {
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  return `${fmtDate(start)} – ${fmtDate(end)}`
}

function computeMonthLabel(start: Date): string {
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(start)
}

export async function buildDigest(
  pool: Pool,
  userId: string,
  period: 'weekly' | 'monthly',
): Promise<DigestResult> {
  const db = drizzle(pool)
  const now = new Date()
  const pStart = period === 'weekly' ? periodStartWeekly(now) : periodStartMonthly(now)
  const pEnd = periodEnd(pStart, period === 'weekly')

  const rows = await db.select({
    type: transactions.type, amount: transactions.amount,
    categoryId: transactions.categoryId, merchant: transactions.merchant, note: transactions.note,
    date: transactions.date,
  }).from(transactions).where(
    and(eq(transactions.userId, userId), isNull(transactions.deletedAt),
      gte(transactions.date, pStart), lt(transactions.date, pEnd))
  ).orderBy(desc(transactions.date))

  const catRows = await db.select({ id: categories.id, name: categories.name }).from(categories).where(
    sql`(${categories.userId} IS NULL OR ${categories.userId} = ${userId}::uuid)`
  )
  const catById = new Map(catRows.map(c => [c.id, c.name]))

  const income = rows.filter(r => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0)
  const expense = rows.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0)
  const net = income - expense
  const savingsRate = income === 0 ? 0 : Math.round(((income - expense) / income) * 100)

  // Top categories
  const expenseByCat = new Map<string, number>()
  for (const r of rows.filter(r => r.type === 'expense')) {
    const id = r.categoryId ?? 'null'
    expenseByCat.set(id, (expenseByCat.get(id) ?? 0) + Number(r.amount))
  }
  const topCategories = [...expenseByCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, amount]) => ({
      name: id === 'null' ? 'Lainnya' : (catById.get(id) ?? 'Lainnya'),
      amount,
      percentage: expense === 0 ? 0 : Math.round((amount * 100) / expense),
    }))

  // Insights
  const insights: DigestResult['insights'] = []
  if (topCategories[0]) {
    insights.push({
      kind: 'top_category',
      label: 'Kategori terbesar',
      detail: `${topCategories[0].name} (${fmtMoney(topCategories[0].amount)})`,
      amount: topCategories[0].amount,
    })
  }

  // Highest spend day
  const byDay = new Map<string, number>()
  for (const r of rows.filter(r => r.type === 'expense')) {
    const day = new Date(r.date).toISOString().slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + Number(r.amount))
  }
  let topDay = ''; let topDayAmt = 0
  for (const [d, a] of byDay) { if (a > topDayAmt) { topDayAmt = a; topDay = d } }
  if (topDay) {
    insights.push({
      kind: 'highest_spend_day',
      label: 'Hari pengeluaran tertinggi',
      detail: fmtDate(new Date(topDay + 'T00:00:00Z')) + ` (${fmtMoney(topDayAmt)})`,
      amount: topDayAmt,
    })
  }

  // Budget status
  const budgetRows = await db.select().from(budgets).where(eq(budgets.userId, userId))
  const budgetStatuses: DigestResult['budgets'] = []
  for (const b of budgetRows) {
    const bStart = new Date(b.startDate)
    const bEnd = period === 'weekly'
      ? new Date(bStart.getTime() + 7 * 86400_000)
      : new Date(bStart.getUTCFullYear(), bStart.getUTCMonth() + 1, bStart.getUTCDate())
    if (bStart > now) continue

    const spentRows = await db.select({ amount: transactions.amount }).from(transactions).where(
      and(
        eq(transactions.userId, userId), isNull(transactions.deletedAt),
        b.categoryId ? eq(transactions.categoryId, b.categoryId) : sql`1=1`,
        eq(transactions.type, 'expense'),
        gte(transactions.date, bStart), lt(transactions.date, bEnd),
      )
    )
    const spent = spentRows.reduce((s, r) => s + Number(r.amount), 0)
    const pct = Number(b.amount) === 0 ? 0 : Math.min(100, Math.round((spent / Number(b.amount)) * 100))
    budgetStatuses.push({
      name: (b.name ?? 'Budget') + (b.categoryId ? ` (${catById.get(b.categoryId) ?? ''})` : ''),
      spent,
      budget: Number(b.amount),
      percentage: pct,
    })
  }

  // Build text
  const periodLabel = period === 'weekly' ? computeWeekLabel(pStart) : computeMonthLabel(pStart)
  const lines = [
    `📊 *Ringkasan ${period === 'weekly' ? 'Mingguan' : 'Bulanan'} Kasku*`,
    `${periodLabel}`,
    ``,
    `💰 Arus Kas`,
    `  Pemasukan : ${fmtMoneyFull(income)}`,
    `  Pengeluaran: ${fmtMoneyFull(expense)}`,
    `  Sisa      : ${fmtMoneyFull(net)} (${savingsRate}%)`,
    ``,
  ]
  if (topCategories.length > 0) {
    lines.push(`📁 Top Pengeluaran`)
    for (const c of topCategories.slice(0, 3)) {
      lines.push(`  ${c.name}: ${fmtMoneyFull(c.amount)} (${c.percentage}%)`)
    }
    lines.push(``)
  }
  if (budgetStatuses.length > 0) {
    lines.push(`📈 Budget`)
    for (const b of budgetStatuses) {
      const emoji = b.percentage >= 100 ? '🔴' : b.percentage >= 80 ? '🟡' : '🟢'
      lines.push(`  ${emoji} ${b.name}: ${b.percentage}% (${fmtMoneyFull(b.spent)}/${fmtMoneyFull(b.budget)})`)
    }
    lines.push(``)
  }
  if (insights.length > 0) {
    lines.push(`💡 Insight`)
    for (const i of insights) {
      lines.push(`  • ${i.label}: ${i.detail}`)
    }
    lines.push(``)
  }
  lines.push(`📝 ${rows.length} transaksi dicatat`)

  return {
    period: {
      from: pStart.toISOString(),
      to: pEnd.toISOString(),
      label: periodLabel,
    },
    income,
    expense,
    net,
    savingsRate,
    transactionCount: rows.length,
    topCategories,
    insights,
    budgets: budgetStatuses,
    text: lines.join('\n'),
  }
}
