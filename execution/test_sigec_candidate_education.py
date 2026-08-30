"""Transactional remote test for SIGEC candidate education management."""

from __future__ import annotations

import json
import secrets
import sys
import time
import uuid
from typing import Any
from urllib.error import URLError

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

    def api_request_with_retry(method: str, path: str, *, service: bool, body: dict[str, Any] | None = None):
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                return api.request(method, path, service=service, body=body)
            except (TimeoutError, URLError) as error:
                last_error = error
                if attempt < 2:
                    time.sleep(1 + attempt)
        assert last_error is not None
        raise last_error

    def create_user(label: str, role: str) -> str:
        status, body = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": f"sigec-test-education-{label}-{run_id}@example.invalid",
            "password": password,
            "email_confirm": True,
            "app_metadata": {"role": role},
        })
        expect(f"create_{label}", status == 200 and isinstance(body, dict) and bool(body.get("id")))
        users.append(body["id"])
        return body["id"]

    def authenticate(cursor: Any, user_id: str, role: str) -> None:
        claims = json.dumps({"sub": user_id, "role": "authenticated", "app_metadata": {"role": role}})
        cursor.execute("set local role authenticated")
        cursor.execute("select set_config('request.jwt.claims', %s, true)", (claims,))

    def reset_postgres(cursor: Any) -> None:
        cursor.execute("reset role")
        cursor.execute("select set_config('request.jwt.claims', '', true)")

    def expect_db_error(cursor: Any, name: str, sql: str, params: tuple[Any, ...], codes: set[str]) -> None:
        savepoint = f"education_expected_{len(checks)}"
        cursor.execute(f"savepoint {savepoint}")
        try:
            cursor.execute(sql, params)
        except psycopg2.Error as error:
            cursor.execute(f"rollback to savepoint {savepoint}")
            expect(name, error.pgcode in codes)
        else:
            cursor.execute(f"rollback to savepoint {savepoint}")
            raise AssertionError(f"{name}: unexpectedly succeeded")

    def cleanup_users() -> bool:
        ok = True
        for user_id in reversed(users):
            deleted = False
            try:
                status, _ = api_request_with_retry("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)
                deleted = status in {200, 204, 404}
            except (TimeoutError, URLError):
                deleted = False
            ok = ok and deleted
        return ok

    def cleanup_stale_users() -> bool:
        status, body = api_request_with_retry("GET", "/auth/v1/admin/users?page=1&per_page=1000", service=True)
        if status != 200 or not isinstance(body, dict):
            return False
        ok = True
        for user in body.get("users", []):
            email = str(user.get("email", ""))
            user_id = user.get("id")
            if user_id and email.startswith("sigec-test-education-") and email.endswith("@example.invalid"):
                delete_status, _ = api_request_with_retry("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)
                ok = ok and delete_status in {200, 204, 404}
        return ok

    try:
        expect("stale_education_fixtures_removed", cleanup_stale_users())
        candidate_a = create_user("candidate-a", "candidato")
        candidate_b = create_user("candidate-b", "candidato")
        manager = create_user("manager", "gerente")

        connection = psycopg2.connect(env["POSTGRES"])
        connection.autocommit = False
        cursor = connection.cursor()

        for index, user_id in enumerate((candidate_a, candidate_b), start=1):
            base = f"{(int(run_id[:8], 16) + index) % 1_000_000_000:09d}"
            cursor.execute(
                """insert into public.sigec_candidate_profiles
                   (user_id, full_name, cpf, birth_date, whatsapp, city, state)
                   values (%s,%s,%s,'1990-01-01',%s,'São Luís','MA')""",
                (user_id, f"Candidato Formação Sintético {index}", valid_cpf(base),
                 f"5598{(int(run_id[1:9], 16) + index) % 1_000_000_000:09d}"),
            )
        checks.append("profiles_seeded_in_rollback_transaction")

        authenticate(cursor, candidate_a, "candidato")
        cursor.execute(
            """insert into public.sigec_candidate_education
               (candidate_id, level, course_name, institution, started_on, completion_date, is_completed, workload_hours)
               values (%s,'licenciatura',%s,%s,'2018-02-01','2021-12-15',true,3200)
               returning id, course_name, institution""",
            (candidate_a, "  Licenciatura   em Matemática  ", "  Universidade   Sintética  "),
        )
        education_id, course_name, institution = cursor.fetchone()
        expect("candidate_inserts_own_education", bool(education_id))
        expect("education_text_is_normalized", course_name == "Licenciatura em Matemática" and institution == "Universidade Sintética")

        expect_db_error(
            cursor, "candidate_cannot_insert_for_another_candidate",
            """insert into public.sigec_candidate_education
               (candidate_id,level,course_name,institution,is_completed)
               values (%s,'tecnico','Curso indevido','Instituição indevida',false)""",
            (candidate_b,), {"42501"},
        )
        expect_db_error(
            cursor, "completed_education_requires_date",
            """insert into public.sigec_candidate_education
               (candidate_id,level,course_name,institution,is_completed)
               values (%s,'bacharelado','Curso concluído','Instituição',true)""",
            (candidate_a,), {"23514"},
        )
        expect_db_error(
            cursor, "pedagogical_education_requires_workload",
            """insert into public.sigec_candidate_education
               (candidate_id,level,course_name,institution,is_completed)
               values (%s,'formacao_pedagogica','Formação pedagógica','Instituição',false)""",
            (candidate_a,), {"23514"},
        )

        cursor.execute(
            """update public.sigec_candidate_education
               set is_completed=false, completion_date='2020-01-01', workload_hours=3300
               where id=%s and candidate_id=%s returning completion_date""",
            (education_id, candidate_a),
        )
        expect("incomplete_education_clears_completion_date", cursor.fetchone()[0] is None)

        expect_db_error(
            cursor, "candidate_cannot_change_education_owner",
            "update public.sigec_candidate_education set candidate_id=%s where id=%s",
            (candidate_b, education_id), {"42501"},
        )
        expect_db_error(
            cursor, "candidate_cannot_change_education_id",
            "update public.sigec_candidate_education set id=%s where id=%s",
            (str(uuid.uuid4()), education_id), {"42501"},
        )

        authenticate(cursor, candidate_b, "candidato")
        cursor.execute("select id from public.sigec_candidate_education where id=%s", (education_id,))
        expect("other_candidate_cannot_read_education", cursor.fetchone() is None)
        cursor.execute("delete from public.sigec_candidate_education where id=%s", (education_id,))
        expect("other_candidate_cannot_delete_education", cursor.rowcount == 0)

        authenticate(cursor, manager, "gerente")
        cursor.execute("select id from public.sigec_candidate_education where id=%s", (education_id,))
        expect("manager_can_read_candidate_education", cursor.fetchone()[0] == education_id)
        cursor.execute("delete from public.sigec_candidate_education where id=%s", (education_id,))
        expect("manager_cannot_mutate_candidate_education", cursor.rowcount == 0)

        reset_postgres(cursor)
        cursor.execute(
            """select actor_id, action, metadata from public.sigec_audit_events
               where entity_type='candidate_education' and entity_id=%s order by id""",
            (str(education_id),),
        )
        events = cursor.fetchall()
        expect("education_changes_are_audited", len(events) >= 2 and str(events[0][0]) == candidate_a)
        serialized = json.dumps([event[2] for event in events], ensure_ascii=False)
        expect("education_audit_omits_personal_values", course_name not in serialized and institution not in serialized)
        expect("education_audit_records_field_names", all("changed_fields" in event[2] for event in events))

        cursor.execute(
            """select
                 has_column_privilege('authenticated','public.sigec_candidate_education','course_name','UPDATE'),
                 not has_column_privilege('authenticated','public.sigec_candidate_education','candidate_id','UPDATE'),
                 not has_column_privilege('authenticated','public.sigec_candidate_education','id','UPDATE'),
                 not has_column_privilege('authenticated','public.sigec_candidate_education','created_at','UPDATE')"""
        )
        expect("education_column_grants_are_least_privilege", cursor.fetchone() == (True, True, True, True))

        connection.rollback()
        connection.close()
        connection = None
        checks.append("database_fixtures_rolled_back")

    except Exception as error:
        if connection is not None:
            connection.rollback()
            connection.close()
        cleanup_ok = cleanup_users()
        print(json.dumps({"ok": False, "error": str(error), "checks": checks, "cleanup": cleanup_ok}, ensure_ascii=False, indent=2))
        return 1

    cleanup_ok = cleanup_users()
    if not cleanup_ok:
        print(json.dumps({"ok": False, "error": "auth_fixture_cleanup_failed", "checks": checks}, ensure_ascii=False, indent=2))
        return 1

    print(json.dumps({"ok": True, "checks": checks, "cleanup": True}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
