import { useEffect, useState } from 'react'
import { formatIDR } from '../utils/formatters.js'

type Category = { id: string; name: string; type: string }
type BudgetRow = {
  id: string
  userId: string
  categoryId: string | null
  name: string
  amount: number
  period: string
  startDate: string
  createdAt: string
  updatedAt: string
}
type BudgetProgress = {
  budget: BudgetRow
  spent: number
  remaining: number
  percentage: number
  periodStart: string
  periodEnd: string
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

export default function BudgetPage() {
  const [budgets, setBudgets] = useState<BudgetProgress[] | null>(null)
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [formState, setFormState] = useState({ categoryId: '', name: '', amount: '', period: 'monthly' })

  const loadData = () => {
    Promise.all([
      api<BudgetProgress[]>('/budgets').catch(() => []),
      api<Category[]>('/categories').catch(() => []),
    ]).then(([b, c]) => { setBudgets(b); setCategories(c) })
      .catch((e: Error) => setError(e.message))
  }

  useEffect(() => { loadData() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const amount = parseInt(formState.amount.replace(/[^\d]/g, ''), 10)
    if (!amount || amount <= 0) { setFormError('Jumlah harus lebih besar dari nol'); return }
    if (!formState.name.trim()) { setFormError('Nama budget wajib diisi'); return }
    try {
      await api('/budgets', {
        method: 'POST',
        body: JSON.stringify({
          categoryId: formState.categoryId || undefined,
          name: formState.name.trim(),
          amount,
          period: formState.period,
        }),
      })
      setShowForm(false)
      setFormState({ categoryId: '', name: '', amount: '', period: 'monthly' })
      loadData()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal membuat budget')
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await api(`/budgets/${id}`, { method: 'DELETE' })
      setBudgets(prev => prev ? prev.filter(b => b.budget.id !== id) : prev)
    } catch { /* ignore */ }
    finally { setDeleting(null) }
  }

  if (error) return <div className="inline-error">{error}</div>

  const expenseCategories = categories?.filter(c => c.type === 'expense') ?? []

  return (
    <section className="finance-page">
      <div className="section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Budget</h1>
          <p>Anggaran per kategori pengeluaran Anda.</p>
        </div>
        {!showForm && <button className="btn btn--primary" onClick={() => setShowForm(true)}>+ Tambah Budget</button>}
      </div>

      {showForm && (
        <form className="card" onSubmit={handleCreate} style={{ marginBottom: '16px' }}>
          <h3 className="card-title">Budget Baru</h3>
          <label className="field">
            <span>Nama Budget</span>
            <input className="input" placeholder="misal: Budget Makan" value={formState.name}
              onChange={e => setFormState(f => ({ ...f, name: e.target.value }))} required maxLength={100} />
          </label>
          <label className="field">
            <span>Kategori</span>
            <select className="input" value={formState.categoryId}
              onChange={e => setFormState(f => ({ ...f, categoryId: e.target.value }))}>
              <option value="">Semua kategori</option>
              {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Jumlah (Rupiah)</span>
            <input className="input" placeholder="misal: 500000" type="text" inputMode="numeric"
              value={formState.amount} onChange={e => setFormState(f => ({ ...f, amount: e.target.value }))} required />
          </label>
          <label className="field">
            <span>Periode</span>
            <select className="input" value={formState.period}
              onChange={e => setFormState(f => ({ ...f, period: e.target.value }))}>
              <option value="weekly">Mingguan</option>
              <option value="monthly">Bulanan</option>
              <option value="quarterly">Kuartalan</option>
              <option value="yearly">Tahunan</option>
            </select>
          </label>
          {formError && <p className="inline-error">{formError}</p>}
          <div className="form-actions" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button type="button" className="btn btn--secondary" onClick={() => { setShowForm(false); setFormError('') }}>Batal</button>
            <button type="submit" className="btn btn--primary">Simpan</button>
          </div>
        </form>
      )}

      {budgets === null ? (
        <p className="muted">Memuat budget...</p>
      ) : budgets.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📊</span>
          <h2 className="empty-title">Belum ada budget</h2>
          <p className="empty-desc">Tambahkan budget untuk mulai melacak pengeluaran.</p>
        </div>
      ) : (
        <div className="item-list">
          {budgets.map(bp => {
            const { budget, spent, remaining, percentage } = bp
            const overBudget = percentage >= 100
            const nearLimit = percentage >= 80 && percentage < 100
            const catName = categories?.find(c => c.id === budget.categoryId)?.name

            return (
              <article className="card" key={budget.id} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <strong>{budget.name}</strong>
                    {catName && <span className="muted"> · {catName}</span>}
                  </div>
                  <span className="muted" style={{ textTransform: 'capitalize' }}>{budget.period}</span>
                </div>
                <div style={{ background: 'var(--bg-muted)', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div
                    style={{
                      width: `${Math.min(100, percentage)}%`,
                      height: '100%',
                      background: overBudget ? 'var(--negative)' : nearLimit ? 'var(--warning, #f59e0b)' : 'var(--accent)',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
                  <span className={overBudget ? 'negative' : ''}><span>{formatIDR(spent)}</span> / <span>{formatIDR(budget.amount)}</span></span>
                  <span className={overBudget ? 'negative' : nearLimit ? 'warning' : 'positive'}>{percentage}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                  {overBudget ? (
                    <span className="negative">Melebihi {formatIDR(spent - budget.amount)}</span>
                  ) : (
                    <span className="muted">Sisa {formatIDR(remaining)}</span>
                  )}
                  <button className="btn btn--small btn--danger" onClick={() => handleDelete(budget.id)} disabled={deleting === budget.id}>
                    Hapus
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
