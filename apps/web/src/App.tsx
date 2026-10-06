import { useEffect, useState } from 'react'
import LoginPage from './LoginPage.js'
import TotpPage from './TotpPage.js'
import CSVImportPage from './CSVImportPage.js'
import InboxReviewPage from './InboxReviewPage.js'
import SourcesPage from './SourcesPage.js'

export type NavItem = 'beranda' | 'transaksi' | 'budget' | 'hutang' | 'lainnya'
type Account = { id: string; name: string; type: string; balance: number }
type Transaction = { id: string; type: 'income' | 'expense' | 'transfer'; amount: number; note: string | null; date: string; source?: string | null }

type DebtRow = {
  id: string; userId: string; contactId: string | null; personName: string | null;
  type: 'lent_out' | 'borrowed'; amount: number; remainingAmount: number;
  currency: string; description: string | null; dueDate: string | null;
  status: 'active' | 'settled' | 'cancelled'; createdAt: string; updatedAt: string
}
type DebtPaymentRow = { id: string; amount: number; note: string | null; paidAt: string }

type DashboardSummary = { totalBalance: number; incomeThisMonth: number; expenseThisMonth: number; savingsRate: number }
type CashflowRow = { label: string; income: number; expense: number; net: number }
type DashboardCashflow = { period: 'daily' | 'weekly'; income: number; expense: number; net: number; breakdown: CashflowRow[] }
type DashboardCategory = { id: string; name: string; amount: number; percentage: number }
type DashboardCategories = { expenses: DashboardCategory[]; total: number }
type DashboardMonth = { month: string; income: number; expense: number; net: number }
type DashboardTrends = { months: DashboardMonth[]; comparison: { incomeChange: number; expenseChange: number; netChange: number }; currentMonth: string }

