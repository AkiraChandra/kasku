/**
 * 2FA Setup Page
 * Path: /settings/2fa
 * Allows user to enable/disable TOTP 2FA.
 */

import { useState } from 'react'

type TotpStatus = { enabled: boolean; setupComplete: boolean } | null
type SetupResult = { secret: string; provisioningUri: string; qrDataUrl: string; message: string }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const body = await response.json() as { ok: boolean; data?: T; error?: { code: string; message: string } }
  if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'Gagal')
  return body.data as T
}

export default function TotpPage() {
  const [status, setStatus] = useState<TotpStatus>(null)
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [step, setStep] = useState<'idle' | 'setup' | 'verify' | 'disable'>('idle')

  const loadStatus = async () => {
    try {
      const s = await api<TotpStatus>('/auth/2fa/status')
      setStatus(s)
      setStep('idle')
    } catch {
      setMessage({ type: 'error', text: 'Gagal memuat status 2FA' })
    }
  }

  const handleSetup = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const result = await api<SetupResult>('/auth/2fa/setup', { method: 'POST' })
      setSetupResult(result)
      setStep('verify')
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message ?? 'Gagal setup 2FA' })
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (code.length !== 6) {
      setMessage({ type: 'error', text: 'Kode harus 6 digit' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      await api('/auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      setMessage({ type: 'success', text: '2FA berhasil diaktifkan!' })
      setStep('idle')
      setSetupResult(null)
      setCode('')
      loadStatus()
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message ?? 'Kode tidak valid' })
    } finally {
      setLoading(false)
    }
  }

  const handleDisable = async () => {
    if (code.length !== 6) {
      setMessage({ type: 'error', text: 'Kode harus 6 digit' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      await api('/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      setMessage({ type: 'success', text: '2FA berhasil dinonaktifkan.' })
      setStep('idle')
      setCode('')
      loadStatus()
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message ?? 'Kode tidak valid' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-content">
      <h1>🔐 Autentikasi Dua Faktor (2FA)</h1>

      <div className="card">
        <p className="text-secondary">
          Lindungi akun Anda dengan autentikasi dua faktor menggunakan aplikasi authenticator
          seperti Google Authenticator, Authy, atau Bitwarden.
        </p>

        {message && (
          <div className={`alert ${message.type}`}>
            {message.text}
          </div>
        )}

        {/* Status */}
        <div className="status-badge">
          <span className={`badge ${status?.enabled ? 'badge-success' : 'badge-neutral'}`}>
            {status === null ? 'Memuat...' : status.enabled ? '✅ Aktif' : '⚪ Nonaktif'}
          </span>
        </div>

        {/* Idle — show enable or disable button */}
        {step === 'idle' && (
          <div className="action-group">
            {!status?.enabled ? (
              <button className="btn btn-primary" onClick={handleSetup} disabled={loading}>
                {loading ? 'Memuat...' : '🔑 Aktifkan 2FA'}
              </button>
            ) : (
              <button className="btn btn-danger" onClick={() => setStep('disable')}>
                Nonaktifkan 2FA
              </button>
            )}
          </div>
        )}

        {/* Setup result — show secret + QR */}
        {step === 'verify' && setupResult && (
          <div className="setup-panel">
            <p>🔍 Buka aplikasi authenticator dan pindai kode QR di bawah, atau masukkan secret manual:</p>
            <div className="secret-display">
              <code className="secret-code">{setupResult.secret}</code>
              <button
                className="btn btn-sm"
                onClick={() => navigator.clipboard.writeText(setupResult.secret)}
              >
                Salin
              </button>
            </div>
            {setupResult.qrDataUrl && (
              <div className="qr-section">
                <img
                  src={setupResult.qrDataUrl}
                  alt="QR Code"
                  className="qr-image"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <p className="text-muted">
                  Atau buka: <a href={setupResult.provisioningUri}>{setupResult.provisioningUri}</a>
                </p>
              </div>
            )}
            <p className="text-secondary">{setupResult.message}</p>

            <div className="verify-form">
              <label>Masukkan kode 6 digit dari aplikasi authenticator:</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="input-2fa"
              />
              <div className="action-group">
                <button className="btn btn-primary" onClick={handleVerify} disabled={loading || code.length !== 6}>
                  {loading ? 'Memverifikasi...' : '✓ Aktifkan'}
                </button>
                <button className="btn btn-ghost" onClick={() => { setStep('idle'); setSetupResult(null); setCode('') }}>
                  Batal
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Disable flow */}
        {step === 'disable' && (
          <div className="disable-panel">
            <p>Untuk menonaktifkan 2FA, masukkan kode dari aplikasi authenticator Anda:</p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="input-2fa"
            />
            <div className="action-group">
              <button className="btn btn-danger" onClick={handleDisable} disabled={loading || code.length !== 6}>
                {loading ? 'Memverifikasi...' : 'Nonaktifkan 2FA'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setStep('idle'); setCode('') }}>
                Batal
              </button>
            </div>
          </div>
        )}

        {/* Load on mount */}
        <button className="btn btn-sm btn-ghost" onClick={loadStatus} style={{ marginTop: '1rem' }}>
          🔄 Refresh Status
        </button>
      </div>

      <style>{`
        .page-content { max-width: 480px; margin: 0 auto; padding: 1rem; }
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.25rem; margin-top: 1rem; }
        .text-secondary { color: var(--text-2); font-size: 14px; }
        .text-muted { color: var(--text-muted); font-size: 12px; }
        .text-neutral { color: var(--text-2); }
        .alert { padding: 0.75rem 1rem; border-radius: 8px; margin: 0.75rem 0; font-size: 14px; }
        .alert.success { background: #ecfdf5; color: #047857; }
        .alert.error { background: #fef2f2; color: #dc2626; }
        .status-badge { margin: 1rem 0; }
        .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 99px; font-size: 13px; font-weight: 500; }
        .badge-success { background: #dcfce7; color: #166534; }
        .badge-neutral { background: #f1f5f9; color: #475569; }
        .action-group { display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap; }
        .btn { padding: 0.5rem 1rem; border-radius: 12px; font-size: 14px; font-weight: 500; border: none; cursor: pointer; }
        .btn-primary { background: var(--accent, #4f46e5); color: #fff; }
        .btn-danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .btn-ghost { background: transparent; color: var(--text-2); }
        .btn-sm { padding: 0.25rem 0.75rem; font-size: 12px; }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .setup-panel, .disable-panel { margin-top: 1rem; }
        .secret-display { display: flex; align-items: center; gap: 0.5rem; margin: 0.75rem 0; background: var(--surface-2); padding: 0.5rem 0.75rem; border-radius: 8px; }
        .secret-code { font-family: monospace; letter-spacing: 0.1em; font-size: 16px; word-break: break-all; }
        .qr-section { text-align: center; margin: 1rem 0; }
        .qr-image { border: 1px solid var(--border); border-radius: 8px; max-width: 200px; }
        .verify-form { margin-top: 1rem; }
        .verify-form label { display: block; font-size: 13px; color: var(--text-2); margin-bottom: 0.5rem; }
        .input-2fa { width: 100%; padding: 0.75rem 1rem; font-size: 24px; text-align: center; letter-spacing: 0.2em; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); margin: 0.5rem 0; }
        .input-2fa:focus { outline: none; border-color: var(--accent, #4f46e5); }
      `}</style>
    </div>
  )
}
