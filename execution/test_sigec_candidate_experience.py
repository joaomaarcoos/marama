"""Transactional remote test for SIGEC candidate teaching experience."""

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
    checks: list[str] = []
    connection = None

    def expect(name: str, condition: bool) -> None:
        if not condition:
            raise AssertionError(name)
        checks.append(name)

    def api_retry(method: str, path: str):
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                return api.request(method, path, service=True)
            except (TimeoutError, URLError) as error:
                last_error = error
                if attempt < 2:
                    time.sleep(1 + attempt)
        assert last_error is not None
        raise last_error

    def create_user(label: str, role: str) -> str:
        status, body = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": f"sigec-test-experience-{label}-{run_id}@example.invalid",
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

    def reset_postgres(cursor: Any) -> None:
        cursor.execute("reset role")
        cursor.execute("select set_config('request.jwt.claims', '', true)")

    def expect_error(cursor: Any, name: str, sql: str, params: tuple[Any, ...], codes: set[str]) -> None:
        savepoint = f"experience_expected_{len(checks)}"
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
            try:
                status, _ = api_retry("DELETE", f"/auth/v1/admin/users/{user_id}")
                ok = ok and status in {200, 204, 404}
            except (TimeoutError, URLError):
                ok = False
        return ok

    def cleanup_stale() -> bool:
        status, body = api_retry("GET", "/auth/v1/admin/users?page=1&per_page=1000")
        if status != 200 or not isinstance(body, dict):
            return False
        ok = True
        for user in body.get("users", []):
            email, user_id = str(user.get("email", "")), user.get("id")
            if user_id and email.startswith("sigec-test-experience-") and email.endswith("@example.invalid"):
                delete_status, _ = api_retry("DELETE", f"/auth/v1/admin/users/{user_id}")
                ok = ok and delete_status in {200, 204, 404}
        return ok

    try:
        expect("stale_experience_fixtures_removed", cleanup_stale())
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
                   (user_id,full_name,cpf,birth_date,whatsapp,city,state)
                   values (%s,%s,%s,'1990-01-01',%s,'São Luís','MA')""",
                (user_id, f"Candidato Experiência Sintético {index}", valid_cpf(base),
                 f"5598{(int(run_id[1:9], 16) + index) % 1_000_000_000:09d}"),
            )
        checks.append("profiles_seeded_in_rollback_transaction")

        authenticate(cursor, candidate_a, "candidato")
        ids = []
        for institution, starts, ends, teaching in (
            ("  Escola   Um  ", "2024-01-01", "2024-03-30", True),
            ("Escola Dois", "2024-03-01", "2024-04-29", True),
            ("Empresa não docente", "2024-01-01", "2024-12-31", False),
        ):
            cursor.execute(
                """insert into public.sigec_candidate_experience
                   (candidate_id,employment_type,institution,role_title,starts_on,ends_on,is_teaching)
                   values (%s,'contratado_publico',%s,'  Professor   de Matemática  ',%s,%s,%s)
                   returning id,institution,role_title""",
                (candidate_a, institution, starts, ends, teaching),
            )
            row = cursor.fetchone(); ids.append(row[0])
            expect("experience_text_is_normalized", "  " not in row[1] and row[2] == "Professor de Matemática")

        cursor.execute("select * from public.sigec_candidate_teaching_experience_summary(%s)", (candidate_a,))
        expect("overlapping_teaching_periods_are_counted_once", cursor.fetchone() == (120, 4, 0))

        expect_error(cursor, "candidate_cannot_insert_for_another_candidate",
                     """insert into public.sigec_candidate_experience
                        (candidate_id,employment_type,institution,role_title,starts_on,is_teaching)
                        values (%s,'outro','Instituição','Professor','2024-01-01',true)""",
                     (candidate_b,), {"42501"})
        expect_error(cursor, "future_start_is_rejected",
                     """insert into public.sigec_candidate_experience
                        (candidate_id,employment_type,institution,role_title,starts_on,is_teaching)
                        values (%s,'outro','Instituição','Professor',current_date + 1,true)""",
                     (candidate_a,), {"23514"})
        expect_error(cursor, "experience_owner_is_immutable",
                     "update public.sigec_candidate_experience set candidate_id=%s where id=%s",
                     (candidate_b, ids[0]), {"42501"})

        authenticate(cursor, candidate_b, "candidato")
        cursor.execute("select id from public.sigec_candidate_experience where id=%s", (ids[0],))
        expect("other_candidate_cannot_read_experience", cursor.fetchone() is None)
        expect_error(cursor, "other_candidate_cannot_request_summary",
                     "select * from public.sigec_candidate_teaching_experience_summary(%s)",
                     (candidate_a,), {"42501"})

        authenticate(cursor, manager, "gerente")
        cursor.execute("select count(*) from public.sigec_candidate_experience where candidate_id=%s", (candidate_a,))
        expect("manager_can_read_experience", cursor.fetchone()[0] == 3)
        cursor.execute("delete from public.sigec_candidate_experience where id=%s", (ids[0],))
        expect("manager_cannot_mutate_experience", cursor.rowcount == 0)
        cursor.execute("select * from public.sigec_candidate_teaching_experience_summary(%s)", (candidate_a,))
        expect("manager_can_read_experience_summary", cursor.fetchone() == (120, 4, 0))

        reset_postgres(cursor)
        cursor.execute("select metadata from public.sigec_audit_events where entity_type='candidate_experience' and entity_id=any(%s)", ([str(item) for item in ids],))
        events = cursor.fetchall()
        serialized = json.dumps(events, ensure_ascii=False)
        expect("experience_changes_are_audited", len(events) == 3)
        expect("experience_audit_omits_values", "Escola Um" not in serialized and "Professor de Matemática" not in serialized)

        cursor.execute("""select
          has_column_privilege('authenticated','public.sigec_candidate_experience','role_title','UPDATE'),
          not has_column_privilege('authenticated','public.sigec_candidate_experience','candidate_id','UPDATE'),
          not has_column_privilege('authenticated','public.sigec_candidate_experience','id','UPDATE'),
          not has_column_privilege('authenticated','public.sigec_candidate_experience','created_at','UPDATE')""")
        expect("experience_column_grants_are_least_privilege", cursor.fetchone() == (True, True, True, True))
        connection.rollback(); connection.close(); connection = None
        checks.append("database_fixtures_rolled_back")
    except Exception as error:
        if connection is not None:
            connection.rollback(); connection.close()
        cleanup_ok = cleanup_users()
        print(json.dumps({"ok": False, "error": str(error), "checks": checks, "cleanup": cleanup_ok}, ensure_ascii=False, indent=2))
        return 1

    cleanup_ok = cleanup_users()
    print(json.dumps({"ok": cleanup_ok, "checks": checks, "cleanup": cleanup_ok}, ensure_ascii=False, indent=2))
    return 0 if cleanup_ok else 1


if __name__ == "__main__":
    sys.exit(main())
