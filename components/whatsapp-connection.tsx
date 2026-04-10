'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  Link2,
  Loader2,
  LogOut,
  PlusCircle,
  QrCode,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react'

type ConnectionState = 'open' | 'connecting' | 'close' | 'unknown'

interface Status {
  state: ConnectionState
  exists: boolean
  instanceName?: string
  profileName?: string
  profilePicUrl?: string
}

interface QrData {
  qrcode?: string
  pairingCode?: string
  state?: string
}

export default function WhatsAppConnection() {
  const [status, setStatus] = useState<Status | null>(null)
  const [qrData, setQrData] = useState<QrData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pollingQr, setPollingQr] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null)
  const [webhookHasSecret, setWebhookHasSecret] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status')
      const data = await res.json()
      setStatus(data)
      return data as Status
    } catch {
      setError('Erro ao verificar status da conexao.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    fetch('/api/whatsapp/webhook-url')
      .then(r => r.json())
      .then(d => { setWebhookUrl(d.url); setWebhookHasSecret(d.hasSecret) })
      .catch(() => {})
  }, [fetchStatus])

  useEffect(() => {
    if (!pollingQr) return

    const interval = setInterval(async () => {
      const nextStatus = await fetchStatus()
      if (nextStatus?.state === 'open') {
        setPollingQr(false)
        setQrData(null)
      }
    }, 4000)

    return () => clearInterval(interval)
  }, [pollingQr, fetchStatus])

  const connectWithQr = async () => {
    const res = await fetch('/api/whatsapp/qr')
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Erro ao obter QR code')
      return false
    }

    if (data.state === 'open') {
      await fetchStatus()
      return true
    }

    setQrData(data)
    setPollingQr(true)
    return true
  }

  const handleConnect = async () => {
    setActionLoading(true)
    setError(null)
    setQrData(null)

    try {
      await connectWithQr()
    } catch {
      setError('Erro de conexao com o servidor.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreateInstance = async () => {
    setActionLoading(true)
    setError(null)
    setQrData(null)
    setPollingQr(false)

    try {
      const res = await fetch('/api/whatsapp/create', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao criar instancia')
        return
      }

      await fetchStatus()
      await connectWithQr()
    } catch {
      setError('Erro de conexao com o servidor.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRefreshQr = async () => {
    setActionLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/whatsapp/qr')
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao atualizar QR code')
        return
      }

      setQrData(data)
    } catch {
      setError('Erro de conexao com o servidor.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Tem certeza que deseja desconectar o WhatsApp? A MARA deixara de responder mensagens.')) {
      return
    }

    setActionLoading(true)
    setError(null)
    setQrData(null)
    setPollingQr(false)

    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao desconectar')
        return
      }

      await fetchStatus()
    } catch {
      setError('Erro de conexao com o servidor.')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  const isConnected = status?.state === 'open'
  const isConnecting = status?.state === 'connecting'
  const instanceMissing = status?.exists === false
  const instanceName = status?.instanceName ?? process.env.NEXT_PUBLIC_INSTANCE_NAME ?? 'marav2'

  return (
    <div className="max-w-xl space-y-4">
      <div
        className={`flex items-center gap-5 rounded-xl border p-6 ${
          isConnected
            ? 'border-green-200 bg-green-50'
            : isConnecting
              ? 'border-yellow-200 bg-yellow-50'
              : instanceMissing
                ? 'border-red-200 bg-red-50'
                : 'border-gray-200 bg-gray-50'
        }`}
      >
        <div
          className={`rounded-full p-3 ${
            isConnected
              ? 'bg-green-100'
              : isConnecting
                ? 'bg-yellow-100'
                : instanceMissing
                  ? 'bg-red-100'
                  : 'bg-gray-100'
          }`}
        >
          {isConnected ? (
            <Wifi className="h-6 w-6 text-green-600" />
          ) : isConnecting ? (
            <Clock className="h-6 w-6 text-yellow-600" />
          ) : instanceMissing ? (
            <AlertCircle className="h-6 w-6 text-red-600" />
          ) : (
            <WifiOff className="h-6 w-6 text-gray-500" />
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : isConnecting ? (
              <Loader2 className="h-4 w-4 animate-spin text-yellow-600" />
            ) : instanceMissing ? (
              <AlertCircle className="h-4 w-4 text-red-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-gray-400" />
            )}
            <span
              className={`text-sm font-semibold ${
                isConnected
                  ? 'text-green-700'
                  : isConnecting
                    ? 'text-yellow-700'
                    : instanceMissing
                      ? 'text-red-700'
                      : 'text-gray-600'
              }`}
            >
              {isConnected ? 'Conectado' : isConnecting ? 'Conectando...' : instanceMissing ? 'Instancia inexistente' : 'Desconectado'}
            </span>
          </div>

          <p className="mt-1 text-xs text-gray-500">
            Instancia: <span className="font-mono">{instanceName}</span>
          </p>

          {instanceMissing && (
            <p className="mt-0.5 text-xs text-red-600">
              A instancia nao existe na Evolution API. Crie novamente para registrar o webhook correto da MARA.
            </p>
          )}

          {isConnected && status?.profileName && (
            <p className="mt-0.5 text-xs text-green-600">
              Conta: <span className="font-medium">{status.profileName}</span>
            </p>
          )}
        </div>

        {isConnected && status?.profilePicUrl && (
          <Image
            src={status.profilePicUrl}
            alt="Foto do perfil"
            width={48}
            height={48}
            className="rounded-full border-2 border-green-200"
          />
        )}

        <button
          onClick={() => {
            setLoading(true)
            fetchStatus()
          }}
          title="Atualizar status"
          className="text-gray-400 transition-colors hover:text-gray-600"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {qrData?.qrcode && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-2 text-gray-700">
            <QrCode className="h-5 w-5" />
            <span className="font-medium">Escaneie o QR Code</span>
          </div>

          <p className="text-center text-sm text-gray-500">
            Abra o WhatsApp no celular -&gt; <strong>Aparelhos conectados</strong> -&gt; <strong>Conectar um aparelho</strong>
          </p>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrData.qrcode}
            alt="QR Code"
            className="h-56 w-56 rounded-lg border border-gray-100"
          />

          {qrData.pairingCode && (
            <p className="text-xs text-gray-500">
              Codigo de pareamento: <span className="font-mono font-bold text-gray-700">{qrData.pairingCode}</span>
            </p>
          )}

          <div className="flex items-center gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Aguardando leitura... a pagina atualiza automaticamente
          </div>

          <button
            onClick={handleRefreshQr}
            disabled={actionLoading}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Gerar novo QR code
          </button>
        </div>
      )}

      {webhookUrl && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Link2 className="h-4 w-4" />
            URL do Webhook
            {webhookHasSecret && (
              <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                com secret
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Configure esta URL na Evolution API para receber mensagens do WhatsApp.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 break-all font-mono select-all">
              {webhookUrl}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              title="Copiar URL"
              className="shrink-0 rounded-lg border border-gray-200 bg-white p-2 text-gray-500 transition-colors hover:text-gray-800"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {instanceMissing && (
          <button
            onClick={handleCreateInstance}
            disabled={actionLoading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400"
          >
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
            {actionLoading ? 'Criando...' : 'Criar instancia'}
          </button>
        )}

        {!isConnected && !qrData?.qrcode && (
          <button
            onClick={handleConnect}
            disabled={actionLoading || instanceMissing}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:bg-green-400"
          >
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            {actionLoading ? 'Gerando...' : 'Gerar QR Code'}
          </button>
        )}

        {isConnected && (
          <button
            onClick={handleDisconnect}
            disabled={actionLoading}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:bg-red-400"
          >
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {actionLoading ? 'Desconectando...' : 'Desconectar'}
          </button>
        )}
      </div>
    </div>
  )
}
