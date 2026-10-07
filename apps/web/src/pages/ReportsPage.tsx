import { useEffect, useState } from 'react'
import { formatIDR } from '../utils/formatters.js'

type ReportData = {
  income?: number
  expense?: number
  net?: number
  savingsRate?: number
  categories?: Array<{ name: string; amount: number; percentage: number }>
} | null

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'include' })
  const body = await response.json() as { ok: boolean; data?: T; error?: { message: string } }
  if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'Gagal memuat laporan')
  return body.data as T
}

export default function ReportsPage() {
  const [report, setReport] = useState<ReportData>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<ReportData>('/reports').then(setReport).catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <div className="inline-error">{error}</div>
  if (!report) return <p className="muted">Memuat laporan...</p>

  return (
    <section className="finance-page">
      <div className="section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Laporan Keuangan</h1>
          <p>Analisis arus kas, pemasukan, dan pengeluaran.</p>
        </div>
      </div>

      <div className="summary-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        <article className="summary-card card">
          <span className="summary-label">Total Pemasukan</span>
          <strong className="summary-value positive">{formatIDR(report.income ?? 0)}</strong>
        </article>
        <article className="summary-card card">
          <span className="summary-label">Total Pengeluaran</span>
          <strong className="summary-value negative">{formatIDR(report.expense ?? 0)}</strong>
        </article>
        <article className="summary-card card">
          <span className="summary-label">Selisih (Net)</span>
          <strong className={`summary-value ${(report.net ?? 0) >= 0 ? 'positive' : 'negative'}`}>
            {formatIDR(report.net ?? 0)}
          </strong>
        </article>
      </div>

      <section className="card">
        <h2 className="card-title" style={{ marginBottom: '12px' }}>Ringkasan Periode</h2>
        <p className="muted">Rasio tabungan: <strong>{report.savingsRate ?? 0}%</strong></p>
      </section>
    </section>
  )
}
