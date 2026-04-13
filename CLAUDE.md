# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server on port 3000
npm run build     # Production build (also type-checks)
npm run lint      # ESLint via next lint
npx next build    # Preferred build command (avoids npm arg-parsing issues on Windows)
```

No test suite configured. TypeScript type errors surface during `build`.

## Architecture Overview

**SISTEMAMARA** is a WhatsApp-based educational assistant (MARA) for the Maranhão Profissionalizado program. It connects Evolution API (WhatsApp), OpenAI GPT-4o, Moodle LMS, and Supabase.

### Message Processing Pipeline

Every inbound WhatsApp message flows through 11 steps in `lib/mara-agent.ts`:

```
Evolution API → POST /api/webhook/evolution
  → returns 200 immediately (setImmediate for async)
  → processMessage():
      1. Upsert conversation record
      2. Resolve media (audio → Whisper, image → base64 vision)
      3. resolveIdentity(): phone → students table, fallback CPF extraction
      4. Fetch chatmemory (last 20 messages, session_id = phone number)
      5. RAG search: embed query → vector search on document_chunks
      6. detectMoodleIntent() → fetch grades/completion/progress on-demand
      7. Build system prompt (DB prompt_sections + identity + Moodle + RAG)
      8. GPT-4o call (gpt-4o, max_tokens: 1000, temp: 0.7)
      9. Save assistant + user messages to chatmemory
     10. Update conversation last_message
     11. Evolution API sendText() → reply to WhatsApp
```

### Key Files

| File | Role |
|------|------|
| `lib/mara-agent.ts` | Main 11-step orchestrator |
| `lib/evolution.ts` | Evolution API client (send, media download, webhook setup) |
| `lib/openai.ts` | Chat, embeddings, Whisper transcription, vision |
| `lib/moodle.ts` | Moodle WebService (students, grades, completion, enrollments) |
| `lib/rag.ts` | Document chunking (2000 chars, 200 overlap), embedding, vector search |
| `lib/prompt-builder.ts` | Assembles system prompt from `prompt_sections` table + context |
| `lib/blast-processor.ts` | Campaign broadcasting with variable interpolation and batching |
| `lib/utils.ts` | `normalizePhone()`, CPF extraction/formatting |
| `lib/supabase/admin.ts` | Service-role client — backend only |
| `lib/supabase/server.ts` | SSR client — authenticated user sessions |

### Supabase Schema

| Table | Key columns |
|-------|-------------|
| `students` | phone (normalized, PK lookup), phone2, cpf, moodle_id, role |
| `conversations` | phone → student_id, last_message, status |
| `chatmemory` | session_id (= phone), role, content, created_at |
| `documents` | name, mime_type, chunk_count |
| `document_chunks` | content, embedding (JSON), document_id |
| `prompt_sections` | title, content, order_index, active |
| `blast_campaigns` | message template, variations, delay_ms, batch_size |
| `blast_contacts` | phone, variables (JSON), status, error_msg |

Required Supabase RPC functions: `increment_blast_sent`, `increment_blast_failed`.

### Identity Resolution

Phone numbers are the primary key. `normalizePhone()` in `lib/utils.ts` strips non-digits and ensures the `55` Brazil country prefix. Students are classified as `aluno`, `gestor`, or `desconhecido`. Gestores bypass student-specific Moodle lookups.

### RAG System

Documents (PDF, TXT, MD) are uploaded via `POST /api/documentos`, chunked, embedded with `text-embedding-3-small`, and stored in `document_chunks`. On each message, the query is embedded and chunks are ranked by cosine similarity, then injected into the system prompt.

### Prompt Configuration

System prompt is built dynamically from the `prompt_sections` table (ordered, active rows). Sections are edited in the dashboard at `/prompt`. Changes take effect on the next message — no redeploy needed.

### Campaign Broadcasts

`lib/blast-processor.ts` reads `blast_contacts`, applies variable interpolation against each row's `variables` JSON, and sends via Evolution API in batches with configurable delay. Supports message variations (random selection per contact).

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
EVOLUTION_API_URL
EVOLUTION_API_KEY
EVOLUTION_INSTANCE_NAME
MOODLE_URL
MOODLE_WSTOKEN
WEBHOOK_SECRET          # optional, validates x-webhook-secret header
NEXT_PUBLIC_APP_URL
```

## Frontend Stack

- Next.js 14 App Router — `app/(auth)/login/` and `app/(dashboard)/`
- Tailwind CSS with dark mode via `darkMode: ['class']`
- Theme toggled by ThemeProvider (`components/theme-provider.tsx`), stored in localStorage, applies `.light`/`.dark` class to `<html>`
- CSS custom properties in `app/globals.css` drive all theme colors — do not use hardcoded color values in components, use `hsl(var(--token))`
- `MARAOrb` canvas component (`components/mara-orb.tsx`) — animated dot-grid with M letter, port of PIL Python animation
- Fonts: **Sora** (titles/highlights), **Manrope** (body/interface), loaded via CSS `@import` in globals.css

## Operational Directives

`directives/` contains SOPs for:
- `webhook_evolution.md` — webhook setup, payload structure, edge cases
- `document_indexing.md` — document upload, chunking, embedding pipeline
- `moodle_sync.md` — bulk student sync, field conflict resolution
