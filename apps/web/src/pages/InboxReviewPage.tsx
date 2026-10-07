import { useEffect, useState } from 'react'

type PendingTransaction = {
  id: string
  date?: string | null
  merchant?: string | null
  description?: string | null
  amount: number
  type: string
  review_reason?: string | null
  reviewReason?: string | null
  raw_input?: string | null
  rawInput?: string | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    ...init,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) },
  })
  const body = await response.json() as { ok: boolean; data?: T; error?: { message?: string } }
  if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'Gagal memuat data')
  return body.data as T
}

function formatAmount(amount: number) {
  return `Rp ${new Intl.NumberFormat('id-ID').format(Math.abs(amount))}`
}

export default function InboxReviewPage() {
  const [transactions, setTransactions] = useState<PendingTransaction[] | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    request<PendingTransaction[]>('/transactions?status=pending_review')
      .then(setTransactions)
      .catch((err: Error) => setError(err.message))
  }, [])

  async function updateStatus(id: string) {
    setBusyId(id)
    try {
      await request(`/transactions/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }) })
      setTransactions(current => current?.filter(transaction => transaction.id !== id) ?? current)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengonfirmasi transaksi')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteTransaction(id: string) {
    setBusyId(id)
    try {
      await request(`/transactions/${id}`, { method: 'DELETE' })
      setTransactions(current => current?.filter(transaction => transaction.id !== id) ?? current)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus transaksi')
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <section className="finance-page"><InlineError message={error} /></section>
  if (!transactions) return <section className="finance-page"><p className="muted">Memuat transaksi...</p></section>

  return (
    <section className="finance-page">
      <div className="section-heading">
        <h1>Inbox Review</h1>
        <p>Periksa transaksi yang belum dapat dikonfirmasi otomatis.</p>
      </div>
      {transactions.length === 0 ? (
        <div className="empty-state"><h2 className="empty-title">Tidak ada transaksi yang perlu dicek</h2></div>
      ) : (
        <div className="item-list">
          {transactions.map(transaction => {
            const merchant = transaction.merchant || transaction.description || 'Tanpa keterangan'
            const reason = transaction.review_reason ?? transaction.reviewReason ?? '-'
            const rawInput = transaction.raw_input ?? transaction.rawInput ?? '-'
            return (
              <article className="list-card review-card" key={transaction.id}>
                <div className="list-card-body">
                  <strong className="list-card-title">{merchant}</strong>
                  <span className="list-card-sub">{transaction.date ? new Date(transaction.date).toLocaleDateString('id-ID') : '-'}</span>
                  <span className="list-card-sub">Jenis: {transaction.type}</span>
                  <span className="list-card-sub">Alasan review: {reason}</span>
                  <span className="list-card-sub">Input asli: {rawInput}</span>
                </div>
                <strong className="list-card-amount">{formatAmount(transaction.amount)}</strong>
                <div className="review-actions">
                  <button className="btn btn--primary btn--sm" onClick={() => updateStatus(transaction.id)} disabled={busyId === transaction.id}>Confirm</button>
                  <button className="btn btn--danger btn--sm" onClick={() => deleteTransaction(transaction.id)} disabled={busyId === transaction.id}>Delete</button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function InlineError({ message }: { message: string }) {
  return <div className="inline-error">{message}</div>
}
