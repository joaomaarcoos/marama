"""Transactional remote test for the SIGEC process publication lifecycle.

Only one temporary Auth manager is committed. All database fixtures and
transitions run inside a PostgreSQL transaction that is always rolled back.
"""

from __future__ import annotations

import json
import secrets
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg2
from psycopg2.extras import Json

from test_sigec_remote_access import Api, load_env


def main() -> int:
    env = load_env()
    api = Api(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"], env["SUPABASE_SERVICE_ROLE_KEY"])
    run_id = uuid.uuid4().hex[:12]
    manager_id: str | None = None
    connection = None
    checks: list[str] = []

    def expect_error(cursor: Any, name: str, sql: str, params: tuple[Any, ...], marker: str) -> None:
        savepoint = f"sigec_expected_{len(checks)}"
        cursor.execute(f"savepoint {savepoint}")
        try:
            cursor.execute(sql, params)
        except psycopg2.Error as error:
            cursor.execute(f"rollback to savepoint {savepoint}")
            if marker not in f"{error.pgcode} {error}":
                raise AssertionError(f"{name}: wrong error {error.pgcode}") from error
            checks.append(name)
        else:
            cursor.execute(f"rollback to savepoint {savepoint}")
            raise AssertionError(f"{name}: unexpectedly succeeded")

    def cleanup_manager() -> bool:
        if manager_id is None:
            return True
        status, _ = api.request("DELETE", f"/auth/v1/admin/users/{manager_id}", service=True)
        return status in {200, 204, 404}

    try:
        status, manager = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": f"sigec-test-process-manager-{run_id}@example.invalid",
            "password": f"Sg!{secrets.token_urlsafe(24)}9z",
            "email_confirm": True,
            "app_metadata": {"role": "gerente"},
        })
        if status != 200:
            raise AssertionError(f"create_manager: HTTP {status}")
        manager_id = manager["id"]
        checks.append("temporary_manager_created")

        connection = psycopg2.connect(env["POSTGRES"])
        connection.autocommit = False
        cursor = connection.cursor()
        now = datetime.now(timezone.utc)
        cursor.execute(
            """insert into public.sigec_processes
               (title, slug, summary, status, edital_version, applications_open_at,
                applications_close_at, created_by)
               values (%s,%s,%s,'draft','teste-1',%s,%s,%s) returning id""",
            (f"Processo sintético P2 {run_id}", f"processo-sintetico-p2-{run_id}",
             "Processo temporário para validar publicação atômica.",
             now + timedelta(minutes=10), now + timedelta(days=2), manager_id),
        )
        process_id = cursor.fetchone()[0]

        cursor.execute("select code, ready from public.sigec_get_process_publication_readiness(%s)", (process_id,))
        readiness = cursor.fetchall()
        if len(readiness) != 8 or all(row[1] for row in readiness):
            raise AssertionError("incomplete_process_readiness_contract_invalid")
        checks.append("incomplete_process_has_blockers")

        cursor.execute("""select
          not has_function_privilege('anon','public.sigec_publish_process(uuid,uuid)','EXECUTE'),
          not has_function_privilege('authenticated','public.sigec_publish_process(uuid,uuid)','EXECUTE'),
          has_function_privilege('service_role','public.sigec_publish_process(uuid,uuid)','EXECUTE')""")
        if cursor.fetchone() != (True, True, True):
            raise AssertionError("publication_rpc_privileges_invalid")
        checks.append("publication_rpc_is_service_only")

        cursor.execute("""select
          not has_function_privilege('anon','public.sigec_upsert_form_configuration(uuid,uuid,text,text,text,text,boolean,integer,jsonb,uuid)','EXECUTE'),
          not has_function_privilege('authenticated','public.sigec_upsert_form_configuration(uuid,uuid,text,text,text,text,boolean,integer,jsonb,uuid)','EXECUTE'),
          has_function_privilege('service_role','public.sigec_upsert_form_configuration(uuid,uuid,text,text,text,text,boolean,integer,jsonb,uuid)','EXECUTE')""")
        if cursor.fetchone() != (True, True, True):
            raise AssertionError("form_configuration_rpc_privileges_invalid")
        checks.append("form_configuration_rpc_is_service_only")

        cursor.execute("""select
          not has_function_privilege('anon','public.sigec_upsert_stage_configuration(uuid,uuid,text,text,text,text,integer,boolean,boolean,boolean,text,uuid)','EXECUTE'),
          not has_function_privilege('authenticated','public.sigec_upsert_stage_configuration(uuid,uuid,text,text,text,text,integer,boolean,boolean,boolean,text,uuid)','EXECUTE'),
          not has_function_privilege('authenticated','public.sigec_upsert_stage_transition(uuid,uuid,uuid,uuid,boolean,boolean,boolean,uuid)','EXECUTE'),
          has_function_privilege('service_role','public.sigec_upsert_stage_configuration(uuid,uuid,text,text,text,text,integer,boolean,boolean,boolean,text,uuid)','EXECUTE'),
          has_function_privilege('service_role','public.sigec_upsert_stage_transition(uuid,uuid,uuid,uuid,boolean,boolean,boolean,uuid)','EXECUTE')""")
        if cursor.fetchone() != (True, True, True, True, True):
            raise AssertionError("stage_configuration_rpc_privileges_invalid")
        checks.append("stage_configuration_rpcs_are_service_only")

        cursor.execute("""select
          not has_function_privilege('anon','public.sigec_upsert_scoring_version(uuid,uuid,text,numeric,text,boolean,uuid)','EXECUTE'),
          not has_function_privilege('authenticated','public.sigec_confirm_scoring_version(uuid,uuid,uuid,text)','EXECUTE'),
          has_function_privilege('service_role','public.sigec_upsert_scoring_version(uuid,uuid,text,numeric,text,boolean,uuid)','EXECUTE'),
          has_function_privilege('service_role','public.sigec_confirm_scoring_version(uuid,uuid,uuid,text)','EXECUTE')""")
        if cursor.fetchone() != (True, True, True, True):
            raise AssertionError("scoring_configuration_rpc_privileges_invalid")
        checks.append("scoring_configuration_rpcs_are_service_only")

        cursor.execute("select public.sigec_upsert_scoring_version(%s,%s,%s,%s,%s,%s,%s)",
                       (process_id, manager_id, "Tentativa direta sintética", 1,
                        "Validação do trigger de confirmação.", False, None))
        guarded_version_id = cursor.fetchone()[0]
        expect_error(cursor, "direct_scoring_confirmation_bypass_is_rejected",
                     "update public.sigec_scoring_rule_versions set status='official',confirmed_by=%s,confirmed_at=now() where id=%s",
                     (manager_id, guarded_version_id), "SIGEC_SCORING_TOTAL_MISMATCH")
        cursor.execute("delete from public.sigec_scoring_rule_versions where id=%s", (guarded_version_id,))

        cursor.execute("set local role authenticated")
        expect_error(cursor, "authenticated_role_cannot_publish",
                     "select * from public.sigec_publish_process(%s,%s)",
                     (process_id, manager_id), "42501")
        cursor.execute("reset role")
        expect_error(cursor, "incomplete_publication_fails_closed",
                     "select * from public.sigec_publish_process(%s,%s)",
                     (process_id, manager_id), "SIGEC_PROCESS_NOT_READY")

        cursor.execute("select public.sigec_upsert_process_modality(%s,%s,%s,%s,%s,%s)",
                       (process_id, manager_id, "Professor Formador", "professor-formador", "Modalidade sintética.", None))
        modality_id = cursor.fetchone()[0]
        cursor.execute("select public.sigec_upsert_process_modality(%s,%s,%s,%s,%s,%s)",
                       (process_id, manager_id, "Modalidade temporária", "modalidade-temporaria", None, None))
        disposable_modality_id = cursor.fetchone()[0]
        cursor.execute("select public.sigec_delete_process_modality(%s,%s,%s)",
                       (process_id, manager_id, disposable_modality_id))
        checks.append("modality_crud_is_scoped_and_audited")

        import_row = {
            "modalityName": "EJATEC", "modalitySlug": "ejatec",
            "municipality": "Imperatriz", "courseName": f"Curso importado {run_id}",
            "vacancyKind": "cadastro_reserva", "vacancyCount": None,
            "acceptedEducation": "Licenciatura compatível.",
            "proofInstructions": "Apresentar diploma legível.",
            "sourceReference": "Fixture transacional de importação.",
        }
        expect_error(cursor, "duplicate_import_is_rejected",
                     "select * from public.sigec_confirm_vacancy_import(%s,%s,%s,%s)",
                     (process_id, manager_id, "a" * 64, Json([import_row, import_row])),
                     "SIGEC_IMPORT_DUPLICATES")
        cursor.execute("select * from public.sigec_confirm_vacancy_import(%s,%s,%s,%s)",
                       (process_id, manager_id, "b" * 64, Json([import_row])))
        if cursor.fetchone()[0] != 1:
            raise AssertionError("vacancy_import_count_invalid")
        checks.append("reviewed_import_is_atomic_and_audited")

        cursor.execute("select public.sigec_upsert_vacancy_configuration(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                       (process_id, manager_id, modality_id, f"Curso sintético P2 {run_id}",
                        "São Luís", "Licenciatura compatível.", "Apresentar diploma legível.",
                        "cadastro_reserva", None, True, None))
        vacancy_id = cursor.fetchone()[0]
        cursor.execute("select public.sigec_upsert_vacancy_configuration(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                       (process_id, manager_id, modality_id, f"Curso sintético P2 {run_id}",
                        "São Luís", "Licenciatura plena compatível.", "Diploma legível e reconhecido.",
                        "quantidade", 2, True, vacancy_id))
        checks.append("vacancy_and_requirement_upsert_is_atomic")
        expect_error(cursor, "modality_with_vacancy_cannot_be_deleted",
                     "select public.sigec_delete_process_modality(%s,%s,%s)",
                     (process_id, manager_id, modality_id), "SIGEC_MODALITY_HAS_VACANCIES")
        form_rpc = "select public.sigec_upsert_form_configuration(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"
        cursor.execute(form_rpc, (process_id, manager_id, "question", "declaracao_pcd",
                                  "Você concorre às vagas PCD?", "Selecione uma opção.", True, 10,
                                  Json({"audience": "all", "questionType": "boolean"}), None))
        question_id = cursor.fetchone()[0]
        cursor.execute(form_rpc, (process_id, manager_id, "question", "declaracao_pcd",
                                  "Deseja concorrer às vagas PCD?", "A comprovação será analisada.", True, 10,
                                  Json({"audience": "all", "questionType": "boolean"}), question_id))
        cursor.execute(form_rpc, (process_id, manager_id, "document", "diploma",
                                  "Diploma", "Apresente arquivo legível.", True, 20,
                                  Json({"audience": "all", "acceptedMimeTypes": ["application/pdf"],
                                        "maxFileSizeBytes": 10 * 1024 * 1024}), None))
        cursor.execute(form_rpc, (process_id, manager_id, "declaration", "autodeclaracao_pcd",
                                  "Autodeclaração PCD", "Texto provisório para teste isolado do processo.", True, 30,
                                  Json({"audience": "pcd", "version": "teste-1"}), None))
        cursor.execute(form_rpc, (process_id, manager_id, "declaration", "autodeclaracao_ppp",
                                  "Autodeclaração PPP", "Texto provisório para teste isolado do processo.", True, 40,
                                  Json({"audience": "ppp", "version": "teste-1"}), None))
        cursor.execute(form_rpc, (process_id, manager_id, "question", "temporaria",
                                  "Pergunta temporária", None, False, 99,
                                  Json({"audience": "all", "questionType": "short_text"}), None))
        disposable_question_id = cursor.fetchone()[0]
        cursor.execute("select public.sigec_delete_form_configuration(%s,%s,%s,%s)",
                       (process_id, manager_id, "question", disposable_question_id))
        checks.append("form_configuration_crud_is_scoped_and_audited")
        stage_rpc = "select public.sigec_upsert_stage_configuration(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"
        cursor.execute(stage_rpc, (process_id, manager_id, "em_analise", "Em análise",
                                   "A candidatura está em análise.", "#2563eb", 10, True, False, False,
                                   "Olá, {{nome}}. Sua candidatura em {{processo}} está em análise: {{link}}", None))
        initial_stage_id = cursor.fetchone()[0]
        cursor.execute(stage_rpc, (process_id, manager_id, "encerrado", "Encerrado",
                                   "A análise da candidatura foi encerrada.", "#64748b", 20, False, True, True,
                                   "Olá, {{nome}}. Consulte o resultado em {{processo}}: {{link}}", None))
        terminal_stage_id = cursor.fetchone()[0]
        expect_error(cursor, "stage_template_rejects_unknown_placeholder", stage_rpc,
                     (process_id, manager_id, "invalida", "Etapa inválida", "Mensagem pública válida.",
                      "#64748b", 30, False, False, False,
                      "Olá, {{segredo}}. Consulte {{link}} para detalhes.", None),
                     "SIGEC_STAGE_CONFIGURATION_INVALID")
        cursor.execute(stage_rpc, (process_id, manager_id, "temporaria_fluxo", "Temporária",
                                   "Etapa temporária para testar exclusão.", "#64748b", 30, False, False, False,
                                   "Olá, {{nome}}. Etapa temporária em {{processo}}: {{link}}", None))
        disposable_stage_id = cursor.fetchone()[0]
        transition_rpc = "select public.sigec_upsert_stage_transition(%s,%s,%s,%s,%s,%s,%s,%s)"
        cursor.execute(transition_rpc, (process_id, manager_id, initial_stage_id, terminal_stage_id,
                                        True, True, True, None))
        main_transition_id = cursor.fetchone()[0]
        cursor.execute(transition_rpc, (process_id, manager_id, initial_stage_id, terminal_stage_id,
                                        False, True, True, main_transition_id))
        cursor.execute(transition_rpc, (process_id, manager_id, initial_stage_id, disposable_stage_id,
                                        False, True, True, None))
        disposable_transition_id = cursor.fetchone()[0]
        cursor.execute("select public.sigec_delete_stage_transition(%s,%s,%s)",
                       (process_id, manager_id, disposable_transition_id))
        cursor.execute("select public.sigec_delete_stage_configuration(%s,%s,%s)",
                       (process_id, manager_id, disposable_stage_id))
        expect_error(cursor, "terminal_stage_cannot_have_outgoing_transition", transition_rpc,
                     (process_id, manager_id, terminal_stage_id, initial_stage_id, False, True, True, None),
                     "SIGEC_TERMINAL_STAGE_HAS_OUTGOING_TRANSITION")
        checks.append("stage_and_transition_crud_is_scoped_and_audited")
        cursor.executemany("""insert into public.sigec_process_decisions
          (process_id,code,revision,title,status,resolution,source_type,source_reference,impact,recorded_by)
          values (%s,%s,1,%s,'confirmed','Confirmada apenas para teste.','product_decision',
                  'Fixture transacional isolada do P2.','Valida o gate sem definir regra real.',%s)""",
          [(process_id, f"SIGEC-DEC-{n:02d}", f"Decisão sintética {n}", manager_id) for n in range(1, 7)])

        cursor.execute("select public.sigec_upsert_scoring_version(%s,%s,%s,%s,%s,%s,%s)",
                       (process_id, manager_id, "Regra oficial sintética", 30,
                        "Fixture transacional isolada da P2-06.", False, None))
        scoring_version_id = cursor.fetchone()[0]
        cursor.execute("select public.sigec_upsert_scoring_item(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                       (process_id, manager_id, scoring_version_id, "producao", "Produção acadêmica",
                        "Critério sintético para teste.", 30, Json({"unit": "item"}), 10, None))
        cursor.execute("select public.sigec_upsert_tie_break_rule(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                       (process_id, manager_id, scoring_version_id, "maior_nota", "Maior nota final",
                        "score_total", "desc", Json({}), 1, None))
        cursor.execute("select public.sigec_confirm_scoring_version(%s,%s,%s,%s)",
                       (process_id, manager_id, scoring_version_id, "official"))
        expect_error(cursor, "confirmed_scoring_version_is_immutable",
                     "update public.sigec_scoring_rule_items set max_points=29 where rule_version_id=%s",
                     (scoring_version_id,), "SIGEC_SCORING_VERSION_IMMUTABLE")
        checks.append("official_scoring_version_is_complete_and_versioned")

        cursor.execute("select public.sigec_upsert_scoring_version(%s,%s,%s,%s,%s,%s,%s)",
                       (process_id, manager_id, "Retificação oficial sintética", 30,
                        "Segunda versão transacional da P2-06.", False, None))
        revised_scoring_version_id = cursor.fetchone()[0]
        cursor.execute("select ready from public.sigec_get_process_publication_readiness(%s) where code='scoring'", (process_id,))
        if cursor.fetchone()[0]:
            raise AssertionError("newer_scoring_draft_did_not_block_publication")
        cursor.execute("select public.sigec_upsert_scoring_item(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                       (process_id, manager_id, revised_scoring_version_id, "producao", "Produção acadêmica revisada",
                        "Critério sintético revisado.", 30, Json({"unit": "item"}), 10, None))
        cursor.execute("select public.sigec_upsert_tie_break_rule(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                       (process_id, manager_id, revised_scoring_version_id, "maior_nota", "Maior nota final",
                        "score_total", "desc", Json({}), 1, None))
        cursor.execute("select public.sigec_confirm_scoring_version(%s,%s,%s,%s)",
                       (process_id, manager_id, revised_scoring_version_id, "official"))
        cursor.execute("select count(*) from public.sigec_scoring_rule_versions where process_id=%s and status='official'", (process_id,))
        if cursor.fetchone()[0] != 2:
            raise AssertionError("official_scoring_history_not_preserved")
        checks.append("latest_scoring_version_controls_publication_without_erasing_history")

        cursor.execute("select code, ready from public.sigec_get_process_publication_readiness(%s)", (process_id,))
        readiness = cursor.fetchall()
        if len(readiness) != 8 or not all(row[1] for row in readiness):
            raise AssertionError("complete_process_not_ready:" + ",".join(row[0] for row in readiness if not row[1]))
        checks.append("complete_process_passes_all_readiness_controls")

        cursor.execute("select * from public.sigec_publish_process(%s,%s)", (process_id, manager_id))
        published = cursor.fetchone()
        if published[1] != "open" or published[2] is None:
            raise AssertionError("publication_transition_invalid")
        checks.append("complete_process_published")

        expect_error(cursor, "published_configuration_is_locked",
                     "select public.sigec_upsert_process_modality(%s,%s,%s,%s,%s,%s)",
                     (process_id, manager_id, "Bloqueada", "bloqueada", None, None),
                     "SIGEC_PROCESS_CONFIGURATION_LOCKED")
        expect_error(cursor, "published_form_configuration_is_locked", form_rpc,
                     (process_id, manager_id, "question", "bloqueada", "Pergunta bloqueada", None,
                      False, 100, Json({"audience": "all", "questionType": "short_text"}), None),
                     "SIGEC_PROCESS_CONFIGURATION_LOCKED")
        expect_error(cursor, "published_stage_configuration_is_locked", stage_rpc,
                     (process_id, manager_id, "bloqueada_fluxo", "Etapa bloqueada", "Mensagem pública.",
                      "#64748b", 100, False, False, False,
                      "Olá, {{nome}}. Consulte {{processo}} em {{link}}", None),
                     "SIGEC_PROCESS_CONFIGURATION_LOCKED")
        expect_error(cursor, "published_scoring_configuration_is_locked",
                     "select public.sigec_upsert_scoring_version(%s,%s,%s,%s,%s,%s,%s)",
                     (process_id, manager_id, "Nova regra bloqueada", 30,
                      "Fixture após publicação.", True, None),
                     "SIGEC_PROCESS_CONFIGURATION_LOCKED")

        cursor.execute("set local role anon")
        cursor.execute("select count(*) from public.sigec_processes where id=%s and status='open'", (process_id,))
        if cursor.fetchone()[0] != 1:
            raise AssertionError("published_process_not_visible_to_anon")
        checks.append("published_process_visible_to_anon")
        cursor.execute("reset role")

        expect_error(cursor, "publication_replay_rejected",
                     "select * from public.sigec_publish_process(%s,%s)",
                     (process_id, manager_id), "SIGEC_PROCESS_NOT_DRAFT")
        cursor.execute("select * from public.sigec_close_process(%s,%s)", (process_id, manager_id))
        if cursor.fetchone()[1] != "closed":
            raise AssertionError("close_transition_invalid")
        checks.append("open_process_closed")

        cursor.execute("""select action,actor_id from public.sigec_audit_events
          where entity_id=%s and action in ('sigec.process.published','sigec.process.closed')""", (str(process_id),))
        audit_rows = cursor.fetchall()
        if {row[0] for row in audit_rows} != {"sigec.process.published", "sigec.process.closed"} or any(str(row[1]) != manager_id for row in audit_rows):
            raise AssertionError("transition_audit_incomplete")
        checks.append("publication_and_close_are_audited")

        connection.rollback()
        connection.close()
        connection = None
        if not cleanup_manager():
            raise AssertionError("temporary_manager_cleanup_failed")
        manager_id = None
        print(json.dumps({"ok": True, "checks": len(checks), "databaseFixturesRolledBack": True, "authUserCleaned": True}, ensure_ascii=False, indent=2))
        return 0
    except Exception as error:  # noqa: BLE001
        if connection is not None:
            connection.rollback()
        print(json.dumps({"ok": False, "checksPassed": len(checks), "error": str(error).splitlines()[0]}, ensure_ascii=False, indent=2))
        return 1
    finally:
        if connection is not None:
            connection.close()
        cleanup_manager()


if __name__ == "__main__":
    sys.exit(main())
