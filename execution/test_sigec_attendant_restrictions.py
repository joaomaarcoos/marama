"""Negative authorization gate for the SIGEC attendant role.

The test creates only one temporary Auth user. Database attempts run in a
transaction and never commit. It proves that an attendant cannot mutate review,
score, ranking, disqualification or convocation state through either RPCs or
direct SQL.
"""

from __future__ import annotations

import json
import secrets
import uuid
from typing import Any

import psycopg2

from test_sigec_remote_access import Api, load_env


def main() -> int:
    env = load_env()
    api = Api(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"], env["SUPABASE_SERVICE_ROLE_KEY"])
    run_id = uuid.uuid4().hex[:12]
    password = f"Sg!{secrets.token_urlsafe(24)}9z"
    email = f"sigec-p5-attendant-{run_id}@example.invalid"
    user_id: str | None = None
    connection = None
    checks: list[str] = []

    try:
        status, body = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": email,
            "password": password,
            "email_confirm": True,
            "app_metadata": {"role": "atendente"},
        })
        if status != 200:
            raise AssertionError(f"create_attendant: HTTP {status}")
        user_id = body["id"]
        checks.append("create_attendant")

        connection = psycopg2.connect(env["POSTGRES"])
        connection.autocommit = False
        cursor = connection.cursor()
        claims = json.dumps({"sub": user_id, "role": "authenticated", "app_metadata": {"role": "atendente"}})
        cursor.execute("select set_config('request.jwt.claims', %s, true)", (claims,))
        cursor.execute("set local role authenticated")

        cursor.execute("select private.sigec_is_staff()")
        if cursor.fetchone()[0] is not False:
            raise AssertionError("attendant_is_not_sigec_staff: helper returned true")
        checks.append("attendant_is_not_sigec_staff")
        cursor.execute(
            """
            select count(*)
            from pg_policies
            where schemaname = 'public'
              and tablename in (
                'sigec_ranking_snapshots', 'sigec_ranking_snapshot_entries',
                'sigec_ranking_snapshot_approvals', 'sigec_ranking_snapshot_publications'
              )
              and cmd in ('INSERT', 'UPDATE', 'DELETE')
              and coalesce(qual, '') || coalesce(with_check, '') like '%sigec_is_staff%'
            """
        )
        if cursor.fetchone()[0] != 7:
            raise AssertionError("ranking_write_policies_require_manager_helper")
        checks.append("ranking_write_policies_require_manager_helper")

        for table, name in (
            ("sigec_applications", "attendant_cannot_read_applications"),
            ("sigec_application_scores", "attendant_cannot_read_scores"),
            ("sigec_ranking_snapshots", "attendant_cannot_read_rankings"),
            ("sigec_convocations", "attendant_cannot_read_convocations"),
        ):
            cursor.execute(f"select count(*) from public.{table}")
            if cursor.fetchone()[0] != 0:
                raise AssertionError(f"{name}: rows became visible")
            checks.append(name)

        savepoint_counter = 0

        def expect_denied(name: str, sql: str, params: tuple[Any, ...], allowed_codes: tuple[str, ...] = ("42501",)) -> None:
            nonlocal savepoint_counter
            savepoint_counter += 1
            savepoint = f"attendant_denied_{savepoint_counter}"
            cursor.execute(f"savepoint {savepoint}")
            try:
                cursor.execute(sql, params)
            except psycopg2.Error as error:
                cursor.execute(f"rollback to savepoint {savepoint}")
                if error.pgcode not in allowed_codes:
                    raise AssertionError(f"{name}: expected {allowed_codes}, received {error.pgcode}") from error
                checks.append(name)
            else:
                cursor.execute(f"rollback to savepoint {savepoint}")
                raise AssertionError(f"{name}: operation unexpectedly succeeded")

        random_ids = [str(uuid.uuid4()) for _ in range(7)]
        expect_denied("attendant_cannot_read_internal_notes", "select count(*) from public.sigec_internal_notes", ())
        expect_denied("attendant_cannot_review_document_rpc", "select public.sigec_review_application_document(%s,%s,'valid',null,null)", (user_id, random_ids[0]))
        expect_denied("attendant_cannot_advance_application_rpc", "select public.sigec_advance_application_stage(%s,%s,%s,'teste')", (user_id, random_ids[1], random_ids[2]))
        expect_denied("attendant_cannot_disqualify_application_rpc", "select public.sigec_disqualify_application(%s,%s,%s,'teste',null)", (user_id, random_ids[1], random_ids[3]))
        expect_denied("attendant_cannot_create_disqualification_catalog", "select public.sigec_create_disqualification_catalog(%s,%s)", (user_id, random_ids[4]))
        expect_denied("attendant_cannot_write_score", "insert into public.sigec_application_scores(application_id,criterion_id,points,reviewed_by) values (%s,%s,1,%s)", (random_ids[1], random_ids[5], user_id))
        expect_denied("attendant_cannot_create_ranking", "insert into public.sigec_ranking_snapshots(process_id,phase,version,algorithm_version,ruleset_version,ranking_scope,input_hash,created_by) values (%s,'simulation',1,'test','test','{}'::jsonb,%s,%s)", (random_ids[4], "a" * 64, user_id))
        expect_denied("attendant_cannot_classify_candidate", "insert into public.sigec_ranking_snapshot_entries(snapshot_id,application_id,list_type,position,classification_status,score_total,score_breakdown,tie_break_values,explanation,public_explanation) values (%s,%s,'general',1,'classificado',1,'{}'::jsonb,'[]'::jsonb,'{}'::jsonb,'teste')", (random_ids[5], random_ids[1]), ("42501", "23514"))
        expect_denied("attendant_cannot_approve_ranking", "insert into public.sigec_ranking_snapshot_approvals(snapshot_id,approver_id,statement) values (%s,%s,'Confirmação de teste')", (random_ids[5], user_id), ("42501", "23514", "55000"))
        expect_denied("attendant_cannot_publish_ranking", "insert into public.sigec_ranking_snapshot_publications(snapshot_id,public_label,published_by) values (%s,'Resultado teste',%s)", (random_ids[5], user_id), ("42501", "23514", "55000"))
        expect_denied("attendant_cannot_create_convocation_batch", "insert into public.sigec_convocation_batches(process_id,title,created_by) values (%s,'Teste',%s)", (random_ids[4], user_id))
        expect_denied("attendant_cannot_convocate_candidate", "insert into public.sigec_convocations(batch_id,application_id,vacancy_id) values (%s,%s,%s)", (random_ids[6], random_ids[1], random_ids[2]))

        connection.rollback()
        cleanup_ok = True
    except Exception as error:
        if connection is not None:
            connection.rollback()
        cleanup_ok = False
        print(json.dumps({"ok": False, "checks": checks, "error": str(error)}, ensure_ascii=False, indent=2))
        return 1
    finally:
        if connection is not None:
            connection.close()
        if user_id:
            cleanup_status, _ = api.request("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)
            cleanup_ok = cleanup_status in {200, 204, 404}

    print(json.dumps({"ok": cleanup_ok, "checks": checks, "cleanup": cleanup_ok}, ensure_ascii=False, indent=2))
    return 0 if cleanup_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
