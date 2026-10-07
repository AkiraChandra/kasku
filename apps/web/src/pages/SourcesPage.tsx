import { useEffect, useState } from 'react'

type Source = {
  id: string
  name: string
  kind: 'email' | 'csv' | 'webhook' | 'form' | 'notification' | 'autopay' | string
  trust: 'review' | 'auto' | string
  totalOk?: number
  total_ok?: number
  totalCorrected?: number
  total_corrected?: number
  accuracy?: number
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'include' })
  const body = await response.json() as { ok: boolean; data?: T; error?: { message?: string } }
  if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'Gagal memuat sumber')
  return body.data as T
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    request<Source[]>('/ingest/sources').then(setSources).catch((err: Error) => setError(err.message))
  }, [])

  if (error) return <section className="finance-page"><div className="inline-error">{error}</div></section>
  if (!sources) return <section className="finance-page"><p className="muted">Memuat sumber...</p></section>

  return (
    <section className="finance-page">
      <div className="section-heading">
        <h1>Sumber Input</h1>
        <p>Statistik sumber transaksi. Data hanya dapat dibaca.</p>
      </div>
      {sources.length === 0 ? <div className="empty-state"><h2 className="empty-title">Belum ada sumber input</h2></div> : (
        <div className="item-list">
          {sources.map(source => {
            const totalOk = source.totalOk ?? source.total_ok ?? 0
            const totalCorrected = source.totalCorrected ?? source.total_corrected ?? 0
            const rawAccuracy = source.accuracy ?? (totalOk + totalCorrected > 0 ? totalOk / (totalOk + totalCorrected) : 0)
            const accuracy = rawAccuracy <= 1 ? rawAccuracy * 100 : rawAccuracy
            return (
              <article className="list-card source-card" key={source.id}>
                <div className="list-card-body">
                  <strong className="list-card-title">{source.name}</strong>
                  <span className="list-card-sub">Jenis: {source.kind}</span>
                  <span className={`badge badge--trust badge--trust-${source.trust}`}>{source.trust}</span>
                </div>
                <div className="source-stats">
                  <span>OK <strong>{totalOk}</strong></span>
                  <span>Dikoreksi <strong>{totalCorrected}</strong></span>
                  <span>Akurasi <strong>{Math.round(accuracy)}%</strong></span>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
