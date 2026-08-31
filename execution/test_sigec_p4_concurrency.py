"""Committed remote concurrency gate for the complete SIGEC application flow.

Unlike the transactional regression suites, this test needs independent
connections to commit against the same rows. Every fixture is uniquely named
and removed in ``finally`` so production-like locking can be exercised safely.
"""

from __future__ import annotations

import json
import secrets
import sys
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import psycopg2
from psycopg2.extras import Json

from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env


def main() -> int:
    env = load_env()
    api = Api(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"], env["SUPABASE_SERVICE_ROLE_KEY"])
    run_id = uuid.uuid4().hex[:12]
    password = f"Sg!{secrets.token_urlsafe(24)}9z"
    users: list[str] = []
    checks: list[str] = []
    process_id: str | None = None
    application_id: str | None = None
    course_ids: list[str] = []
    request_id: str | None = None

    def expect(name: str, condition: bool) -> None:
        if not condition:
            raise AssertionError(name)
        checks.append(name)

    def create_user(label: str, role: str) -> str:
        status, body = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": f"sigec-p4-gate-{label}-{run_id}@example.invalid",
            "password": password,
            "email_confirm": True,
            "app_metadata": {"role": role},
        })
        expect(f"create_{label}", status == 200 and bool(body.get("id")))
        users.append(body["id"])
        return body["id"]

    def authenticate(cursor: Any, user_id: str, role: str = "candidato") -> None:
        cursor.execute("set local role authenticated")
        cursor.execute("select set_config('request.jwt.claims', %s, true)", (
            json.dumps({"sub": user_id, "role": "authenticated", "app_metadata": {"role": role}}),
        ))

    def concurrent_calls(user_id: str, calls: list[tuple[str, tuple[Any, ...]]]) -> list[dict[str, Any]]:
        barrier = threading.Barrier(len(calls))

        def execute(call: tuple[str, tuple[Any, ...]]) -> dict[str, Any]:
            connection = psycopg2.connect(env["POSTGRES"], connect_timeout=15)
            connection.autocommit = False
            try:
                with connection.cursor() as cursor:
                    authenticate(cursor, user_id)
                    barrier.wait(timeout=15)
                    cursor.execute(call[0], call[1])
                    row = cursor.fetchone()
                connection.commit()
                return {"ok": True, "row": row}
            except psycopg2.Error as error:
                connection.rollback()
                return {"ok": False, "code": error.pgcode}
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=len(calls)) as executor:
            return list(executor.map(execute, calls))

    def cleanup() -> bool:
        ok = True
        connection = None
        try:
            connection = psycopg2.connect(env["POSTGRES"], connect_timeout=15)
            connection.autocommit = False
            with connection.cursor() as cursor:
                if process_id:
                    cursor.execute("select slug from public.sigec_processes where id=%s for update", (process_id,))
                    process_row = cursor.fetchone()
                    if process_row is not None and process_row[0] != f"sigec-p4-gate-{run_id}":
                        raise RuntimeError("cleanup target does not match the synthetic run")
                entity_ids = [value for value in (application_id, request_id) if value]
                if application_id:
                    cursor.execute(
                        """delete from public.sigec_audit_events
                           where entity_id = any(%s) or metadata ->> 'application_id' = %s""",
                        (entity_ids, application_id),
                    )
                    cursor.execute(
                        "select id from public.sigec_application_submissions where application_id=%s order by version desc",
                        (application_id,),
                    )
                    submission_ids = [row[0] for row in cursor.fetchall()]
                    if submission_ids:
                        # ACCESS EXCLUSIVE is held until COMMIT, so no other
                        # transaction can touch the table while the immutable
                        # trigger is disabled for this exact synthetic chain.
                        cursor.execute("lock table public.sigec_application_submissions in access exclusive mode")
                        cursor.execute("alter table public.sigec_application_submissions disable trigger sigec_application_submissions_immutable")
                        for submission_id in submission_ids:
                            cursor.execute("delete from public.sigec_application_submissions where id=%s", (submission_id,))
                        cursor.execute("alter table public.sigec_application_submissions enable trigger sigec_application_submissions_immutable")
                    cursor.execute("delete from public.sigec_applications where id=%s", (application_id,))
                if process_id:
                    cursor.execute("delete from public.sigec_processes where id=%s", (process_id,))
                if course_ids:
                    cursor.execute("delete from public.sigec_courses where id = any(%s::uuid[])", (course_ids,))
            connection.commit()
        except Exception:
            ok = False
            if connection is not None:
                connection.rollback()
        finally:
            if connection is not None:
                connection.close()
        for user_id in reversed(users):
            status, _ = api.request("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)
            ok = ok and status in {200, 204, 404}
        return ok

    try:
        candidate = create_user("candidate", "candidato")
        manager = create_user("manager", "gerente")

        setup = psycopg2.connect(env["POSTGRES"], connect_timeout=15)
        setup.autocommit = False
        with setup.cursor() as cursor:
            cpf_base = f"{(int(run_id[:8], 16) + 700) % 1_000_000_000:09d}"
            cursor.execute(
                """insert into public.sigec_candidate_profiles
                   (user_id,full_name,cpf,birth_date,whatsapp,whatsapp_verified_at,postal_code,street,address_number,district,city,state,availability,profile_completed_at)
                   values (%s,'Candidato Gate P4',%s,'1990-01-01',%s,now(),'65000123','Rua Teste','10','Centro','São Luís','MA','Manhã',now())""",
                (candidate, valid_cpf(cpf_base), f"5598{(int(run_id[1:9], 16) + 700) % 1_000_000_000:09d}"),
            )
            cursor.execute(
                """insert into public.sigec_processes
                   (title,slug,status,published_at,applications_open_at,applications_close_at,created_by,edital_version,max_preferences)
                   values (%s,%s,'open',now()-interval '1 hour',now()-interval '1 hour',now()+interval '1 day',%s,'gate-p4',2)
                   returning id""",
                ("Processo sintético Gate P4", f"sigec-p4-gate-{run_id}", manager),
            )
            process_id = str(cursor.fetchone()[0])
            cursor.execute("insert into public.sigec_process_stages(process_id,code,label,is_initial,position) values(%s,'recebida','Recebida',true,0)", (process_id,))
            cursor.execute("insert into public.sigec_modalities(process_id,name,slug) values(%s,'Modalidade Gate','modalidade-gate') returning id", (process_id,))
            modality_id = cursor.fetchone()[0]
            vacancy_ids: list[str] = []
            for position in (1, 2):
                name = f"Curso Gate P4 {run_id} {position}"
                cursor.execute("insert into public.sigec_courses(canonical_name,normalized_name) values(%s,%s) returning id", (name, name.lower()))
                course_id = str(cursor.fetchone()[0])
                course_ids.append(course_id)
                cursor.execute(
                    """insert into public.sigec_vacancies(process_id,modality_id,course_id,municipality,vacancy_kind,vacancy_count)
                       values(%s,%s,%s,'São Luís','quantidade',1) returning id""",
                    (process_id, modality_id, course_id),
                )
                vacancy_ids.append(str(cursor.fetchone()[0]))
            cursor.execute(
                """insert into public.sigec_process_questions(process_id,code,label,question_type,required,config)
                   values(%s,'confirmacao','Confirma os dados?','boolean',true,%s) returning id""",
                (process_id, Json({"audience": "all"})),
            )
            question_id = str(cursor.fetchone()[0])
            cursor.execute(
                """insert into public.sigec_document_requirements(process_id,code,label,condition_config)
                   values(%s,'identificacao','Identificação',%s) returning id""",
                (process_id, Json({"audience": "all"})),
            )
            requirement_id = str(cursor.fetchone()[0])
        setup.commit()
        setup.close()

        draft_results = concurrent_calls(candidate, [
            ("select * from public.sigec_create_application_draft(%s)", (process_id,)),
            ("select * from public.sigec_create_application_draft(%s)", (process_id,)),
        ])
        expect("concurrent_draft_calls_succeed", all(result["ok"] for result in draft_results))
        draft_ids = {str(result["row"][0]) for result in draft_results}
        expect("concurrent_draft_returns_one_application", len(draft_ids) == 1)
        application_id = draft_ids.pop()

        preference_results = concurrent_calls(candidate, [
            ("select public.sigec_replace_application_preferences(%s,%s::uuid[])", (application_id, vacancy_ids)),
            ("select public.sigec_replace_application_preferences(%s,%s::uuid[])", (application_id, list(reversed(vacancy_ids)))),
        ])
        expect("concurrent_preference_replacements_succeed", all(result["ok"] for result in preference_results))

        answer_results = concurrent_calls(candidate, [
            ("select public.sigec_replace_application_answers(%s,%s)", (application_id, Json({question_id: True}))),
            ("select public.sigec_replace_application_answers(%s,%s)", (application_id, Json({question_id: False}))),
        ])
        expect("concurrent_answer_replacements_succeed", all(result["ok"] for result in answer_results))

        setup = psycopg2.connect(env["POSTGRES"], connect_timeout=15)
        setup.autocommit = False
        with setup.cursor() as cursor:
            cursor.execute("select count(*) from public.sigec_applications where process_id=%s and candidate_id=%s", (process_id, candidate))
            expect("one_application_persisted", cursor.fetchone()[0] == 1)
            cursor.execute("select vacancy_id from public.sigec_application_preferences where application_id=%s order by position", (application_id,))
            final_preferences = tuple(str(row[0]) for row in cursor.fetchall())
            expect("preferences_are_atomic_not_mixed", final_preferences in (tuple(vacancy_ids), tuple(reversed(vacancy_ids))))
            cursor.execute("select count(*),min(position),max(position) from public.sigec_application_preferences where application_id=%s", (application_id,))
            expect("preference_positions_remain_unique", cursor.fetchone() == (2, 1, 2))
            cursor.execute("select count(*) from public.sigec_application_answers where application_id=%s and question_id=%s", (application_id, question_id))
            expect("one_answer_persisted", cursor.fetchone()[0] == 1)
            document_path = f"{candidate}/{application_id}/{uuid.uuid4()}.pdf"
            cursor.execute(
                "select * from public.sigec_register_candidate_document(%s,%s,%s,'identificacao.pdf','application/pdf',10,%s,%s)",
                (application_id, requirement_id, document_path, "a" * 64, candidate),
            )
            document_id = cursor.fetchone()[0]
            cursor.execute("select public.sigec_record_document_malware_scan(%s,%s,'clean','clamav',null,null)", (document_id, "a" * 64))
            for kind, version in (("edital", "edital:gate-p4"), ("truthfulness", "declaracao-veracidade:1"), ("requirements", "requisitos:gate-p4"), ("lgpd", "aviso-privacidade:1")):
                cursor.execute(
                    """insert into public.sigec_consents(application_id,consent_type,document_version,accepted,ip_hash,user_agent_hash)
                       values(%s,%s,%s,true,%s,%s)""",
                    (application_id, kind, version, "b" * 64, "c" * 64),
                )
        setup.commit()
        setup.close()

        submit_sql = "select * from public.sigec_submit_application(%s,%s,%s)"
        submit_results = concurrent_calls(candidate, [
            (submit_sql, (application_id, "b" * 64, "c" * 64)),
            (submit_sql, (application_id, "b" * 64, "c" * 64)),
        ])
        expect("concurrent_submit_calls_succeed", all(result["ok"] for result in submit_results))
        expect("concurrent_submit_returns_same_protocol", submit_results[0]["row"] == submit_results[1]["row"])
        first_protocol = submit_results[0]["row"][0]

        correction_results = concurrent_calls(candidate, [
            ("select * from public.sigec_start_application_correction(%s)", (application_id,)),
            ("select * from public.sigec_start_application_correction(%s)", (application_id,)),
        ])
        expect("concurrent_correction_calls_succeed", all(result["ok"] for result in correction_results))
        expect("correction_opens_once", sorted(result["row"][2] for result in correction_results) == [False, True])

        resubmit_results = concurrent_calls(candidate, [
            (submit_sql, (application_id, "d" * 64, "e" * 64)),
            (submit_sql, (application_id, "d" * 64, "e" * 64)),
        ])
        expect("concurrent_resubmit_calls_succeed", all(result["ok"] for result in resubmit_results))
        expect("concurrent_resubmit_returns_same_protocol", resubmit_results[0]["row"] == resubmit_results[1]["row"])
        expect("resubmit_creates_new_protocol", resubmit_results[0]["row"][0] != first_protocol)

        setup = psycopg2.connect(env["POSTGRES"], connect_timeout=15)
        setup.autocommit = False
        with setup.cursor() as cursor:
            cursor.execute("select count(*),count(distinct protocol),max(version) from public.sigec_application_submissions where application_id=%s", (application_id,))
            expect("exactly_two_submission_versions", cursor.fetchone() == (2, 2, 2))
            cursor.execute("select count(*) from public.sigec_audit_events where entity_id=%s and action='application_draft_created'", (application_id,))
            expect("draft_audited_once", cursor.fetchone()[0] == 1)
            cursor.execute("select count(*) from public.sigec_audit_events where entity_id=%s and action='application_submitted'", (application_id,))
            expect("first_submit_audited_once", cursor.fetchone()[0] == 1)
            cursor.execute("select count(*) from public.sigec_audit_events where entity_id=%s and action='application_correction_started'", (application_id,))
            expect("correction_audited_once", cursor.fetchone()[0] == 1)
            cursor.execute("select count(*) from public.sigec_audit_events where entity_id=%s and action='application_resubmitted'", (application_id,))
            expect("resubmit_audited_once", cursor.fetchone()[0] == 1)
            cursor.execute(
                """insert into public.sigec_information_requests(application_id,message,requested_fields,due_at,requested_by)
                   values(%s,'Confirme novamente a informação',%s,now()+interval '1 hour',%s) returning id""",
                (application_id, Json([{"kind": "question", "id": question_id}]), manager),
            )
            request_id = str(cursor.fetchone()[0])
        setup.commit()
        setup.close()

        diligence_sql = "select * from public.sigec_submit_information_request_answers(%s,%s)"
        diligence_results = concurrent_calls(candidate, [
            (diligence_sql, (request_id, Json({question_id: True}))),
            (diligence_sql, (request_id, Json({question_id: True}))),
        ])
        expect("one_concurrent_diligence_completion", sum(1 for result in diligence_results if result["ok"]) == 1)
        expect("repeated_diligence_fails_closed", sorted(result.get("code", "") for result in diligence_results if not result["ok"]) == ["23514"])

        verify = psycopg2.connect(env["POSTGRES"], connect_timeout=15)
        verify.autocommit = False
        with verify.cursor() as cursor:
            cursor.execute("select status,answered_at is not null from public.sigec_information_requests where id=%s", (request_id,))
            expect("diligence_is_answered_once", cursor.fetchone() == ("answered", True))
            cursor.execute("select action,count(*) from public.sigec_audit_events where entity_id=%s group by action", (request_id,))
            diligence_audits = dict(cursor.fetchall())
            expect("diligence_audits_are_not_duplicated", diligence_audits.get("information_request_answers_updated") == 1 and diligence_audits.get("information_request_answered") == 1)
            cursor.execute("select count(*) from public.sigec_application_submission_versions where application_id=%s and is_current", (application_id,))
            expect("only_one_submission_is_current", cursor.fetchone()[0] == 1)
        verify.rollback()
        verify.close()
    except Exception as error:
        cleanup_ok = cleanup()
        print(json.dumps({"ok": False, "error": str(error), "checks": checks, "cleanup": cleanup_ok}, ensure_ascii=False, indent=2))
        return 1

    cleanup_ok = cleanup()
    checks.append("committed_fixtures_removed")
    print(json.dumps({"ok": cleanup_ok, "checks": checks, "cleanup": cleanup_ok}, ensure_ascii=False, indent=2))
    return 0 if cleanup_ok else 1


if __name__ == "__main__":
    sys.exit(main())
