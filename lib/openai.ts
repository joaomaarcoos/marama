import OpenAI from 'openai'

let cachedOpenAI: OpenAI | null = null

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required.`)
  }
  return value
}

export function getOpenAIClient(): OpenAI {
  if (!cachedOpenAI) {
    cachedOpenAI = new OpenAI({ apiKey: getRequiredEnv('OPENAI_API_KEY') })
  }

  return cachedOpenAI
}

export async function createEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAIClient()
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
  })
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

export async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const openai = getOpenAIClient()
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    max_tokens: 1000,
    temperature: 0.7,
  })

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
            route: {
              type: 'string',
              enum: ['REPLY', 'HUMAN', 'OFFER_TICKET'],
            },
            confidence: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
            },
            reason: {
              type: 'string',
            },
          },
          required: ['route', 'confidence', 'reason'],
        },
      },
    },
  })

  const content = response.choices[0]?.message?.content ?? ''
  const parsed = JSON.parse(content) as AssistantRouteDecision

  if (!parsed.route || !parsed.confidence || !parsed.reason) {
    throw new Error('Route decision incompleta')
  }

  return parsed
}

export async function transcribeAudio(audioBuffer: Buffer, mimetype: string): Promise<string> {
  const openai = getOpenAIClient()
  const ext = mimetype.includes('ogg') ? 'ogg' : mimetype.includes('mp4') ? 'mp4' : 'mp3'
  const filename = `audio.${ext}`

  const file = new File([new Uint8Array(audioBuffer)], filename, { type: mimetype })

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'pt',
  })

  return transcription.text
}

export async function buildImageMessage(
  base64: string,
  mimetype: string,
  caption?: string
): Promise<OpenAI.Chat.ChatCompletionContentPart[]> {
  const dataUrl = `data:${mimetype};base64,${base64}`
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: 'image_url',
      image_url: { url: dataUrl },
    },
  ]

  if (caption) {
    parts.unshift({ type: 'text', text: caption })
  }

  return parts
}