const NAV_LABELS: Record<NavItem, string> = {
  beranda: 'Dashboard', transaksi: 'Transaksi', budget: 'Budget', hutang: 'Hutang', lainnya: 'Lainnya',
}
const NAV_ICONS: Record<NavItem, string> = {
  beranda: '🏠', transaksi: '💸', budget: '📊', hutang: '📋', lainnya: '⚙️',
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

type Category = { id: string; name: string; type: string }

type BudgetRow = {
  id: string; userId: string; categoryId: string | null; name: string;
  amount: number; period: string; startDate: string; createdAt: string; updatedAt: string
}

type BudgetProgress = {
  budget: BudgetRow; spent: number; remaining: number; percentage: number;
  periodStart: string; periodEnd: string
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [active, setActive] = useState<NavItem>('beranda')
  const [subview, setSubview] = useState<'akun' | 'kategori' | '2fa' | 'csv-import' | 'inbox-review' | 'sources'>('akun')

  useEffect(() => {
    let mounted = true
    fetch('/api/v1/auth/me', { credentials: 'include' })
      .then((response) => {
        if (mounted) setIsAuthenticated(response.status === 200)
      })
      .catch(() => {
        if (mounted) setIsAuthenticated(false)
      })
    return () => { mounted = false }
  }, [])

  async function handleLogout() {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' })
    } finally {
      setIsAuthenticated(false)
    }
  }

  if (isAuthenticated === null) return <p className="muted">Memuat...</p>
  if (!isAuthenticated) return <LoginPage onLogin={() => setIsAuthenticated(true)} />

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar-title">Kasku</span>
        <span className="topbar-sub">Keuangan Pribadi</span>
        <button type="button" className="btn btn--ghost" onClick={handleLogout}>Keluar</button>
      </header>
      <main className="content">
        {active === 'beranda' && <DashboardView />}
        {active === 'transaksi' && <TransactionsView />}
        {active === 'budget' && <BudgetView />}
        {active === 'hutang' && <HutangView />}
        {active === 'lainnya' && (
          <section className="finance-page">
            <div className="section-heading"><h1>Pengaturan &amp; Data</h1><p>Kelola akun, kategori, dan keamanan 2FA.</p></div>
            <div className="segmented">
              <button className={subview === 'akun' ? 'selected' : ''} onClick={() => setSubview('akun')}>Akun</button>
              <button className={subview === 'kategori' ? 'selected' : ''} onClick={() => setSubview('kategori')}>Kategori</button>
              <button className={subview === '2fa' ? 'selected' : ''} onClick={() => setSubview('2fa')}>Keamanan (2FA)</button>
              <button className={subview === 'csv-import' ? 'selected' : ''} onClick={() => setSubview('csv-import')}>Import CSV</button>
              <button className={subview === 'inbox-review' ? 'selected' : ''} onClick={() => setSubview('inbox-review')}>Inbox Review</button>
              <button className={subview === 'sources' ? 'selected' : ''} onClick={() => setSubview('sources')}>Sumber Input</button>
            </div>
            {subview === 'akun' ? <AccountsView /> : subview === 'kategori' ? <CategoriesView /> : subview === '2fa' ? <TotpPage /> : subview === 'csv-import' ? <CSVImportPage /> : subview === 'inbox-review' ? <InboxReviewPage /> : <SourcesPage />}
          </section>
        )}
      </main>
      <nav className="bottom-nav">
        {(Object.keys(NAV_LABELS) as NavItem[]).map((key) => (
          <button key={key} className={`nav-item${active === key ? ' nav-item--active' : ''}`} onClick={() => setActive(key)} aria-label={NAV_LABELS[key]} aria-current={active === key ? 'page' : undefined}>
            <span className="nav-icon">{NAV_ICONS[key]}</span><span className="nav-label">{NAV_LABELS[key]}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

// ── Hutang View ──────────────────────────────────────────────

type DebtForm = { type: 'lent_out' | 'borrowed'; personName: string; amount: string; description: string; dueDate: string }
type PaymentForm = { amount: string; note: string }

function HutangView() {
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
    const amount = parseRupiah(form.amount)
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
    const amount = parseRupiah(payForm.amount)
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
  const settledDebts = debts?.filter(d => d.status === 'settled') ?? []
  const totalHutang = activeDebts.reduce((sum, d) => sum + d.remainingAmount, 0)
  const totalUtang = activeDebts.reduce((sum, d) => sum + d.remainingAmount, 0)

  return (
    <section className="finance-page">
      <div className="section-heading">
        <h1>Hutang</h1>
        <p>Lacak piutang & utang Anda.</p>
      </div>
      <div className="segmented">
        <button className={tab === 'hutang_saya' ? 'selected' : ''} onClick={() => setTab('hutang_saya')}>
          Hutang saya ({activeDebts.length})
        </button>
        <button className={tab === 'utang_saya' ? 'selected' : ''} onClick={() => setTab('utang_saya')}>
          Utang saya ({activeDebts.length})
        </button>
      </div>

      {activeDebts.length > 0 && (
        <div className="debt-summary">
          <span className="muted">Total {tab === 'hutang_saya' ? 'piutang' : 'utang'}:</span>
          <strong className={tab === 'hutang_saya' ? 'positive' : 'negative'}>
            {formatIDR(tab === 'hutang_saya' ? totalHutang : totalUtang)}
          </strong>
        </div>
      )}

      {!showForm ? (
        <button className="btn btn--primary" style={{ margin: '12px 0', width: '100%' }} onClick={() => setShowForm(true)}>
          + Tambah {tab === 'hutang_saya' ? 'Hutang' : 'Utang'}
        </button>
      ) : (
        <form className="budget-form card" onSubmit={handleCreate}>
          <h3 className="card-title">Hutang Baru</h3>
          <label className="field">
            <span>Jenis</span>
            <select className="input" value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as 'lent_out' | 'borrowed' }))}>
              <option value="lent_out">Hutang saya (piutang)</option>
              <option value="borrowed">Utang saya</option>
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
          <div className="form-actions">
            <button type="button" className="btn btn--secondary" onClick={() => { setShowForm(false); setFormError('') }}>
              Batal
            </button>
            <button type="submit" className="btn btn--primary">Simpan</button>
          </div>
        </form>
      )}

      {error ? <InlineError message={error} /> :
       debts === null ? <p className="muted">Memuat hutang...</p> :
       activeDebts.length === 0 ? (
         <EmptyState icon="📋" title="Belum ada hutang" description={`Belum ada ${tab === 'hutang_saya' ? 'piutang' : 'utang'} untuk ditampilkan.`} />
       ) : (
         <div className="debt-list">
           {activeDebts.map(d => (
             <DebtCard
               key={d.id}
               debt={d}
               onDelete={handleDelete}
               onSettle={handleSettle}
               deleting={deleting === d.id}
               showPayForm={showPayForm === d.id}
              onShowPay={() => { setShowPayForm(d.id); setPayForm({ amount: '', note: '' }); setPayError('') }}
              onHidePay={() => { setShowPayForm(null); setPayError('') }}
              onPay={handlePay}
              payForm={payForm}
              setPayForm={setPayForm}
              payError={payError}
              formatIDR={formatIDR}
             />
           ))}
         </div>
       )}

      {settledDebts.length > 0 && (
        <details className="settled-section">
          <summary className="muted" style={{ cursor: 'pointer', margin: '16px 0 8px' }}>
            {settledDebts.length} sudah lunas
          </summary>
          {settledDebts.map(d => (
            <DebtCard key={d.id} debt={d} onDelete={handleDelete} onSettle={() => {}} deleting={deleting === d.id} showPayForm={false} onShowPay={() => {}} onHidePay={() => {}} onPay={() => {}} payForm={{ amount: '', note: '' }} setPayForm={() => {}} payError="" formatIDR={formatIDR} settled />
          ))}
        </details>
      )}
    </section>
  )
}

