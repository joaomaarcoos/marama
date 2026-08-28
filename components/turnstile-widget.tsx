'use client'

import Script from 'next/script'
import { useCallback, useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
    }
  }
}

type TurnstileWidgetProps = {
  siteKey: string
  action: string
  theme?: 'dark' | 'light'
  resetKey?: number
  onToken: (token: string) => void
}

export function TurnstileWidget({ siteKey, action, theme = 'light', resetKey = 0, onToken }: TurnstileWidgetProps) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const [scriptReady, setScriptReady] = useState(false)

  const renderWidget = useCallback(() => {
    if (!container.current || !window.turnstile) return
    if (widgetId.current) window.turnstile.remove(widgetId.current)
    container.current.replaceChildren()
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      action,
      theme,
      size: 'flexible',
      callback: (token: string) => onToken(token),
      'expired-callback': () => onToken(''),
      'error-callback': () => onToken(''),
    })
  }, [action, onToken, siteKey, theme])

  useEffect(() => {
    if (scriptReady) renderWidget()
    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [renderWidget, resetKey, scriptReady])

  return (
    <div className="min-h-[65px]" aria-label="Verificação de segurança">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setScriptReady(true)} />
      <div ref={container} />
    </div>
  )
}
