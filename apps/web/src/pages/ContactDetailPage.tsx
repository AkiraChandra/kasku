import { useEffect, useState } from 'react'
import { formatIDR } from '../utils/formatters.js'

type Contact = { id: string; name: string; phone?: string | null; bankAccount?: string | null; notes?: string | null }
type Debt = { id: string; personName: string | null; type: 'lent_out' | 'borrowed'; amount: number; remainingAmount: number; status: string; description: string | null }

export default function ContactDetailPage({ contactId }: { contactId: string }) {
  const [contact, setContact] = useState<Contact | null>(null)
  const [debts, setDebts] = useState<Debt[]>([])
  useEffect(() => {
    fetch(`/api/v1/contacts/${contactId}`, { credentials: 'include' }).then(r => r.json()).then(b => { if (b.ok) setContact(b.data) })
    fetch(`/api/v1/debts?contactId=${contactId}`, { credentials: 'include' }).then(r => r.json()).then(b => { if (b.ok) setDebts(b.data) })
  }, [contactId])
  if (!contact) return <p className="muted">Memuat kontak...</p>
  return <section className="finance-page">
    <div className="section-heading"><h1>{contact.name}</h1><p>{contact.phone ?? 'Tanpa nomor telepon'}</p></div>
    {(contact.bankAccount || contact.notes) && <div className="card"><p>{contact.bankAccount}</p><p>{contact.notes}</p></div>}
    <h2>Hutang &amp; Piutang</h2>
    {debts.length === 0 ? <p className="muted">Belum ada catatan.</p> : <div className="item-list">{debts.map(d => <article className="list-card" key={d.id}><strong>{d.personName ?? contact.name}</strong><span className={d.type === 'lent_out' ? 'positive' : 'negative'}>{formatIDR(d.remainingAmount)}</span><small>{d.description ?? ''}</small></article>)}</div>}
  </section>
}
