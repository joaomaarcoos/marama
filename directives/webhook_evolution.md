# Webhook Evolution

## Objetivo
Padronizar a operacao do fluxo de entrada do WhatsApp via Evolution API, com foco em:
- configurar e validar a instancia/webhook
- inspecionar payloads recebidos
- normalizar eventos `messages.upsert`
- salvar payloads para replay e debug

Esta diretiva descreve a primeira versao da camada 1 para um fluxo que hoje ainda executa a resposta conversacional principal dentro do app Next.js.

## Codigo Atual de Referencia
- `app/api/webhook/evolution/route.ts`
- `lib/mara-agent.ts`
- `lib/evolution.ts`
- `lib/openai.ts`

## Ferramentas
- `execution/evolution_api.py`
- `execution/evolution_webhook.py`

## Entradas
- variaveis de ambiente:
  - `EVOLUTION_API_URL`
  - `EVOLUTION_API_KEY`
  - `EVOLUTION_INSTANCE_NAME`
  - `NEXT_PUBLIC_APP_URL`
  - `WEBHOOK_SECRET` (opcional, mas recomendado)
- payload JSON salvo localmente em `.tmp/` quando houver replay/debug

## Saidas Esperadas
- webhook configurado na Evolution apontando para `/api/webhook/evolution`
- status atual da instancia
- JSON normalizado com:
  - `event`
  - `phone`
  - `message.type`
  - `message.text`
  - `message.caption`
  - `message.mediaId`
  - `message.mimetype`
- payloads salvos em `.tmp/` para reprocessamento

## Procedimento Padrao
1. Validar status da instancia:
   `py execution/evolution_api.py status`
2. Se necessario, criar ou reconfigurar a instancia:
   `py execution/evolution_api.py create`
   ou
   `py execution/evolution_api.py configure-webhook`
3. Para debugar um evento recebido, salvar o body bruto em `.tmp/algum_evento.json`.
4. Normalizar o payload salvo:
   `py execution/evolution_webhook.py --payload .tmp/algum_evento.json`
5. Se precisar persistir a versao normalizada:
   `py execution/evolution_webhook.py --payload .tmp/algum_evento.json --write-normalized .tmp/algum_evento.normalized.json`

## Edge Cases
- Eventos diferentes de `messages.upsert` e `MESSAGES_UPSERT` devem ser ignorados.
- Mensagens enviadas pela propria instancia (`fromMe=true`) devem ser ignoradas.
- Mensagens de grupo (`@g.us`) devem ser ignoradas.
- Mensagens sem texto podem virar:
  - audio com `mediaId`
  - image com `caption` e `mediaId`
  - document com placeholder textual
- Se `WEBHOOK_SECRET` estiver configurado, trate mismatch como erro operacional e corrija antes de prosseguir.

## Limites da V1
- A resposta com IA continua no app (`lib/mara-agent.ts`).
- O script de `execution/evolution_webhook.py` cobre parsing, validacao e replay de payload, nao a orquestracao completa do agente.
- Se houver necessidade de reprocessamento ponta a ponta fora do app, a proxima iteracao deve extrair o fluxo de `processMessage()` para `execution/`.

## Quando Atualizar Esta Diretiva
- Se o formato do payload da Evolution mudar
- Se novos tipos de mensagem passarem a ser tratados
- Se o processamento assinado sair da rota Next e migrar para `execution/`
