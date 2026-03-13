import { createClient } from '@/lib/supabase/server'
import { formatDate, formatPhone } from '@/lib/utils'
import Link from 'next/link'
import { ArrowLeft, User, Bot } from 'lucide-react'

export const revalidate = 0

export default async function ConversaPage({ params }: { params: { phone: string } }) {
  const supabase = await createClient()
  const phone = decodeURIComponent(params.phone)

  const [{ data: conversation }, { data: history }] = await Promise.all([
    supabase
      .from('conversations')
      .select('*, students(full_name, email, courses)')
      .eq('phone', phone)
      .single(),
    supabase
      .from('chatmemory')
      .select('role, content, created_at')
      .eq('session_id', phone)
      .order('created_at', { ascending: true })
      .limit(100),
  ])

  const student = conversation?.students as { full_name: string; email: string; courses: unknown[] } | null

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Link href="/conversas" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {student?.full_name ?? conversation?.contact_name ?? formatPhone(phone)}
          </h1>
          <p className="text-sm text-gray-500">{formatPhone(phone)}</p>
        </div>
      </div>

      {student && (
        <div className="mb-6 bg-blue-50 rounded-xl border border-blue-100 p-4">
          <p className="text-sm font-medium text-blue-800">Aluno identificado: {student.full_name}</p>
          {student.email && <p className="text-xs text-blue-600 mt-0.5">{student.email}</p>}
          {Array.isArray(student.courses) && student.courses.length > 0 && (
            <p className="text-xs text-blue-600 mt-1">
              Cursos: {(student.courses as { fullname: string }[]).map((c) => c.fullname).join(', ')}
            </p>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 max-h-[60vh] overflow-y-auto">
        {(!history || history.length === 0) ? (
          <p className="text-center text-gray-400 py-8">Nenhuma mensagem no histórico.</p>
        ) : (
          history.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === 'assistant' ? 'flex-row' : 'flex-row-reverse'}`}
            >
              <div className={`shrink-0 rounded-full p-2 ${msg.role === 'assistant' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                {msg.role === 'assistant'
                  ? <Bot className="h-4 w-4 text-blue-600" />
                  : <User className="h-4 w-4 text-gray-500" />
                }
              </div>
              <div className={`max-w-[75%] ${msg.role === 'assistant' ? 'items-start' : 'items-end'} flex flex-col gap-1`}>
                <div className={`rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'assistant' ? 'bg-blue-50 text-gray-800' : 'bg-gray-100 text-gray-800'}`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
                {msg.created_at && (
                  <span className="text-xs text-gray-400">{formatDate(msg.created_at)}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
