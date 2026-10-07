import { useEffect, useState } from 'react'
import { formatIDR } from '../utils/formatters.js'

type DashboardSummary = { totalBalance: number; incomeThisMonth: number; expenseThisMonth: number; savingsRate: number }
type CashflowRow = { label: string; income: number; expense: number; net: number }
type DashboardCashflow = { period: 'daily' | 'weekly'; income: number; expense: number; net: number; breakdown: CashflowRow[] }
type DashboardCategory = { id: string; name: string; amount: number; percentage: number }
type DashboardCategories = { expenses: DashboardCategory[]; total: number }
type DashboardMonth = { month: string; income: number; expense: number; net: number }
type DashboardTrends = { months: DashboardMonth[]; comparison: { incomeChange: number; expenseChange: number; netChange: number }; currentMonth: string }

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'include' })
  const body = await response.json() as { ok: boolean; data?: T; error?: { message: string } }
  if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'Gagal memuat data')
  return body.data as T
}

export default function DashboardPage() {
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

  if (error) return <div className="inline-error">{error}</div>
  if (!summary) return <p className="muted">Memuat dashboard...</p>

  const CATEGORY_COLORS = ['#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c']

  return (
    <div className="dashboard">
      <section className="section-heading">
        <h1>Dashboard</h1>
        <p>Ringkasan keuangan Anda.</p>
      </section>

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

      <section className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 className="card-title">Arus Kas</h2>
          <div className="segmented">
            <button className={cfPeriod === 'daily' ? 'selected' : ''} onClick={() => setCfPeriod('daily')}>Harian</button>
            <button className={cfPeriod === 'weekly' ? 'selected' : ''} onClick={() => setCfPeriod('weekly')}>Mingguan</button>
          </div>
        </div>
        {cashflow ? (
          <>
            <div className="cashflow-totals" style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '0.9rem' }}>
              <span className="positive">+{formatIDR(cashflow.income)}</span>
              <span className="negative">-{formatIDR(cashflow.expense)}</span>
              <span className={cashflow.net >= 0 ? 'positive' : 'negative'}>{cashflow.net >= 0 ? '+' : ''}{formatIDR(cashflow.net)}</span>
            </div>
            <div className="bar-chart" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {((cashflow.breakdown ?? []) as CashflowRow[]).map((row) => {
                const maxVal = Math.max(...((cashflow.breakdown ?? []) as CashflowRow[]).map((r) => Math.max(r.income, r.expense)), 1)
                return (
                  <div key={row.label} className="bar-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="bar-label" style={{ width: '60px', fontSize: '0.8rem' }}>{row.label.slice(5)}</span>
                    <div className="bar-track" style={{ flex: 1, background: 'var(--bg-muted)', height: '8px', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                      <div className="bar bar--income" style={{ width: `${(row.income / maxVal) * 100}%`, background: 'var(--positive)' }} />
                      <div className="bar bar--expense" style={{ width: `${(row.expense / maxVal) * 100}%`, background: 'var(--negative)' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : <p className="muted">Memuat...</p>}
      </section>

      <section className="card">
        <h2 className="card-title" style={{ marginBottom: '12px' }}>Pengeluaran per Kategori</h2>
        {categories && categories.total > 0 ? (
          <div className="category-legend" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(categories.expenses as DashboardCategory[]).map((cat, i) => (
              <div key={cat.id} className="legend-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="legend-dot" style={{ width: '10px', height: '10px', borderRadius: '50%', background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                  <span className="legend-name">{cat.name}</span>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span className="legend-amount negative">{formatIDR(cat.amount)}</span>
                  <span className="legend-pct muted">{cat.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="muted">Belum ada pengeluaran bulan ini.</p>}
      </section>

      <section className="card">
        <h2 className="card-title" style={{ marginBottom: '12px' }}>Tren Bulanan</h2>
        {trends && trends.comparison ? (
          <>
            <div className="trend-comparison" style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '0.85rem' }}>
              <div className={`trend-change ${trends.comparison.incomeChange >= 0 ? 'positive' : 'negative'}`}>
                Pemasukan {trends.comparison.incomeChange >= 0 ? '↑' : '↓'} {formatIDR(Math.abs(trends.comparison.incomeChange))}
              </div>
              <div className={`trend-change ${trends.comparison.expenseChange >= 0 ? 'negative' : 'positive'}`}>
                Pengeluaran {trends.comparison.expenseChange >= 0 ? '↑' : '↓'} {formatIDR(Math.abs(trends.comparison.expenseChange))}
              </div>
            </div>
          <div className="trend-months" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {trends.months.map(month => <span key={month.month} className="muted">{month.month}</span>)}
          </div>
          </>
        ) : <p className="muted">Memuat...</p>}
      </section>
    </div>
  )
}