function DebtCard({ debt, onDelete, onSettle, deleting, showPayForm, onShowPay, onHidePay, onPay, payForm, setPayForm, payError, formatIDR, settled }: {
  debt: DebtRow
  onDelete: (id: string) => void
  onSettle: (id: string) => void
  deleting: boolean
  showPayForm: boolean
  onShowPay: () => void
  onHidePay: () => void
  onPay: (id: string, e: React.FormEvent) => void
  payForm: PaymentForm
  setPayForm: React.Dispatch<React.SetStateAction<PaymentForm>>
  payError: string
  formatIDR: (n: number) => string
  settled?: boolean
}) {
  const paid = debt.amount - debt.remainingAmount
  const pct = debt.amount === 0 ? 0 : Math.round((paid / debt.amount) * 100)
  const isLent = debt.type === 'lent_out'
  const label = isLent ? 'Piutang' : 'Utang'
  const badge = isLent ? '🔵' : '🔴'
  const overdue = debt.dueDate && new Date(debt.dueDate) < new Date() && debt.status === 'active'

  return (
    <article className={`debt-card card${settled ? ' debt-card--settled' : ''}`}>
      <div className="debt-card__header">
        <div>
          <span className="debt-badge">{badge} {label}</span>
          <strong className="debt-person">{debt.personName ?? 'Orang tidak dikenal'}</strong>
        </div>
        <span className={`debt-amount ${isLent ? 'positive' : 'negative'}`}>
          {formatIDR(debt.remainingAmount)}
        </span>
      </div>
      {debt.description && <p className="muted debt-desc">{debt.description}</p>}
      {debt.dueDate && (
        <p className={`muted debt-due${overdue ? ' overdue' : ''}`}>
          {overdue ? '⚠️ ' : ''}Jatuh tempo: {new Date(debt.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}
      {!settled && (
        <>
          <div className="budget-bar-container">
            <div className="budget-bar" style={{ width: `${pct}%`, background: isLent ? 'var(--accent)' : 'var(--danger)' }} />
          </div>
          <div className="debt-stats">
            <span className="muted">{formatIDR(paid)} dari {formatIDR(debt.amount)}</span>
            <span className={`budget-pct ${pct >= 100 ? 'positive' : ''}`}>{pct}%</span>
          </div>
        </>
      )}
      {!settled && !showPayForm && (
        <div className="debt-actions">
          <button className="btn btn--small btn--secondary" onClick={onShowPay}>Bayar</button>
          {debt.remainingAmount > 0 && (
            <button className="btn btn--small" onClick={() => onSettle(debt.id)}>Tandai lunas</button>
          )}
          <button className="btn btn--small btn--danger" onClick={() => onDelete(debt.id)} disabled={deleting}>
            {deleting ? 'Hapus...' : 'Hapus'}
          </button>
        </div>
      )}
      {!settled && showPayForm && (
        <form className="pay-form" onSubmit={(e) => onPay(debt.id, e)}>
          <label className="field">
            <span>Jumlah Pembayaran</span>
            <input className="input" placeholder="misal: 100000" type="text" inputMode="numeric"
              value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} required />
          </label>
          <label className="field">
            <span>Catatan</span>
            <input className="input" placeholder="opsional" value={payForm.note}
              onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))} maxLength={500} />
          </label>
          {payError && <p className="inline-error">{payError}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn--small btn--secondary" onClick={onHidePay}>Batal</button>
            <button type="submit" className="btn btn--small btn--primary">Simpan</button>
          </div>
        </form>
      )}
    </article>
  )
}

