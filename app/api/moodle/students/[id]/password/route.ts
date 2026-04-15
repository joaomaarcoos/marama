import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { setUserPassword, requestPasswordReset } from '@/lib/moodle'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json() as { mode: 'set' | 'email'; password?: string }

  if (!body.mode || !['set', 'email'].includes(body.mode)) {
    return NextResponse.json({ error: 'mode inválido' }, { status: 400 })
  }

  if (body.mode === 'set') {
    const pwd = (body.password ?? '').trim()
    if (pwd.length < 8) {
      return NextResponse.json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, { status: 400 })
    }
    if (!/[a-zA-Z]/.test(pwd) || !/[0-9]/.test(pwd)) {
      return NextResponse.json({ error: 'A senha deve conter letras e números.' }, { status: 400 })
    }
  }

  // Buscar dados do aluno
  const { data: student, error: fetchError } = await adminClient
    .from('students')
    .select('moodle_id, username, email, full_name')
    .eq('id', params.id)
    .single()

  if (fetchError || !student) {
    return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 })
  }

  if (!student.moodle_id) {
    return NextResponse.json({ error: 'Aluno não possui vínculo com o Moodle.' }, { status: 422 })
  }

  try {
    if (body.mode === 'set') {
      await setUserPassword(student.moodle_id, body.password!)
      console.log(`[Admin] Senha alterada para aluno moodle_id=${student.moodle_id} por user=${user.email}`)
    } else {
      if (!student.username || !student.email) {
        return NextResponse.json({ error: 'Aluno sem username ou email cadastrado no Moodle.' }, { status: 422 })
      }
      await requestPasswordReset(student.username, student.email)
      console.log(`[Admin] Email de reset enviado para moodle_id=${student.moodle_id} por user=${user.email}`)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Admin] Erro ao alterar senha Moodle:', err)
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
