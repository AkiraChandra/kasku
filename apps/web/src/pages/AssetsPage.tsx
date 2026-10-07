import { useEffect, useState } from 'react'
import { formatIDR } from '../utils/formatters.js'

type Asset = {
  id: string
  name: string
  type: string
  currentValue: number
  purchasePrice?: number
  updatedAt: string
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

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('reksa_dana')
  const [value, setValue] = useState('')
  const [formError, setFormError] = useState('')

  const loadAssets = () => {
    api<Asset[]>('/assets').then(setAssets).catch((e: Error) => setError(e.message))
  }

  useEffect(() => { loadAssets() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const numVal = parseInt(value.replace(/[^\d]/g, ''), 10)
    if (!numVal || numVal <= 0) { setFormError('Nilai harus lebih besar dari nol'); return }
    if (!name.trim()) { setFormError('Nama aset wajib diisi'); return }

    try {
      await api('/assets', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          type,
          currentValue: numVal,
          purchasePrice: numVal,
        }),
      })
      setShowForm(false)
      setName('')
      setValue('')
      loadAssets()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal membuat aset')
    }
  }

  async function handleDelete(id: string) {
    try {
      await api(`/assets/${id}`, { method: 'DELETE' })
      setAssets(prev => prev?.filter(a => a.id !== id) ?? null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus aset')
    }
  }

  if (error) return <div className="inline-error">{error}</div>

  const totalAssets = assets?.reduce((sum, a) => sum + a.currentValue, 0) ?? 0

  return (
    <section className="finance-page">
      <div className="section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Aset &amp; Kekayaan Bersih</h1>
          <p>Lacak portofolio aset dan investasi Anda.</p>
        </div>
        {!showForm && <button className="btn btn--primary" onClick={() => setShowForm(true)}>+ Tambah Aset</button>}
      </div>

      <div className="card" style={{ marginBottom: '16px', background: 'var(--accent-subtle, var(--bg-muted))' }}>
        <span className="muted">Total Nilai Aset</span>
        <h2 style={{ fontSize: '1.8rem', marginTop: '4px' }}>{formatIDR(totalAssets)}</h2>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleCreate} style={{ marginBottom: '16px' }}>
          <h3 className="card-title">Aset Baru</h3>
          <label className="field">
            <span>Nama Aset</span>
            <input className="input" placeholder="misal: Emas Antam" value={name}
              onChange={e => setName(e.target.value)} required maxLength={100} />
          </label>
          <label className="field">
            <span>Tipe Aset</span>
            <select className="input" value={type} onChange={e => setType(e.target.value)}>
              <option value="reksa_dana">Reksa Dana</option>
              <option value="emas">Emas</option>
              <option value="saham">Saham</option>
              <option value="deposito">Deposito</option>
              <option value="crypto">Crypto</option>
              <option value="properti">Properti</option>
              <option value="kendaraan">Kendaraan</option>
              <option value="lainnya">Lainnya</option>
            </select>
          </label>
          <label className="field">
            <span>Nilai Terkini (Rupiah)</span>
            <input className="input" placeholder="misal: 15000000" type="text" inputMode="numeric"
              value={value} onChange={e => setValue(e.target.value)} required />
          </label>
          {formError && <p className="inline-error">{formError}</p>}
          <div className="form-actions" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button type="button" className="btn btn--secondary" onClick={() => setShowForm(false)}>Batal</button>
            <button type="submit" className="btn btn--primary">Simpan</button>
          </div>
        </form>
      )}

      {assets === null ? (
        <p className="muted">Memuat aset...</p>
      ) : assets.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">💎</span>
          <h2 className="empty-title">Belum ada aset</h2>
          <p className="empty-desc">Tambahkan aset atau investasi Anda.</p>
        </div>
      ) : (
        <div className="item-list">
          {assets.map(a => (
            <article className="card" key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <strong>{a.name}</strong>
                <div className="muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>{a.type}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <strong className="positive">{formatIDR(a.currentValue)}</strong>
                <button className="btn btn--small btn--danger" onClick={() => handleDelete(a.id)}>Hapus</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
