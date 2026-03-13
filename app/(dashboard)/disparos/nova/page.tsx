'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { parseContactsCSV, CSVContact } from '@/lib/csv-parser'
import {
  Upload, CheckCircle, AlertCircle, Loader2, Plus, X, Sparkles, Variable,
} from 'lucide-react'
import WhatsAppPreview from '@/components/whatsapp-preview'

const PRESET_VARS = ['{nome}', '{telefone}', '{curso}']

export default function NovaDisparoPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [delay, setDelay] = useState(3)
  const [batchSize, setBatchSize] = useState(10)
  const [batchDelay, setBatchDelay] = useState(30)
  const [variations, setVariations] = useState<string[]>([])
  const [variationsEnabled, setVariationsEnabled] = useState(false)
  const [aiCount, setAiCount] = useState(3)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [customVar, setCustomVar] = useState('')
  const [contacts, setContacts] = useState<CSVContact[]>([])
  const [parseErrors, setParseErrors] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function insertVariable(variable: string, target: 'message' | number) {
    if (target === 'message') {
      const el = messageRef.current
      if (!el) return
      const start = el.selectionStart ?? message.length
      const end = el.selectionEnd ?? message.length
      const newVal = message.slice(0, start) + variable + message.slice(end)
      setMessage(newVal)
      setTimeout(() => {
        el.focus()
        el.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      setVariations(prev => {
        const updated = [...prev]
        updated[target] = (updated[target] ?? '') + variable
        return updated
      })
    }
  }

  function addCustomVar() {
    const v = customVar.trim().replace(/\s+/g, '_')
    if (!v) return
    const token = '{' + v + '}'
    insertVariable(token, 'message')
    setCustomVar('')
  }

  function addVariationManual() {
    if (variations.length >= 4) return
    setVariations(prev => [...prev, ''])
  }

  function removeVariation(i: number) {
    setVariations(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateVariation(i: number, val: string) {
    setVariations(prev => {
      const u = [...prev]
      u[i] = val
      return u
    })
  }

  async function generateWithAI() {
    if (!message.trim()) { setAiError('Escreva a mensagem principal primeiro.'); return }
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/blast/variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, count: aiCount }),
      })
      const data = await res.json()
      if (!res.ok) { setAiError(data.error ?? 'Erro ao gerar'); return }
      setVariations(data.variations.slice(0, 4))
    } catch {
      setAiError('Erro de conexão')
    } finally {
      setAiLoading(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const result = parseContactsCSV(text)
    setContacts(result.valid)
    setParseErrors(result.invalid.length)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (contacts.length === 0) { setError('Faça upload de um CSV com contatos válidos.'); return }
    setLoading(true)
    setError(null)

    const activeVariations = variationsEnabled ? variations.filter(v => v.trim()) : []

    const res = await fetch('/api/blast/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        message,
        contacts,
        delaySeconds: delay,
        variations: activeVariations,
        batchSize,
        batchDelaySeconds: batchDelay,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Erro ao criar campanha')
      setLoading(false)
      return
    }

    const { campaignId } = await res.json()
    router.push(`/disparos/${campaignId}`)
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Nova Campanha</h1>
        <p className="text-gray-500 mt-1">Configure e inicie um disparo em massa</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">

        {/* Nome */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome da campanha</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="Ex: Lembrete de matricula - Marco 2025"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        {/* Mensagem + Preview lado a lado */}
        <div className="flex gap-4 items-start">
          <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <label className="block text-sm font-medium text-gray-700">Mensagem principal</label>

            {/* Variable chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Variable className="h-3.5 w-3.5" /> Inserir variavel:
              </span>
              {PRESET_VARS.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v, 'message')}
                  className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-mono hover:bg-blue-100 transition-colors"
                >
                  {v}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <input
                  value={customVar}
                  onChange={e => setCustomVar(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomVar() } }}
                  placeholder="variavel customizada"
                  className="px-2 py-0.5 border border-gray-200 rounded text-xs w-36 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  type="button"
                  onClick={addCustomVar}
                  className="text-xs text-blue-600 hover:text-blue-800 px-1"
                >
                  + Add
                </button>
              </div>
            </div>

            <textarea
              ref={messageRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              required
              rows={5}
              placeholder="Ola {nome}! Seu prazo de matricula no curso {curso} encerra em breve..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-y"
            />
            <p className="text-xs text-gray-400">{message.length} caracteres</p>
          </div>

          {/* iPhone mockup */}
          <div className="sticky top-6 shrink-0">
            <WhatsAppPreview message={message} />
          </div>
        </div>

        {/* Variacoes */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Variacoes de mensagem</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                O sistema alterna aleatoriamente entre as versoes para reduzir bloqueios.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={variationsEnabled}
                onChange={e => setVariationsEnabled(e.target.checked)}
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
            </label>
          </div>

          {variationsEnabled && (
            <div className="space-y-3">
              {/* AI generation */}
              <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-100 rounded-lg">
                <Sparkles className="h-4 w-4 text-purple-600 shrink-0" />
                <div className="flex-1 text-xs text-purple-700">
                  Gerar automaticamente variacoes mantendo 90%+ da mensagem original
                </div>
                <select
                  value={aiCount}
                  onChange={e => setAiCount(Number(e.target.value))}
                  className="text-xs border border-purple-200 rounded px-1.5 py-1 bg-white focus:outline-none"
                >
                  <option value={2}>2 variacoes</option>
                  <option value={3}>3 variacoes</option>
                  <option value={4}>4 variacoes</option>
                </select>
                <button
                  type="button"
                  onClick={generateWithAI}
                  disabled={aiLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  {aiLoading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Sparkles className="h-3.5 w-3.5" />
                  }
                  {aiLoading ? 'Gerando...' : 'Gerar com IA'}
                </button>
              </div>

              {aiError && <p className="text-xs text-red-600">{aiError}</p>}

              {variations.map((v, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600">Variacao {i + 1}</span>
                    <div className="flex items-center gap-2">
                      {PRESET_VARS.map(pv => (
                        <button
                          key={pv}
                          type="button"
                          onClick={() => insertVariable(pv, i)}
                          className="px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded text-xs font-mono hover:bg-blue-100"
                        >
                          {pv}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => removeVariation(i)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={v}
                    onChange={e => updateVariation(i, e.target.value)}
                    rows={3}
                    placeholder="Escreva uma variacao da mensagem principal..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm resize-y bg-gray-50"
                  />
                </div>
              ))}

              {variations.length < 4 && (
                <button
                  type="button"
                  onClick={addVariationManual}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar variacao manualmente
                </button>
              )}

              {variations.length === 0 && (
                <p className="text-xs text-gray-400 italic">
                  Nenhuma variacao adicionada. Use a IA ou adicione manualmente.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Configuracoes de envio */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900 text-sm">Configuracoes de envio</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Intervalo entre mensagens
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={delay}
                  onChange={e => setDelay(Number(e.target.value))}
                  min={1} max={60}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <span className="text-sm text-gray-500">segundos</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Minimo recomendado: 3s</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Pausa a cada
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={batchSize}
                  onChange={e => setBatchSize(Number(e.target.value))}
                  min={5} max={100}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <span className="text-sm text-gray-500">mensagens</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Recomendado: 10</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Duracao da pausa entre lotes
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={batchDelay}
                onChange={e => setBatchDelay(Number(e.target.value))}
                min={10} max={300}
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <span className="text-sm text-gray-500">segundos</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              A cada {batchSize} mensagens o sistema aguarda {batchDelay}s antes de continuar.
            </p>
          </div>
        </div>

        {/* CSV */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-1 text-sm">Lista de contatos (CSV)</h3>
          <p className="text-xs text-gray-500 mb-4">
            Coluna obrigatoria:{' '}
            <code className="bg-gray-100 px-1 rounded">telefone</code>{' '}
            (ou <code className="bg-gray-100 px-1 rounded">phone</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">celular</code>).
            Opcionais: <code className="bg-gray-100 px-1 rounded">nome</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">curso</code> e qualquer coluna usada como variavel.
          </p>

          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-8 text-center cursor-pointer transition-colors"
          >
            <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Clique para selecionar o CSV</p>
            <p className="text-xs text-gray-400 mt-1">Formato: .csv</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>

          {contacts.length > 0 && (
            <div className="mt-4 flex items-center gap-4">
              <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">{contacts.length} contatos validos</span>
              </div>
              {parseErrors > 0 && (
                <div className="flex items-center gap-2 text-yellow-700 bg-yellow-50 px-3 py-2 rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{parseErrors} invalidos ignorados</span>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || contacts.length === 0}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Iniciando...' : `Iniciar disparo para ${contacts.length} contatos`}
        </button>
      </form>
    </div>
  )
}
