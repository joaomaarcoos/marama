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

        cursor.execute("set local role authenticated")
        expect_error(cursor, "authenticated_role_cannot_publish",
                     "select * from public.sigec_publish_process(%s,%s)",
                     (process_id, manager_id), "42501")
        cursor.execute("reset role")
        expect_error(cursor, "incomplete_publication_fails_closed",
                     "select * from public.sigec_publish_process(%s,%s)",
                     (process_id, manager_id), "SIGEC_PROCESS_NOT_READY")

        cursor.execute("insert into public.sigec_courses (canonical_name,normalized_name) values (%s,%s) returning id",
                       (f"Curso sintético P2 {run_id}", f"CURSO SINTETICO P2 {run_id.upper()}"))
        course_id = cursor.fetchone()[0]
        cursor.execute("insert into public.sigec_modalities (process_id,name,slug) values (%s,'Professor Formador','professor-formador') returning id", (process_id,))
        modality_id = cursor.fetchone()[0]
        cursor.execute("""insert into public.sigec_process_course_requirements
          (process_id,course_id,accepted_education,proof_instructions)
          values (%s,%s,'Licenciatura compatível.','Apresentar diploma legível.')""", (process_id, course_id))
        cursor.execute("""insert into public.sigec_vacancies
          (process_id,modality_id,course_id,municipality,vacancy_kind)
          values (%s,%s,%s,'São Luís','cadastro_reserva')""", (process_id, modality_id, course_id))
        cursor.execute("insert into public.sigec_document_requirements (process_id,code,label,required) values (%s,'diploma','Diploma',true)", (process_id,))
        cursor.execute("""insert into public.sigec_process_stages
          (process_id,code,label,position,is_terminal) values
          (%s,'em_analise','Em análise',1,false),(%s,'encerrado','Encerrado',2,true)""", (process_id, process_id))
        cursor.execute("insert into public.sigec_scoring_criteria (process_id,code,label,max_points) values (%s,'titulacao','Titulação',30)", (process_id,))
        cursor.executemany("""insert into public.sigec_process_decisions
          (process_id,code,revision,title,status,resolution,source_type,source_reference,impact,recorded_by)
          values (%s,%s,1,%s,'confirmed','Confirmada apenas para teste.','product_decision',
                  'Fixture transacional isolada do P2.','Valida o gate sem definir regra real.',%s)""",
          [(process_id, f"SIGEC-DEC-{n:02d}", f"Decisão sintética {n}", manager_id) for n in range(1, 7)])

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
