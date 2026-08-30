"""Transactional remote test for secure, versioned SIGEC documents."""

from __future__ import annotations

import json
import secrets
import sys
import time
import uuid
from typing import Any
from urllib.error import URLError
from urllib.parse import urlsplit, urlunsplit

import psycopg2

from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env


def transaction_pooler(uri: str) -> str:
    parsed = urlsplit(uri)
    if parsed.hostname and parsed.hostname.endswith(".pooler.supabase.com") and parsed.port == 5432:
        host = f"{parsed.hostname}:6543"
        if parsed.username:
            credentials = parsed.username
            if parsed.password:
                credentials += f":{parsed.password}"
            host = f"{credentials}@{host}"
        return urlunsplit((parsed.scheme, host, parsed.path, parsed.query, parsed.fragment))
    return uri


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

    def request_retry(method: str, path: str, body: dict[str, Any] | None = None):
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                return api.request(method, path, service=True, body=body)
            except (TimeoutError, URLError) as error:
                last_error = error
                if attempt < 2:
                    time.sleep(1 + attempt)
        assert last_error is not None
        raise last_error

    def create_user(label: str, role: str) -> str:
        status, body = request_retry("POST", "/auth/v1/admin/users", {
            "email": f"sigec-test-documents-{label}-{run_id}@example.invalid",
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
        savepoint = f"documents_expected_{len(checks)}"
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
                status, _ = request_retry("DELETE", f"/auth/v1/admin/users/{user_id}")
                ok = ok and status in {200, 204, 404}
            except (TimeoutError, URLError):
                ok = False
        return ok

    try:
        candidate_a = create_user("candidate-a", "candidato")
        candidate_b = create_user("candidate-b", "candidato")
        manager = create_user("manager", "gerente")
        connection = psycopg2.connect(transaction_pooler(env["POSTGRES"]), connect_timeout=15)
        connection.autocommit = False
        cursor = connection.cursor()

        for index, candidate in enumerate((candidate_a, candidate_b), start=1):
            base = f"{(int(run_id[:8], 16) + index) % 1_000_000_000:09d}"
            cursor.execute(
                """insert into public.sigec_candidate_profiles
                   (user_id,full_name,cpf,birth_date,whatsapp,city,state)
                   values (%s,%s,%s,'1990-01-01',%s,'São Luís','MA')""",
                (candidate, f"Candidato Documento Sintético {index}", valid_cpf(base),
                 f"5598{(int(run_id[1:9], 16) + index) % 1_000_000_000:09d}"),
            )

        cursor.execute(
            """insert into public.sigec_processes
               (title,slug,status,applications_open_at,applications_close_at,created_by)
               values (%s,%s,'draft',now() - interval '1 hour',now() + interval '1 day',%s)
               returning id""",
            (f"Processo documentos {run_id}", f"processo-documentos-{run_id}", manager),
        )
        process_id = cursor.fetchone()[0]
        cursor.execute(
            """insert into public.sigec_document_requirements
               (process_id,code,label,accepted_mime_types,max_file_size_bytes)
               values (%s,'diploma','Diploma',array['application/pdf'],1048576) returning id""",
            (process_id,),
        )
        requirement_id = cursor.fetchone()[0]
        cursor.execute(
            "insert into public.sigec_applications(process_id,candidate_id) values (%s,%s) returning id",
            (process_id, candidate_a),
        )
        application_id = cursor.fetchone()[0]

        rpc = "select * from public.sigec_register_candidate_document(%s,%s,%s,%s,%s,%s,%s,%s)"
        path_one = f"{candidate_a}/{application_id}/{requirement_id}-{uuid.uuid4()}.pdf"
        cursor.execute(rpc, (application_id, requirement_id, path_one, "diploma.pdf", "application/pdf", 512, "a" * 64, candidate_a))
        document_one, version_one = cursor.fetchone()
        expect("first_document_is_version_one", version_one == 1)

        path_two = f"{candidate_a}/{application_id}/{requirement_id}-{uuid.uuid4()}.pdf"
        cursor.execute(rpc, (application_id, requirement_id, path_two, "diploma-novo.pdf", "application/pdf", 640, "b" * 64, candidate_a))
        document_two, version_two = cursor.fetchone()
        expect("second_document_is_version_two", version_two == 2)
        cursor.execute(
            """select supersedes_document_id,technical_status,malware_status,sanitized_at is not null,sha256 is not null
               from public.sigec_application_documents where id=%s""",
            (document_two,),
        )
        expect("new_version_supersedes_previous_and_is_quarantined", cursor.fetchone() == (document_one, "validated", "pending", True, True))

        scan_rpc = "select * from public.sigec_record_document_malware_scan(%s,%s,%s,%s,%s,%s)"
        cursor.execute(scan_rpc, (document_one, "a" * 64, "clean", "clamav-test", None, None))
        expect("clean_scan_releases_first_document", cursor.fetchone() == (document_one, "clean", 1))
        cursor.execute(scan_rpc, (document_two, "b" * 64, "infected", "clamav-test", "Eicar-Signature", None))
        expect("infected_scan_quarantines_second_document", cursor.fetchone() == (document_two, "infected", 1))
        cursor.execute(scan_rpc, (document_two, "b" * 64, "error", "clamav-test", None, "scanner_timeout"))
        expect("scanner_error_keeps_document_quarantined", cursor.fetchone() == (document_two, "error", 2))
        cursor.execute(scan_rpc, (document_two, "b" * 64, "infected", "clamav-test", "Eicar-Signature", None))
        expect("rescan_is_audited_and_restores_infected_verdict", cursor.fetchone() == (document_two, "infected", 3))
        expect_error(cursor, "scan_hash_mismatch_is_rejected", scan_rpc,
                     (document_one, "f" * 64, "clean", "clamav-test", None, None), {"23503"})

        expect_error(cursor, "wrong_candidate_is_rejected", rpc,
                     (application_id, requirement_id, path_two + "x", "x.pdf", "application/pdf", 100, "c" * 64, candidate_b), {"42501"})
        expect_error(cursor, "mime_outside_requirement_is_rejected", rpc,
                     (application_id, requirement_id, path_two + "y", "x.png", "image/png", 100, "d" * 64, candidate_a), {"23514"})
        expect_error(cursor, "invalid_hash_is_rejected", rpc,
                     (application_id, requirement_id, path_two + "z", "x.pdf", "application/pdf", 100, "invalid", candidate_a), {"23514"})

        cursor.execute("select prosecdef from pg_proc where oid='public.sigec_register_candidate_document(uuid,uuid,text,text,text,bigint,text,uuid)'::regprocedure")
        expect("document_rpc_uses_security_invoker", cursor.fetchone() == (False,))
        cursor.execute("""select
          not has_function_privilege('authenticated','public.sigec_register_candidate_document(uuid,uuid,text,text,text,bigint,text,uuid)','EXECUTE'),
          not has_function_privilege('authenticated','public.sigec_record_document_malware_scan(uuid,text,text,text,text,text)','EXECUTE'),
          not has_table_privilege('authenticated','public.sigec_application_documents','INSERT')""")
        expect("candidate_cannot_bypass_document_backend", cursor.fetchone() == (True, True, True))

        authenticate(cursor, candidate_a, "candidato")
        cursor.execute("select count(*) from public.sigec_application_documents where application_id=%s", (application_id,))
        expect("candidate_reads_own_document_metadata", cursor.fetchone()[0] == 2)
        authenticate(cursor, candidate_b, "candidato")
        cursor.execute("select count(*) from public.sigec_application_documents where application_id=%s", (application_id,))
        expect("other_candidate_cannot_read_documents", cursor.fetchone()[0] == 0)
        authenticate(cursor, manager, "gerente")
        cursor.execute("select count(*) from public.sigec_application_documents where application_id=%s", (application_id,))
        expect("manager_reads_document_metadata", cursor.fetchone()[0] == 2)

        reset_postgres(cursor)
        cursor.execute("""select count(*) from pg_policies
          where schemaname='storage' and tablename='objects' and cmd='INSERT'
            and policyname like 'sigec_storage_candidate%'""")
        expect("candidate_has_no_direct_storage_insert_policy", cursor.fetchone()[0] == 0)
        cursor.execute("""select coalesce(qual,'') from pg_policies
          where schemaname='storage' and tablename='objects' and policyname='sigec_storage_candidate_read'""")
        storage_qual = cursor.fetchone()[0]
        expect("all_authenticated_storage_read_requires_clean_scan", "malware_status" in storage_qual and "clean" in storage_qual and "candidate_id" in storage_qual)
        cursor.execute("""select metadata from public.sigec_audit_events
          where action='candidate_document_uploaded' and entity_type='application_document'
            and entity_id in (%s,%s) order by id""", (str(document_one), str(document_two)))
        events = cursor.fetchall()
        serialized = json.dumps(events, ensure_ascii=False)
        expect("document_versions_are_audited_without_sensitive_metadata",
               len(events) == 2 and "diploma.pdf" not in serialized and str(candidate_a) not in serialized and "aaaa" not in serialized)
        cursor.execute("""select metadata from public.sigec_audit_events
          where action='candidate_document_malware_scanned' and entity_id in (%s,%s) order by id""",
                       (str(document_one), str(document_two)))
        scan_events = cursor.fetchall()
        expect("every_malware_scan_attempt_is_audited_without_signature",
               len(scan_events) == 4 and "Eicar-Signature" not in json.dumps(scan_events, ensure_ascii=False))

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
    print(json.dumps({"ok": cleanup_ok, "checks": checks, "cleanup": cleanup_ok}, ensure_ascii=False, indent=2))
    return 0 if cleanup_ok else 1


if __name__ == "__main__":
    sys.exit(main())
