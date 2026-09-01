"""Transactional remote checks for the read-only SIGEC application review detail."""
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
    checks: list[str] = []
    connection = None
    signature = "public.sigec_get_application_review_detail(uuid,uuid)"

    def expect(name: str, condition: bool):
        if not condition:
            raise AssertionError(name)
        checks.append(name)

    def create_user(label: str, role: str) -> str:
        status, body = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": f"sigec-p5-detail-{label}-{run_id}@example.invalid",
            "password": password,
            "email_confirm": True,
            "app_metadata": {"role": role},
        })
        expect(f"create_{label}", status == 200 and bool(body.get("id")))
        users.append(body["id"])
        return body["id"]

    def expect_error(cur: Any, name: str, actor: str, application: str, code: str):
        savepoint = f"p5_detail_{len(checks)}"
        cur.execute(f"savepoint {savepoint}")
        try:
            cur.execute("select public.sigec_get_application_review_detail(%s,%s)", (actor, application))
        except psycopg2.Error as exc:
            cur.execute(f"rollback to savepoint {savepoint}")
            expect(name, exc.pgcode == code)
        else:
            cur.execute(f"rollback to savepoint {savepoint}")
            raise AssertionError(name)

    def cleanup() -> bool:
        return all(api.request("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)[0] in {200, 204, 404} for user_id in reversed(users))

    def keys(value: Any) -> set[str]:
        if isinstance(value, dict):
            return set(value) | set().union(*(keys(item) for item in value.values()))
        if isinstance(value, list):
            return set().union(*(keys(item) for item in value)) if value else set()
        return set()

    try:
        admin = create_user("admin", "admin")
        manager = create_user("manager", "gerente")
        attendant = create_user("attendant", "atendente")
        candidate = create_user("candidate", "candidato")
        connection = psycopg2.connect(env["POSTGRES"])
        connection.autocommit = False
        cur = connection.cursor()

        cpf_base = f"{(int(run_id[:8], 16) + 1700) % 1_000_000_000:09d}"
        cur.execute(
            """insert into public.sigec_candidate_profiles(
              user_id,full_name,cpf,birth_date,whatsapp,whatsapp_verified_at,
              postal_code,street,address_number,district,city,state,availability,profile_completed_at
            ) values(%s,'Candidato Detalhe',%s,'1990-01-01',%s,now(),
              '65000123','Rua Privada','10','Centro','São Luís','MA','Manhã',now())""",
            (candidate, valid_cpf(cpf_base), f"5598{(int(run_id[1:9], 16) + 1700) % 1_000_000_000:09d}"),
        )
        cur.execute(
            """insert into public.sigec_processes(
              title,slug,status,published_at,applications_open_at,applications_close_at,
              created_by,edital_version,max_preferences
            ) values('Processo detalhe P5',%s,'open',now()-interval '1 hour',
              now()-interval '1 hour',now()+interval '1 day',%s,'p5-detail',1) returning id""",
            (f"sigec-p5-detail-{run_id}", manager),
        )
        process = cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stages(process_id,code,label,is_initial,position) values(%s,'recebida','Recebida',true,0) returning id", (process,))
        stage = cur.fetchone()[0]
        cur.execute("insert into public.sigec_modalities(process_id,name,slug) values(%s,'Presencial','presencial') returning id", (process,))
        modality = cur.fetchone()[0]
        course_name = f"Curso Detalhe {run_id}"
        cur.execute("insert into public.sigec_courses(canonical_name,normalized_name) values(%s,%s) returning id", (course_name, course_name.lower()))
        course = cur.fetchone()[0]
        cur.execute("insert into public.sigec_vacancies(process_id,modality_id,course_id,municipality) values(%s,%s,%s,'São Luís') returning id", (process, modality, course))
        vacancy = cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_questions(process_id,code,label,question_type,required) values(%s,'motivacao','Por que deseja a vaga?','long_text',true) returning id", (process,))
        question = cur.fetchone()[0]
        cur.execute("insert into public.sigec_document_requirements(process_id,code,label,required) values(%s,'diploma','Diploma',true) returning id", (process,))
        requirement = cur.fetchone()[0]
        cur.execute("insert into public.sigec_applications(process_id,candidate_id) values(%s,%s) returning id", (process, candidate))
        application = cur.fetchone()[0]
        cur.execute("insert into public.sigec_application_preferences(application_id,vacancy_id,position) values(%s,%s,1)", (application, vacancy))
        cur.execute("insert into public.sigec_application_answers(application_id,question_id,answer) values(%s,%s,%s::jsonb)", (application, question, json.dumps("Quero contribuir com a educação.")))
        cur.execute(
            """insert into public.sigec_application_documents(
              application_id,requirement_id,storage_path,original_name,mime_type,size_bytes,sha256,version
            ) values(%s,%s,%s,'nome-pessoal.pdf','application/pdf',1024,%s,1) returning id""",
            (application, requirement, f"{candidate}/{application}/v1.pdf", "a" * 64),
        )
        document_one = cur.fetchone()[0]
        cur.execute(
            """insert into public.sigec_application_documents(
              application_id,requirement_id,storage_path,original_name,mime_type,size_bytes,sha256,version,supersedes_document_id
            ) values(%s,%s,%s,'outro-nome-pessoal.pdf','application/pdf',2048,%s,2,%s)""",
            (application, requirement, f"{candidate}/{application}/v2.pdf", "b" * 64, document_one),
        )
        cur.execute("insert into public.sigec_consents(application_id,consent_type,document_version,accepted,ip_hash,user_agent_hash) values(%s,'lgpd','aviso-privacidade:1',true,%s,%s)", (application, "c" * 64, "d" * 64))
        cur.execute("update public.sigec_applications set stage_id=%s,application_state='submitted',submitted_at=now() where id=%s", (stage, application))
        protocol_one = f"SIGEC-2026-{run_id.upper()}"
        protocol_two = f"SIGEC-2026-{run_id[::-1].upper()}"
        cur.execute("insert into public.sigec_application_submissions(application_id,version,protocol,edital_version,snapshot,snapshot_sha256,submitted_at) values(%s,1,%s,'p5-detail','{}',%s,now()-interval '1 minute') returning id", (application, protocol_one, "e" * 64))
        submission_one = cur.fetchone()[0]
        cur.execute("insert into public.sigec_application_submissions(application_id,version,protocol,edital_version,snapshot,snapshot_sha256,submitted_at,supersedes_submission_id) values(%s,2,%s,'p5-detail','{}',%s,now(),%s)", (application, protocol_two, "f" * 64, submission_one))
        cur.execute("insert into public.sigec_application_status_history(application_id,to_stage_id,public_message,changed_by) values(%s,%s,'Candidatura recebida.',%s)", (application, stage, manager))

        cur.execute("select public.sigec_get_application_review_detail(%s,%s)", (admin, application))
        detail = cur.fetchone()[0]
        expect("detail_returns_application", detail["application"]["id"] == str(application))
        expect("detail_returns_candidate_and_process", detail["application"]["candidateName"] == "Candidato Detalhe" and detail["application"]["processTitle"] == "Processo detalhe P5")
        expect("detail_returns_preference", len(detail["preferences"]) == 1 and detail["preferences"][0]["course"] == course_name)
        expect("detail_returns_answer", len(detail["answers"]) == 1 and detail["answers"][0]["answer"] == "Quero contribuir com a educação.")
        expect("detail_returns_document_versions", len(detail["documents"]) == 2 and sum(1 for item in detail["documents"] if item["isCurrent"]) == 1)
        expect("detail_returns_submission_versions", [item["version"] for item in detail["submissions"]] == [2, 1] and detail["submissions"][0]["isCurrent"] is True)
        expect("detail_returns_safe_consent", len(detail["consents"]) == 1 and detail["consents"][0]["type"] == "lgpd")
        expect("detail_returns_status_history", len(detail["history"]) == 1 and detail["history"][0]["toStage"] == "Recebida")
        forbidden = {"cpf", "whatsapp", "street", "addressNumber", "storagePath", "originalName", "ipHash", "userAgentHash", "snapshot", "metadata"}
        expect("detail_omits_sensitive_fields", not (forbidden & keys(detail)))

        cur.execute("select public.sigec_get_application_review_detail(%s,%s)", (manager, application))
        expect("manager_can_read_detail", cur.fetchone()[0]["application"]["id"] == str(application))
        expect_error(cur, "candidate_actor_rejected", candidate, application, "42501")
        expect_error(cur, "attendant_actor_rejected", attendant, application, "42501")
        expect_error(cur, "missing_application_rejected", admin, str(uuid.uuid4()), "P0002")
        cur.execute(
            """select
              not has_function_privilege('anon',%s,'EXECUTE'),
              not has_function_privilege('authenticated',%s,'EXECUTE'),
              has_function_privilege('service_role',%s,'EXECUTE'),
              not (select prosecdef from pg_proc where oid=%s::regprocedure)""",
            (signature, signature, signature, signature),
        )
        expect("service_only_security_invoker", cur.fetchone() == (True, True, True, True))
        connection.rollback()
        connection.close()
        connection = None
        checks.append("database_fixtures_rolled_back")
    except Exception as exc:
        if connection:
            connection.rollback()
            connection.close()
        cleaned = cleanup()
        print(json.dumps({"ok": False, "error": str(exc), "checks": checks, "cleanup": cleaned}, ensure_ascii=False, indent=2))
        return 1

    cleaned = cleanup()
    print(json.dumps({"ok": cleaned, "checks": checks, "cleanup": cleaned}, ensure_ascii=False, indent=2))
    return 0 if cleaned else 1


if __name__ == "__main__":
    sys.exit(main())
