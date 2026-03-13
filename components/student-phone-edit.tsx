'use client'

import { useState, useRef, useEffect } from 'react'
import { Pencil, Check, X, Loader2, Phone } from 'lucide-react'
import { formatPhone } from '@/lib/utils'

interface StudentPhoneEditProps {
  studentId: string
  initialPhone: string | null
}

export default function StudentPhoneEdit({ studentId, initialPhone }: StudentPhoneEditProps) {
  const [phone, setPhone] = useState<string | null>(initialPhone)
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setInputValue(phone ?? '')
      setError(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [editing, phone])

  const save = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/moodle/students/${studentId}/phone`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: inputValue.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao salvar')
        return
      }
      setPhone(data.phone)
      setEditing(false)
    } catch {
      setError('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  const cancel = () => {
    setEditing(false)
    setError(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') cancel()
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="tel"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="(98) 98765-4321"
            className="w-36 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
          ) : (
            <>
              <button
                onClick={save}
                title="Salvar"
                className="text-green-600 hover:text-green-700"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={cancel}
                title="Cancelar"
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Clique para editar o telefone"
      className="group flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600 transition-colors"
    >
      {phone ? (
        <>
          <Phone className="h-3 w-3 text-gray-400 group-hover:text-blue-400" />
          {formatPhone(phone)}
        </>
      ) : (
        <span className="text-xs text-gray-400 italic hover:text-blue-500">+ Adicionar</span>
      )}
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 text-blue-400 transition-opacity" />
    </button>
  )
}
