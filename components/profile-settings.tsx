'use client'

import { useRef, useState, useTransition } from 'react'
import { Camera, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, User } from 'lucide-react'
import { updateProfile, updateEmail, updatePassword, uploadAvatar } from '@/app/(dashboard)/configuracoes/actions'
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from '@/lib/roles'

interface ProfileUser {
  id: string
  email: string
  fullName: string
  phone: string
  avatarUrl: string | null
  role: UserRole
}

function Toast({ type, text }: { type: 'success' | 'error'; text: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
      style={
        type === 'success'
          ? { background: 'hsl(142 71% 45% / 0.12)', color: 'hsl(142 71% 35%)', border: '1px solid hsl(142 71% 45% / 0.3)' }
          : { background: 'hsl(0 84% 60% / 0.12)', color: 'hsl(0 84% 50%)', border: '1px solid hsl(0 84% 60% / 0.3)' }
      }
    >
      {type === 'success'
        ? <CheckCircle2 className="h-4 w-4 shrink-0" />
        : <AlertCircle className="h-4 w-4 shrink-0" />}
      {text}
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-6"
      style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
    >
      <div className="mb-5">
        <h2 className="text-base font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{title}</h2>
        {description && <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{description}</p>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputClass = "w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
const inputStyle = {
  background: 'hsl(var(--background))',
  border: '1px solid hsl(var(--border))',
  color: 'hsl(var(--foreground))',
}

function SaveButton({ pending, label = 'Salvar alterações' }: { pending: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-60"
      style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {label}
    </button>
  )
}

// ── Avatar Section ────────────────────────────────────────────────────────────

function AvatarSection({ user, onAvatarChange }: { user: ProfileUser; onAvatarChange: (url: string) => void }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [preview, setPreview] = useState<string | null>(user.avatarUrl)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)

    const fd = new FormData()
    fd.append('avatar', file)
    startTransition(async () => {
      const result = await uploadAvatar(fd)
      if (result.error) {
        setMsg({ type: 'error', text: result.error })
        setPreview(user.avatarUrl)
      } else {
        setMsg({ type: 'success', text: result.success! })
        if (result.avatarUrl) onAvatarChange(result.avatarUrl)
      }
      setTimeout(() => setMsg(null), 4000)
    })
  }

  const initials = user.fullName
    ? user.fullName.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : user.email.slice(0, 2).toUpperCase()

  return (
    <Section title="Foto de perfil" description="JPG, PNG ou WebP · máximo 2 MB">
      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <div
            className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-xl font-bold"
            style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}
          >
            {preview
              ? <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
              : initials}
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center transition-opacity disabled:opacity-50"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
            title="Alterar foto"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>

        <div className="min-w-0">
          <p className="font-medium text-sm truncate" style={{ color: 'hsl(var(--foreground))' }}>
            {user.fullName || user.email}
          </p>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {user.email}
          </p>
          <span
            className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{
              background: ROLE_COLORS[user.role] + '22',
              color: ROLE_COLORS[user.role],
              border: `1px solid ${ROLE_COLORS[user.role]}44`,
            }}
          >
            {ROLE_LABELS[user.role]}
          </span>
        </div>
      </div>

      {msg && <div className="mt-4"><Toast type={msg.type} text={msg.text} /></div>}
    </Section>
  )
}

// ── Personal Info Section ─────────────────────────────────────────────────────

function PersonalInfoSection({ user }: { user: ProfileUser }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateProfile(fd)
      setMsg({ type: result.error ? 'error' : 'success', text: result.error ?? result.success! })
      setTimeout(() => setMsg(null), 4000)
    })
  }

  return (
    <Section title="Informações pessoais">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome completo">
            <input
              name="full_name"
              defaultValue={user.fullName}
              placeholder="Seu nome completo"
              className={inputClass}
              style={inputStyle}
            />
          </Field>
          <Field label="Celular / WhatsApp">
            <input
              name="phone"
              defaultValue={user.phone}
              placeholder="+55 (00) 00000-0000"
              className={inputClass}
              style={inputStyle}
            />
          </Field>
        </div>

        {msg && <Toast type={msg.type} text={msg.text} />}

        <div className="flex justify-end pt-1">
          <SaveButton pending={pending} />
        </div>
      </form>
    </Section>
  )
}

// ── Email Section ─────────────────────────────────────────────────────────────

function EmailSection({ user }: { user: ProfileUser }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateEmail(fd)
      setMsg({ type: result.error ? 'error' : 'success', text: result.error ?? result.success! })
      setTimeout(() => setMsg(null), 6000)
    })
  }

  return (
    <Section title="E-mail" description="Um link de confirmação será enviado para o novo endereço.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="E-mail atual">
          <input
            value={user.email}
            disabled
            className={inputClass}
            style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }}
          />
        </Field>
        <Field label="Novo e-mail">
          <input
            name="email"
            type="email"
            placeholder="novo@email.com"
            className={inputClass}
            style={inputStyle}
          />
        </Field>

        {msg && <Toast type={msg.type} text={msg.text} />}

        <div className="flex justify-end pt-1">
          <SaveButton pending={pending} label="Alterar e-mail" />
        </div>
      </form>
    </Section>
  )
}

// ── Password Section ──────────────────────────────────────────────────────────

function PasswordSection() {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updatePassword(fd)
      setMsg({ type: result.error ? 'error' : 'success', text: result.error ?? result.success! })
      if (!result.error) formRef.current?.reset()
      setTimeout(() => setMsg(null), 4000)
    })
  }

  return (
    <Section title="Segurança" description="A senha deve ter pelo menos 8 caracteres.">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nova senha">
            <div className="relative">
              <input
                name="password"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                className={inputClass}
                style={{ ...inputStyle, paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="Confirmar nova senha">
            <div className="relative">
              <input
                name="confirm"
                type={showConfirm ? 'text' : 'password'}
                placeholder="••••••••"
                className={inputClass}
                style={{ ...inputStyle, paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
        </div>

        {msg && <Toast type={msg.type} text={msg.text} />}

        <div className="flex justify-end pt-1">
          <SaveButton pending={pending} label="Alterar senha" />
        </div>
      </form>
    </Section>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ProfileSettings({ user }: { user: ProfileUser }) {
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(user.avatarUrl)
  const userWithAvatar = { ...user, avatarUrl: currentAvatarUrl }

  return (
    <div className="max-w-2xl space-y-5">
      <AvatarSection user={userWithAvatar} onAvatarChange={setCurrentAvatarUrl} />
      <PersonalInfoSection user={userWithAvatar} />
      <EmailSection user={userWithAvatar} />
      <PasswordSection />
    </div>
  )
}
