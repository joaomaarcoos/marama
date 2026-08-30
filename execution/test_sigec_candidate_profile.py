"""Transactional remote test for SIGEC candidate profile management.

Temporary Auth identities are created through the Admin API. Every database
fixture and mutation runs inside one PostgreSQL transaction that is always
rolled back before the identities are removed.
"""

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
            "email": f"sigec-test-profile-{label}-{run_id}@example.invalid",
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

    def expect_permission_error(cursor: Any, name: str, sql: str, params: tuple[Any, ...]) -> None:
        savepoint = f"profile_expected_{len(checks)}"
        cursor.execute(f"savepoint {savepoint}")
        try:
            cursor.execute(sql, params)
        except psycopg2.Error as error:
            cursor.execute(f"rollback to savepoint {savepoint}")
            expect(name, error.pgcode == "42501")
        else:
            cursor.execute(f"rollback to savepoint {savepoint}")
            raise AssertionError(f"{name}: unexpectedly succeeded")

    def cleanup_users() -> bool:
        ok = True
        for user_id in reversed(users):
            status, _ = api.request("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)
            ok = ok and status in {200, 204, 404}
        return ok

    def cleanup_stale_users() -> bool:
        status, body = api.request("GET", "/auth/v1/admin/users?page=1&per_page=1000", service=True)
        if status != 200 or not isinstance(body, dict):
            return False
        stale = [
            user for user in body.get("users", [])
            if str(user.get("email", "")).startswith("sigec-test-profile-")
            and str(user.get("email", "")).endswith("@example.invalid")
        ]
        ok = True
        for user in stale:
            user_id = user.get("id")
            if not user_id:
                continue
            audit_status, _ = api.request(
                "DELETE",
                f"/rest/v1/sigec_audit_events?entity_type=eq.candidate_profile&entity_id=eq.{user_id}",
                service=True,
            )
            delete_status, _ = api.request("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)
            ok = ok and audit_status in {200, 204} and delete_status in {200, 204, 404}
        return ok

    try:
        expect("stale_profile_fixtures_removed", cleanup_stale_users())
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
                   (user_id, full_name, cpf, birth_date, whatsapp, whatsapp_verified_at, city, state)
                   values (%s,%s,%s,'1990-01-01',%s,now(),'São Luís','MA')""",
                (user_id, f"Candidato Perfil Sintético {index}", valid_cpf(base),
                 f"5598{(int(run_id[1:9], 16) + index) % 1_000_000_000:09d}"),
            )
        checks.append("profiles_seeded_in_rollback_transaction")

        new_whatsapp = f"5599{int(run_id[2:10], 16) % 1_000_000_000:09d}"
        authenticate(cursor, candidate_a, "candidato")
        cursor.execute(
            """update public.sigec_candidate_profiles
               set full_name=%s, birth_date='1990-01-02', whatsapp=%s,
                   postal_code=%s, street=%s, address_number='120', address_extra='Sala 2',
                   district='Centro', city='São Luís', state='ma', availability=%s,
                   professional_summary=%s
               where user_id=%s
               returning full_name, whatsapp, whatsapp_verified_at, postal_code, street, state, profile_completed_at""",
            ("  Candidato   Perfil Atualizado  ", new_whatsapp, "65000-123",
             "  Rua   da Cidadania  ", "Manhã e tarde, de segunda a sexta.",
             "Experiência docente em educação profissional.", candidate_a),
        )
        updated = cursor.fetchone()
        expect("candidate_updates_own_profile", updated is not None)
        expect("profile_fields_are_normalized", updated[0] == "Candidato Perfil Atualizado" and updated[3] == "65000123" and updated[4] == "Rua da Cidadania" and updated[5] == "MA")
        expect("completion_is_derived", updated[6] is not None)
        expect("whatsapp_change_resets_verification", updated[1] == new_whatsapp and updated[2] is None)

        expect_permission_error(cursor, "candidate_cannot_self_complete",
                                "update public.sigec_candidate_profiles set profile_completed_at=now() where user_id=%s",
                                (candidate_a,))
        expect_permission_error(cursor, "candidate_cannot_change_cpf",
                                "update public.sigec_candidate_profiles set cpf=%s where user_id=%s",
                                (valid_cpf("123456789"), candidate_a))

        cursor.execute("update public.sigec_candidate_profiles set availability='' where user_id=%s returning profile_completed_at", (candidate_a,))
        expect("incomplete_profile_is_not_marked_complete", cursor.fetchone()[0] is None)

        authenticate(cursor, candidate_b, "candidato")
        cursor.execute("update public.sigec_candidate_profiles set city='Tentativa indevida' where user_id=%s", (candidate_a,))
        expect("other_candidate_cannot_update_profile", cursor.rowcount == 0)

        authenticate(cursor, manager, "gerente")
        cursor.execute("update public.sigec_candidate_profiles set city='Tentativa interna direta' where user_id=%s", (candidate_a,))
        expect("manager_cannot_bypass_owner_update", cursor.rowcount == 0)

        reset_postgres(cursor)
        cursor.execute(
            """select actor_id, metadata from public.sigec_audit_events
               where entity_type='candidate_profile' and entity_id=%s
                 and action='candidate_profile_updated' order by id""",
            (candidate_a,),
        )
        events = cursor.fetchall()
        expect("profile_changes_are_audited", len(events) >= 2 and str(events[0][0]) == candidate_a)
        serialized = json.dumps([event[1] for event in events], ensure_ascii=False)
        expect("audit_omits_personal_values", "Rua da Cidadania" not in serialized and new_whatsapp not in serialized and "Experiência docente" not in serialized)
        expect("audit_records_changed_field_names", all("changed_fields" in event[1] for event in events))

        cursor.execute(
            """select
                 not has_column_privilege('authenticated','public.sigec_candidate_profiles','cpf','UPDATE'),
                 not has_column_privilege('authenticated','public.sigec_candidate_profiles','profile_completed_at','UPDATE'),
                 not has_column_privilege('authenticated','public.sigec_candidate_profiles','whatsapp_verified_at','UPDATE'),
                 has_column_privilege('authenticated','public.sigec_candidate_profiles','whatsapp','UPDATE')"""
        )
        expect("profile_column_grants_are_least_privilege", cursor.fetchone() == (True, True, True, True))

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
