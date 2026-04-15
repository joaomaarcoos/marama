'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Filter, X, ChevronDown, Search } from 'lucide-react'

interface Label {
  id: string
  name: string
  color: string
}

interface ContactsFilterProps {
  labels: Label[]
  currentSource?: string
  currentLabel?: string
  currentQuery?: string
}

export function ContactsFilter({ labels, currentSource, currentLabel, currentQuery }: ContactsFilterProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<string>(currentSource ?? '')
  const [labelId, setLabelId] = useState<string>(currentLabel ?? '')
  const [labelSearch, setLabelSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const activeCount = [currentSource, currentLabel].filter(Boolean).length

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  function apply() {
    const p = new URLSearchParams()
    if (currentQuery) p.set('q', currentQuery)
    if (source) p.set('source', source)
    if (labelId) p.set('label', labelId)
    router.push(`/contatos${p.toString() ? `?${p.toString()}` : ''}`)
    setOpen(false)
  }

  function clear() {
    setSource('')
    setLabelId('')
    const p = new URLSearchParams()
    if (currentQuery) p.set('q', currentQuery)
    router.push(`/contatos${p.toString() ? `?${p.toString()}` : ''}`)
    setOpen(false)
  }

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
            width: '260px',
            maxHeight: 'min(420px, 70vh)',
            borderRadius: '12px',
            background: 'hsl(220 40% 8%)',
            border: '1px solid hsl(216 32% 18%)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            overflowY: 'auto',
          }}
        >
          {/* Vínculo */}
          <div>
            <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'hsl(215 18% 42%)', marginBottom: '8px' }}>
              Vínculo
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[
                { value: '', label: 'Todos os contatos' },
                { value: 'moodle', label: 'Moodle' },
                { value: 'atendimento', label: 'Somente atendimento' },
              ].map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 8px',
                    borderRadius: '7px',
                    cursor: 'pointer',
                    background: source === opt.value ? 'hsl(160 84% 39% / 0.1)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  <input
                    type="radio"
                    name="source"
                    value={opt.value}
                    checked={source === opt.value}
                    onChange={() => setSource(opt.value)}
                    style={{ accentColor: 'hsl(160 84% 39%)' }}
                  />
                  <span style={{ fontSize: '13px', color: 'hsl(213 31% 88%)' }}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Etiquetas */}
          {labels.length > 0 && (
            <div>
              <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'hsl(215 18% 42%)', marginBottom: '8px' }}>
                Etiqueta
              </p>

              {/* Busca de etiqueta */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  borderRadius: '8px', padding: '5px 8px', marginBottom: '6px',
                  background: 'hsl(220 36% 11%)',
                  border: '1px solid hsl(216 32% 18%)',
                }}
              >
                <Search size={12} style={{ color: 'hsl(215 18% 42%)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={labelSearch}
                  onChange={e => setLabelSearch(e.target.value)}
                  placeholder="Buscar etiqueta..."
                  style={{
                    background: 'transparent', border: 'none', outline: 'none',
                    fontSize: '12px', color: 'hsl(213 31% 88%)', width: '100%',
                  }}
                />
                {labelSearch && (
                  <button onClick={() => setLabelSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <X size={10} style={{ color: 'hsl(215 18% 42%)' }} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflowY: 'auto' }}>
                {!labelSearch && (
                  <label
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px',
                      borderRadius: '7px', cursor: 'pointer',
                      background: labelId === '' ? 'hsl(216 32% 13%)' : 'transparent',
                    }}
                  >
                    <input
                      type="radio"
                      name="label"
                      value=""
                      checked={labelId === ''}
                      onChange={() => setLabelId('')}
                      style={{ accentColor: 'hsl(160 84% 39%)' }}
                    />
                    <span style={{ fontSize: '13px', color: 'hsl(213 31% 88%)' }}>Todas</span>
                  </label>
                )}
                {labels.filter(l => l.name.toLowerCase().includes(labelSearch.toLowerCase())).map(label => (
                  <label
                    key={label.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px',
                      borderRadius: '7px', cursor: 'pointer',
                      background: labelId === label.id ? `${label.color}18` : 'transparent',
                    }}
                  >
                    <input
                      type="radio"
                      name="label"
                      value={label.id}
                      checked={labelId === label.id}
                      onChange={() => setLabelId(label.id)}
                      style={{ accentColor: label.color }}
                    />
                    <span
                      className="flex items-center gap-1.5"
                      style={{ fontSize: '13px', color: label.color }}
                    >
                      <span
                        style={{
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: label.color, flexShrink: 0,
                        }}
                      />
                      {label.name}
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
              Aplicar filtro
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
