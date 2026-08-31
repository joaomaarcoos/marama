"""Transactional remote test for idempotent SIGEC application drafts."""

from __future__ import annotations

import json
import secrets
import sys
import uuid
from typing import Any

import psycopg2

from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env


def main() -> int:
    env = load_env()
    api = Api(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"], env["SUPABASE_SERVICE_ROLE_KEY"])
    run_id = uuid.uuid4().hex[:12]
    password = f"Sg!{secrets.token_urlsafe(24)}9z"
    users: list[str] = []
    connection = None
    checks: list[str] = []

    def expect(name: str, condition: bool) -> None:
        if not condition:
            raise AssertionError(name)
        checks.append(name)

    def create_user(label: str, role: str) -> str:
        status, body = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": f"sigec-test-draft-{label}-{run_id}@example.invalid",
            "password": password,
            "email_confirm": True,
            "app_metadata": {"role": role},
        })
        expect(f"create_{label}", status == 200 and isinstance(body, dict) and bool(body.get("id")))
        users.append(body["id"])
        return body["id"]

    def authenticate(cursor: Any, user_id: str, role: str) -> None:
        cursor.execute("set local role authenticated")
        cursor.execute("select set_config('request.jwt.claims', %s, true)", (
            json.dumps({"sub": user_id, "role": "authenticated", "app_metadata": {"role": role}}),
        ))

    def reset(cursor: Any) -> None:
        cursor.execute("reset role")
        cursor.execute("select set_config('request.jwt.claims', '', true)")

    def expect_error(cursor: Any, name: str, sql: str, params: tuple[Any, ...], code: str) -> None:
        savepoint = f"draft_expected_{len(checks)}"
        cursor.execute(f"savepoint {savepoint}")
        try:
            cursor.execute(sql, params)
        except psycopg2.Error as error:
            cursor.execute(f"rollback to savepoint {savepoint}")
            expect(name, error.pgcode == code)
        else:
            cursor.execute(f"rollback to savepoint {savepoint}")
            raise AssertionError(f"{name}: unexpectedly succeeded")

    def cleanup() -> bool:
        ok = True
        for user_id in reversed(users):
            status, _ = api.request("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)
            ok = ok and status in {200, 204, 404}
        return ok

    try:
        candidate = create_user("candidate", "candidato")
        incomplete = create_user("incomplete", "candidato")
        manager = create_user("manager", "gerente")
        connection = psycopg2.connect(env["POSTGRES"])
        connection.autocommit = False
        cursor = connection.cursor()

        for index, user_id in enumerate((candidate, incomplete), start=1):
            base = f"{(int(run_id[:8], 16) + index) % 1_000_000_000:09d}"
            cursor.execute(
                """insert into public.sigec_candidate_profiles
                   (user_id,full_name,cpf,birth_date,whatsapp,whatsapp_verified_at,postal_code,street,address_number,district,city,state,availability,profile_completed_at)
                   values (%s,%s,%s,'1990-01-01',%s,%s,'65000123','Rua Teste','10','Centro','São Luís','MA','Manhã',%s)""",
                (user_id, f"Candidato Rascunho {index}", valid_cpf(base),
                 f"5598{(int(run_id[1:9], 16) + index) % 1_000_000_000:09d}",
                 "2026-08-30" if user_id == candidate else None,
                 "2026-08-30" if user_id == candidate else None),
            )
        cursor.execute(
            """insert into public.sigec_processes
               (title,slug,status,published_at,applications_open_at,applications_close_at,created_by)
               values (%s,%s,'open',now()-interval '1 hour',now()-interval '1 hour',now()+interval '1 day',%s)
               returning id""",
            ("Processo sintético de rascunho", f"sigec-draft-{run_id}", manager),
        )
        process_id = cursor.fetchone()[0]

        authenticate(cursor, candidate, "candidato")
        cursor.execute("select * from public.sigec_create_application_draft(%s)", (process_id,))
        first = cursor.fetchone()
        expect("draft_created", first[0] is not None and first[1] == "draft" and first[2] is True)
        cursor.execute("select * from public.sigec_create_application_draft(%s)", (process_id,))
        second = cursor.fetchone()
        expect("draft_creation_is_idempotent", second[0] == first[0] and second[2] is False)

        reset(cursor)
        cursor.execute("insert into public.sigec_modalities(process_id,name,slug) values (%s,'Modalidade Teste','modalidade-teste') returning id", (process_id,))
        modality_id = cursor.fetchone()[0]
        vacancy_ids = []
        for index in (1, 2):
            course_name = f"Curso Preferência {run_id} {index}"
            cursor.execute("insert into public.sigec_courses(canonical_name,normalized_name) values (%s,%s) returning id", (course_name, course_name.lower()))
            course_id = cursor.fetchone()[0]
            cursor.execute("""insert into public.sigec_vacancies(process_id,modality_id,course_id,municipality,vacancy_kind,vacancy_count)
                              values (%s,%s,%s,'São Luís','quantidade',1) returning id""", (process_id, modality_id, course_id))
            vacancy_ids.append(cursor.fetchone()[0])

        authenticate(cursor, candidate, "candidato")
        cursor.execute("select public.sigec_replace_application_preferences(%s,%s::uuid[])", (first[0], vacancy_ids))
        expect("ordered_preferences_saved_atomically", cursor.fetchone()[0] == 2)
        cursor.execute("select vacancy_id from public.sigec_application_preferences where application_id=%s order by position", (first[0],))
        expect("preference_order_is_preserved", [row[0] for row in cursor.fetchall()] == vacancy_ids)
        cursor.execute("select public.sigec_replace_application_preferences(%s,%s::uuid[])", (first[0], list(reversed(vacancy_ids))))
        cursor.execute("select vacancy_id from public.sigec_application_preferences where application_id=%s order by position", (first[0],))
        expect("preference_order_can_be_replaced", [row[0] for row in cursor.fetchall()] == list(reversed(vacancy_ids)))
        expect_error(cursor, "duplicate_preference_is_rejected",
                     "select public.sigec_replace_application_preferences(%s,%s::uuid[])", (first[0], [vacancy_ids[0], vacancy_ids[0]]), "23514")
        expect_error(cursor, "direct_preference_write_is_revoked",
                     "delete from public.sigec_application_preferences where application_id=%s", (first[0],), "42501")

        authenticate(cursor, incomplete, "candidato")
        expect_error(cursor, "other_candidate_preferences_are_rejected",
                     "select public.sigec_replace_application_preferences(%s,%s::uuid[])", (first[0], [vacancy_ids[0]]), "42501")

        reset(cursor)
        cursor.execute("update public.sigec_processes set max_preferences=1 where id=%s", (process_id,))
        authenticate(cursor, candidate, "candidato")
        expect_error(cursor, "configured_preference_limit_is_enforced",
                     "select public.sigec_replace_application_preferences(%s,%s::uuid[])", (first[0], vacancy_ids), "23514")
        reset(cursor)
        cursor.execute("update public.sigec_processes set max_preferences=5 where id=%s", (process_id,))
        authenticate(cursor, candidate, "candidato")
        expect_error(cursor, "direct_insert_is_revoked",
                     "insert into public.sigec_applications(process_id,candidate_id) values (%s,%s)",
                     (process_id, candidate), "42501")

        authenticate(cursor, incomplete, "candidato")
        expect_error(cursor, "incomplete_profile_is_rejected",
                     "select * from public.sigec_create_application_draft(%s)", (process_id,), "23514")

        authenticate(cursor, manager, "gerente")
        expect_error(cursor, "manager_cannot_create_candidate_draft",
                     "select * from public.sigec_create_application_draft(%s)", (process_id,), "42501")

        reset(cursor)
        cursor.execute("update public.sigec_applications set application_state='submitted', submitted_at=now() where id=%s", (first[0],))
        authenticate(cursor, candidate, "candidato")
        expect_error(cursor, "submitted_preferences_are_locked",
                     "select public.sigec_replace_application_preferences(%s,%s::uuid[])", (first[0], [vacancy_ids[0]]), "23514")
        reset(cursor)
        cursor.execute("update public.sigec_applications set application_state='draft', submitted_at=null where id=%s", (first[0],))
        cursor.execute("update public.sigec_processes set applications_close_at=now()-interval '1 second' where id=%s", (process_id,))
        cursor.execute("delete from public.sigec_applications where id=%s", (first[0],))
        authenticate(cursor, candidate, "candidato")
        expect_error(cursor, "closed_window_is_rejected",
                     "select * from public.sigec_create_application_draft(%s)", (process_id,), "23514")

        reset(cursor)
        cursor.execute("select count(*) from public.sigec_audit_events where action='application_draft_created' and entity_id=%s", (str(first[0]),))
        expect("draft_is_audited_once", cursor.fetchone()[0] == 1)
        cursor.execute("select not has_table_privilege('authenticated','public.sigec_applications','INSERT'), has_function_privilege('authenticated','public.sigec_create_application_draft(uuid)','EXECUTE')")
        expect("least_privilege_grants", cursor.fetchone() == (True, True))

        connection.rollback()
        connection.close()
        connection = None
        checks.append("database_fixtures_rolled_back")
    except Exception as error:
        if connection is not None:
            connection.rollback()
            connection.close()
        cleanup_ok = cleanup()
        print(json.dumps({"ok": False, "error": str(error), "checks": checks, "cleanup": cleanup_ok}, ensure_ascii=False, indent=2))
        return 1

    cleanup_ok = cleanup()
    print(json.dumps({"ok": cleanup_ok, "checks": checks, "cleanup": cleanup_ok}, ensure_ascii=False, indent=2))
    return 0 if cleanup_ok else 1


if __name__ == "__main__":
    sys.exit(main())
