import { useState } from 'react'
import AccountsCategoriesPage from './AccountsCategoriesPage.js'
import TotpPage from './TotpPage.js'
import CSVImportPage from './CSVImportPage.js'
import InboxReviewPage from './InboxReviewPage.js'
import SourcesPage from './SourcesPage.js'

type Section = 'accounts' | 'categories' | 'security' | 'import' | 'inbox' | 'sources'

export default function OthersPage() {
  const [section, setSection] = useState<Section>('accounts')
  const item = (value: Section, label: string) => <button className={`sidebar-item${section === value ? ' sidebar-item--active' : ''}`} onClick={() => setSection(value)}>{label}</button>
  return <section className="finance-page">
    <div className="section-heading"><h1>Lainnya</h1><p>Akses fitur keuangan, kontrol, dan pengaturan.</p></div>
    <div className="segmented">{item('accounts', 'Akun & Kategori')}{item('security', 'Keamanan')}{item('import', 'Import CSV')}{item('inbox', 'Inbox Review')}{item('sources', 'Sumber Input')}</div>
    {section === 'accounts' || section === 'categories' ? <AccountsCategoriesPage /> : section === 'security' ? <TotpPage /> : section === 'import' ? <CSVImportPage /> : section === 'inbox' ? <InboxReviewPage /> : <SourcesPage />}
  </section>
}
