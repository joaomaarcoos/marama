'use client'

import { useEffect, useRef } from 'react'

interface MARAOrbProps {
  size?: number
  startDelay?: number   // ms before intro animation begins (animated mode only)
  isStatic?: boolean    // true = draw final state once, no animation
}

export function MARAOrb({ size = 167, startDelay = 0, isStatic = false }: MARAOrbProps) {
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
    const scale = (size * 0.46) / 132
    const R = 132 * scale
    const spacing = 18 * scale
    const msx = 105 * scale
    const msy = 100 * scale
    const minMDot  = size * 0.022
    const minBgDot = size * 0.007

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
      return left || right
        || distToSeg(nx, ny, -0.56, -0.62, 0, 0.05) < 0.11
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
        const rawR = isM
          ? (5.8 + 1.5 * Math.max(0, edgeFactor)) * scale
          : (1.2 + 2.1 * Math.max(0, edgeFactor) ** 1.6) * scale
        const baseR = isM ? Math.max(minMDot, rawR) : Math.max(minBgDot, rawR)

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

    /* ── STATIC MODE: draw final settled state once ── */
    if (isStatic) {
      ctx.clearRect(0, 0, size, size)
      for (const d of dots) {
        ctx.globalAlpha = d.brightness
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.baseR, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      return
    }

    /* ── ANIMATED MODE: fly-in + pulse ── */
    const INTRO = 4000
    let t0: number | null = null
    let raf: number

    function frame(now: number) {
      if (t0 === null) t0 = now
      const elapsed = now - t0 - startDelay

      ctx.clearRect(0, 0, size, size)

      if (elapsed < 0) {
        raf = requestAnimationFrame(frame)
        return
      }

      const t = Math.min(1, elapsed / INTRO)

      // Subtle halo ring
      const haloAlpha = (10 + 8 * Math.sin(now * 0.002)) / 255
      ctx.globalAlpha = haloAlpha
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = Math.max(0.5, 0.8 * scale)
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
  }, [size, startDelay, isStatic])

  return <canvas ref={ref} style={{ display: 'block' }} />
}
