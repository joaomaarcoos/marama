'use client'

import { useState, useEffect, useRef } from 'react'
import { login } from './actions'
import { Loader2 } from 'lucide-react'
import { MARAOrb } from '@/components/mara-orb'

/* ─── Canvas particle system ─────────────────────────────────── */
function ParticleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number

    function resize() {
      canvas!.width = canvas!.offsetWidth
      canvas!.height = canvas!.offsetHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const N = 70
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.2 + 0.3,
      o: Math.random() * 0.4 + 0.1,
    }))

    function frame(t: number) {
      const W = canvas!.width, H = canvas!.height
      ctx!.clearRect(0, 0, W, H)

      for (let gx = 0; gx <= W; gx += 44) {
        for (let gy = 0; gy <= H; gy += 44) {
          const pulse = (Math.sin(t * 0.0009 + gx * 0.012 + gy * 0.012) + 1) * 0.5
          ctx!.globalAlpha = 0.03 + pulse * 0.045
          ctx!.fillStyle = '#00d4ff'
          ctx!.beginPath()
          ctx!.arc(gx, gy, 0.9, 0, Math.PI * 2)
          ctx!.fill()
        }
      }
      ctx!.globalAlpha = 1

      for (const p of pts) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0
      }

      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y
          const d = Math.hypot(dx, dy)
          if (d < 130) {
            ctx!.globalAlpha = (1 - d / 130) * 0.14
            ctx!.strokeStyle = '#1db87a'
            ctx!.lineWidth = 0.6
            ctx!.beginPath()
            ctx!.moveTo(pts[i].x, pts[i].y)
            ctx!.lineTo(pts[j].x, pts[j].y)
            ctx!.stroke()
          }
        }
      }
      ctx!.globalAlpha = 1

      for (const p of pts) {
        ctx!.globalAlpha = p.o
        ctx!.fillStyle = '#00d4ff'
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.fill()
      }
      ctx!.globalAlpha = 1
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return <canvas ref={ref} className="absolute inset-0 w-full h-full" />
}

/* ─── Main page ──────────────────────────────────────────────── */
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
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: '#050e1a', fontFamily: "'Manrope', sans-serif" }}
    >
      {/* Particle canvas */}
      <div className="absolute inset-0 pointer-events-none">
        <ParticleCanvas />
        {/* Ambient glow */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(29,184,122,0.06) 0%, transparent 65%)',
          }}
        />
      </div>

      {/* ══ Login card ══ */}
      <div
        className="login-card relative z-10 w-full mx-4"
        style={{
          maxWidth: 380,
          background: 'rgba(8,18,34,0.82)',
          border: '1px solid rgba(29,184,122,0.2)',
          borderRadius: 20,
          padding: '40px 36px 32px',
          backdropFilter: 'blur(24px)',
          boxShadow:
            '0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04), 0 0 60px -20px rgba(29,184,122,0.2)',
        }}
      >
        {/* Orb + title */}
        <div className="flex flex-col items-center mb-8 gap-4">
          <MARAOrb size={167} startDelay={2000} />

          <div className="text-center">
            <h1
              style={{
                fontFamily: "'Sora', sans-serif",
                fontWeight: 800,
                fontSize: '1.75rem',
                letterSpacing: '-0.01em',
                color: 'rgba(255,255,255,0.95)',
                lineHeight: 1.1,
              }}
            >
              MARA
            </h1>
            <p
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: '0.72rem',
                color: 'rgba(255,255,255,0.35)',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginTop: 4,
              }}
            >
              Maranhão Profissionalizado
            </p>
          </div>

          {/* Divider */}
          <div
            style={{
              width: '100%',
              height: 1,
              background:
                'linear-gradient(to right, transparent, rgba(29,184,122,0.3), rgba(0,212,255,0.2), transparent)',
            }}
          />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label
              style={{
                display: 'block',
                fontFamily: "'Sora', sans-serif",
                fontSize: '0.6rem',
                fontWeight: 600,
                letterSpacing: '0.14em',
                color: 'rgba(0,212,255,0.55)',
                textTransform: 'uppercase',
                marginBottom: 7,
              }}
            >
              E-mail
            </label>
            <input
              className="mara-input"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="gestor@ma.gov.br"
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontFamily: "'Sora', sans-serif",
                fontSize: '0.6rem',
                fontWeight: 600,
                letterSpacing: '0.14em',
                color: 'rgba(0,212,255,0.55)',
                textTransform: 'uppercase',
                marginBottom: 7,
              }}
            >
              Senha
            </label>
            <input
              className="mara-input"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.25)',
                color: 'rgba(252,165,165,0.9)',
                fontSize: '0.82rem',
              }}
            >
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="mara-btn" style={{ marginTop: 4 }}>
            {loading ? (
              <>
                <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                Autenticando...
              </>
            ) : (
              'Entrar'
            )}
          </button>
        </form>
      </div>

      {/* ══ Footer ══ */}
      <div
        className="relative z-10 flex flex-col items-center gap-2 mt-8"
        style={{ animation: 'card-in 0.7s 0.35s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        {/* Status dots */}
        <div className="flex items-center gap-5">
          {[
            { color: '#1db87a', label: 'Online' },
            { color: '#00d4ff', label: 'IA Ativa' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span
                style={{
                  width: 5, height: 5, borderRadius: '50%', display: 'inline-block',
                  background: s.color, boxShadow: `0 0 5px ${s.color}`,
                  animation: 'blink 2s ease-in-out infinite',
                }}
              />
              <span
                style={{
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: '0.6rem', letterSpacing: '0.1em',
                  color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase',
                }}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Credit */}
        <p
          style={{
            fontFamily: "'Manrope', sans-serif",
            fontSize: '0.65rem',
            color: 'rgba(255,255,255,0.18)',
            letterSpacing: '0.06em',
          }}
        >
          Desenvolvido por{' '}
          <span style={{ color: 'rgba(29,184,122,0.5)', fontWeight: 600 }}>
            João Dantas
          </span>
        </p>
      </div>
    </div>
  )
}
