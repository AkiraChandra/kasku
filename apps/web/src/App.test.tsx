import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { formatIDR, default as App } from '../src/App'

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

describe('finance views', () => {
  it('shows accounts from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: [{ id: 'a1', name: 'BCA', type: 'bank', balance: 250000 }] }),
    }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Lainnya' }))
    fireEvent.click(screen.getByRole('button', { name: 'Akun' }))
    expect(await screen.findByText('BCA')).toBeTruthy()
    expect(screen.getByText('Rp 250.000')).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('shows transactions from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: [{ id: 't1', type: 'expense', amount: 35000, note: 'Nasi goreng', date: '2026-10-04T00:00:00.000Z' }] }),
    }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Transaksi' }))
    expect(await screen.findByText('Nasi goreng')).toBeTruthy()
    expect(screen.getByText('-Rp 35.000')).toBeTruthy()
    vi.unstubAllGlobals()
  })
})
