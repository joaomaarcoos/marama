import assert from 'node:assert/strict'
import sharp from 'sharp'
import { DocumentValidationError, processCandidateDocument } from '../lib/sigec-document-processing'

const checks: string[] = []

async function rejects(name: string, operation: () => Promise<unknown>) {
  await assert.rejects(operation, DocumentValidationError)
  checks.push(name)
}

async function main() {
  const pdf = new File([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF')], 'edital.pdf', { type: 'application/pdf' })
  const processedPdf = await processCandidateDocument(pdf)
  assert.equal(processedPdf.mimeType, 'application/pdf')
  assert.match(processedPdf.sha256, /^[0-9a-f]{64}$/)
  checks.push('valid_pdf_is_detected_and_hashed')

  const activePdf = new File([Buffer.from('%PDF-1.4\n1 0 obj\n<< /JavaScript (alert) >>\nendobj\n%%EOF')], 'ativo.pdf', { type: 'application/pdf' })
  await rejects('active_pdf_is_rejected', () => processCandidateDocument(activePdf))

  const jpegWithExif = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#315f9d' } })
  .withMetadata({ exif: { IFD0: { Artist: 'SIGEC-sensitive-metadata' } } })
  .jpeg()
  .toBuffer()
  const processedJpeg = await processCandidateDocument(new File([jpegWithExif], '../foto.jpg', { type: 'image/jpeg' }))
  const jpegMetadata = await sharp(processedJpeg.buffer).metadata()
  assert.equal(jpegMetadata.exif, undefined)
  assert.equal(processedJpeg.originalName, '.._foto.jpg')
  assert.equal(processedJpeg.buffer.includes(Buffer.from('SIGEC-sensitive-metadata')), false)
  checks.push('jpeg_is_reencoded_and_metadata_removed')

  const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#ffffff' } }).png().toBuffer()
  const processedPng = await processCandidateDocument(new File([png], 'imagem.png', { type: 'image/png' }))
  assert.equal(processedPng.mimeType, 'image/png')
  checks.push('valid_png_is_decoded_and_reencoded')

  await rejects('declared_type_spoofing_is_rejected', () => processCandidateDocument(new File([png], 'falso.pdf', { type: 'application/pdf' })))
  await rejects('oversized_file_is_rejected_before_processing', () => processCandidateDocument(new File([Buffer.alloc(10 * 1024 * 1024 + 1)], 'grande.pdf', { type: 'application/pdf' })))

  console.log(JSON.stringify({ ok: true, checks }, null, 2))
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), checks }, null, 2))
  process.exit(1)
})
