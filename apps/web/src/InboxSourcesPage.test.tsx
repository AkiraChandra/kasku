import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import InboxReviewPage from './pages/InboxReviewPage'
import SourcesPage from './pages/SourcesPage'

afterEach(() => vi.unstubAllGlobals())

describe('InboxReviewPage', () => {
  it('loads pending transactions and confirms one', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: [{ id: 't1', date: '2026-10-04T00:00:00.000Z', merchant: 'Kopi', amount: 35000, type: 'expense', review_reason: 'confidence rendah', raw_input: 'kopi 35k' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: { id: 't1' } }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<InboxReviewPage />)
    expect(await screen.findByText('Kopi')).toBeTruthy()
    expect(screen.getByText(/confidence rendah/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/transactions/t1', expect.objectContaining({ method: 'PATCH' })))
    expect(screen.queryByText('Kopi')).toBeNull()
  })
})

describe('SourcesPage', () => {
  it('shows source stats and calculated accuracy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: [{ id: 's1', name: 'WhatsApp', kind: 'form', trust: 'review', totalOk: 8, totalCorrected: 2 }] }),
    }))

    render(<SourcesPage />)
    expect(await screen.findByText('WhatsApp')).toBeTruthy()
    expect(screen.getByText('80%')).toBeTruthy()
    expect(screen.getByText(/review/)).toBeTruthy()
  })
})
