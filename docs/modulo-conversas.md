# Módulo de Conversas — Documentação de Lógica

## Visão Geral

O módulo de conversas é a interface de atendimento humano do sistema. Permite que atendentes visualizem, filtrem e respondam conversas de WhatsApp em tempo real.

---

## Arquivos Envolvidos

| Arquivo | Papel |
|---|---|
| `app/(dashboard)/conversas/layout.tsx` | Layout edge-to-edge (remove padding do dashboard) |
| `app/(dashboard)/conversas/page.tsx` | Página raiz — renderiza `<ChatInterface />` sem phone selecionado |
| `app/(dashboard)/conversas/[phone]/page.tsx` | Página de conversa aberta — passa o phone para `<ChatInterface />` |
| `components/chat-interface.tsx` | Componente principal — toda a lógica de UI |
| `app/api/conversas/route.ts` | `GET /api/conversas` — lista todas as conversas |
| `app/api/conversas/[phone]/route.ts` | `GET /api/conversas/[phone]` — detalhe + mensagens; `PATCH` — atualiza conversa |
| `app/api/conversas/[phone]/send/route.ts` | `POST /api/conversas/[phone]/send` — envia mensagem/arquivo |

---

## Banco de Dados

### Tabela `conversations`

Registro mestre de cada conversa (uma por número de WhatsApp).

| Coluna | Tipo | Descrição |
|---|---|---|
| `phone` | text (PK) | Número normalizado do contato (ex: `559881522794`) |
| `status` | text | `'active'` ou `'closed'` |
| `followup_stage` | text | `null`, `'followup_1'` ou `'closed'` (encerramento automático por inatividade) |
| `assigned_to` | uuid | ID do atendente no Supabase Auth |
| `assigned_name` | text | Nome/email do atendente |
| `labels` | text[] | IDs das etiquetas aplicadas |
| `contact_name` | text | Nome interno do contato (editável pelo atendente) |
| `mara_paused_until` | timestamptz | MARA não responde até esta data |
| `mara_manual_paused` | boolean | Pausa manual ativada pelo atendente |
| `last_message` | text | Preview da última mensagem |
| `last_message_at` | timestamptz | Data da última mensagem |
| `student_id` | uuid | FK para `students` (se identificado) |

**Regra de encerramento:** A conversa é considerada encerrada se `status = 'closed'` **ou** `followup_stage = 'closed'`. Ambos os campos precisam ser verificados.

### Tabela `chatmemory`

Histórico de mensagens de cada conversa.

| Coluna | Tipo | Descrição |
|---|---|---|
| `session_id` | text | Número do contato (= `phone` da conversa) |
| `role` | text | `'user'` (mensagem do contato) ou `'assistant'` (MARA ou atendente) |
| `content` | text | Conteúdo da mensagem |
| `created_at` | timestamptz | Data de criação |

---

## APIs

### `GET /api/conversas`

Retorna lista de todas as conversas (máx. 200, ordenadas por `last_message_at` DESC).

Junta dados do Evolution API (`findChats()`) para enriquecer cada conversa com:
- `whatsapp_name` — nome do contato no WhatsApp
- `whatsapp_profile_pic_url` — foto de perfil
- `whatsapp_updated_at` — quando o perfil foi atualizado

Se `findChats()` falhar (Evolution API indisponível), retorna as conversas sem esses campos extras.

---

### `GET /api/conversas/[phone]`

Retorna o detalhe de uma conversa específica + histórico de mensagens (máx. 200, ASC).

Também junta dados do aluno (`students`) se a conversa tiver `student_id`.

---

### `PATCH /api/conversas/[phone]`

Atualiza campos da conversa. Campos aceitos:

| Campo | Efeito colateral automático |
|---|---|
| `status: 'closed'` | Limpa `assigned_to`, `assigned_name`, `mara_paused_until`, `mara_manual_paused` |
| `followup_stage: 'closed'` | Mesmo efeito acima |
| `assigned_to` (com valor) | Define `mara_paused_until` = agora + 12h |
| `assigned_to: null` | Limpa `mara_paused_until` |
| `labels` | Substitui array de etiquetas |
| `contact_name` | Salva nome interno do contato |
| `mara_manual_paused` | Liga/desliga pausa manual |

---

### `POST /api/conversas/[phone]/send`

Envia mensagem ou arquivo para o contato via Evolution API.

**Fluxo:**
1. Valida auth (usuário logado)
2. Valida tamanho do arquivo (máx. 16 MB)
3. Assina a mensagem de texto com o nome do atendente: `*Nome*\n\nmensagem`
4. **Antes de enviar:** grava no banco `mara_paused_until = agora + 90min`, `assigned_to`, `assigned_name`, `status = 'active'`, `followup_stage = null` — reabre a conversa se estava encerrada
5. Envia pelo Evolution API:
   - Texto → `sendText()`
   - Imagem/Áudio/Documento → `sendMedia()` (base64 data URL + `fileName` para documentos)
