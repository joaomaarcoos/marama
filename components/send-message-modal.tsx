'use client'

import { useState } from 'react'
import { Send, X, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react'

interface SendMessageModalProps {
  phone: string
  contactName: string
}

export function SendMessageModal({ phone, contactName }: SendMessageModalProps) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  function handleOpen() {
    setOpen(true)
    setMessage('')
    setResult(null)
    setErrorMsg('')
  }

  function handleClose() {
    if (sending) return
    setOpen(false)
  }

  async function handleSend() {
    if (!message.trim() || sending) return

    setSending(true)
    setResult(null)

    try {
      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message: message.trim() }),
      })

      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Erro ao enviar mensagem.')
        setResult('error')
      } else {
        setResult('success')
        setMessage('')
        setTimeout(() => setOpen(false), 1500)
      }
    } catch {
      setErrorMsg('Falha na conexão. Tente novamente.')
      setResult('error')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
        style={{
          color: 'hsl(213 31% 92%)',
          background: 'hsl(217 91% 60% / 0.15)',
          border: '1px solid hsl(217 91% 60% / 0.3)',
        }}
      >
        <MessageSquare size={13} />
        Enviar mensagem
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div
            className="w-full max-w-md rounded-2xl"
            style={{
              background: 'hsl(220 40% 8%)',
              border: '1px solid hsl(216 32% 18%)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid hsl(216 32% 15%)' }}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: 'hsl(213 31% 92%)' }}>
                  Enviar mensagem
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(215 18% 45%)' }}>
                  {contactName} · {phone}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                style={{ color: 'hsl(215 18% 45%)' }}
                disabled={sending}
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              {result === 'success' ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <CheckCircle2 size={32} style={{ color: 'hsl(160 84% 39%)' }} />
                  <p className="text-sm font-medium" style={{ color: 'hsl(213 31% 92%)' }}>
                    Mensagem enviada!
                  </p>
                </div>
              ) : (
                <>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    rows={4}
                    disabled={sending}
                    className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none transition-colors"
                    style={{
                      background: 'hsl(220 36% 11%)',
                      border: '1px solid hsl(216 32% 18%)',
                      color: 'hsl(213 31% 92%)',
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend()
                    }}
                  />
                  <p className="mt-2 text-xs leading-5" style={{ color: 'hsl(215 18% 42%)' }}>
                    A mensagem sai assinada com seu nome em negrito e pausa a MARA neste contato.
                  </p>

                  {result === 'error' && (
                    <div
                      className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                      style={{ background: 'hsl(0 84% 39% / 0.12)', color: 'hsl(0 84% 60%)', border: '1px solid hsl(0 84% 39% / 0.25)' }}
                    >
                      <AlertCircle size={13} />
                      {errorMsg}
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-xs" style={{ color: 'hsl(215 18% 40%)' }}>
                      Ctrl+Enter para enviar
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleClose}
                        disabled={sending}
                        className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
                        style={{ background: 'hsl(220 36% 13%)', color: 'hsl(215 18% 55%)', border: '1px solid hsl(216 32% 18%)' }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSend}
                        disabled={!message.trim() || sending}
                        className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
                        style={{ background: 'hsl(160 84% 39%)', color: 'hsl(220 26% 8%)' }}
                      >
                        <Send size={13} />
                        {sending ? 'Enviando...' : 'Enviar'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
