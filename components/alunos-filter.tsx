'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Filter, X, ChevronDown, Search } from 'lucide-react'

interface Course {
  id: number
  fullname: string
  shortname: string
}

interface AlunosFilterProps {
  courses: Course[]
  currentCurso?: string
  currentTipo?: string
  currentCpf?: string
  currentTel?: string
  currentQ?: string
}

export function AlunosFilter({ courses, currentCurso, currentTipo, currentCpf, currentTel, currentQ }: AlunosFilterProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [curso, setCurso] = useState(currentCurso ?? '')
  const [tipo, setTipo] = useState(currentTipo ?? '')
  const [cpf, setCpf] = useState(currentCpf ?? '')
  const [tel, setTel] = useState(currentTel ?? '')
  const [courseSearch, setCourseSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const activeCount = [currentCurso, currentTipo, currentCpf, currentTel].filter(Boolean).length

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  function apply() {
    const p = new URLSearchParams()
    if (currentQ) p.set('q', currentQ)
    if (curso) p.set('curso', curso)
    if (tipo) p.set('tipo', tipo)
    if (cpf) p.set('cpf', cpf)
    if (tel) p.set('tel', tel)
    router.push(`/alunos${p.toString() ? `?${p.toString()}` : ''}`)
    setOpen(false)
  }

  function clear() {
    setCurso(''); setTipo(''); setCpf(''); setTel('')
    const p = new URLSearchParams()
    if (currentQ) p.set('q', currentQ)
    router.push(`/alunos${p.toString() ? `?${p.toString()}` : ''}`)
    setOpen(false)
  }

  const filteredCourses = courses.filter(c =>
    (c.fullname + c.shortname).toLowerCase().includes(courseSearch.toLowerCase())
  )

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all"
        style={{
          background: activeCount > 0 ? 'hsl(160 84% 39% / 0.15)' : 'hsl(220 40% 8%)',
          border: activeCount > 0 ? '1px solid hsl(160 84% 39% / 0.4)' : '1px solid hsl(216 32% 15%)',
          color: activeCount > 0 ? 'hsl(160 84% 39%)' : 'hsl(215 18% 55%)',
        }}
      >
        <Filter size={14} />
        Filtrar
        {activeCount > 0 && (
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
            style={{ background: 'hsl(160 84% 39%)', color: 'hsl(220 26% 8%)' }}
          >
            {activeCount}
          </span>
        )}
        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 50,
            width: '280px',
            borderRadius: '12px',
            background: 'hsl(220 40% 8%)',
            border: '1px solid hsl(216 32% 18%)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* Tipo */}
          <div>
            <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'hsl(215 18% 42%)', marginBottom: '8px' }}>
              Tipo
            </p>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { value: '', label: 'Todos' },
                { value: 'aluno', label: 'Alunos' },
                { value: 'gestor', label: 'Gestores' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTipo(opt.value)}
                  className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all"
                  style={{
                    background: tipo === opt.value ? 'hsl(160 84% 39% / 0.15)' : 'hsl(220 36% 11%)',
                    border: `1px solid ${tipo === opt.value ? 'hsl(160 84% 39% / 0.4)' : 'hsl(216 32% 18%)'}`,
                    color: tipo === opt.value ? 'hsl(160 84% 39%)' : 'hsl(213 31% 70%)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* CPF */}
          <div>
            <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'hsl(215 18% 42%)', marginBottom: '8px' }}>
              CPF
            </p>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { value: '', label: 'Todos' },
                { value: 'com', label: 'Com CPF' },
                { value: 'sem', label: 'Sem CPF' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCpf(opt.value)}
                  className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all"
                  style={{
                    background: cpf === opt.value ? 'hsl(160 84% 39% / 0.15)' : 'hsl(220 36% 11%)',
                    border: `1px solid ${cpf === opt.value ? 'hsl(160 84% 39% / 0.4)' : 'hsl(216 32% 18%)'}`,
                    color: cpf === opt.value ? 'hsl(160 84% 39%)' : 'hsl(213 31% 70%)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Telefone */}
          <div>
            <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'hsl(215 18% 42%)', marginBottom: '8px' }}>
              Telefone
            </p>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { value: '', label: 'Todos' },
                { value: 'com', label: 'Com tel.' },
                { value: 'sem', label: 'Sem tel.' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTel(opt.value)}
                  className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all"
                  style={{
                    background: tel === opt.value ? 'hsl(160 84% 39% / 0.15)' : 'hsl(220 36% 11%)',
                    border: `1px solid ${tel === opt.value ? 'hsl(160 84% 39% / 0.4)' : 'hsl(216 32% 18%)'}`,
                    color: tel === opt.value ? 'hsl(160 84% 39%)' : 'hsl(213 31% 70%)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Curso */}
          {courses.length > 0 && (
            <div>
              <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'hsl(215 18% 42%)', marginBottom: '8px' }}>
                Curso
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', padding: '5px 8px', marginBottom: '6px', background: 'hsl(220 36% 11%)', border: '1px solid hsl(216 32% 18%)' }}>
                <Search size={12} style={{ color: 'hsl(215 18% 42%)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={courseSearch}
                  onChange={e => setCourseSearch(e.target.value)}
                  placeholder="Buscar curso..."
                  style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '12px', color: 'hsl(213 31% 88%)', width: '100%' }}
                />
                {courseSearch && (
                  <button onClick={() => setCourseSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <X size={10} style={{ color: 'hsl(215 18% 42%)' }} />
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '150px', overflowY: 'auto' }}>
                {!courseSearch && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', borderRadius: '7px', cursor: 'pointer', background: curso === '' ? 'hsl(216 32% 13%)' : 'transparent' }}>
                    <input type="radio" name="curso" value="" checked={curso === ''} onChange={() => setCurso('')} style={{ accentColor: 'hsl(160 84% 39%)' }} />
                    <span style={{ fontSize: '12px', color: 'hsl(213 31% 88%)' }}>Todos os cursos</span>
                  </label>
                )}
                {filteredCourses.map(c => (
                  <label
                    key={c.id}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', borderRadius: '7px', cursor: 'pointer', background: curso === String(c.id) ? 'hsl(160 84% 39% / 0.1)' : 'transparent' }}
                  >
                    <input
                      type="radio"
                      name="curso"
                      value={String(c.id)}
                      checked={curso === String(c.id)}
                      onChange={() => setCurso(String(c.id))}
                      style={{ accentColor: 'hsl(160 84% 39%)' }}
                    />
                    <span style={{ fontSize: '12px', color: 'hsl(213 31% 88%)' }}>
                      <span style={{ color: 'hsl(215 18% 55%)', marginRight: '4px' }}>{c.shortname}</span>
                      {c.fullname}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Ações */}
          <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid hsl(216 32% 15%)', paddingTop: '10px' }}>
            <button
              onClick={clear}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: 'hsl(220 36% 12%)', color: 'hsl(215 18% 55%)', border: '1px solid hsl(216 32% 18%)', flex: 1 }}
            >
              <X size={11} />
              Limpar
            </button>
            <button
              onClick={apply}
              className="rounded-lg px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-90"
              style={{ background: 'hsl(160 84% 39%)', color: 'hsl(220 26% 8%)', flex: 1 }}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
