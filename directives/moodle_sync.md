# Moodle Sync

## Objetivo
Sincronizar alunos do Moodle para a tabela `students` no Supabase de forma deterministica, preservando campos mantidos manualmente no banco.

## Codigo Atual de Referencia
- `app/api/moodle/sync/route.ts`
- `lib/moodle.ts`
- `app/api/moodle/tutores/route.ts`

## Ferramentas
- `execution/moodle_client.py`
- `execution/moodle_sync.py`

## Entradas
- variaveis de ambiente:
  - `MOODLE_URL`
  - `MOODLE_WSTOKEN`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- cursos a sincronizar:
  - por padrao, lista interna espelhada de `SYNC_COURSE_IDS`
  - opcionalmente via `--course-id`

## Saidas Esperadas
- upsert em `students` com:
  - `moodle_id`
  - `full_name`
  - `email`
  - `username`
  - `courses`
  - `last_synced_at`
- resumo JSON com:
  - `courses_scanned`
  - `students_discovered`
  - `processed`
  - `errors`

## Procedimento Padrao
1. Rodar sync completo:
   `py execution/moodle_sync.py`
2. Rodar sync parcial para um curso:
   `py execution/moodle_sync.py --course-id 12`
3. Rodar sync de varios cursos:
   `py execution/moodle_sync.py --course-id 12 --course-id 18 --course-id 30`
4. Validar sem gravar:
   `py execution/moodle_sync.py --dry-run`

## Regras de Persistencia
- Nunca enviar `phone`, `phone2`, `cpf` ou `role` no upsert de sync.
- O objetivo e preservar dados enriquecidos manualmente no Supabase.
- O conflito deve ocorrer em `moodle_id`.

## Edge Cases
- Se um curso falhar na API do Moodle, registrar o erro e continuar nos demais.
- Se o mesmo aluno aparecer em varios cursos, deduplicar por `moodle_id` e agregar `courses`.
- Se o Moodle devolver email ou username vazios, persistir `null`.
- Se nenhum aluno for encontrado, ainda assim retornar resumo operacional.

## Limites da V1
- `SYNC_COURSE_IDS` continua espelhado do codigo TypeScript; ainda nao existe fonte operacional separada.
- A V1 cobre sync bulk de alunos. Consultas on-demand de notas, progresso e matricula continuam sendo usadas pelo app.

## Quando Atualizar Esta Diretiva
- Se a lista de cursos sair do codigo e passar a vir de config externa
- Se o schema de `students` mudar
- Se for necessario incluir sync de tutores no mesmo fluxo
