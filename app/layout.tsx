import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SISTEMAMARA',
  description: 'Sistema de gestao da agente MARA - Maranhao Profissionalizado',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
