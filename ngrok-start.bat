@echo off
echo Iniciando tunnel Cloudflare para porta 3000...
start "" cloudflared tunnel --url http://localhost:3000 --logfile cloudflared.log

echo Aguardando tunnel iniciar (10 segundos)...
timeout /t 10 /nobreak > nul

echo Buscando URL publica no log...
for /f "tokens=*" %%i in ('findstr /i "trycloudflare.com" cloudflared.log 2^>nul') do set LOG_LINE=%%i

for /f "tokens=*" %%i in ('node -e "const s=process.env.LOG_LINE||'';const m=s.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);console.log(m?m[0]:'')"') do set TUNNEL_URL=%%i

if "%TUNNEL_URL%"=="" (
  echo.
  echo Tentando via API local do cloudflared...
  curl -s http://localhost:8080/metrics 2>nul | findstr trycloudflare > metrics.tmp
  for /f "tokens=*" %%i in ('node -e "const fs=require('fs');try{const d=fs.readFileSync('metrics.tmp','utf8');const m=d.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);console.log(m?m[0]:'')}catch{console.log('')}"') do set TUNNEL_URL=%%i
  del metrics.tmp > nul 2>&1
)

if "%TUNNEL_URL%"=="" (
  echo.
  echo Nao consegui extrair a URL automaticamente.
  echo Abra o arquivo cloudflared.log e procure por "trycloudflare.com"
  echo Copie a URL e rode manualmente:
  echo   curl -X PUT "https://apima.joaodantasia.com.br/webhook/set/mara-teste" -H "apikey: 6208717f318c23042e127b1721f51eb6" -H "Content-Type: application/json" -d "{\"url\":\"SUA_URL/api/webhook/evolution\",\"enabled\":true,\"events\":[\"MESSAGES_UPSERT\"],\"webhookByEvents\":false,\"webhookBase64\":true}"
  pause
  exit /b 1
)

echo.
echo URL tunnel: %TUNNEL_URL%
echo Webhook: %TUNNEL_URL%/api/webhook/evolution

echo Atualizando webhook no Evolution API...
curl -s -X PUT "https://apima.joaodantasia.com.br/webhook/set/mara-teste" ^
  -H "apikey: 6208717f318c23042e127b1721f51eb6" ^
  -H "Content-Type: application/json" ^
  -d "{\"url\":\"%TUNNEL_URL%/api/webhook/evolution\",\"enabled\":true,\"events\":[\"MESSAGES_UPSERT\"],\"webhookByEvents\":false,\"webhookBase64\":true}"

echo.
echo Pronto! MARA esta recebendo mensagens via: %TUNNEL_URL%
echo Mantenha esta janela aberta. Pressione qualquer tecla para encerrar o tunnel.
pause
taskkill /f /im cloudflared.exe > nul 2>&1
del cloudflared.log > nul 2>&1
