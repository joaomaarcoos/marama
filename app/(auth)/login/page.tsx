'use client'

import { useState, useEffect, useRef } from 'react'
import { login } from './actions'
import { Loader2 } from 'lucide-react'

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

/* ─── MARA canvas orb — dot-M field (port of Python animation) ── */
function MARAOrb({ size = 167 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const DPR = window.devicePixelRatio || 1
    canvas.width = size * DPR
    canvas.height = size * DPR
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.scale(DPR, DPR)

    const cx = size / 2, cy = size / 2
    // Scale so the dot field fills ~92% of the canvas diameter
    const scale = (size * 0.46) / 132
    const R = 132 * scale          // field radius ≈ size*0.46
    const spacing = 18 * scale     // dot grid spacing
    // M normalization factors (same as Python: /105, /100)
    const msx = 105 * scale
    const msy = 100 * scale

    // Seeded LCG (approximates Python random.seed(11) distribution)
    let seed = 11
    function rnd() {
      seed = Math.imul(seed, 1664525) + 1013904223 | 0
      return (seed >>> 0) / 0xFFFFFFFF
    }

    function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
      const abx = bx - ax, aby = by - ay
      const ab2 = abx * abx + aby * aby
      const t2 = ab2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / ab2))
      return Math.hypot(px - (ax + t2 * abx), py - (ay + t2 * aby))
    }

    function pointInM(x: number, y: number) {
      const nx = (x - cx) / msx
      const ny = (y - cy) / msy
      const left  = nx > -0.82 && nx < -0.56 && ny > -0.72 && ny < 0.55
      const right = nx >  0.56 && nx <  0.82 && ny > -0.72 && ny < 0.55
      return left || right || distToSeg(nx, ny, -0.56, -0.62, 0, 0.05) < 0.11
                           || distToSeg(nx, ny,  0.56, -0.62, 0, 0.05) < 0.11
    }

    type Dot = {
      x: number; y: number; sx: number; sy: number
      baseR: number; brightness: number; isM: boolean
      phase: number; delay: number
    }

    const dots: Dot[] = []
    const steps = Math.ceil(R / spacing) + 2

    for (let row = -steps; row <= steps; row++) {
      for (let col = -steps; col <= steps; col++) {
        const stagger = (Math.abs(row) % 2) * (spacing * 0.5)
        const x = cx + col * spacing + stagger
        const y = cy + row * spacing
        const rr = Math.hypot(x - cx, y - cy)
        if (rr > R) continue

        const edgeFactor = 1 - rr / R
        const isM = pointInM(x, y)
        const baseR = isM
          ? (5.8 + 1.5 * Math.max(0, edgeFactor)) * scale
          : (1.2 + 2.1 * Math.max(0, edgeFactor) ** 1.6) * scale

        const ang = Math.atan2(y - cy, x - cx)
        const startR = R + (65 + rnd() * 26 + 10) * scale
        dots.push({
          x, y,
          sx: cx + Math.cos(ang) * startR,
          sy: cy + Math.sin(ang) * startR,
          baseR,
          brightness: isM ? 1.0 : 0.78,
          isM,
          phase: rnd() * Math.PI * 2,
          delay: rnd() * 0.24 + (isM ? 0.04 : 0.0),
        })
      }
    }

    function easeOut(t: number) { return 1 - (1 - t) ** 3 }

    const DELAY = 2000  // ms to wait before animation starts
    const INTRO = 4000  // ms for fly-in
    let t0: number | null = null
    let raf: number

    function frame(now: number) {
      if (t0 === null) t0 = now
      const elapsed = now - t0 - DELAY  // subtract 2s delay

      ctx.clearRect(0, 0, size, size)

      // During delay: blank canvas
      if (elapsed < 0) {
        raf = requestAnimationFrame(frame)
        return
      }

      const t = Math.min(1, elapsed / INTRO)

      // Subtle halo
      const haloAlpha = (12 + 10 * Math.sin(now * 0.002)) / 255
      ctx.globalAlpha = haloAlpha
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.8 * scale
      ctx.beginPath()
      ctx.arc(cx, cy, R + 2 * scale, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1

      for (const d of dots) {
        const lt = Math.max(0, Math.min(1, (t - d.delay) / 0.42))
        const e = easeOut(lt)
        const x = d.sx + (d.x - d.sx) * e
        const y = d.sy + (d.y - d.sy) * e

        const pulse = lt >= 1
          ? 1 + (d.isM ? 0.10 : 0.06) * Math.sin(now * 0.00346 + d.phase)
          : 0.55 + 0.45 * e

        const r = d.baseR * pulse
        const alpha = d.brightness * Math.min(1, 0.18 + 1.25 * e)

        ctx.globalAlpha = alpha
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [size])

  return <canvas ref={ref} style={{ display: 'block' }} />
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
          <MARAOrb size={220} />

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
