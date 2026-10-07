import { useState } from 'react'

type Bank = 'bca' | 'mandiri'
type ParsedRow = {
  occurred_at: string
  merchant: string
  amount: number
  type: 'income' | 'expense'
  source_ref: string
}

function csvRows(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { field += '"'; index += 1 }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"' && field === '') quoted = true
    else if (char === ',' || char === ';' || char === '\t') { row.push(field.trim()); field = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index += 1
      row.push(field.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []; field = ''
    } else field += char
  }
  if (field || row.length) { row.push(field.trim()); if (row.some(Boolean)) rows.push(row) }
  if (quoted) throw new Error('CSV tidak valid: tanda kutip tidak ditutup')
  return rows
}

function normalize(value: string) { return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_/-]+/g, '') }
function parseDate(value: string) {
  const parts = value.trim().split(/[/-]/).map(Number)
  const date = parts.length === 3 && parts[0] > 31
    ? new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
    : new Date(Date.UTC(parts[2], parts[1] - 1, parts[0]))
  if (Number.isNaN(date.getTime())) throw new Error(`Tanggal tidak valid: ${value}`)
  return date.toISOString()
}
function parseAmount(value: string) {
  const cleaned = value.trim().replace(/^rp\s*/i, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '')
  const amount = cleaned.includes('.') && cleaned.includes(',') ? Number(cleaned.replace(/\./g, '').replace(',', '.')) : Number(cleaned.replace(/[.,]/g, ''))
  if (!Number.isSafeInteger(amount)) throw new Error(`Jumlah tidak valid: ${value}`)
  return Math.abs(amount)
}

function parseCsv(input: string, bank: Bank): ParsedRow[] {
  const rows = csvRows(input)
  if (rows.length < 2) return []
  const headers = rows[0].map(normalize)
  const index = (name: string) => {
    const value = headers.indexOf(name)
    if (value < 0) throw new Error(`Kolom CSV tidak ditemukan: ${name}`)
    return value
  }
  const date = index('tanggal'); const merchant = index('keterangan'); const amount = index('jumlah'); const kind = index(bank === 'bca' ? 'dk' : 'jenis')
  return rows.slice(1).flatMap((row, rowIndex) => {
    if (row.every(value => !value)) return []
    const typeValue = (row[kind] ?? '').toLowerCase()
    if (!row[date] || !row[amount] || !typeValue) throw new Error(`Baris ${rowIndex + 2} tidak lengkap`)
    const type = ['k', 'kredit', 'credit', 'cr', 'c'].includes(typeValue) ? 'income' : ['d', 'debit', 'db', 'dr'].includes(typeValue) ? 'expense' : null
    if (!type) throw new Error(`Jenis transaksi tidak valid: ${row[kind]}`)
    return [{ occurred_at: parseDate(row[date]), merchant: row[merchant] ?? '', amount: parseAmount(row[amount]), type, source_ref: `${bank}:${rowIndex + 1}` }]
  })
}

function formatAmount(amount: number) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount) }

export default function CSVImportPage() {
  const [bank, setBank] = useState<Bank>('bca')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Ukuran file maksimal 5MB'); return }
    setError(''); setMessage(''); setRows([])
    try {
      const parsed = parseCsv(await file.text(), bank)
      if (parsed.length > 200) throw new Error('Maksimal 200 baris per file')
      setRows(parsed)
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'CSV tidak dapat dibaca') }
  }

  async function submit() {
    if (!rows.length) return
    setSubmitting(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/v1/ingest/batch', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: `bank_csv_${bank}`, items: rows.map(row => ({ source_ref: row.source_ref, parsed: row })) }),
      })
      const body = await response.json() as { ok?: boolean; error?: { message?: string } }
      if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'Import CSV gagal')
      setMessage(`${rows.length} transaksi dikirim untuk diproses.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Import CSV gagal') }
    finally { setSubmitting(false) }
  }

  return (
    <section className="finance-page">
      <div className="section-heading"><h1>Import mutasi bank</h1><p>Unggah CSV BCA atau Mandiri untuk dicocokkan dengan transaksi.</p></div>
      <label className="field"><span className="field-label">Bank</span>
        <select className="input" value={bank} onChange={event => { setBank(event.target.value as Bank); setRows([]); setMessage(''); setError('') }}>
          <option value="bca">BCA</option>
          <option value="mandiri">Mandiri</option>
        </select>
      </label>
      <label className="field"><span className="field-label">File CSV</span>
        <input className="input" type="file" accept=".csv,text/csv" onChange={handleFile} />
      </label>
      {error && <p role="alert" className="inline-error">{error}</p>}
      {message && <p role="status" className="money-income">{message}</p>}
      {rows.length > 0 && <>
        <p>{rows.length} baris siap diimpor.</p>
        <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Jumlah</th><th>Jenis</th></tr></thead><tbody>
          {rows.slice(0, 20).map(row => <tr key={row.source_ref}><td>{new Date(row.occurred_at).toLocaleDateString('id-ID')}</td><td>{row.merchant}</td><td>{formatAmount(row.amount)}</td><td>{row.type === 'income' ? 'Masuk' : 'Keluar'}</td></tr>)}
        </tbody></table></div>
        {rows.length > 20 && <p>Menampilkan 20 baris pertama.</p>}
        <button className="btn btn--primary" type="button" disabled={submitting} onClick={submit}>{submitting ? 'Mengirim…' : 'Import transaksi'}</button>
      </>}
    </section>
  )
}