6. Salva mensagem em `chatmemory` com `role: 'assistant'`
7. Atualiza `last_message` e `last_message_at` na conversa
8. Sincroniza snapshot de contatos

**Tipos de arquivo aceitos:** `image/*`, `audio/*`, `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.xlsm`, `.csv`, `.txt`, `.zip`, `.rar`, `.7z`, `.ppt`, `.pptx`, `.odt`, `.ods`, `.odp`

---

## Componente `ChatInterface`

### Estrutura visual

```
┌─────────────────────┬──────────────────────────────────┬───────────────────┐
│   Sidebar esquerda  │       Painel do chat              │  Painel de info   │
│   (lista conversas) │   (header + mensagens + composer) │   (contato)       │
└─────────────────────┴──────────────────────────────────┴───────────────────┘
```

O painel de info abre/fecha com o botão `ⓘ` no header.

---

### Filtros (tabs)

| Tab | Lógica |
|---|---|
| **Todas** | Conversas não encerradas (`!isClosed`) |
| **Ao Vivo** | `status = 'active'` + sem `followup_stage` + não encerrada |
| **Minhas** | `assigned_to = userId` (inclui encerradas) |
| **Não Atribuídas** | Sem `assigned_to` + não encerradas |
| **Encerradas** | `isClosed = true` (`status = 'closed'` OU `followup_stage = 'closed'`) |

---

### Atualização em tempo real

**Realtime (Supabase):**
- Lista de conversas: subscription na tabela `conversations` (evento `*`) → recarrega a lista instantaneamente
- Painel do chat: subscription na tabela `chatmemory` filtrada por `session_id = phone` → recarrega mensagens instantaneamente

**Polling de fallback:**
- Lista: a cada 30s
- Chat aberto: a cada 20s

---

### Lógica de pausa da MARA

A MARA não responde quando qualquer uma dessas condições for verdadeira:

| Condição | Campo |
|---|---|
| Atendente atribuído | `assigned_to` preenchido |
| Pausa temporária ativa | `mara_paused_until > agora` |
| Pausa manual ligada | `mara_manual_paused = true` |

Ao enviar uma mensagem manual, o sistema automaticamente define `mara_paused_until = agora + 90min`.
Ao atribuir a conversa via botão, `mara_paused_until = agora + 12h`.

---

### Ações do header

| Botão | Condição de exibição | O que faz |
|---|---|---|
| **Atribuir** | Não atribuída + não encerrada | `assigned_to = userId`, `assigned_name = email` |
| **Atribuída** (badge) | Atribuída ao usuário atual | Clique libera: `assigned_to = null` |
| **Pausar MARA** | Não encerrada | Liga `mara_manual_paused` |
| **Reativar MARA** | MARA pausada manualmente | Desliga `mara_manual_paused` |
| **Encerrar** | Não encerrada | `status = 'closed'`, limpa atribuição e pausas |
| **Reabrir** | Encerrada | `status = 'active'`, `followup_stage = null` |
| **Etiquetas** | Sempre | Abre picker de etiquetas |
| **ⓘ** | Sempre | Abre/fecha painel de informações do contato |

---

### Composer (caixa de envio)

- **Emoji:** abre picker de emojis
- **Clipe:** abre seletor de arquivo (aceita os tipos listados acima)
- **Mic:** grava áudio pelo microfone do navegador (`MediaRecorder`, formato `webm` ou `ogg`)
- **Enter:** envia mensagem (Shift+Enter quebra linha)
- **Tamanho máximo de arquivo:** 16 MB

Ao selecionar um arquivo, aparece um chip com nome, tipo e tamanho antes do envio.

---

### Exibição de mensagens

- Mensagens agrupadas por data (Hoje / Ontem / dd de mês de ano)
- `role: 'assistant'` → balão direito (saída)
- `role: 'user'` → balão esquerdo com avatar do contato (entrada)
- Banner no topo das mensagens quando a conversa está encerrada (azul = automático, padrão = manual)

---

## Fluxo completo de uma mensagem recebida

```
WhatsApp do contato
  → Evolution API
    → POST /api/webhook/evolution
      → debounce 3s (acumula mensagens rápidas)
        → verifica pausa da MARA
          → se não pausada: processMessages() em mara-agent.ts
            → upsert em conversations
            → salva em chatmemory (role: 'user')
            → GPT-4o responde
            → salva em chatmemory (role: 'assistant')
            → sendText() via Evolution API
            → Realtime dispara → UI atualiza instantaneamente
```

## Fluxo completo de uma mensagem enviada pelo atendente

```
Atendente digita e clica enviar
  → POST /api/conversas/[phone]/send
    → mara_paused_until = agora + 90min
    → status = 'active', followup_stage = null (reabre se encerrada)
    → sendText() ou sendMedia() via Evolution API
    → salva em chatmemory (role: 'assistant')
    → atualiza last_message na conversa
    → Realtime dispara → UI atualiza instantaneamente
```
