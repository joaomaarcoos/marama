'use client'

import { useState } from 'react'
import { login } from './actions'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const formData = new FormData(e.currentTarget)
    const result = await login(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'hsl(222 50% 3%)' }}
    >
      {/* Dot grid background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle, hsl(216 32% 14%) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          opacity: 0.5,
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full blur-3xl pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse, hsl(38 92% 50% / 0.06) 0%, transparent 70%)',
        }}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-xs mx-4 rounded-2xl p-8 animate-fade-up"
        style={{
          background: 'hsl(220 40% 7%)',
          border: '1px solid hsl(216 32% 14%)',
          boxShadow:
            '0 32px 64px -16px hsl(222 50% 2% / 0.9), 0 0 0 1px hsl(38 92% 50% / 0.05)',
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
            style={{
              background: 'hsl(38 92% 50% / 0.08)',
              border: '1px solid hsl(38 92% 50% / 0.2)',
              boxShadow: '0 0 30px -6px hsl(38 92% 50% / 0.2)',
            }}
          >
            <span
              className="font-display italic font-bold text-xl"
              style={{
                color: 'hsl(38 92% 50%)',
                textShadow: '0 0 20px hsl(38 92% 50% / 0.5)',
              }}
            >
              M
            </span>
          </div>

          <h1
            className="font-display italic font-bold text-4xl tracking-tight leading-none"
            style={{
              color: 'hsl(38 92% 52%)',
              textShadow: '0 0 40px hsl(38 92% 50% / 0.25)',
            }}
          >
            MARA
          </h1>
          <p
            className="mt-2 text-center"
            style={{
              color: 'hsl(215 18% 35%)',
              fontSize: '0.65rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            Maranhão Profissionalizado
          </p>
        </div>

        {/* Divider */}
        <div
          className="mb-6 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, hsl(216 32% 18%), transparent)',
          }}
        />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block font-medium uppercase"
              style={{
                color: 'hsl(215 18% 45%)',
                fontSize: '0.62rem',
                letterSpacing: '0.1em',
              }}
            >
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="gestor@ma.gov.br"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm transition-all duration-150 outline-none placeholder:text-[hsl(215_18%_28%)]"
              style={{
                background: 'hsl(219 36% 9%)',
                border: '1px solid hsl(216 32% 17%)',
                color: 'hsl(213 31% 85%)',
                caretColor: 'hsl(38 92% 50%)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.border =
                  '1px solid hsl(38 92% 50% / 0.45)'
                e.currentTarget.style.boxShadow =
                  '0 0 0 3px hsl(38 92% 50% / 0.07)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = '1px solid hsl(216 32% 17%)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block font-medium uppercase"
              style={{
                color: 'hsl(215 18% 45%)',
                fontSize: '0.62rem',
                letterSpacing: '0.1em',
              }}
            >
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm transition-all duration-150 outline-none placeholder:text-[hsl(215_18%_28%)]"
              style={{
                background: 'hsl(219 36% 9%)',
                border: '1px solid hsl(216 32% 17%)',
                color: 'hsl(213 31% 85%)',
                caretColor: 'hsl(38 92% 50%)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.border =
                  '1px solid hsl(38 92% 50% / 0.45)'
                e.currentTarget.style.boxShadow =
                  '0 0 0 3px hsl(38 92% 50% / 0.07)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = '1px solid hsl(216 32% 17%)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>

          {error && (
            <div
              className="px-3.5 py-2.5 rounded-lg text-sm"
              style={{
                background: 'hsl(0 63% 50% / 0.08)',
                border: '1px solid hsl(0 63% 50% / 0.2)',
                color: 'hsl(0 70% 65%)',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2 mt-1"
            style={{
              background: loading
                ? 'hsl(38 92% 50% / 0.45)'
                : 'hsl(38 92% 50%)',
              color: 'hsl(222 50% 4%)',
              boxShadow: loading
                ? 'none'
                : '0 4px 20px -4px hsl(38 92% 50% / 0.45)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Entrando...
              </>
            ) : (
              'Acessar Sistema'
            )}
          </button>
        </form>

        <p
          className="mt-6 text-center"
          style={{
            color: 'hsl(215 18% 25%)',
            fontSize: '0.6rem',
            letterSpacing: '0.05em',
          }}
        >
          SISTEMAMARA · Acesso Restrito
        </p>
      </div>
    </div>
  )
}
