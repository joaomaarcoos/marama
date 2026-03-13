import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function createEmbedding(text: string): Promise<number[]> {
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

export async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    max_tokens: 1000,
    temperature: 0.7,
  })

  return response.choices[0]?.message?.content ?? ''
}

export async function transcribeAudio(audioBuffer: Buffer, mimetype: string): Promise<string> {
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
