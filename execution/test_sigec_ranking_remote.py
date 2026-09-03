"""Transactional remote tests for SIGEC ranking evidence and RLS.

Only temporary Auth users are committed. All database fixtures and ranking
operations run in one transaction that is always rolled back.
"""

from __future__ import annotations

import json
import secrets
import sys
import uuid
from typing import Any

import psycopg2
from psycopg2.extras import Json

from test_sigec_remote_access import Api, load_env


def main() -> int:
    env = load_env()
    api = Api(
        env["NEXT_PUBLIC_SUPABASE_URL"],
        env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
        env["SUPABASE_SERVICE_ROLE_KEY"],
    )
    run_id = uuid.uuid4().hex[:12]
    password = f"Sg!{secrets.token_urlsafe(24)}9z"
    user_ids: list[str] = []
    checks: list[str] = []
    connection = None

    def cleanup_users() -> bool:
        remaining: list[str] = []
        for user_id in reversed(user_ids):
            status, _ = api.request("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)
            if status not in {200, 204, 404}:
                remaining.append(user_id)
        user_ids[:] = list(reversed(remaining))
        return not user_ids

    def create_user(label: str, role: str) -> str:
        status, body = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": f"sigec-test-ranking-{label}-{run_id}@example.invalid",
            "password": password,
            "email_confirm": True,
            "app_metadata": {"role": role},
        })
        if status != 200:
            raise AssertionError(f"create_user_{label}: HTTP {status}")
        user_ids.append(body["id"])
        checks.append(f"create_user_{label}")
        return body["id"]

    try:
        manager_a = create_user("manager-a", "gerente")
        manager_b = create_user("manager-b", "gerente")
        candidate = create_user("candidate", "candidato")
        attendant = create_user("attendant", "atendente")

        connection = psycopg2.connect(env["POSTGRES"])
        connection.autocommit = False
        cursor = connection.cursor()

        def as_actor(user_id: str, role: str) -> None:
            cursor.execute("reset role")
            claims = json.dumps({
                "sub": user_id,
                "role": "authenticated",
                "app_metadata": {"role": role},
            })
            cursor.execute("select set_config('request.jwt.claims', %s, true)", (claims,))
            cursor.execute("set local role authenticated")

        savepoint_counter = 0

        def expect_error(
            name: str,
            sql: str,
            params: tuple[Any, ...],
            marker: str | tuple[str, ...],
        ) -> None:
            nonlocal savepoint_counter
            savepoint_counter += 1
            savepoint = f"sigec_expected_error_{savepoint_counter}"
            cursor.execute(f"savepoint {savepoint}")
            try:
                cursor.execute(sql, params)
            except psycopg2.Error as error:
                cursor.execute(f"rollback to savepoint {savepoint}")
                markers = (marker,) if isinstance(marker, str) else marker
                error_evidence = f"{error.pgcode} {error}"
                if not any(expected in error_evidence for expected in markers):
                    raise AssertionError(f"{name}: wrong error {error.pgcode}") from error
                checks.append(name)
            else:
                cursor.execute(f"rollback to savepoint {savepoint}")
                raise AssertionError(f"{name}: operation unexpectedly succeeded")

        cursor.execute("reset role")
        cursor.execute(
            """
            insert into public.sigec_candidate_profiles
              (user_id, full_name, cpf, birth_date, whatsapp, city, state,
               whatsapp_verified_at, profile_completed_at)
            values (%s, %s, %s, date '1990-01-01', %s, 'São Luís', 'MA', now(), now())
            """,
            (candidate, "Candidato Ranking Sintético", f"{int(run_id[:8], 16) % 100000000:08d}303",
             f"5597{int(run_id[:7], 16) % 1000000000:09d}"),
        )
        cursor.execute(
            """
            insert into public.sigec_processes
              (title, slug, status, edital_version, created_by)
            values (%s, %s, 'draft', 'test', %s)
            returning id
            """,
            (f"Ranking sintético {run_id}", f"ranking-sintetico-{run_id}", manager_a),
        )
        process_id = cursor.fetchone()[0]
        cursor.execute(
            "insert into public.sigec_applications (process_id, candidate_id) values (%s, %s) returning id",
            (process_id, candidate),
        )
        application_id = cursor.fetchone()[0]

        for user_id, role, label in (
            (candidate, "candidato", "candidate"),
            (attendant, "atendente", "attendant"),
        ):
            as_actor(user_id, role)
            cursor.execute("select count(*) from public.sigec_process_decisions")
            if cursor.fetchone()[0] != 0:
                raise AssertionError(f"{label}_cannot_read_internal_ranking_tables")
            checks.append(f"{label}_cannot_read_internal_ranking_tables")

        as_actor(manager_a, "gerente")
        cursor.execute(
            """
            insert into public.sigec_process_decisions
              (process_id, code, revision, title, status, source_type,
               source_reference, impact, recorded_by)
            values (%s, 'SIGEC-DEC-01', 1, 'Rubrica pendente', 'pending',
                    'product_decision', 'Teste transacional', 'Bloqueia classificação', %s)
            returning id
            """,
            (process_id, manager_a),
        )
        pending_decision = cursor.fetchone()[0]
        expect_error(
            "decision_is_append_only",
            "update public.sigec_process_decisions set title = 'Alterada' where id = %s",
            (pending_decision,),
            ("SIGEC_IMMUTABLE_RECORD", "42501"),
        )
        expect_error(
            "confirmed_quota_blocked_while_decisions_pending",
            """
            insert into public.sigec_quota_rule_versions
              (process_id, version, status, configuration, source_decision_ids,
               source_reference, recorded_by)
            values (%s, 1, 'confirmed', %s, %s::uuid[], 'Teste transacional', %s)
            """,
            (process_id, Json({"pcd": 5, "ppp": 20}), [pending_decision], manager_a),
            "SIGEC_CURRENT_DECISION_EVIDENCE_REQUIRED",
        )

        cursor.execute(
            """
            insert into public.sigec_ranking_snapshots
              (process_id, phase, version, algorithm_version, ruleset_version,
               ranking_scope, input_hash, created_by)
            values (%s, 'simulation', 1, 'test-1', 'draft-1', %s, %s, %s)
            returning id
            """,
            (process_id, Json({"municipality": "São Luís"}), "1" * 64, manager_a),
        )
        simulation_id = cursor.fetchone()[0]
        cursor.execute(
            """
            insert into public.sigec_ranking_snapshot_entries
              (snapshot_id, application_id, list_type, position, classification_status,
               score_total, score_breakdown, tie_break_values, explanation, public_explanation)
            values (%s, %s, 'general', 1, 'classificado', 70, %s, %s, %s, %s)
            returning id
            """,
            (
                simulation_id, application_id, Json({"titulation": 30, "experience": 40}),
                Json([{"rule": "score_total", "value": 70}]),
                Json({"ordered_rules": ["score_total"], "decisive_rule": "score_total"}),
                "Classificado pela maior pontuação.",
            ),
        )
        simulation_entry = cursor.fetchone()[0]
        cursor.execute(
            """
            update public.sigec_ranking_snapshots
            set state = 'frozen', frozen_by = %s, frozen_at = now(), row_count = 1,
                content_hash = %s
            where id = %s
            """,
            (manager_a, "2" * 64, simulation_id),
        )
        checks.append("simulation_can_be_frozen_with_pending_normative_rules")
        expect_error(
            "frozen_snapshot_is_immutable",
            "update public.sigec_ranking_snapshots set content_hash = %s where id = %s",
            ("3" * 64, simulation_id),
            "SIGEC_FROZEN_SNAPSHOT",
        )
        expect_error(
            "frozen_snapshot_entry_is_immutable",
            "update public.sigec_ranking_snapshot_entries set score_total = 71 where id = %s",
            (simulation_entry,),
            "SIGEC_FROZEN_SNAPSHOT",
        )
        expect_error(
            "simulation_cannot_be_approved_for_publication",
            """
            insert into public.sigec_ranking_snapshot_approvals
              (snapshot_id, approver_id, statement)
            values (%s, %s, 'Aprovação sintética para teste')
            """,
            (simulation_id, manager_a),
            "SIGEC_OFFICIAL_FROZEN_SNAPSHOT_REQUIRED",
        )

        cursor.execute(
            """
            insert into public.sigec_ranking_snapshots
              (process_id, phase, version, algorithm_version, ruleset_version,
               ranking_scope, input_hash, created_by)
            values (%s, 'preliminary', 1, 'test-1', 'pending-1', %s, %s, %s)
            returning id
            """,
            (process_id, Json({"municipality": "São Luís"}), "4" * 64, manager_a),
        )
        blocked_snapshot = cursor.fetchone()[0]
        cursor.execute(
            """
            insert into public.sigec_ranking_snapshot_entries
              (snapshot_id, application_id, list_type, position, classification_status,
               score_total, score_breakdown, tie_break_values, explanation, public_explanation)
            values (%s, %s, 'general', 1, 'classificado', 70, %s, %s, %s, %s)
            """,
            (
                blocked_snapshot, application_id, Json({"total": 70}),
                Json([{"rule": "score_total", "value": 70}]),
                Json({"ordered_rules": ["score_total"], "decisive_rule": "score_total"}),
                "Classificação sintética bloqueada.",
            ),
        )
        expect_error(
            "official_snapshot_blocked_while_decisions_pending",
            """
            update public.sigec_ranking_snapshots
            set state = 'frozen', frozen_by = %s, frozen_at = now(), row_count = 1,
                content_hash = %s
            where id = %s
            """,
            (manager_a, "5" * 64, blocked_snapshot),
            "SIGEC_NORMATIVE_DECISIONS_PENDING",
        )

        decision_ids: list[str] = []
        cursor.execute(
            """
            insert into public.sigec_process_decisions
              (process_id, code, revision, title, status, resolution, source_type,
               source_reference, impact, supersedes_id, recorded_by)
            values (%s, 'SIGEC-DEC-01', 2, 'Rubrica confirmada', 'confirmed',
                    'Rubrica confirmada para teste.', 'official_guidance',
                    'Teste transacional', 'Libera classificação sintética', %s, %s)
            returning id
            """,
            (process_id, pending_decision, manager_a),
        )
        decision_ids.append(cursor.fetchone()[0])
        for number in range(2, 7):
            cursor.execute(
                """
                insert into public.sigec_process_decisions
                  (process_id, code, revision, title, status, resolution, source_type,
                   source_reference, impact, recorded_by)
                values (%s, %s, 1, %s, 'confirmed', %s, 'official_guidance',
                        'Teste transacional', 'Libera classificação sintética', %s)
                returning id
                """,
                (process_id, f"SIGEC-DEC-{number:02d}", f"Decisão {number}",
                 f"Decisão {number} confirmada para teste.", manager_a),
            )
            decision_ids.append(cursor.fetchone()[0])

        cursor.execute(
            """
            insert into public.sigec_quota_rule_versions
              (process_id, version, status, configuration, source_decision_ids,
               source_reference, recorded_by)
            values (%s, 1, 'confirmed', %s, %s::uuid[], 'Teste transacional', %s)
            returning id
            """,
            (process_id, Json({"pcd": 5, "ppp": 20}), decision_ids, manager_a),
        )
        quota_id = cursor.fetchone()[0]
        checks.append("confirmed_quota_requires_current_decision_evidence")

        def create_official_snapshot(version: int, sources: list[str], quota: str) -> str:
            as_actor(manager_a, "gerente")
            cursor.execute(
                """
                insert into public.sigec_ranking_snapshots
                  (process_id, phase, version, algorithm_version, ruleset_version,
                   ranking_scope, input_hash, source_decision_ids, quota_rule_version_id, created_by)
                values (%s, 'preliminary', %s, 'test-1', %s, %s, %s, %s::uuid[], %s, %s)
                returning id
                """,
                (process_id, version, f"confirmed-{version}", Json({"municipality": "São Luís"}),
                 format((version + 5) % 16, "x") * 64, sources, quota, manager_a),
            )
            snapshot_id = cursor.fetchone()[0]
            cursor.execute(
                """
                insert into public.sigec_ranking_snapshot_entries
                  (snapshot_id, application_id, list_type, position, classification_status,
                   score_total, score_breakdown, tie_break_values, explanation, public_explanation)
                values (%s, %s, 'general', 1, 'classificado', 100, %s, %s, %s, %s)
                """,
                (
                    snapshot_id, application_id, Json({"total": 100}),
                    Json([{"rule": "score_total", "value": 100}]),
                    Json({"ordered_rules": ["score_total"], "decisive_rule": "score_total"}),
                    "Classificado conforme evidência vigente.",
                ),
            )
            cursor.execute(
                """
                update public.sigec_ranking_snapshots
                set state = 'frozen', frozen_by = %s, frozen_at = now(), row_count = 1,
                    content_hash = %s
                where id = %s
                """,
                (manager_a, format((version + 6) % 16, "x") * 64, snapshot_id),
            )
            return snapshot_id

        stale_snapshot = create_official_snapshot(2, decision_ids, quota_id)
        as_actor(manager_a, "gerente")
        cursor.execute(
            "insert into public.sigec_ranking_snapshot_approvals (snapshot_id, approver_id, statement) values (%s, %s, %s)",
            (stale_snapshot, manager_a, "Primeira aprovação independente para teste."),
        )
        as_actor(manager_b, "gerente")
        cursor.execute(
            "insert into public.sigec_ranking_snapshot_approvals (snapshot_id, approver_id, statement) values (%s, %s, %s)",
            (stale_snapshot, manager_b, "Segunda aprovação independente para teste."),
        )
        as_actor(manager_a, "gerente")
        cursor.execute(
            """
            insert into public.sigec_process_decisions
              (process_id, code, revision, title, status, resolution, source_type,
               source_reference, impact, supersedes_id, recorded_by)
            values (%s, 'SIGEC-DEC-01', 3, 'Rubrica retificada', 'confirmed',
                    'Rubrica retificada para teste.', 'retification', 'Teste transacional',
                    'Invalida evidência anterior', %s, %s)
            returning id
            """,
            (process_id, decision_ids[0], manager_a),
        )
        decision_ids[0] = cursor.fetchone()[0]
        expect_error(
            "publication_rejects_stale_decision_evidence",
            """
            insert into public.sigec_ranking_snapshot_publications
              (snapshot_id, public_label, published_by)
            values (%s, 'Resultado preliminar sintético', %s)
            """,
            (stale_snapshot, manager_a),
            ("SIGEC_CURRENT_RANKING_EVIDENCE_REQUIRED", "SIGEC_SNAPSHOT_DECISION_EVIDENCE_STALE"),
        )

        cursor.execute(
            """
            insert into public.sigec_quota_rule_versions
              (process_id, version, status, configuration, source_decision_ids,
               source_reference, recorded_by)
            values (%s, 2, 'confirmed', %s, %s::uuid[], 'Retificação sintética', %s)
            returning id
            """,
            (process_id, Json({"pcd": 5, "ppp": 20}), decision_ids, manager_a),
        )
        current_quota_id = cursor.fetchone()[0]
        current_snapshot = create_official_snapshot(3, decision_ids, current_quota_id)
        as_actor(manager_a, "gerente")
        cursor.execute(
            "insert into public.sigec_ranking_snapshot_approvals (snapshot_id, approver_id, statement) values (%s, %s, %s)",
            (current_snapshot, manager_a, "Primeira aprovação independente para teste."),
        )
        expect_error(
            "publication_requires_two_distinct_approvers",
            """
            insert into public.sigec_ranking_snapshot_publications
              (snapshot_id, public_label, published_by)
            values (%s, 'Resultado preliminar sintético', %s)
            """,
            (current_snapshot, manager_a),
            "SIGEC_TWO_PERSON_APPROVAL_REQUIRED",
        )
        as_actor(manager_b, "gerente")
        cursor.execute(
            "insert into public.sigec_ranking_snapshot_approvals (snapshot_id, approver_id, statement) values (%s, %s, %s)",
            (current_snapshot, manager_b, "Segunda aprovação independente para teste."),
        )
        as_actor(manager_a, "gerente")
        cursor.execute(
            """
            insert into public.sigec_ranking_snapshot_publications
              (snapshot_id, public_label, published_by)
            values (%s, 'Resultado preliminar sintético', %s)
            returning id
            """,
            (current_snapshot, manager_a),
        )
        publication_id = cursor.fetchone()[0]
        checks.append("current_snapshot_with_two_approvers_can_be_published")
        expect_error(
            "publication_record_is_immutable",
            "update public.sigec_ranking_snapshot_publications set public_label = 'Alterado' where id = %s",
            (publication_id,),
            ("SIGEC_IMMUTABLE_RECORD", "42501"),
        )

        superseded_candidate = create_official_snapshot(4, decision_ids, current_quota_id)
        replacement_snapshot = create_official_snapshot(5, decision_ids, current_quota_id)
        as_actor(manager_a, "gerente")
        expect_error(
            "older_frozen_snapshot_cannot_be_reviewed",
            """
            insert into public.sigec_ranking_snapshot_approvals
              (snapshot_id, approver_id, statement)
            values (%s, %s, 'Revisão de versão antiga para teste.')
            """,
            (superseded_candidate, manager_a),
            "SIGEC_LATEST_RANKING_SNAPSHOT_REQUIRED",
        )
        as_actor(attendant, "atendente")
        expect_error(
            "attendant_cannot_approve_official_result",
            """
            insert into public.sigec_ranking_snapshot_approvals
              (snapshot_id, approver_id, statement)
            values (%s, %s, 'Tentativa de confirmação por atendente.')
            """,
            (replacement_snapshot, attendant),
            ("SIGEC_RANKING_REVIEWER_REQUIRED", "42501"),
        )
        for actor in (manager_a, manager_b):
            as_actor(actor, "gerente")
            cursor.execute(
                "insert into public.sigec_ranking_snapshot_approvals (snapshot_id, approver_id, statement) values (%s, %s, %s)",
                (replacement_snapshot, actor, "Confirmação independente da versão substituta."),
            )
        as_actor(manager_a, "gerente")
        expect_error(
            "replacement_requires_publication_chain",
            """
            insert into public.sigec_ranking_snapshot_publications
              (snapshot_id, public_label, published_by)
            values (%s, 'Resultado preliminar substituto', %s)
            """,
            (replacement_snapshot, manager_a),
            "SIGEC_PUBLICATION_REPLACEMENT_CHAIN_REQUIRED",
        )
        cursor.execute("reset role")
        cursor.execute(
            "select public.sigec_publish_ranking_snapshot(%s, %s, %s)",
            (manager_a, replacement_snapshot, "Resultado preliminar substituto"),
        )
        replacement_publication_id = cursor.fetchone()[0]
        cursor.execute(
            "select supersedes_publication_id from public.sigec_ranking_snapshot_publications where id = %s",
            (replacement_publication_id,),
        )
        if cursor.fetchone()[0] != publication_id:
            raise AssertionError("replacement_publication_chain_invalid")
        checks.append("server_publication_preserves_replacement_chain")

        cursor.execute(
            "select has_function_privilege('authenticated', 'public.sigec_publish_ranking_snapshot(uuid,uuid,text)', 'execute')"
        )
        if cursor.fetchone()[0]:
            raise AssertionError("ranking_publication_rpc_exposed_to_authenticated")
        checks.append("ranking_publication_rpc_is_service_only")

        as_actor(candidate, "candidato")
        cursor.execute("select count(*) from public.sigec_ranking_snapshot_publications")
        if cursor.fetchone()[0] != 0:
            raise AssertionError("candidate_cannot_read_internal_publication_record")
        checks.append("candidate_cannot_read_internal_publication_record")

        connection.rollback()
        if not cleanup_users():
            raise AssertionError("Synthetic Auth users were not fully cleaned")
        print(json.dumps({
            "ok": True,
            "checks": len(checks),
            "databaseFixturesRolledBack": True,
            "authUsersCleaned": True,
        }, ensure_ascii=False, indent=2))
        return 0
    except Exception as error:
        if connection is not None:
            connection.rollback()
        print(json.dumps({
            "ok": False,
            "checksPassed": len(checks),
            "error": str(error).splitlines()[0],
        }, ensure_ascii=False, indent=2))
        return 1
    finally:
        if connection is not None:
            connection.close()
        cleanup_users()


if __name__ == "__main__":
    sys.exit(main())
