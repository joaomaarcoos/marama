import OpenAI from 'openai'
import { getAdminClient } from '@/lib/supabase/admin'

let cachedOpenAI: OpenAI | null = null

// Pricing per token (USD) — updated May 2025
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o':                 { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
  'gpt-4o-mini':            { input: 0.15 / 1_000_000, output:  0.60 / 1_000_000 },
  'text-embedding-3-small': { input: 0.02 / 1_000_000, output:  0 },
  'whisper-1':              { input: 0,                 output:  0 },
}
// Whisper: $0.006 / min — we estimate 30 s per transcription call
const WHISPER_COST_PER_CALL = 0.006 * 0.5

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING[model] ?? { input: 0, output: 0 }
  return p.input * inputTokens + p.output * outputTokens
}

function logUsage(entry: {
  model: string
  context: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  phone?: string | null
}): void {
  void getAdminClient()
    .from('openai_usage_log')
    .insert({ ...entry, total_tokens: entry.input_tokens + entry.output_tokens })
    .then((res) => { if (res.error) console.error('[usage-log]', res.error) })
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

export function getOpenAIClient(): OpenAI {
  if (!cachedOpenAI) {
    cachedOpenAI = new OpenAI({ apiKey: getRequiredEnv('OPENAI_API_KEY') })
  }
  return cachedOpenAI
}

export async function createEmbedding(
  text: string,
  context = 'embed/query',
  phone?: string | null,
): Promise<number[]> {
  const openai = getOpenAIClient()
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
  })

  const usage = response.usage
  if (usage) {
    logUsage({
      model: 'text-embedding-3-small',
      context,
      input_tokens: usage.prompt_tokens,
      output_tokens: 0,
      cost_usd: calcCost('text-embedding-3-small', usage.prompt_tokens, 0),
      phone,
    })
  }

  return response.data[0].embedding
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | OpenAI.Chat.ChatCompletionContentPart[]
}

export type AssistantRouteDecision = {
  route: 'REPLY' | 'HUMAN' | 'OFFER_TICKET'
  confidence: 'low' | 'medium' | 'high'
  reason: string
}

export async function chatCompletion(
  messages: ChatMessage[],
  context = 'chat/resposta',
  phone?: string | null,
): Promise<string> {
  const openai = getOpenAIClient()
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    max_tokens: 1000,
    temperature: 0.7,
  })

  const usage = response.usage
  if (usage) {
    logUsage({
      model: 'gpt-4o',
      context,
      input_tokens: usage.prompt_tokens,
      output_tokens: usage.completion_tokens,
      cost_usd: calcCost('gpt-4o', usage.prompt_tokens, usage.completion_tokens),
      phone,
    })
  }

  return response.choices[0]?.message?.content ?? ''
}

export async function routeChatCompletion(messages: ChatMessage[]): Promise<AssistantRouteDecision> {
  const openai = getOpenAIClient()
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'Voce e um roteador operacional da MARA. Sua unica funcao e decidir a proxima rota do atendimento. Nao responda ao usuario. Retorne somente JSON valido no schema solicitado.',
      },
      ...messages,
    ] as OpenAI.Chat.ChatCompletionMessageParam[],
    temperature: 0,
    max_tokens: 250,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'mara_route_decision',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            route: { type: 'string', enum: ['REPLY', 'HUMAN', 'OFFER_TICKET'] },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            reason: { type: 'string' },
          },
          required: ['route', 'confidence', 'reason'],
        },
      },
    },
  })

  const content = response.choices[0]?.message?.content ?? ''
  const parsed = JSON.parse(content) as AssistantRouteDecision
  if (!parsed.route || !parsed.confidence || !parsed.reason) throw new Error('Route decision incompleta')
  return parsed
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimetype: string,
  phone?: string | null,
): Promise<string> {
  const openai = getOpenAIClient()
  const ext = mimetype.includes('ogg') ? 'ogg' : mimetype.includes('mp4') ? 'mp4' : 'mp3'
  const file = new File([new Uint8Array(audioBuffer)], `audio.${ext}`, { type: mimetype })

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'pt',
  })

  logUsage({
    model: 'whisper-1',
    context: 'audio/transcricao',
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: WHISPER_COST_PER_CALL,
    phone,
  })

  return transcription.text
}

export async function buildImageMessage(
  base64: string,
  mimetype: string,
  caption?: string,
): Promise<OpenAI.Chat.ChatCompletionContentPart[]> {
  const dataUrl = `data:${mimetype};base64,${base64}`
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: 'image_url', image_url: { url: dataUrl } },
  ]
  if (caption) parts.unshift({ type: 'text', text: caption })
  return parts
}
