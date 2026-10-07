import { useState } from 'react'

export default function SettingsPage() {
  const [currency, setCurrency] = useState('IDR')
  const [theme, setTheme] = useState('system')
  const [saved, setSaved] = useState(false)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <section className="finance-page">
      <div className="section-heading">
        <h1>Pengaturan</h1>
        <p>Sesuaikan preferensi aplikasi Kasku Anda.</p>
      </div>

      {saved && <div className="inline-success" style={{ marginBottom: '16px', color: 'var(--success-color)' }}>Pengaturan berhasil disimpan!</div>}

      <section className="card" style={{ maxWidth: '600px' }}>
        <h2 className="card-title" style={{ marginBottom: '16px' }}>Preferensi Umum</h2>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Mata Uang Utama</label>
            <select className="input" value={currency} onChange={e => setCurrency(e.target.value)}>
              <option value="IDR">IDR (Rp - Rupiah)</option>
              <option value="USD">USD ($ - US Dollar)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Tema Tampilan</label>
            <select className="input" value={theme} onChange={e => setTheme(e.target.value)}>
              <option value="system">Ikuti Sistem</option>
              <option value="light">Terang (Light)</option>
              <option value="dark">Gelap (Dark)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Cadangan Data & Ekspor</label>
            <p className="muted" style={{ fontSize: '12px', marginBottom: '8px' }}>Ekspor seluruh data keuangan Anda ke format JSON atau CSV.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => alert('Fitur ekspor data belum tersedia.')}>Ekspor JSON</button>
              <button type="button" className="btn btn-secondary" onClick={() => alert('Fitur ekspor data belum tersedia.')}>Ekspor CSV</button>
            </div>
          </div>

          <button className="btn btn-primary" type="submit" style={{ alignSelf: 'flex-start', marginTop: '8px' }}>Simpan Perubahan</button>
        </form>
      </section>
    </section>
  )
}
