import { createHash, randomUUID } from 'crypto'
import sharp from 'sharp'
import { SIGEC_ALLOWED_DOCUMENT_TYPES, SIGEC_MAX_DOCUMENT_SIZE } from './sigec'

type AllowedMime = (typeof SIGEC_ALLOWED_DOCUMENT_TYPES)[number]

export type ProcessedCandidateDocument = {
  buffer: Buffer
  mimeType: AllowedMime
  extension: 'pdf' | 'jpg' | 'png'
  originalName: string
  sha256: string
}

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentValidationError'
  }
}

function safeOriginalName(value: string) {
  const normalized = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]/g, '_').trim()
  return normalized.slice(0, 255) || 'documento'
}

function detectMime(buffer: Buffer): AllowedMime | null {
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  return null
}

function validatePdf(buffer: Buffer) {
  const tail = buffer.subarray(Math.max(0, buffer.length - 2048)).toString('latin1')
  if (!tail.includes('%%EOF')) throw new DocumentValidationError('O PDF está incompleto ou corrompido.')
  const contents = buffer.toString('latin1')
  if (/\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA|Encrypt)\b/i.test(contents)) {
    throw new DocumentValidationError('PDF com conteúdo ativo, incorporado ou criptografado não é permitido.')
  }
  return buffer
}

async function sanitizeImage(buffer: Buffer, mimeType: 'image/jpeg' | 'image/png') {
  const image = sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 }).rotate()
  const metadata = await image.metadata()
  if (!metadata.width || !metadata.height || metadata.width < 1 || metadata.height < 1) {
    throw new DocumentValidationError('A imagem não pôde ser decodificada.')
  }
  return mimeType === 'image/jpeg'
    ? image.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    : image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
}

export async function processCandidateDocument(file: File): Promise<ProcessedCandidateDocument> {
  if (!(file instanceof File) || file.size < 1 || file.size > SIGEC_MAX_DOCUMENT_SIZE) {
    throw new DocumentValidationError('O arquivo deve ter até 10 MB.')
  }
  const input = Buffer.from(await file.arrayBuffer())
  const detected = detectMime(input)
  if (!detected) throw new DocumentValidationError('Envie um PDF, JPEG ou PNG válido.')
  if (file.type && file.type !== detected) throw new DocumentValidationError('O tipo declarado não corresponde ao conteúdo do arquivo.')

  const output = detected === 'application/pdf' ? validatePdf(input) : await sanitizeImage(input, detected)
  if (output.length > SIGEC_MAX_DOCUMENT_SIZE) throw new DocumentValidationError('O arquivo processado ultrapassa 10 MB.')
  return {
    buffer: output,
    mimeType: detected,
    extension: detected === 'application/pdf' ? 'pdf' : detected === 'image/jpeg' ? 'jpg' : 'png',
    originalName: safeOriginalName(file.name),
    sha256: createHash('sha256').update(output).digest('hex'),
  }
}

export function candidateDocumentPath(userId: string, applicationId: string, requirementId: string, extension: string) {
  return `${userId}/${applicationId}/${requirementId}/${randomUUID()}.${extension}`
}
