import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpenAIClient } from '@/lib/openai'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { message, count = 3 } = await request.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Mensagem obrigatória' }, { status: 400 })

  const n = Math.min(4, Math.max(2, Number(count)))

  const prompt = `Você é um especialista em copywriting para WhatsApp.

Gere exatamente ${n} variações da mensagem abaixo para campanhas de disparo.

REGRAS OBRIGATÓRIAS:
- Cada variação deve preservar 90% ou mais do conteúdo e intenção original
- Apenas pequenas mudanças: sinônimos, reordenar frases, variações de saudação, emojis diferentes
- Mantenha TODAS as variáveis como {nome}, {telefone}, {curso} etc. EXATAMENTE como aparecem
- NÃO invente informações novas
- Retorne APENAS um array JSON de strings, sem explicações

Mensagem original:
${message}

Responda apenas com o array JSON:`

  try {
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0].message.content ?? '{}'
    const parsed = JSON.parse(raw)

    // Handle both { variations: [...] } and direct array wrapped in object
    const variations: string[] = Array.isArray(parsed)
      ? parsed
      : parsed.variations ?? parsed.messages ?? Object.values(parsed)[0] ?? []

    if (!Array.isArray(variations) || variations.length === 0) {
      return NextResponse.json({ error: 'IA não retornou variações válidas' }, { status: 500 })
    }

    return NextResponse.json({ variations: variations.slice(0, 4) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar variações'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
