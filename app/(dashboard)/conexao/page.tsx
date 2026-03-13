import WhatsAppConnection from '@/components/whatsapp-connection'

export const revalidate = 0

export default function ConexaoPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Conexão WhatsApp</h1>
        <p className="text-gray-500 mt-1">Gerencie a conexão da MARA com o WhatsApp via Evolution API.</p>
      </div>
      <WhatsAppConnection />
    </div>
  )
}
