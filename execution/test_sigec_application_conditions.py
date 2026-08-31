"""Remote transactional checks for conditional SIGEC answers and documents."""

from __future__ import annotations

import json
import secrets
import sys
import uuid
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
    connection = None
    checks: list[str] = []

    def expect(name: str, condition: bool) -> None:
        if not condition:
            raise AssertionError(name)
        checks.append(name)

    def create_user(label: str, role: str) -> str:
        status, body = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": f"sigec-test-conditions-{label}-{run_id}@example.invalid",
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
        savepoint = f"conditions_expected_{len(checks)}"
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
        other = create_user("other", "candidato")
        manager = create_user("manager", "gerente")
        connection = psycopg2.connect(env["POSTGRES"])
        connection.autocommit = False
        cursor = connection.cursor()

        for index, user_id in enumerate((candidate, other), start=1):
            base = f"{(int(run_id[:8], 16) + 40 + index) % 1_000_000_000:09d}"
            cursor.execute(
                """insert into public.sigec_candidate_profiles
                   (user_id,full_name,cpf,birth_date,whatsapp,whatsapp_verified_at,postal_code,street,address_number,district,city,state,availability,profile_completed_at)
                   values (%s,%s,%s,'1990-01-01',%s,now(),'65000123','Rua Teste','10','Centro','São Luís','MA','Manhã',now())""",
                (user_id, f"Candidato Condicional {index}", valid_cpf(base),
                 f"5598{(int(run_id[1:9], 16) + 40 + index) % 1_000_000_000:09d}"),
            )
        cursor.execute(
            """insert into public.sigec_processes
               (title,slug,status,published_at,applications_open_at,applications_close_at,created_by)
               values (%s,%s,'open',now()-interval '1 hour',now()-interval '1 hour',now()+interval '1 day',%s)
               returning id""",
            ("Processo sintético condicional", f"sigec-conditions-{run_id}", manager),
        )
        process_id = cursor.fetchone()[0]
        cursor.execute("insert into public.sigec_applications(process_id,candidate_id) values (%s,%s) returning id", (process_id, candidate))
        application_id = cursor.fetchone()[0]
        cursor.execute("insert into public.sigec_applications(process_id,candidate_id) values (%s,%s)", (process_id, other))

        cursor.execute(
            """insert into public.sigec_process_questions(process_id,code,label,question_type,required,config,position)
               values (%s,'declara_pcd','Deseja concorrer como PCD?','boolean',true,%s,0) returning id""",
            (process_id, Json({"audience": "all", "audienceMarker": "pcd"})),
        )
        marker_id = cursor.fetchone()[0]
        expect_error(cursor, "duplicate_audience_marker_rejected",
                     """insert into public.sigec_process_questions(process_id,code,label,question_type,required,config,position)
                            values (%s,'declara_pcd_duplicada','Outra declaração PCD','boolean',false,%s,1)""",
                     (process_id, Json({"audience": "all", "audienceMarker": "pcd"})), "23505")
        expect_error(cursor, "audience_marker_must_be_public_boolean",
                     """insert into public.sigec_process_questions(process_id,code,label,question_type,required,config,position)
                            values (%s,'marcador_invalido','Marcador inválido','short_text',false,%s,2)""",
                     (process_id, Json({"audience": "all", "audienceMarker": "ppp"})), "23514")
        cursor.execute(
            """insert into public.sigec_process_questions(process_id,code,label,question_type,required,config,position)
               values (%s,'nome_social','Como deseja ser identificado?','short_text',true,%s,10) returning id""",
            (process_id, Json({"audience": "all"})),
        )
        all_id = cursor.fetchone()[0]
        cursor.execute(
            """insert into public.sigec_process_questions(process_id,code,label,question_type,required,config,position)
               values (%s,'tipo_deficiencia','Informe a condição declarada','short_text',true,%s,20) returning id""",
            (process_id, Json({"audience": "pcd"})),
        )
        pcd_id = cursor.fetchone()[0]
        cursor.execute(
            """insert into public.sigec_document_requirements(process_id,code,label,condition_config)
               values (%s,'identificacao','Identificação',%s) returning id""",
            (process_id, Json({"audience": "all"})),
        )
        document_all_id = cursor.fetchone()[0]
        cursor.execute(
            """insert into public.sigec_document_requirements(process_id,code,label,condition_config)
               values (%s,'laudo_pcd','Laudo PCD',%s) returning id""",
            (process_id, Json({"audience": "pcd"})),
        )
        document_pcd_id = cursor.fetchone()[0]

        authenticate(cursor, candidate, "candidato")
        base_answers = {str(marker_id): False, str(all_id): "Nome de teste"}
        cursor.execute("select public.sigec_replace_application_answers(%s,%s)", (application_id, Json(base_answers)))
        expect("base_answers_saved", cursor.fetchone()[0] == 2)
        cursor.execute("select private.sigec_application_matches_audience(%s,'pcd')", (application_id,))
        expect("pcd_audience_false", cursor.fetchone()[0] is False)
        expect_error(cursor, "hidden_answer_rejected",
                     "select public.sigec_replace_application_answers(%s,%s)",
                     (application_id, Json({**base_answers, str(pcd_id): "injetado"})), "42501")
        expect_error(cursor, "required_conditional_answer_enforced",
                     "select public.sigec_replace_application_answers(%s,%s)",
                     (application_id, Json({str(marker_id): True, str(all_id): "Nome de teste"})), "23514")
        expect_error(cursor, "invalid_answer_type_rejected",
                     "select public.sigec_replace_application_answers(%s,%s)",
                     (application_id, Json({str(marker_id): "sim", str(all_id): "Nome de teste"})), "23514")
        expect_error(cursor, "direct_answer_write_revoked",
                     "delete from public.sigec_application_answers where application_id=%s", (application_id,), "42501")

        complete_answers = {str(marker_id): True, str(all_id): "Nome de teste", str(pcd_id): "Condição comprovável"}
        cursor.execute("select public.sigec_replace_application_answers(%s,%s)", (application_id, Json(complete_answers)))
        expect("conditional_answers_saved", cursor.fetchone()[0] == 3)
        cursor.execute("select private.sigec_application_matches_audience(%s,'pcd')", (application_id,))
        expect("pcd_audience_true", cursor.fetchone()[0] is True)

        authenticate(cursor, other, "candidato")
        expect_error(cursor, "other_candidate_rejected",
                     "select public.sigec_replace_application_answers(%s,%s)", (application_id, Json(base_answers)), "42501")

        reset(cursor)
        cursor.execute("update public.sigec_application_answers set answer='false'::jsonb where application_id=%s and question_id=%s", (application_id, marker_id))
        expect_error(cursor, "hidden_document_rejected_in_database",
                     "select * from public.sigec_register_candidate_document(%s,%s,%s,'laudo.pdf','application/pdf',10,%s,%s)",
                     (application_id, document_pcd_id, f"{candidate}/{application_id}/{uuid.uuid4()}.pdf", "a" * 64, candidate), "42501")
        cursor.execute(
            "select * from public.sigec_register_candidate_document(%s,%s,%s,'identificacao.pdf','application/pdf',10,%s,%s)",
            (application_id, document_all_id, f"{candidate}/{application_id}/{uuid.uuid4()}.pdf", "b" * 64, candidate),
        )
        expect("applicable_document_registered", cursor.fetchone()[0] is not None)

        cursor.execute("update public.sigec_applications set application_state='submitted',submitted_at=now() where id=%s", (application_id,))
        authenticate(cursor, candidate, "candidato")
        expect_error(cursor, "submitted_answers_locked",
                     "select public.sigec_replace_application_answers(%s,%s)", (application_id, Json(base_answers)), "23514")

        reset(cursor)
        cursor.execute("select metadata from public.sigec_audit_events where action='application_answers_updated' and entity_id=%s order by id desc limit 1", (str(application_id),))
        metadata = cursor.fetchone()[0]
        expect("answer_values_omitted_from_audit", set(metadata.keys()) == {"answer_count"})
        cursor.execute("select not has_table_privilege('authenticated','public.sigec_application_answers','INSERT,UPDATE,DELETE'), has_function_privilege('authenticated','public.sigec_replace_application_answers(uuid,jsonb)','EXECUTE')")
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
