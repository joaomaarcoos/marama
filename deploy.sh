#!/bin/bash
# deploy.sh - roda na VPS após clonar/atualizar o projeto

set -e

echo "=== Deploy SISTEMAMARA ==="

# Atualizar código (se usar git)
# git pull origin master

# Build e subir container
echo "[1/3] Fazendo build e subindo container..."
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d

echo "[2/3] Aguardando app iniciar..."
sleep 5

# Verificar se está rodando
if curl -sf http://localhost:1303 > /dev/null 2>&1; then
  echo "[3/3] App rodando em http://localhost:1303"
else
  echo "[3/3] AVISO: app pode ainda estar inicializando. Verifique com: docker compose logs -f"
fi

# Atualizar webhook do Evolution API para domínio de produção
echo ""
echo "Atualizando webhook no Evolution API..."
curl -s -X PUT "https://apima.joaodantasia.com.br/webhook/set/mara-teste" \
  -H "apikey: 6208717f318c23042e127b1721f51eb6" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://mara.joaondantasia.com.br/api/webhook/evolution","enabled":true,"events":["MESSAGES_UPSERT"],"webhookByEvents":false,"webhookBase64":true}'

echo ""
echo "=== Deploy concluido! ==="
echo "App: https://mara.joaondantasia.com.br"
echo "Logs: docker compose logs -f"