function BudgetView() {
  const [budgets, setBudgets] = useState<BudgetProgress[] | null>(null)
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [formState, setFormState] = useState({ categoryId: '', name: '', amount: '', period: 'monthly' })

  useEffect(() => {
    Promise.all([
      api<BudgetProgress[]>('/budgets').catch(() => []),
      api<Category[]>('/categories').catch(() => []),
    ]).then(([b, c]) => { setBudgets(b); setCategories(c) })
      .catch((e: Error) => setError(e.message))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const amount = parseRupiah(formState.amount)
    if (!amount || amount <= 0) { setFormError('Jumlah harus lebih besar dari nol'); return }
    if (!formState.name.trim()) { setFormError('Nama budget wajib diisi'); return }
    try {
      await api<BudgetRow>('/budgets', {
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
      const fresh = await api<BudgetProgress[]>('/budgets')
      setBudgets(fresh)
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

  if (error) return <InlineError message={error} />
  if (budgets === null || categories === null) return <p className="muted">Memuat budget...</p>

  const expenseCategories = categories.filter(c => c.type === 'expense')

  return (
    <section className="finance-page">
      <div className="section-heading">
        <h1>Budget</h1>
        <p>Anggaran per kategori pengeluaran Anda.</p>
      </div>

      {!showForm ? (
        <button className="btn btn--primary" style={{ marginBottom: '12px', width: '100%' }} onClick={() => setShowForm(true)}>
          + Tambah Budget
        </button>
      ) : (
        <form className="budget-form card" onSubmit={handleCreate}>
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
          <div className="form-actions">
            <button type="button" className="btn btn--secondary" onClick={() => { setShowForm(false); setFormError('') }}>
              Batal
            </button>
            <button type="submit" className="btn btn--primary">Simpan</button>
          </div>
        </form>
      )}

      {budgets === null ? (
        <p className="muted">Memuat budget...</p>
      ) : budgets.length === 0 ? (
        <EmptyState icon="📊" title="Belum ada budget" description="Tambahkan budget untuk mulai melacak pengeluaran." />
      ) : (
        <div className="budget-list">
          {budgets.map(bp => (
            <BudgetCard
              key={bp.budget.id}
              progress={bp}
              categoryName={categories?.find(c => c.id === bp.budget.categoryId)?.name}
              onDelete={handleDelete}
              deleting={deleting === bp.budget.id}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function BudgetCard({ progress, categoryName, onDelete, deleting }: {
  progress: BudgetProgress
  categoryName?: string
  onDelete: (id: string) => void
  deleting: boolean
}) {
  const { budget, spent, remaining, percentage } = progress
  const overBudget = percentage >= 100
  const nearLimit = percentage >= 80 && percentage < 100

  const periodLabel: Record<string, string> = {
    weekly: 'Minggu ini', monthly: 'Bulan ini', quarterly: 'Kuartal ini', yearly: 'Tahun ini',
  }

  return (
    <article className="budget-card card">
      <div className="budget-card__header">
        <div>
          <strong className="budget-name">{budget.name}</strong>
          {categoryName && <span className="budget-category muted"> · {categoryName}</span>}
        </div>
        <span className="budget-period muted">{periodLabel[budget.period] ?? budget.period}</span>
      </div>
      <div className="budget-bar-container">
        <div
          className={`budget-bar${overBudget ? ' budget-bar--over' : nearLimit ? ' budget-bar--warn' : ''}`}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
      <div className="budget-stats">
        <span className={overBudget ? 'negative' : ''}>{formatIDR(spent)}</span>
        <span className="muted">dari {formatIDR(budget.amount)}</span>
        <span className={`budget-pct ${overBudget ? 'negative' : nearLimit ? 'warn' : 'positive'}`}>
          {percentage}%
        </span>
      </div>
      <div className="budget-remaining">
        {overBudget
          ? <span className="negative">Melebihi {formatIDR(spent - budget.amount)}</span>
          : <span className="muted">Sisa {formatIDR(remaining)}</span>
        }
      </div>
      <button className="btn btn--danger btn--small" style={{ marginTop: '8px' }}
        onClick={() => onDelete(budget.id)} disabled={deleting}>
        {deleting ? 'Menghapus...' : 'Hapus'}
      </button>
    </article>
  )
}

function parseRupiah(value: string): number {
  const cleaned = value.replace(/[^\d]/g, '')
  if (!cleaned) return 0
  return parseInt(cleaned, 10)
}

// ── Other Views ─────────────────────────────────────────────

function AccountsView() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api<Account[]>('/accounts').then(setAccounts).catch((e: Error) => setError(e.message)) }, [])
  if (error) return <InlineError message={error} />
  if (!accounts) return <p className="muted">Memuat akun...</p>
  if (accounts.length === 0) return <EmptyState icon="🏦" title="Belum ada akun" description="Tambahkan akun melalui WhatsApp atau API Kasku." />
  return <div className="item-list">{accounts.map((account) => <article className="list-card" key={account.id}><div><strong>{account.name}</strong><span className="muted">{account.type}</span></div><strong>{formatIDR(account.balance)}</strong></article>)}</div>
}

function CategoriesView() {
  const [categories, setCategories] = useState<Array<{ id: string; name: string; type: string }> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api<Array<{ id: string; name: string; type: string }>>('/categories').then(setCategories).catch((e: Error) => setError(e.message)) }, [])
  if (error) return <InlineError message={error} />
  if (!categories || !Array.isArray(categories)) return <p className="muted">Memuat kategori...</p>
  if (categories.length === 0) return <EmptyState icon="🏷️" title="Belum ada kategori" description="Kategori transaksi akan muncul di sini." />
  return <div className="item-list">{categories.map((category) => <article className="list-card" key={category.id}><strong>{category.name}</strong><span className="muted">{category.type}</span></article>)}</div>
}

function TransactionsView() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api<Transaction[]>('/transactions').then(setTransactions).catch((e: Error) => setError(e.message)) }, [])
  if (error) return <InlineError message={error} />
  if (!transactions) return <p className="muted">Memuat transaksi...</p>
  return <section className="finance-page"><div className="section-heading"><h1>Transaksi</h1><p>Riwayat pemasukan, pengeluaran, dan transfer.</p></div>{transactions.length === 0 ? <EmptyState icon="💸" title="Belum ada transaksi" description="Catat transaksi lewat WhatsApp atau API Kasku." /> : <div className="item-list">{transactions.map((transaction) => { const sign = transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : ''; return <article className="list-card" key={transaction.id}><div><strong>{transaction.note || transaction.type}</strong><span className="muted">{new Date(transaction.date).toLocaleDateString('id-ID')} <SourceBadge source={transaction.source} /></span></div><strong className={transaction.type === 'expense' ? 'negative' : 'positive'}>{sign}{formatIDR(transaction.amount)}</strong></article> })}</div>}</section>
}

const SOURCE_LABELS: Record<string, string> = { whatsapp: 'WA', wa: 'WA', web: 'Web', email: 'Email', csv: 'Import', import: 'Import', webhook: 'Webhook', notification: 'Notification', autopay: 'Autopay' }
const SOURCE_CLASSES: Record<string, string> = { whatsapp: 'blue', wa: 'blue', web: 'gray', email: 'green', csv: 'purple', import: 'purple', webhook: 'orange', notification: 'yellow', autopay: 'teal' }
function SourceBadge({ source }: { source?: string | null }) {
  const normalized = (source ?? 'web').toLowerCase()
  return <span className={`badge badge--source badge--source-${SOURCE_CLASSES[normalized] ?? 'gray'}`}>{SOURCE_LABELS[normalized] ?? source ?? 'Web'}</span>
}

function InlineError({ message }: { message: string }) { return <div className="inline-error">{message}</div> }

function DashboardView() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [cashflow, setCashflow] = useState<DashboardCashflow | null>(null)
  const [categories, setCategories] = useState<DashboardCategories | null>(null)
  const [trends, setTrends] = useState<DashboardTrends | null>(null)
  const [cfPeriod, setCfPeriod] = useState<'daily' | 'weekly'>('daily')
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api<DashboardSummary>('/dashboard/summary').catch(() => null),
      api<DashboardCashflow>(`/dashboard/cashflow?period=${cfPeriod}`).catch(() => null),
      api<DashboardCategories>('/dashboard/categories').catch(() => null),
      api<DashboardTrends>('/dashboard/trends').catch(() => null),
    ]).then(([s, cf, cat, t]) => {
      setSummary(s)
      setCashflow(cf)
      setCategories(cat)
      setTrends(t)
    }).catch((e: Error) => setError(e.message))
  }, [cfPeriod])

  if (error) return <InlineError message={error} />
  if (!summary || typeof summary !== 'object' || Array.isArray(summary) || !('totalBalance' in summary)) return <p className="muted">Memuat dashboard...</p>

  const CATEGORY_COLORS = ['#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c']

  return (
    <div className="dashboard">
      <section className="section-heading">
        <h1>Dashboard</h1>
        <p>Ringkasan keuangan Anda.</p>
      </section>

      {/* Summary cards */}
      <div className="summary-cards">
        <article className="summary-card">
          <span className="summary-label">Saldo Total</span>
          <strong className="summary-value">{formatIDR(summary.totalBalance)}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">Pemasukan Bulan Ini</span>
          <strong className="summary-value positive">{formatIDR(summary.incomeThisMonth)}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">Pengeluaran Bulan Ini</span>
          <strong className="summary-value negative">{formatIDR(summary.expenseThisMonth)}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">Rasio Tabungan</span>
          <strong className={`summary-value ${summary.savingsRate >= 20 ? 'positive' : summary.savingsRate >= 0 ? '' : 'negative'}`}>
            {summary.savingsRate}%
          </strong>
        </article>
      </div>

      {/* Cashflow */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Arus Kas</h2>
          <div className="segmented">
            <button className={cfPeriod === 'daily' ? 'selected' : ''} onClick={() => setCfPeriod('daily')}>Harian</button>
            <button className={cfPeriod === 'weekly' ? 'selected' : ''} onClick={() => setCfPeriod('weekly')}>Mingguan</button>
          </div>
        </div>
        {cashflow ? (
          <>
            <div className="cashflow-totals">
              <span className="positive">+{formatIDR(cashflow.income)}</span>
              <span className="negative">-{formatIDR(cashflow.expense)}</span>
              <span className={cashflow.net >= 0 ? 'positive' : 'negative'}>{cashflow.net >= 0 ? '+' : ''}{formatIDR(cashflow.net)}</span>
            </div>
            <div className="bar-chart">
              {((cashflow.breakdown ?? []) as CashflowRow[]).map((row) => {
                const maxVal = Math.max(...((cashflow.breakdown ?? []) as CashflowRow[]).map((r) => Math.max(r.income, r.expense)), 1)
                return (
                  <div key={row.label} className="bar-row">
                    <span className="bar-label">{row.label.slice(5)}</span>
                    <div className="bar-track">
                      <div className="bar bar--income" style={{ width: `${(row.income / maxVal) * 100}%` }} />
                      <div className="bar bar--expense" style={{ width: `${(row.expense / maxVal) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : <p className="muted">Memuat...</p>}
      </section>

      {/* Category breakdown */}
      <section className="card">
        <h2 className="card-title">Pengeluaran per Kategori</h2>
        {categories && categories.total > 0 ? (
          <>
            <div className="donut-chart-container">
              <svg viewBox="0 0 32 32" className="donut-svg">
                {(categories.expenses as DashboardCategory[]).reduce((acc, cat, i) => {
                  const pct = cat.percentage / 100
                  acc.elements.push(
                    <circle
                      key={cat.id}
                      cx="16" cy="16" r="12"
                      fill="none"
                      stroke={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                      strokeWidth="5"
                      strokeDasharray={`${pct * 75.398} ${75.398 - pct * 75.398}`}
                      strokeDashoffset={`-${acc.offset * 75.398}`}
                      strokeLinecap="butt"
                    />
                  )
                  acc.offset += pct
                  return acc
                }, { elements: [] as React.ReactNode[], offset: 0, rem: 12 }).elements}
                <text x="16" y="16" textAnchor="middle" dominantBaseline="central" fontSize="4" fill="var(--text)" fontWeight="bold">
                  {formatIDR(categories.total).replace('Rp ', '')}
                </text>
              </svg>
            </div>
            <div className="category-legend">
              {(categories.expenses as DashboardCategory[]).map((cat, i) => (
                <div key={cat.id} className="legend-row">
                  <span className="legend-dot" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                  <span className="legend-name">{cat.name}</span>
                  <span className="legend-amount negative">{formatIDR(cat.amount)}</span>
                  <span className="legend-pct muted">{cat.percentage}%</span>
                </div>
              ))}
            </div>
          </>
        ) : <p className="muted">Belum ada pengeluaran bulan ini.</p>}
      </section>

      {/* Trends */}
      <section className="card">
        <h2 className="card-title">Tren Bulanan</h2>
        {trends ? (
          <>
            <div className="trend-bars">
              {((trends.months ?? []) as DashboardMonth[]).map((m) => {
                const maxVal = Math.max(...((trends.months ?? []) as DashboardMonth[]).map((mo) => Math.max(mo.income, mo.expense)), 1)
                return (
                  <div key={m.month} className="trend-month">
                    <div className="trend-label">{m.month}</div>
                    <div className="trend-bar-container">
                      <div className="trend-bar-group">
                        <div className="trend-bar trend-bar--income" style={{ height: `${(m.income / maxVal) * 60}px` }} title={`Pemasukan: ${formatIDR(m.income)}`} />
                        <div className="trend-bar trend-bar--expense" style={{ height: `${(m.expense / maxVal) * 60}px` }} title={`Pengeluaran: ${formatIDR(m.expense)}`} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="trend-legend">
              <span><span className="trend-dot trend-dot--income" /> Pemasukan</span>
              <span><span className="trend-dot trend-dot--expense" /> Pengeluaran</span>
            </div>
            <div className="trend-comparison">
              <div className={`trend-change ${trends.comparison.incomeChange >= 0 ? 'positive' : 'negative'}`}>
                Pemasukan {trends.comparison.incomeChange >= 0 ? '↑' : '↓'} {formatIDR(Math.abs(trends.comparison.incomeChange))}
              </div>
              <div className={`trend-change ${trends.comparison.expenseChange >= 0 ? 'negative' : 'positive'}`}>
                Pengeluaran {trends.comparison.expenseChange >= 0 ? '↑' : '↓'} {formatIDR(Math.abs(trends.comparison.expenseChange))}
              </div>
            </div>
          </>
        ) : <p className="muted">Memuat...</p>}
      </section>
    </div>
  )
}

function EmptyState({ icon, title, description }: { icon: string; title: string; description: string }) { return <div className="empty-state"><span className="empty-icon">{icon}</span><h2 className="empty-title">{title}</h2><p className="empty-desc">{description}</p></div> }
export function formatIDR(amount: number): string { const formatted = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(amount)); return `${amount < 0 ? '-' : ''}Rp ${formatted}` }
