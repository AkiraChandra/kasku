import { useEffect, useState } from 'react'
import { formatIDR } from '../utils/formatters.js'

type Bill = {
  id: string
  name: string
  amount: number
  dueDate: string
  status: 'pending' | 'paid' | 'overdue' | string
  categoryName?: string
}

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

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[] | null>(null)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [formError, setFormError] = useState('')

  const loadBills = () => {
    api<Bill[]>('/bills').then(setBills).catch((e: Error) => setError(e.message))
  }

  useEffect(() => { loadBills() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const numAmount = parseInt(amount.replace(/[^\d]/g, ''), 10)
    if (!numAmount || numAmount <= 0) { setFormError('Jumlah harus lebih besar dari nol'); return }
    if (!name.trim()) { setFormError('Nama tagihan wajib diisi'); return }
    if (!dueDate) { setFormError('Tanggal jatuh tempo wajib diisi'); return }

    try {
      await api('/bills', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          amount: numAmount,
          dueDate: new Date(dueDate).toISOString(),
          recurrence: 'monthly',
        }),
      })
      setShowForm(false)
      setName('')
      setAmount('')
      setDueDate('')
      loadBills()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal membuat tagihan')
    }
  }

  async function handleMarkPaid(id: string) {
    try {
      await api(`/bills/${id}/pay`, { method: 'POST' })
      loadBills()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menandai lunas')
    }
  }

  async function handleDelete(id: string) {
    try {
      await api(`/bills/${id}`, { method: 'DELETE' })
      setBills(prev => prev?.filter(b => b.id !== id) ?? null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus tagihan')
    }
  }

  if (error) return <div className="inline-error">{error}</div>

  return (
    <section className="finance-page">
      <div className="section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Tagihan &amp; Langganan</h1>
          <p>Kelola tagihan rutin agar tidak terlambat.</p>
        </div>
        {!showForm && <button className="btn btn--primary" onClick={() => setShowForm(true)}>+ Tambah Tagihan</button>}
      </div>

      {showForm && (
        <form className="card" onSubmit={handleCreate} style={{ marginBottom: '16px' }}>
          <h3 className="card-title">Tagihan Baru</h3>
          <label className="field">
            <span>Nama Tagihan</span>
            <input className="input" placeholder="misal: Listrik PLN" value={name}
              onChange={e => setName(e.target.value)} required maxLength={100} />
          </label>
          <label className="field">
            <span>Perkiraan Nominal (Rupiah)</span>
            <input className="input" placeholder="misal: 450000" type="text" inputMode="numeric"
              value={amount} onChange={e => setAmount(e.target.value)} required />
          </label>
          <label className="field">
            <span>Jatuh Tempo</span>
            <input className="input" type="date" value={dueDate}
              onChange={e => setDueDate(e.target.value)} required />
          </label>
          {formError && <p className="inline-error">{formError}</p>}
          <div className="form-actions" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button type="button" className="btn btn--secondary" onClick={() => setShowForm(false)}>Batal</button>
            <button type="submit" className="btn btn--primary">Simpan</button>
          </div>
        </form>
      )}

      {bills === null ? (
        <p className="muted">Memuat tagihan...</p>
      ) : bills.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🔔</span>
          <h2 className="empty-title">Belum ada tagihan</h2>
          <p className="empty-desc">Tambahkan tagihan rutin agar diingatkan.</p>
        </div>
      ) : (
        <div className="item-list">
          {bills.map(b => {
            const isPaid = b.status === 'paid'
            return (
              <article className="card" key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <strong>{b.name}</strong>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    Jatuh tempo: {new Date(b.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {isPaid && <span className="positive" style={{ marginLeft: '8px' }}>· Lunas</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>{formatIDR(b.amount)}</strong>
                  {!isPaid && (
                    <button className="btn btn--small btn--primary" onClick={() => handleMarkPaid(b.id)}>Bayar</button>
                  )}
                  <button className="btn btn--small btn--danger" onClick={() => handleDelete(b.id)}>Hapus</button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
