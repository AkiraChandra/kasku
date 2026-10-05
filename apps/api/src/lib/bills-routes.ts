import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { z } from 'zod'
import { failure, success } from '../index.js'
import { parseAmount, AmountParseError } from './money.js'
import type { AuthRepository } from './auth-repo.js'
import type { BillsRepository } from './bills-repo.js'

const sessionCookie = 'kasku_session'
const recurrenceValues = ['weekly', 'monthly', 'quarterly', 'yearly'] as const
const amountTypeValues = ['fixed', 'variable'] as const

const createBillSchema = z.object({
  name: z.string().trim().min(1).max(200),
  categoryId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  amountType: z.enum(amountTypeValues).optional(),
  amount: z.union([z.string(), z.number()]),
  recurrence: z.enum(recurrenceValues),
  dueDay: z.number().int().min(1).max(31).optional(),
  reminderDaysBefore: z.array(z.number().int().min(0)).optional(),
  notes: z.string().trim().max(500).optional(),
})

const updateBillSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  amountType: z.enum(amountTypeValues).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  recurrence: z.enum(recurrenceValues).optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  reminderDaysBefore: z.array(z.number().int().min(0)).nullable().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
})

function validationError(error: z.ZodError) {
  const issue = error.issues[0]
  return failure('VALIDATION_ERROR', issue.message, issue.path.join('.'))
}

function parseMoney(value: string | number): number {
  try {
    return parseAmount(value)
  } catch (error) {
    if (error instanceof AmountParseError) throw error
    throw new AmountParseError('INVALID_AMOUNT', 'Jumlah tidak valid')
  }
}

