import { useEffect, useState } from 'react'
import { formatIDR } from '../utils/formatters.js'

type Transaction = {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amount: number
  note: string | null
  date: string
  source?: string | null
}

type Account = { id: string; name: string; type: string }
type Category = { id: string; name: string; type: string }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    ...init,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) },
  })
  const body = await response.json() as { ok: boolean; data?: T; error?: { message: string } }
  if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'Gagal memuat data')
  return body.data as T
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [formType, setFormType] = useState<'expense' | 'income' | 'transfer'>('expense')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [formError, setFormError] = useState('')

  const loadData = () => {
    Promise.all([
      api<Transaction[]>('/transactions').catch(() => []),
      api<Account[]>('/accounts').catch(() => []),
      api<Category[]>('/categories').catch(() => []),
    ]).then(([txs, accs, cats]) => {
      setTransactions(txs)
      setAccounts(accs)
      setCategories(cats)
      if (accs.length > 0 && !accountId) setAccountId(accs[0].id)
    }).catch((e: Error) => setError(e.message))
  }

  useEffect(() => { loadData() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const numAmount = parseInt(amount.replace(/[^\d]/g, ''), 10)
    if (!numAmount || numAmount <= 0) { setFormError('Jumlah harus lebih besar dari nol'); return }
    if (!accountId) { setFormError('Pilih akun terlebih dahulu'); return }

    try {
      await api('/transactions', {
        method: 'POST',
        headers: { 'Idempotency-Key': `tx-${Date.now()}` },
        body: JSON.stringify({
          type: formType,
          amount: numAmount,
          note: note.trim() || undefined,
          accountId,
          categoryId: categoryId || undefined,
          occurredAt: new Date().toISOString(),
        }),
      })
      setShowAdd(false)
      setAmount('')
      setNote('')
      loadData()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan transaksi')
    }
  }

  async function handleDelete(id: string) {
    try {
      await api(`/transactions/${id}`, { method: 'DELETE' })
      setTransactions(prev => prev?.filter(t => t.id !== id) ?? null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus transaksi')
    }
  }

  if (error) return <div className="inline-error">{error}</div>

  return (
    <section className="finance-page">
      <div className="section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Transaksi</h1>
          <p>Riwayat pemasukan, pengeluaran, dan transfer.</p>
        </div>
        <button className="btn btn--primary" onClick={() => setShowAdd(true)}>+ Tambah</button>
      </div>

      {showAdd && (
        <form className="card" onSubmit={handleCreate} style={{ marginBottom: '16px' }}>
          <h3 className="card-title">Tambah Transaksi</h3>
          <div className="segmented" style={{ marginBottom: '12px' }}>
            <button type="button" className={formType === 'expense' ? 'selected' : ''} onClick={() => setFormType('expense')}>Pengeluaran</button>
            <button type="button" className={formType === 'income' ? 'selected' : ''} onClick={() => setFormType('income')}>Pemasukan</button>
            <button type="button" className={formType === 'transfer' ? 'selected' : ''} onClick={() => setFormType('transfer')}>Transfer</button>
          </div>
          <label className="field">
            <span>Jumlah (Rupiah)</span>
            <input className="input" placeholder="misal: 35000" type="text" inputMode="numeric"
              value={amount} onChange={e => setAmount(e.target.value)} required />
          </label>
          <label className="field">
            <span>Catatan / Merchant</span>
            <input className="input" placeholder="misal: Warteg Bahari" value={note}
              onChange={e => setNote(e.target.value)} maxLength={200} />
          </label>
          <label className="field">
            <span>Akun</span>
            <select className="input" value={accountId} onChange={e => setAccountId(e.target.value)} required>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
            </select>
          </label>
          <label className="field">
            <span>Kategori</span>
            <select className="input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">Tanpa Kategori</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
            </select>
          </label>
          {formError && <p className="inline-error">{formError}</p>}
          <div className="form-actions" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button type="button" className="btn btn--secondary" onClick={() => setShowAdd(false)}>Batal</button>
            <button type="submit" className="btn btn--primary">Simpan</button>
          </div>
        </form>
      )}

      {transactions === null ? (
        <p className="muted">Memuat transaksi...</p>
      ) : transactions.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">💸</span>
          <h2 className="empty-title">Belum ada transaksi</h2>
          <p className="empty-desc">Catat transaksi lewat WhatsApp atau tombol tambah di atas.</p>
        </div>
      ) : (
        <div className="item-list">
          {transactions.map(t => {
            const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''
            const colorClass = t.type === 'income' ? 'positive' : t.type === 'expense' ? 'negative' : ''
            return (
              <article className="list-card" key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{t.note || (t.type === 'income' ? 'Pemasukan' : t.type === 'expense' ? 'Pengeluaran' : 'Transfer')}</strong>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    {new Date(t.date).toLocaleDateString('id-ID')} · {t.source ?? 'web'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <strong className={colorClass}>{sign}{formatIDR(t.amount)}</strong>
                  <button className="btn btn--small btn--danger" onClick={() => handleDelete(t.id)}>Hapus</button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
