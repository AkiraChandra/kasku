import { useState } from 'react'

type LoginPageProps = { onLogin: () => void }

type ErrorBody = { error?: { message?: string } }

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const body = await response.json() as ErrorBody & { ok?: boolean }
      if (!response.ok || body.ok === false) {
        throw new Error(body.error?.message ?? 'Email atau password salah')
      }
      onLogin()
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Gagal login')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-logo">
          <h1 id="login-title" className="login-logo-name">Masuk ke Kasku</h1>
          <p className="login-logo-tag">Keuangan Pribadi</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className={`input${error ? ' input--error' : ''}`}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <div className="password-wrapper">
              <input
                className={`input${error ? ' input--error' : ''}`}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            {error && <p className="inline-error" role="alert">{error}</p>}
          </label>
          <div className="login-actions">
            <button className="btn btn--primary btn--full" type="submit" disabled={submitting}>
              {submitting ? 'Memproses...' : 'Masuk'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
