'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Wifi, WifiOff, Loader2, RefreshCw, LogOut, QrCode, CheckCircle2, AlertCircle, Clock
} from 'lucide-react'
import Image from 'next/image'

type ConnectionState = 'open' | 'connecting' | 'close' | 'unknown'

interface Status {
  state: ConnectionState
  instanceName?: string
  profileName?: string
  profilePicUrl?: string
}

interface QrData {
  qrcode?: string   // base64 image
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

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status')
      const data = await res.json()
      setStatus(data)
      return data as Status
    } catch {
      setError('Erro ao verificar status da conexão.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Poll status while QR code is showing (waiting for scan)
  useEffect(() => {
    if (!pollingQr) return
    const interval = setInterval(async () => {
      const s = await fetchStatus()
      if (s?.state === 'open') {
        setPollingQr(false)
        setQrData(null)
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [pollingQr, fetchStatus])

  const handleConnect = async () => {
    setActionLoading(true)
    setError(null)
    setQrData(null)
    try {
      const res = await fetch('/api/whatsapp/qr')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao obter QR code')
        return
      }
      if (data.state === 'open') {
        await fetchStatus()
        return
      }
      setQrData(data)
      setPollingQr(true)
    } catch {
      setError('Erro de conexão com o servidor.')
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
      setError('Erro de conexão com o servidor.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Tem certeza que deseja desconectar o WhatsApp? A MARA deixará de responder mensagens.')) return
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
      setError('Erro de conexão com o servidor.')
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
  const instanceName = status?.instanceName ?? process.env.NEXT_PUBLIC_INSTANCE_NAME ?? 'mara'

  return (
    <div className="max-w-xl space-y-4">

      {/* Status card */}
      <div className={`rounded-xl border p-6 flex items-center gap-5 ${
        isConnected
          ? 'bg-green-50 border-green-200'
          : isConnecting
          ? 'bg-yellow-50 border-yellow-200'
          : 'bg-gray-50 border-gray-200'
      }`}>
        <div className={`rounded-full p-3 ${
          isConnected ? 'bg-green-100' : isConnecting ? 'bg-yellow-100' : 'bg-gray-100'
        }`}>
          {isConnected ? (
            <Wifi className="h-6 w-6 text-green-600" />
          ) : isConnecting ? (
            <Clock className="h-6 w-6 text-yellow-600" />
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
            ) : (
              <AlertCircle className="h-4 w-4 text-gray-400" />
            )}
            <span className={`font-semibold text-sm ${
              isConnected ? 'text-green-700' : isConnecting ? 'text-yellow-700' : 'text-gray-600'
            }`}>
              {isConnected ? 'Conectado' : isConnecting ? 'Conectando…' : 'Desconectado'}
            </span>
          </div>

          <p className="text-xs text-gray-500 mt-1">
            Instância: <span className="font-mono">{instanceName}</span>
          </p>

          {isConnected && status?.profileName && (
            <p className="text-xs text-green-600 mt-0.5">
              Conta: <span className="font-medium">{status.profileName}</span>
            </p>
          )}
        </div>

        {/* Profile picture */}
        {isConnected && status?.profilePicUrl && (
          <Image
            src={status.profilePicUrl}
            alt="Foto do perfil"
            width={48}
            height={48}
            className="rounded-full border-2 border-green-200"
          />
        )}

        {/* Refresh status button */}
        <button
          onClick={() => { setLoading(true); fetchStatus() }}
          title="Atualizar status"
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* QR Code panel */}
      {qrData?.qrcode && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-gray-700">
            <QrCode className="h-5 w-5" />
            <span className="font-medium">Escaneie o QR Code</span>
          </div>

          <p className="text-sm text-gray-500 text-center">
            Abra o WhatsApp no celular → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong>
          </p>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrData.qrcode}
            alt="QR Code"
            className="w-56 h-56 rounded-lg border border-gray-100"
          />

          {qrData.pairingCode && (
            <p className="text-xs text-gray-500">
              Código de pareamento: <span className="font-mono font-bold text-gray-700">{qrData.pairingCode}</span>
            </p>
          )}

          <div className="flex items-center gap-2 text-xs text-yellow-600 bg-yellow-50 px-3 py-2 rounded-lg">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Aguardando leitura… a página atualiza automaticamente
          </div>

          <button
            onClick={handleRefreshQr}
            disabled={actionLoading}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Gerar novo QR code
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {!isConnected && !qrData?.qrcode && (
          <button
            onClick={handleConnect}
            disabled={actionLoading}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="h-4 w-4" />
            )}
            {actionLoading ? 'Gerando…' : 'Gerar QR Code'}
          </button>
        )}

        {isConnected && (
          <button
            onClick={handleDisconnect}
            disabled={actionLoading}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            {actionLoading ? 'Desconectando…' : 'Desconectar'}
          </button>
        )}
      </div>
    </div>
  )
}
