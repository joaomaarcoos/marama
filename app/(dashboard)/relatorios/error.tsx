'use client'

export default function RelatoriosError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div
      className="rounded-xl p-6"
      style={{
        background: 'hsl(0 70% 20% / 0.2)',
        border: '1px solid hsl(0 70% 40% / 0.35)',
      }}
    >
      <p className="text-sm font-medium" style={{ color: 'hsl(0 70% 70%)' }}>
        Erro ao carregar relatórios
      </p>
      {error.message && (
        <p className="mt-1 text-xs" style={{ color: 'hsl(0 70% 55%)' }}>
          {error.message}
        </p>
      )}
      <button
        onClick={reset}
        className="mt-4 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
        style={{
          background: 'hsl(0 70% 40% / 0.25)',
          border: '1px solid hsl(0 70% 50% / 0.4)',
          color: 'hsl(0 70% 75%)',
        }}
      >
        Tentar novamente
      </button>
    </div>
  )
}
