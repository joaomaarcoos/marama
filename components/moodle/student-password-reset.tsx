'use client'

import { useState } from 'react'
import { KeyRound, X, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react'

interface Props {
  id: string
  fullName: string
  email: string | null
  hasMoodleId: boolean
}

type Mode = 'set' | 'email'

export function StudentPasswordReset({ id, fullName, email, hasMoodleId }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('set')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  function handleOpen() {
    setOpen(true)
    setMode('set')
    setPassword('')
    setConfirm('')
    setResult(null)
    setErrorMsg('')
    setShowPwd(false)
  }

  function handleClose() {
    if (loading) return
    setOpen(false)
  }

  function validate(): string | null {
    if (mode === 'set') {
      if (password.length < 8) return 'A senha deve ter pelo menos 8 caracteres.'
      if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'A senha deve conter letras e números.'
      if (password !== confirm) return 'As senhas não coincidem.'
    }
    return null
  }

  async function handleSubmit() {
    const validationError = validate()
    if (validationError) {
      setErrorMsg(validationError)
      setResult('error')
      return
    }

    setLoading(true)
    setResult(null)
    setErrorMsg('')

    try {
      const body = mode === 'set'
        ? { mode: 'set', password }
        : { mode: 'email' }

      const res = await fetch(`/api/moodle/students/${id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Erro ao processar.')
        setResult('error')
      } else {
        setResult('success')
        setTimeout(() => setOpen(false), 2000)
      }
    } catch {
      setErrorMsg('Falha na conexão. Tente novamente.')
      setResult('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={!hasMoodleId}
        title={hasMoodleId ? 'Redefinir senha do Moodle' : 'Aluno sem vínculo Moodle'}
        className="flex items-center justify-center rounded-lg p-1.5 transition-opacity hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ color: 'hsl(215 18% 55%)', background: 'hsl(220 36% 12%)', border: '1px solid hsl(216 32% 18%)' }}
      >
        <KeyRound size={13} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div
            className="w-full max-w-sm rounded-2xl"
            style={{ background: 'hsl(220 40% 8%)', border: '1px solid hsl(216 32% 18%)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid hsl(216 32% 15%)' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'hsl(213 31% 92%)' }}>
                  Redefinir senha do Moodle
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(215 18% 45%)' }}>
                  {fullName}{email ? ` · ${email}` : ''}
                </p>
              </div>
              <button onClick={handleClose} disabled={loading} className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ color: 'hsl(215 18% 45%)' }}>
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              {result === 'success' ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <CheckCircle2 size={32} style={{ color: 'hsl(160 84% 39%)' }} />
                  <p className="text-sm font-medium" style={{ color: 'hsl(213 31% 92%)' }}>
                    {mode === 'set' ? 'Senha alterada com sucesso!' : 'Email de redefinição enviado!'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Modo */}
                  <div className="mb-4 flex flex-col gap-2">
                    {(['set', 'email'] as const).map(opt => (
                      <label
                        key={opt}
                        className="flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2"
                        style={{
                          background: mode === opt ? 'hsl(160 84% 39% / 0.1)' : 'hsl(220 36% 11%)',
                          border: `1px solid ${mode === opt ? 'hsl(160 84% 39% / 0.3)' : 'hsl(216 32% 18%)'}`,
                        }}
                      >
                        <input
                          type="radio"
                          name="mode"
                          checked={mode === opt}
                          onChange={() => { setMode(opt); setResult(null); setErrorMsg('') }}
                          style={{ accentColor: 'hsl(160 84% 39%)' }}
                        />
                        <span className="text-sm" style={{ color: 'hsl(213 31% 88%)' }}>
                          {opt === 'set' ? 'Definir nova senha diretamente' : 'Enviar link de reset por email'}
                        </span>
                      </label>
                    ))}
                  </div>

                  {/* Campo de senha */}
                  {mode === 'set' && (
                    <div className="flex flex-col gap-2 mb-4">
                      <div className="relative">
                        <input
                          type={showPwd ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="Nova senha (mín. 8 chars, letras + números)"
                          disabled={loading}
                          className="w-full rounded-xl px-3 py-2 pr-9 text-sm outline-none"
                          style={{ background: 'hsl(220 36% 11%)', border: '1px solid hsl(216 32% 18%)', color: 'hsl(213 31% 92%)' }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd(v => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2"
                          style={{ color: 'hsl(215 18% 45%)' }}
                        >
                          {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <input
                        type={showPwd ? 'text' : 'password'}
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        placeholder="Confirmar senha"
                        disabled={loading}
                        className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                        style={{ background: 'hsl(220 36% 11%)', border: '1px solid hsl(216 32% 18%)', color: 'hsl(213 31% 92%)' }}
                        onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                      />
                    </div>
                  )}

                  {mode === 'email' && (
                    <p className="mb-4 text-xs rounded-lg px-3 py-2" style={{ background: 'hsl(220 36% 11%)', color: 'hsl(215 18% 55%)', border: '1px solid hsl(216 32% 18%)' }}>
                      Um email de redefinição será enviado para: <strong style={{ color: 'hsl(213 31% 78%)' }}>{email ?? 'email não cadastrado'}</strong>
                    </p>
                  )}

                  {result === 'error' && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'hsl(0 84% 39% / 0.12)', color: 'hsl(0 84% 60%)', border: '1px solid hsl(0 84% 39% / 0.25)' }}>
                      <AlertCircle size={13} />
                      {errorMsg}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleClose}
                      disabled={loading}
                      className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80"
                      style={{ background: 'hsl(220 36% 13%)', color: 'hsl(215 18% 55%)', border: '1px solid hsl(216 32% 18%)' }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={loading || (mode === 'email' && !email)}
                      className="flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
                      style={{ background: 'hsl(160 84% 39%)', color: 'hsl(220 26% 8%)' }}
                    >
                      {loading ? 'Aguarde...' : mode === 'set' ? 'Alterar senha' : 'Enviar email'}
                    </button>
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
