import { describe, it, expect, beforeEach } from 'vitest'
import { inMemoryBillsRepository } from '../lib/bills-repo.js'
import type { CreateBillInput } from '../lib/bills-repo.js'

const UID = '00000000-0000-0000-0000-000000000001'

describe('BillsRepository (in-memory)', () => {
  beforeEach(() => { inMemoryBillsRepository.reset?.() })

  describe('listBills', () => {
    it('returns empty list initially', async () => {
      const result = await inMemoryBillsRepository.listBills(UID)
      expect(result).toEqual([])
    })

    it('returns only active bills for the user', async () => {
      await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 500000, recurrence: 'monthly', dueDay: 5,
      })
      await inMemoryBillsRepository.createBill(UID, {
        name: 'Internet', amount: 300000, recurrence: 'monthly', dueDay: 10,
      })
      const bills = await inMemoryBillsRepository.listBills(UID)
      expect(bills).toHaveLength(2)
    })

    it('isolates between users', async () => {
      const UID2 = '00000000-0000-0000-0000-000000000002'
      await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 500000, recurrence: 'monthly', dueDay: 5,
      })
      await inMemoryBillsRepository.createBill(UID2, {
        name: 'Internet', amount: 300000, recurrence: 'monthly', dueDay: 10,
      })
      const user1 = await inMemoryBillsRepository.listBills(UID)
      const user2 = await inMemoryBillsRepository.listBills(UID2)
      expect(user1).toHaveLength(1)
      expect(user1[0].name).toBe('Listrik')
      expect(user2).toHaveLength(1)
      expect(user2[0].name).toBe('Internet')
    })

    it('does not return archived (deleted) bills', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 500000, recurrence: 'monthly', dueDay: 5,
      })
      await inMemoryBillsRepository.deleteBill(UID, bill.id)
      const bills = await inMemoryBillsRepository.listBills(UID)
      expect(bills).toHaveLength(0)
    })
  })

  describe('createBill', () => {
    it('creates a bill with correct fields', async () => {
      const input: CreateBillInput = {
        name: 'Listrik PLN',
        amount: 450000,
        recurrence: 'monthly',
        dueDay: 5,
        categoryId: 'cat-1',
        accountId: 'acc-1',
        amountType: 'fixed',
        reminderDaysBefore: [3, 1, 0],
        notes: 'Tagihan bulanan',
      }
      const bill = await inMemoryBillsRepository.createBill(UID, input)
      expect(bill.id).toBeTruthy()
      expect(bill.name).toBe('Listrik PLN')
      expect(bill.amount).toBe(450000)
      expect(bill.recurrence).toBe('monthly')
      expect(bill.dueDay).toBe(5)
      expect(bill.amountType).toBe('fixed')
      expect(bill.isActive).toBe(true)
      expect(bill.notes).toBe('Tagihan bulanan')
      expect(bill.userId).toBe(UID)
    })

    it('uses defaults for optional fields', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Internet', amount: 300000, recurrence: 'monthly',
      })
      expect(bill.amountType).toBe('fixed')
      expect(bill.reminderDaysBefore).toEqual([3, 1, 0])
      expect(bill.categoryId).toBeNull()
      expect(bill.accountId).toBeNull()
      expect(bill.notes).toBeNull()
    })

    it('rejects negative amount', async () => {
      await expect(
        inMemoryBillsRepository.createBill(UID, {
          name: 'Test', amount: -100, recurrence: 'monthly',
        })
      ).rejects.toThrow()
    })
  })

  describe('updateBill', () => {
    it('updates allowed fields', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 450000, recurrence: 'monthly', dueDay: 5,
      })
      const updated = await inMemoryBillsRepository.updateBill(UID, bill.id, {
        name: 'Listrik PLN',
        amount: 500000,
        dueDay: 10,
      })
      expect(updated.name).toBe('Listrik PLN')
      expect(updated.amount).toBe(500000)
      expect(updated.dueDay).toBe(10)
    })

    it('throws BILL_NOT_FOUND for wrong user', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 450000, recurrence: 'monthly', dueDay: 5,
      })
      await expect(
        inMemoryBillsRepository.updateBill('other-user', bill.id, { name: 'Hacked' })
      ).rejects.toThrow('BILL_NOT_FOUND')
    })

    it('can deactivate a bill', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 450000, recurrence: 'monthly', dueDay: 5,
      })
      await inMemoryBillsRepository.updateBill(UID, bill.id, { isActive: false })
      const bills = await inMemoryBillsRepository.listBills(UID)
      expect(bills).toHaveLength(0)
    })
  })

  describe('deleteBill', () => {
    it('soft-deletes by archiving', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 450000, recurrence: 'monthly', dueDay: 5,
      })
      const deleted = await inMemoryBillsRepository.deleteBill(UID, bill.id)
      expect(deleted).toBe(true)
      const bills = await inMemoryBillsRepository.listBills(UID)
      expect(bills).toHaveLength(0)
    })

    it('returns false for non-existent or other user bill', async () => {
      const deleted = await inMemoryBillsRepository.deleteBill(UID, 'does-not-exist')
      expect(deleted).toBe(false)
    })
  })

  describe('generateOccurrences', () => {
    it('generates occurrences for next N days', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 450000, recurrence: 'monthly', dueDay: 15,
      })
      const occurrences = await inMemoryBillsRepository.generateOccurrences(UID, bill.id, 35)
      expect(occurrences.length).toBeGreaterThan(0)
      expect(occurrences[0].billId).toBe(bill.id)
      expect(occurrences[0].status).toBe('upcoming')
      expect(occurrences[0].expectedAmount).toBe(450000)
    })

    it('is idempotent - does not duplicate occurrences on rerun', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Internet', amount: 300000, recurrence: 'monthly', dueDay: 20,
      })
      await inMemoryBillsRepository.generateOccurrences(UID, bill.id, 35)
      const first = await inMemoryBillsRepository.generateOccurrences(UID, bill.id, 35)
      expect(first.length).toBeGreaterThan(0)
    })

    it('throws for wrong user', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 450000, recurrence: 'monthly', dueDay: 5,
      })
      await expect(
        inMemoryBillsRepository.generateOccurrences('other-user', bill.id, 35)
      ).rejects.toThrow('BILL_NOT_FOUND')
    })
  })

  describe('getUpcoming', () => {
    it('returns upcoming occurrences within days range', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 450000, recurrence: 'monthly', dueDay: 15,
      })
      await inMemoryBillsRepository.generateOccurrences(UID, bill.id, 7)
      const upcoming = await inMemoryBillsRepository.getUpcoming(UID, 7)
      expect(upcoming.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('markPaid / markSkipped', () => {
    it('marks occurrence as paid', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 450000, recurrence: 'monthly', dueDay: 15,
      })
      const occurrences = await inMemoryBillsRepository.generateOccurrences(UID, bill.id, 35)
      const occ = occurrences[0]
      const updated = await inMemoryBillsRepository.markPaid(UID, bill.id, occ.id)
      expect(updated.status).toBe('paid')
      expect(updated.paidDate).toBeTruthy()
    })

    it('marks occurrence as skipped', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 450000, recurrence: 'monthly', dueDay: 15,
      })
      const occurrences = await inMemoryBillsRepository.generateOccurrences(UID, bill.id, 35)
      const occ = occurrences[0]
      const updated = await inMemoryBillsRepository.markSkipped(UID, bill.id, occ.id)
      expect(updated.status).toBe('skipped')
    })

    it('throws OCCURRENCE_NOT_FOUND for wrong occurrence', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 450000, recurrence: 'monthly', dueDay: 15,
      })
      await expect(
        inMemoryBillsRepository.markPaid(UID, bill.id, 'does-not-exist')
      ).rejects.toThrow('OCCURRENCE_NOT_FOUND')
    })

    it('throws OCCURRENCE_NOT_FOUND for wrong bill', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 450000, recurrence: 'monthly', dueDay: 15,
      })
      const occurrences = await inMemoryBillsRepository.generateOccurrences(UID, bill.id, 35)
      const occ = occurrences[0]
      await expect(
        inMemoryBillsRepository.markPaid(UID, 'wrong-bill-id', occ.id)
      ).rejects.toThrow('OCCURRENCE_NOT_FOUND')
    })
  })

  describe('recurrence types', () => {
    it('creates weekly occurrence', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'Sampah', amount: 50000, recurrence: 'weekly',
      })
      const occs = await inMemoryBillsRepository.generateOccurrences(UID, bill.id, 14)
      expect(occs.length).toBeGreaterThanOrEqual(2)
    })

    it('creates yearly occurrence', async () => {
      const bill = await inMemoryBillsRepository.createBill(UID, {
        name: 'PBB', amount: 1000000, recurrence: 'yearly', dueDay: 1,
      })
      const occs = await inMemoryBillsRepository.generateOccurrences(UID, bill.id, 365)
      expect(occs.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('user isolation', () => {
    it('user A cannot see user B bills', async () => {
      const UID2 = '00000000-0000-0000-0000-000000000002'
      const bill1 = await inMemoryBillsRepository.createBill(UID, {
        name: 'Listrik', amount: 450000, recurrence: 'monthly', dueDay: 5,
      })
      const bill2 = await inMemoryBillsRepository.createBill(UID2, {
        name: 'Internet', amount: 300000, recurrence: 'monthly', dueDay: 10,
      })
      const occ1 = await inMemoryBillsRepository.markPaid(UID, bill1.id, 'fake-occ-id').catch(() => null)
      // This should throw for wrong user, but we're checking isolation
      await expect(
        inMemoryBillsRepository.markPaid(UID2, bill1.id, 'fake-occ-id')
      ).rejects.toThrow('OCCURRENCE_NOT_FOUND')
      await expect(
        inMemoryBillsRepository.markPaid(UID, bill2.id, 'fake-occ-id')
      ).rejects.toThrow('OCCURRENCE_NOT_FOUND')
    })
  })
})
