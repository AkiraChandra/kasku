import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { formatIDR } from './utils/formatters'
import App from './App'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

describe('formatIDR', () => {
  it('formats thousands with dot separator', () => {
    expect(formatIDR(5000)).toBe('Rp 5.000')
    expect(formatIDR(15000)).toBe('Rp 15.000')
    expect(formatIDR(100000)).toBe('Rp 100.000')
  })

  it('formats millions correctly', () => {
    expect(formatIDR(1000000)).toBe('Rp 1.000.000')
    expect(formatIDR(1250000)).toBe('Rp 1.250.000')
  })

  it('formats zero and small numbers', () => {
    expect(formatIDR(0)).toBe('Rp 0')
    expect(formatIDR(1)).toBe('Rp 1')
    expect(formatIDR(999)).toBe('Rp 999')
  })

  it('prepends minus for negative amounts', () => {
    expect(formatIDR(-5000)).toBe('-Rp 5.000')
    expect(formatIDR(-1250000)).toBe('-Rp 1.250.000')
  })
})

describe('auth guard', () => {
  it('shows the login page when the session is unauthenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      json: async () => ({ ok: false, error: { message: 'Sesi tidak ditemukan' } }),
    }))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Masuk ke Kasku' })).toBeTruthy()
    expect(screen.queryByText('Dashboard')).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('finance views', () => {
  it('shows accounts from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string) => {
      if (path.includes('/auth/me')) return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) })
      return Promise.resolve({
      ok: true,
      json: async () => ({ ok: true, data: [{ id: 'a1', name: 'BCA', type: 'bank', balance: 250000 }] }),
      })
    }))
    render(<App />)
    fireEvent.click(await screen.findAllByRole('button', { name: 'Lainnya' }).then(btns => btns[0]))
    fireEvent.click(screen.getByRole('button', { name: 'Akun' }))
    expect(await screen.findByText('BCA')).toBeTruthy()
    expect(screen.getByText('Rp 250.000')).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('shows transactions from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string) => {
      if (path.includes('/auth/me')) return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) })
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: [{ id: 't1', type: 'expense', amount: 35000, note: 'Nasi goreng', date: '2026-10-04T00:00:00.000Z' }] }) })
    }))
    render(<App />)
    fireEvent.click(await screen.findAllByRole('button', { name: 'Transaksi' }).then(btns => btns[0]))
    expect(await screen.findByText('Nasi goreng')).toBeTruthy()
    expect(screen.getByText('-Rp 35.000')).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('shows budget list from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string) => {
      if (path.includes('/auth/me')) return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) })
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: [] }) })
    }))
    render(<App />)
    fireEvent.click(await screen.findAllByRole('button', { name: 'Budget' }).then(btns => btns[0]))
    expect(await screen.findByRole('heading', { level: 1, name: 'Budget' })).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('shows budget cards with progress', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string) => {
      if (path.includes('/auth/me')) return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) })
      return Promise.resolve({
      ok: true,
      json: async () => ({
        ok: true,
        data: [{
          budget: { id: 'b1', name: 'Budget Makan', categoryId: null, amount: 1_000_000, period: 'monthly', startDate: '2026-10-01T00:00:00Z', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', userId: 'u1' },
          spent: 250_000,
          remaining: 750_000,
          percentage: 25,
          periodStart: '2026-10-01T00:00:00Z',
          periodEnd: '2026-11-01T00:00:00Z',
        }],
      }),
      })
    }))
    render(<App />)
    fireEvent.click(await screen.findAllByRole('button', { name: 'Budget' }).then(btns => btns[0]))
    expect(await screen.findByText('Budget Makan')).toBeTruthy()
    expect(screen.getByText('Rp 250.000')).toBeTruthy()
    expect(screen.getByText(/Rp 1\.000\.000/)).toBeTruthy()
    expect(screen.getByText(/25%/)).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('shows empty state when no budgets', async () => {
    let callCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string) => {
      callCount++
      if (path.includes('/auth/me')) return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) })
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, data: [] }),
      })
    }))
    render(<App />)
    fireEvent.click(await screen.findAllByRole('button', { name: 'Budget' }).then(btns => btns[0]))
    expect(await screen.findByText('Belum ada budget')).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('shows dashboard summary cards', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string) => {
      if (path.includes('/auth/me')) return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) })
      if (path.includes('/dashboard/summary')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { totalBalance: 1500000, incomeThisMonth: 500000, expenseThisMonth: 200000, savingsRate: 60 } }) })
      }
      if (path.includes('/dashboard/cashflow')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { period: 'daily', income: 500000, expense: 200000, net: 300000, breakdown: [] } }) })
      }
      if (path.includes('/dashboard/categories')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { expenses: [], total: 0 } }) })
      }
      if (path.includes('/dashboard/trends')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { months: [], comparison: { incomeChange: 0, expenseChange: 0, netChange: 0 }, currentMonth: '2026-10' } }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: [] }) })
    }))
    render(<App />)
    expect(await screen.findByText('Dashboard')).toBeTruthy()
    expect(await screen.findByText('Saldo Total')).toBeTruthy()
    expect(await screen.findByText('Pemasukan Bulan Ini')).toBeTruthy()
    expect(await screen.findByText('Pengeluaran Bulan Ini')).toBeTruthy()
    expect(await screen.findByText('Rasio Tabungan')).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('shows category donut and legend when expenses exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string) => {
      if (path.includes('/auth/me')) return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) })
      if (path.includes('/dashboard/summary')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { totalBalance: 1000000, incomeThisMonth: 1000000, expenseThisMonth: 300000, savingsRate: 70 } }) })
      }
      if (path.includes('/dashboard/cashflow')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { period: 'daily', income: 1000000, expense: 300000, net: 700000, breakdown: [] } }) })
      }
      if (path.includes('/dashboard/categories')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { expenses: [{ id: 'c1', name: 'Makanan', amount: 200000, percentage: 67 }, { id: 'c2', name: 'Transport', amount: 100000, percentage: 33 }], total: 300000 } }) })
      }
      if (path.includes('/dashboard/trends')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { months: [], comparison: { incomeChange: 0, expenseChange: 0, netChange: 0 }, currentMonth: '2026-10' } }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: [] }) })
    }))
    render(<App />)
    expect(await screen.findByText('Makanan')).toBeTruthy()
    expect(screen.getByText('Transport')).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('shows trend monthly bars', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string) => {
      if (path.includes('/auth/me')) return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) })
      if (path.includes('/dashboard/summary')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { totalBalance: 2000000, incomeThisMonth: 800000, expenseThisMonth: 400000, savingsRate: 50 } }) })
      }
      if (path.includes('/dashboard/cashflow')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { period: 'daily', income: 800000, expense: 400000, net: 400000, breakdown: [] } }) })
      }
      if (path.includes('/dashboard/categories')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { expenses: [], total: 0 } }) })
      }
      if (path.includes('/dashboard/trends')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { months: [{ month: '2026-05', income: 500000, expense: 200000, net: 300000 }, { month: '2026-10', income: 800000, expense: 400000, net: 400000 }], comparison: { incomeChange: 300000, expenseChange: 200000, netChange: 100000 }, currentMonth: '2026-10' } }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: [] }) })
    }))
    render(<App />)
    expect(await screen.findByText('2026-05')).toBeTruthy()
    expect(screen.getByText('2026-10')).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('shows Hutang tabs and empty state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string) => {
      if (path.includes('/auth/me')) return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) })
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: [] }) })
    }))
    render(<App />)
    fireEvent.click(await screen.findAllByRole('button', { name: 'Hutang' }).then(btns => btns[0]))
    expect(await screen.findByRole('heading', { level: 1, name: 'Hutang' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Hutang saya/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Utang saya/ })).toBeTruthy()
    expect(screen.getByText('Belum ada hutang')).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('renders debt person, remaining amount, due date, and payment action', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string) => {
      if (path.includes('/auth/me')) return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true }) })
      return Promise.resolve({
      ok: true,
      json: async () => ({ ok: true, data: [{
        id: 'd1', userId: 'u1', contactId: null, personName: 'Budi', type: 'lent_out',
        amount: 1000000, remainingAmount: 250000, currency: 'IDR', description: 'Pinjaman',
        dueDate: '2099-12-31T00:00:00.000Z', status: 'active', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      }] }),
      })
    }))
    render(<App />)
    fireEvent.click(await screen.findAllByRole('button', { name: 'Hutang' }).then(btns => btns[0]))
    expect(await screen.findByText('Budi')).toBeTruthy()
    expect(screen.getAllByText('Rp 250.000').length).toBeGreaterThan(0)
    expect(screen.getByText('Pinjaman')).toBeTruthy()
    expect(screen.getByText(/Jatuh tempo/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bayar' })).toBeTruthy()
    vi.unstubAllGlobals()
  })
})