export function createBillsRoutes(billsRepo: BillsRepository, authRepo?: AuthRepository) {
  const app = new Hono()

  async function currentUserId(c: any): Promise<string | null> {
    if (!authRepo) return null
    const token = getCookie(c, sessionCookie)
    if (!token) return null
    const session = await authRepo.findSessionByTokenHash((await import('./auth.js')).hashToken(token))
    return session?.user.id ?? null
  }

  async function requireUser(c: any): Promise<string | Response> {
    const userId = await currentUserId(c)
    if (!userId) return c.json(failure('UNAUTHORIZED', 'Sesi tidak ditemukan, silakan login'), 401)
    return userId
  }

  app.get('/bills', async (c) => {
    const user = await requireUser(c)
    if (user instanceof Response) return user
    const bills = await billsRepo.listBills(user)
    return c.json(success(bills))
  })

  app.post('/bills', async (c) => {
    const user = await requireUser(c)
    if (user instanceof Response) return user
    let body: unknown
    try { body = await c.req.json() } catch { return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400) }
    const parsed = createBillSchema.safeParse(body)
    if (!parsed.success) return c.json(validationError(parsed.error), 400)
    let amount: number
    try { amount = parseMoney(parsed.data.amount) } catch (error) {
      return c.json(failure('INVALID_AMOUNT', error instanceof Error ? error.message : 'Jumlah tidak valid', 'amount'), 400)
    }
    if (amount < 0) return c.json(failure('INVALID_AMOUNT', 'Jumlah tidak boleh negatif', 'amount'), 400)
    const row = await billsRepo.createBill(user, { ...parsed.data, amount })
    return c.json(success(row), 201)
  })

  app.get('/bills/upcoming', async (c) => {
    const user = await requireUser(c)
    if (user instanceof Response) return user
    const days = Math.min(90, Math.max(1, Number(c.req.query('days') ?? 30)))
    const occurrences = await billsRepo.getUpcoming(user, days)
    return c.json(success(occurrences))
  })

  app.get('/bills/:id', async (c) => {
    const user = await requireUser(c)
    if (user instanceof Response) return user
    const id = c.req.param('id')
    const bill = await billsRepo.getBill(user, id)
    if (!bill) return c.json(failure('NOT_FOUND', 'Tagihan tidak ditemukan'), 404)
    return c.json(success(bill))
  })

  app.patch('/bills/:id', async (c) => {
    const user = await requireUser(c)
    if (user instanceof Response) return user
    const id = c.req.param('id')
    let body: unknown
    try { body = await c.req.json() } catch { return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400) }
    const parsed = updateBillSchema.safeParse(body)
    if (!parsed.success) return c.json(validationError(parsed.error), 400)
    if (parsed.data.amount !== undefined) {
      try { parseMoney(parsed.data.amount as string | number) } catch (error) {
        return c.json(failure('INVALID_AMOUNT', error instanceof Error ? error.message : 'Jumlah tidak valid', 'amount'), 400)
      }
    }
    try {
      const amount = parsed.data.amount !== undefined ? parseMoney(parsed.data.amount as string | number) : undefined
      const row = await billsRepo.updateBill(user, id, { ...parsed.data, ...(amount !== undefined ? { amount } : {}) } as any)
      return c.json(success(row))
    } catch (error) {
      if (error instanceof Error && error.message === 'BILL_NOT_FOUND') return c.json(failure('NOT_FOUND', 'Tagihan tidak ditemukan'), 404)
      throw error
    }
  })

  app.delete('/bills/:id', async (c) => {
    const user = await requireUser(c)
    if (user instanceof Response) return user
    const id = c.req.param('id')
    const deleted = await billsRepo.deleteBill(user, id)
    if (!deleted) return c.json(failure('NOT_FOUND', 'Tagihan tidak ditemukan'), 404)
    return c.json(success({ id, deleted: true }))
  })

  app.get('/bills/:id/occurrences', async (c) => {
    const user = await requireUser(c)
    if (user instanceof Response) return user
    const id = c.req.param('id')
    const bill = await billsRepo.getBill(user, id)
    if (!bill) return c.json(failure('NOT_FOUND', 'Tagihan tidak ditemukan'), 404)
    const occurrences = await billsRepo.listOccurrences(user, id)
    return c.json(success(occurrences))
  })

  app.post('/bills/:id/occurrences/generate', async (c) => {
    const user = await requireUser(c)
    if (user instanceof Response) return user
    const id = c.req.param('id')
    const bill = await billsRepo.getBill(user, id)
    if (!bill) return c.json(failure('NOT_FOUND', 'Tagihan tidak ditemukan'), 404)
    const days = Math.min(90, Math.max(1, Number(c.req.query('days') ?? 35)))
    const occurrences = await billsRepo.generateOccurrences(user, id, days)
    return c.json(success(occurrences))
  })

  app.post('/bills/:id/occurrences/:oid/pay', async (c) => {
    const user = await requireUser(c)
    if (user instanceof Response) return user
    const { id, oid } = c.req.param()
    let body: unknown
    try { body = await c.req.json() } catch { body = {} }
    const transactionId = (body as any)?.transactionId
    const paidDate = (body as any)?.paidDate
    try {
      const occ = await billsRepo.markPaid(user, id, oid, { transactionId, paidDate })
      return c.json(success(occ, `${occ.billName ?? 'Tagihan'} lunas`))
    } catch (error) {
      if (error instanceof Error && error.message === 'OCCURRENCE_NOT_FOUND') {
        return c.json(failure('NOT_FOUND', 'Occurrence tidak ditemukan'), 404)
      }
      throw error
    }
  })

  app.post('/bills/:id/occurrences/:oid/skip', async (c) => {
    const user = await requireUser(c)
    if (user instanceof Response) return user
    const { id, oid } = c.req.param()
    try {
      const occ = await billsRepo.markSkipped(user, id, oid)
      return c.json(success(occ, `${occ.billName ?? 'Tagihan'} dilewati`))
    } catch (error) {
      if (error instanceof Error && error.message === 'OCCURRENCE_NOT_FOUND') {
        return c.json(failure('NOT_FOUND', 'Occurrence tidak ditemukan'), 404)
      }
      throw error
    }
  })

  return app
}
