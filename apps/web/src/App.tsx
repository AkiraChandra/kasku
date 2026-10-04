import { useEffect, useState } from 'react'

export type NavItem = 'beranda' | 'transaksi' | 'budget' | 'hutang' | 'lainnya'
type Account = { id: string; name: string; type: string; balance: number }
type Transaction = { id: string; type: 'income' | 'expense' | 'transfer'; amount: number; note: string | null; date: string }

const NAV_LABELS: Record<NavItem, string> = {
  beranda: 'Beranda', transaksi: 'Transaksi', budget: 'Budget', hutang: 'Hutang', lainnya: 'Lainnya',
}
const NAV_ICONS: Record<NavItem, string> = {
  beranda: '🏠', transaksi: '💸', budget: '📊', hutang: '📋', lainnya: '⚙️',
}

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'include' })
  const body = await response.json() as { ok: boolean; data?: T; error?: { message: string } }
  if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'Gagal memuat data')
  return body.data as T
}

export default function App() {
  const [active, setActive] = useState<NavItem>('beranda')
  const [subview, setSubview] = useState<'akun' | 'kategori'>('akun')

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar-title">Kasku</span>
        <span className="topbar-sub">Pencatatan Warung</span>
      </header>
      <main className="content">
        {active === 'beranda' && <DashboardPlaceholder />}
        {active === 'transaksi' && <TransactionsView />}
        {active === 'budget' && <EmptyState icon="📊" title="Budget" description="Atur anggaran bulanan untuk setiap kategori pengeluaran warung Anda." />}
        {active === 'hutang' && <EmptyState icon="📋" title="Hutang" description="Catat dan lacak hutang pelanggan. Dikirim via WhatsApp." />}
        {active === 'lainnya' && (
          <section className="finance-page">
            <div className="section-heading"><h1>Akun &amp; kategori</h1><p>Kelola sumber dana dan label transaksi.</p></div>
            <div className="segmented">
              <button className={subview === 'akun' ? 'selected' : ''} onClick={() => setSubview('akun')}>Akun</button>
              <button className={subview === 'kategori' ? 'selected' : ''} onClick={() => setSubview('kategori')}>Kategori</button>
            </div>
            {subview === 'akun' ? <AccountsView /> : <CategoriesView />}
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
  if (!categories) return <p className="muted">Memuat kategori...</p>
  if (categories.length === 0) return <EmptyState icon="🏷️" title="Belum ada kategori" description="Kategori transaksi akan muncul di sini." />
  return <div className="item-list">{categories.map((category) => <article className="list-card" key={category.id}><strong>{category.name}</strong><span className="muted">{category.type}</span></article>)}</div>
}

function TransactionsView() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api<Transaction[]>('/transactions').then(setTransactions).catch((e: Error) => setError(e.message)) }, [])
  if (error) return <InlineError message={error} />
  if (!transactions) return <p className="muted">Memuat transaksi...</p>
  return <section className="finance-page"><div className="section-heading"><h1>Transaksi</h1><p>Riwayat pemasukan, pengeluaran, dan transfer.</p></div>{transactions.length === 0 ? <EmptyState icon="💸" title="Belum ada transaksi" description="Catat transaksi lewat WhatsApp atau API Kasku." /> : <div className="item-list">{transactions.map((transaction) => { const sign = transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : ''; return <article className="list-card" key={transaction.id}><div><strong>{transaction.note || transaction.type}</strong><span className="muted">{new Date(transaction.date).toLocaleDateString('id-ID')}</span></div><strong className={transaction.type === 'expense' ? 'negative' : 'positive'}>{sign}{formatIDR(transaction.amount)}</strong></article> })}</div>}</section>
}

function InlineError({ message }: { message: string }) { return <div className="inline-error">{message}</div> }
function DashboardPlaceholder() { return <div className="dashboard"><section className="card card--summary"><h2 className="card-title">Ringkasan</h2><p className="card-body">Saldo &amp; ringkasan keuangan warung akan muncul di sini.</p></section><section className="card card--wa"><h2 className="card-title">🔗 Hubungkan WhatsApp</h2><p className="card-body">Kirim pesan ke nomor Kasku untuk mencatat transaksi otomatis.</p><div className="wa-examples"><div className="wa-example-label">Contoh format pesan:</div><code className="wa-example">jual 5000 tahu</code><code className="wa-example">beli 15000 tempe telur</code><code className="wa-example">bayar 10000 dari Budi</code><code className="wa-example">utang 20000 ke Ani</code></div></section></div> }
function EmptyState({ icon, title, description }: { icon: string; title: string; description: string }) { return <div className="empty-state"><span className="empty-icon">{icon}</span><h2 className="empty-title">{title}</h2><p className="empty-desc">{description}</p></div> }
export function formatIDR(amount: number): string { const formatted = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(amount)); return `${amount < 0 ? '-' : ''}Rp ${formatted}` }
