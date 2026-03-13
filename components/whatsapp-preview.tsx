'use client'

interface WhatsAppPreviewProps {
  message: string
  name?: string   // sample name to fill {nome}
  phone?: string  // sample phone to fill {telefone}
  curso?: string  // sample course to fill {curso}
}

function interpolateSample(text: string, name: string, phone: string, curso: string): string {
  return text
    .replace(/\{nome\}/gi, name || 'João Silva')
    .replace(/\{telefone\}/gi, phone || '(98) 99999-0000')
    .replace(/\{curso\}/gi, curso || 'Bartender')
    .replace(/\{(\w+)\}/g, (_, key) => `[${key}]`)
}

export default function WhatsAppPreview({ message, name = '', phone = '', curso = '' }: WhatsAppPreviewProps) {
  const preview = interpolateSample(message || 'Sua mensagem aparece aqui…', name, phone, curso)
  const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex flex-col items-center select-none">
      <p className="text-xs text-gray-500 mb-3 font-medium">Prévia no WhatsApp</p>

      {/* iPhone frame */}
      <div
        className="relative bg-gray-900 rounded-[2.5rem] shadow-2xl overflow-hidden"
        style={{ width: 220, height: 420 }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-gray-900 rounded-b-xl z-10" />

        {/* Screen */}
        <div className="absolute inset-[3px] rounded-[2.2rem] overflow-hidden bg-[#ECE5DD] flex flex-col">

          {/* WhatsApp header */}
          <div className="bg-[#075E54] pt-6 pb-2 px-3 flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-full bg-gray-300 shrink-0" />
            <div>
              <p className="text-white text-xs font-semibold leading-tight">MARA</p>
              <p className="text-green-200 text-[9px]">online</p>
            </div>
          </div>

          {/* Chat area */}
          <div className="flex-1 overflow-hidden px-2 py-2 flex flex-col justify-end">
            {/* Message bubble */}
            <div className="max-w-[85%] self-end">
              <div className="bg-[#DCF8C6] rounded-tl-xl rounded-tr-sm rounded-b-xl px-2.5 py-1.5 shadow-sm relative">
                <p className="text-gray-800 text-[10px] leading-relaxed whitespace-pre-wrap break-words">
                  {preview}
                </p>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <span className="text-[8px] text-gray-500">{now}</span>
                  {/* Double check */}
                  <svg className="h-3 w-3 text-blue-500" viewBox="0 0 16 11" fill="currentColor">
                    <path d="M11.071.653a.75.75 0 0 0-1.06 1.06l1.06-1.06zM5.5 7.232l-.53.53a.75.75 0 0 0 1.06 0L5.5 7.232zm-3.47-2.47a.75.75 0 0 0-1.06 1.06l1.06-1.06zm9.001-3.049-6 6-1.06-1.06 6-6 1.06 1.06zm-5 6-3.5-3.5 1.06-1.061 3.5 3.5-1.06 1.06z"/>
                    <path d="M14.5 1.732 8.5 7.732l-1.06-1.06 6-6 1.06 1.06z"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Input bar */}
          <div className="bg-[#F0F0F0] px-2 py-1.5 flex items-center gap-1.5 shrink-0">
            <div className="flex-1 bg-white rounded-full px-3 py-1">
              <p className="text-gray-400 text-[9px]">Mensagem</p>
            </div>
            <div className="w-6 h-6 rounded-full bg-[#075E54] flex items-center justify-center shrink-0">
              <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Home indicator */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-16 h-1 bg-white rounded-full opacity-60" />
      </div>

      <p className="text-xs text-gray-400 mt-2 text-center">
        Valores de exemplo para variáveis
      </p>
    </div>
  )
}
