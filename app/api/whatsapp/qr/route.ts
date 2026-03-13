import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getQrCode } from '@/lib/evolution'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const result = await getQrCode()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao obter QR code'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
