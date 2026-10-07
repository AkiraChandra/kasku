import { useEffect, useState } from 'react'
import { formatIDR } from '../utils/formatters.js'

type Account = { id: number; name: string; type: string; balance: number }
type Category = { id: number; name: string; type: string; color?: string }

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  })
  const body = await response.json() as { ok: boolean; data?: T; error?: { message: string } }
  if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'Gagal memproses data')
  return body.data as T
}

export default function AccountsCategoriesPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'accounts' | 'categories'>('accounts')

  // Form states
  const [accName, setAccName] = useState('')
  const [accType, setAccType] = useState('bank')
  const [accBalance, setAccBalance] = useState('')

  const [catName, setCatName] = useState('')
  const [catType, setCatType] = useState('expense')

  const loadData = () => {
    Promise.all([
      api<Account[]>('/accounts'),
      api<Category[]>('/categories')
    ]).then(([accs, cats]) => {
      setAccounts(accs)
      setCategories(cats)
    }).catch((e: Error) => setError(e.message))
  }

  useEffect(() => { loadData() }, [])

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api('/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: accName, type: accType, balance: parseFloat(accBalance) || 0 })
      })
      setAccName('')
      setAccBalance('')
      loadData()
    } catch (err: any) { setError(err.message) }
  }

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api('/categories', {
        method: 'POST',
        body: JSON.stringify({ name: catName, type: catType })
      })
      setCatName('')
      loadData()
    } catch (err: any) { setError(err.message) }
  }

  return (
    <section className="finance-page">
      <div className="section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Akun & Kategori</h1>
          <p>Kelola rekening bank, dompet, dan kategori transaksi.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className={`btn ${activeTab === 'accounts' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('accounts')}>Akun</button>
          <button className={`btn ${activeTab === 'categories' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('categories')}>Kategori</button>
        </div>
      </div>

      {error && <div className="inline-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {activeTab === 'accounts' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px' }}>
          <section className="card">
            <h2 className="card-title" style={{ marginBottom: '12px' }}>Daftar Akun / Dompet</h2>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr><th>Nama</th><th>Tipe</th><th>Saldo</th></tr>
                </thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.id}>
                      <td>{acc.name}</td>
                      <td>{acc.type}</td>
                      <td style={{ fontWeight: 600 }}>{formatIDR(acc.balance)}</td>
                    </tr>
                  ))}
                  {accounts.length === 0 && <tr><td colSpan={3} className="muted">Belum ada akun.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="card">
            <h2 className="card-title" style={{ marginBottom: '12px' }}>Tambah Akun Baru</h2>
            <form onSubmit={handleAddAccount} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Nama Akun</label>
                <input className="input" value={accName} onChange={e => setAccName(e.target.value)} placeholder="BCA / Dompet Utama" required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Tipe</label>
                <select className="input" value={accType} onChange={e => setAccType(e.target.value)}>
                  <option value="bank">Bank</option>
                  <option value="cash">Tunai</option>
                  <option value="e-wallet">E-Wallet</option>
                  <option value="investment">Investasi</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Saldo Awal</label>
                <input className="input" type="number" value={accBalance} onChange={e => setAccBalance(e.target.value)} placeholder="0" required />
              </div>
              <button className="btn btn-primary" type="submit">Tambah Akun</button>
            </form>
          </aside>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px' }}>
          <section className="card">
            <h2 className="card-title" style={{ marginBottom: '12px' }}>Daftar Kategori</h2>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr><th>Nama Kategori</th><th>Tipe</th></tr>
                </thead>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat.id}>
                      <td>{cat.name}</td>
                      <td><span className={`badge ${cat.type}`}>{cat.type}</span></td>
                    </tr>
                  ))}
                  {categories.length === 0 && <tr><td colSpan={2} className="muted">Belum ada kategori.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="card">
            <h2 className="card-title" style={{ marginBottom: '12px' }}>Tambah Kategori Baru</h2>
            <form onSubmit={handleAddCategory} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Nama Kategori</label>
                <input className="input" value={catName} onChange={e => setCatName(e.target.value)} placeholder="Makan & Minum" required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Tipe</label>
                <select className="input" value={catType} onChange={e => setCatType(e.target.value)}>
                  <option value="expense">Pengeluaran</option>
                  <option value="income">Pemasukan</option>
                </select>
              </div>
              <button className="btn btn-primary" type="submit">Tambah Kategori</button>
            </form>
          </aside>
        </div>
      )}
    </section>
  )
}
