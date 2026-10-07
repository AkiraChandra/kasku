import { useEffect, useState } from 'react'
import { formatIDR } from '../utils/formatters.js'

type DebtRow = {
  id: string
  userId: string
  contactId: string | null
  personName: string | null
  type: 'lent_out' | 'borrowed'
  amount: number
  remainingAmount: number
  currency: string
  description: string | null
  dueDate: string | null
  status: 'active' | 'settled' | 'cancelled'
  createdAt: string
  updatedAt: string
}
type DebtPaymentRow = { id: string; amount: number; note: string | null; paidAt: string }
type DebtForm = { type: 'lent_out' | 'borrowed'; personName: string; amount: string; description: string; dueDate: string }
type PaymentForm = { amount: string; note: string }

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

export default function DebtsPage() {
  const [tab, setTab] = useState<'hutang_saya' | 'utang_saya'>('hutang_saya')
  const [debts, setDebts] = useState<DebtRow[] | null>(null)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showPayForm, setShowPayForm] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [payError, setPayError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [form, setForm] = useState<DebtForm>({ type: 'lent_out', personName: '', amount: '', description: '', dueDate: '' })
  const [payForm, setPayForm] = useState<PaymentForm>({ amount: '', note: '' })

  useEffect(() => {
    const type = tab === 'hutang_saya' ? 'lent_out' : 'borrowed'
    api<DebtRow[]>(`/debts?type=${type}`)
      .then(setDebts)
      .catch((e: Error) => setError(e.message))
  }, [tab])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const amount = parseInt(form.amount.replace(/[^\d]/g, ''), 10)
    if (!amount || amount <= 0) { setFormError('Jumlah harus lebih besar dari nol'); return }
    if (!form.personName.trim()) { setFormError('Nama orang wajib diisi'); return }
    try {
      await api<DebtRow>('/debts', {
        method: 'POST',
        headers: { 'Idempotency-Key': `debt-create-${Date.now()}` },
        body: JSON.stringify({
          type: form.type,
          personName: form.personName.trim(),
          amount,
          description: form.description.trim() || undefined,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        }),
      })
      setShowForm(false)
      setForm({ type: form.type, personName: '', amount: '', description: '', dueDate: '' })
      const fresh = await api<DebtRow[]>(`/debts?type=${form.type}`)
      setDebts(fresh)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal membuat hutang')
    }
  }

  async function handlePay(debtId: string, e: React.FormEvent) {
    e.preventDefault()
    setPayError('')
    const amount = parseInt(payForm.amount.replace(/[^\d]/g, ''), 10)
    if (!amount || amount <= 0) { setPayError('Jumlah harus lebih besar dari nol'); return }
    try {
      const result = await api<{ debt: DebtRow; payment: DebtPaymentRow }>(`/debts/${debtId}/payments`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `debt-pay-${Date.now()}` },
        body: JSON.stringify({ amount, note: payForm.note.trim() || undefined }),
      })
      setShowPayForm(null)
      setPayForm({ amount: '', note: '' })
      setDebts(prev => prev ? prev.map(d => d.id === debtId ? result.debt : d) : prev)
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Gagal mencatat pembayaran')
    }
  }

  async function handleSettle(id: string) {
    try {
      const settled = await api<DebtRow>(`/debts/${id}/settle`, { method: 'POST' })
      setDebts(prev => prev ? prev.map(d => d.id === id ? settled : d) : prev)
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await api(`/debts/${id}`, { method: 'DELETE' })
      setDebts(prev => prev ? prev.filter(d => d.id !== id) : prev)
    } catch { /* ignore */ }
    finally { setDeleting(null) }
  }

  const activeDebts = debts?.filter(d => d.status === 'active') ?? []
  const totalActive = activeDebts.reduce((sum, d) => sum + d.remainingAmount, 0)

  return (
    <section className="finance-page">
      <div className="section-heading">
        <h1>Hutang</h1>
        <p>Lacak piutang orang lain kepada Anda atau utang Anda.</p>
      </div>
      <div className="segmented" style={{ marginBottom: '16px' }}>
        <button className={tab === 'hutang_saya' ? 'selected' : ''} onClick={() => setTab('hutang_saya')}>
          Hutang saya · Piutang ({activeDebts.length})
        </button>
        <button className={tab === 'utang_saya' ? 'selected' : ''} onClick={() => setTab('utang_saya')}>
          Utang saya ({activeDebts.length})
        </button>
      </div>

      {activeDebts.length > 0 && (
        <div style={{ marginBottom: '12px', fontSize: '0.9rem' }}>
          <span className="muted">Total {tab === 'hutang_saya' ? 'piutang' : 'utang'}: </span>
          <strong className={tab === 'hutang_saya' ? 'positive' : 'negative'}>{formatIDR(totalActive)}</strong>
        </div>
      )}

      {!showForm ? (
        <button className="btn btn--primary" style={{ marginBottom: '16px', width: '100%' }} onClick={() => setShowForm(true)}>
          + Tambah {tab === 'hutang_saya' ? 'Piutang' : 'Utang'}
        </button>
      ) : (
        <form className="card" onSubmit={handleCreate} style={{ marginBottom: '16px' }}>
          <h3 className="card-title">Catatan Baru</h3>
          <label className="field">
            <span>Jenis</span>
            <select className="input" value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as 'lent_out' | 'borrowed' }))}>
              <option value="lent_out">Piutang (Orang berhutang ke saya)</option>
              <option value="borrowed">Utang (Saya berhutang)</option>
            </select>
          </label>
          <label className="field">
            <span>Nama Orang</span>
            <input className="input" placeholder="misal: Budi" value={form.personName}
              onChange={e => setForm(f => ({ ...f, personName: e.target.value }))} required maxLength={200} />
          </label>
          <label className="field">
            <span>Jumlah (Rupiah)</span>
            <input className="input" placeholder="misal: 500000" type="text" inputMode="numeric"
              value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
          </label>
          <label className="field">
            <span>Keterangan</span>
            <input className="input" placeholder="misal: Pinjaman" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} maxLength={500} />
          </label>
          <label className="field">
            <span>Jatuh Tempo</span>
            <input className="input" type="date" value={form.dueDate}
              onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
          </label>
          {formError && <p className="inline-error">{formError}</p>}
          <div className="form-actions" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button type="button" className="btn btn--secondary" onClick={() => setShowForm(false)}>Batal</button>
            <button type="submit" className="btn btn--primary">Simpan</button>
          </div>
        </form>
      )}

      {error ? <div className="inline-error">{error}</div> :
       debts === null ? <p className="muted">Memuat data...</p> :
       activeDebts.length === 0 ? (
         <div className="empty-state">
           <span className="empty-icon">👥</span>
           <h2 className="empty-title">Belum ada hutang</h2>
           <p className="empty-desc">Belum ada {tab === 'hutang_saya' ? 'piutang' : 'utang'} aktif.</p>
         </div>
       ) : (
         <div className="item-list">
           {activeDebts.map(d => {
             const paid = d.amount - d.remainingAmount
             const pct = d.amount === 0 ? 0 : Math.round((paid / d.amount) * 100)
             const isLent = d.type === 'lent_out'

             return (
               <article className="card" key={d.id} style={{ marginBottom: '12px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                   <div>
                     <strong>{d.personName ?? 'Tanpa nama'}</strong>
                     {d.description && <div className="muted" style={{ fontSize: '0.8rem' }}>{d.description}</div>}
                   </div>
                   <strong className={isLent ? 'positive' : 'negative'}>{formatIDR(d.remainingAmount)}</strong>
                 </div>
                 {d.dueDate && (
                   <div className="muted" style={{ fontSize: '0.8rem', marginBottom: '8px' }}>
                     Jatuh tempo: {new Date(d.dueDate).toLocaleDateString('id-ID')}
                   </div>
                 )}
                 <div style={{ background: 'var(--bg-muted)', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                   <div style={{ width: `${pct}%`, height: '100%', background: isLent ? 'var(--accent)' : 'var(--negative)' }} />
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '8px' }}>
                   <span className="muted">Dibayar: {formatIDR(paid)} / {formatIDR(d.amount)}</span>
                   <span>{pct}%</span>
                 </div>
                 {showPayForm !== d.id ? (
                   <div style={{ display: 'flex', gap: '8px' }}>
                     <button className="btn btn--small btn--secondary" onClick={() => setShowPayForm(d.id)}>Bayar</button>
                     <button className="btn btn--small" onClick={() => handleSettle(d.id)}>Tandai Lunas</button>
                     <button className="btn btn--small btn--danger" onClick={() => handleDelete(d.id)} disabled={deleting === d.id}>Hapus</button>
                   </div>
                 ) : (
                   <form onSubmit={e => handlePay(d.id, e)} style={{ marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                     <label className="field">
                       <span>Jumlah Pembayaran</span>
                       <input className="input" placeholder="misal: 100000" type="text" inputMode="numeric"
                         value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} required />
                     </label>
                     {payError && <p className="inline-error">{payError}</p>}
                     <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                       <button type="button" className="btn btn--small btn--secondary" onClick={() => setShowPayForm(null)}>Batal</button>
                       <button type="submit" className="btn btn--small btn--primary">Simpan</button>
                     </div>
                   </form>
                 )}
               </article>
             )
           })}
         </div>
       )}
    </section>
  )
}
