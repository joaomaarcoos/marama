'use client'

import { useState } from 'react'
import { GraduationCap, ShieldCheck, Loader2 } from 'lucide-react'

interface StudentRoleToggleProps {
  studentId: string
  initialRole: 'aluno' | 'gestor'
}

export default function StudentRoleToggle({ studentId, initialRole }: StudentRoleToggleProps) {
  const [role, setRole] = useState<'aluno' | 'gestor'>(initialRole)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    const newRole = role === 'aluno' ? 'gestor' : 'aluno'
    setLoading(true)
    try {
      const res = await fetch(`/api/moodle/students/${studentId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (res.ok) setRole(newRole)
    } catch {
      // silently fail — show current state
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <Loader2 className="h-3 w-3 animate-spin" />
      </span>
    )
  }

  return (
    <button
      onClick={toggle}
      title={`Clique para mudar para ${role === 'aluno' ? 'gestor' : 'aluno'}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        role === 'gestor'
          ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
      }`}
    >
      {role === 'gestor' ? (
        <>
          <ShieldCheck className="h-3 w-3" />
          Gestor
        </>
      ) : (
        <>
          <GraduationCap className="h-3 w-3" />
          Aluno
        </>
      )}
    </button>
  )
}
