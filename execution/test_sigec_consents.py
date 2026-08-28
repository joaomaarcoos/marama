"""Remote integration test for versioned SIGEC application consents.

The test creates one isolated candidate, process and draft application, verifies
the service-only consent bundle and removes every fixture in ``finally``.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import secrets
import uuid

from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env


def main() -> int:
    env = load_env()
    api = Api(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"], env["SUPABASE_SERVICE_ROLE_KEY"])
    run_id = uuid.uuid4().hex[:12]
    user_id: str | None = None
    process_id: str | None = None
    application_id: str | None = None
    checks: list[str] = []
    cleanup_ok = True

    try:
        email = f"sigec-test-consent-{run_id}@example.invalid"
        password = f"Consent!{secrets.token_urlsafe(24)}8z"
        signup_nonce = secrets.token_hex(32)
        nonce_digest = hashlib.sha256(signup_nonce.encode()).hexdigest()
        status, _ = api.request("POST", "/rest/v1/sigec_candidate_signup_nonces", service=True, body={
            "nonce_digest": nonce_digest,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
        })
        if status not in {200, 201}:
            raise AssertionError(f"nonce_fixture: HTTP {status}")

        status, created = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {
                "full_name": "Candidato Aceite Sintético",
                "cpf": valid_cpf(f"{int(run_id[:8], 16) % 1_000_000_000:09d}"),
                "birth_date": "1990-05-18",
                "whatsapp": f"5598{int(run_id[1:8], 16) % 1_000_000_000:09d}",
                "city": "São Luís",
                "state": "MA",
                "sigec_candidate_signup": True,
                "sigec_signup_nonce": signup_nonce,
            },
        })
        if status != 200:
            raise AssertionError(f"candidate_fixture: HTTP {status}")
        user_id = created["id"]

        status, login = api.create_email_link_session(email)
        if status != 200 or not isinstance(login, dict) or not login.get("access_token"):
            raise AssertionError(f"candidate_login: HTTP {status}")
        token = login["access_token"]
        checks.append("candidate_fixture_authenticated")

        now = datetime.now(timezone.utc)
        status, processes = api.request(
            "POST",
            "/rest/v1/sigec_processes",
            service=True,
            prefer="return=representation",
            body={
                "title": f"Processo Sintético Aceites {run_id}",
                "slug": f"processo-sintetico-aceites-{run_id}",
                "status": "open",
                "edital_version": "1.0",
                "published_at": (now - timedelta(days=1)).isoformat(),
                "applications_open_at": (now - timedelta(minutes=5)).isoformat(),
                "applications_close_at": (now + timedelta(days=1)).isoformat(),
                "created_by": user_id,
            },
        )
        if status != 201 or not isinstance(processes, list) or len(processes) != 1:
            raise AssertionError(f"process_fixture: HTTP {status}")
        process_id = processes[0]["id"]

        status, applications = api.request(
            "POST",
            "/rest/v1/sigec_applications",
            service=True,
            prefer="return=representation",
            body={"process_id": process_id, "candidate_id": user_id},
        )
        if status != 201 or not isinstance(applications, list) or len(applications) != 1:
            raise AssertionError(f"application_fixture: HTTP {status}")
        application_id = applications[0]["id"]

        status, eligibility_rows = api.request(
            "GET",
            f"/rest/v1/sigec_applications?id=eq.{application_id}&select=id,candidate_id,application_state,process_id,sigec_processes(status,edital_version,published_at,applications_open_at,applications_close_at)",
            service=True,
        )
        if status != 200 or not isinstance(eligibility_rows, list) or len(eligibility_rows) != 1:
            raise AssertionError(f"eligibility_fixture: HTTP {status} body={eligibility_rows}")

        evidence = {
            "p_application_id": application_id,
            "p_candidate_id": user_id,
            "p_ip_hash": hashlib.sha256(secrets.token_bytes(32)).hexdigest(),
            "p_user_agent_hash": hashlib.sha256(secrets.token_bytes(32)).hexdigest(),
        }
        status, bundle = api.request(
            "POST", "/rest/v1/rpc/sigec_record_required_consents", service=True, body=evidence
        )
        versions = {item["consent_type"]: item["document_version"] for item in bundle} if isinstance(bundle, list) else {}
        expected_versions = {
            "edital": "edital:1.0",
            "truthfulness": "declaracao-veracidade:1",
            "requirements": "requisitos:1.0",
            "lgpd": "aviso-privacidade:1",
        }
        if status != 200 or versions != expected_versions:
            raise AssertionError(
                f"required_bundle: HTTP {status} body={bundle} versions={versions} eligibility={eligibility_rows}"
            )
        checks.append("four_required_consents_server_versioned")

        first_timestamps = {item["consent_type"]: item["accepted_at"] for item in bundle}
        status, repeated = api.request(
            "POST", "/rest/v1/rpc/sigec_record_required_consents", service=True, body=evidence
        )
        repeated_timestamps = {
            item["consent_type"]: item["accepted_at"] for item in repeated
        } if isinstance(repeated, list) else {}
        if status != 200 or repeated_timestamps != first_timestamps:
            raise AssertionError("consent_bundle_was_not_idempotent")
        checks.append("consent_bundle_is_idempotent")

        status, _ = api.request(
            "POST", "/rest/v1/rpc/sigec_record_required_consents", token=token, body=evidence
        )
        if status < 400:
            raise AssertionError("candidate_called_server_only_consent_rpc")
        checks.append("consent_rpc_is_service_role_only")

        status, _ = api.request("POST", "/rest/v1/sigec_consents", token=token, body={
            "application_id": application_id,
            "consent_type": "ppi",
            "document_version": "candidate-controlled",
            "accepted": True,
            "ip_hash": evidence["p_ip_hash"],
            "user_agent_hash": evidence["p_user_agent_hash"],
        })
        if status < 400:
            raise AssertionError("candidate_inserted_consent_directly")
        checks.append("direct_candidate_insert_is_revoked")

        wrong_subject = dict(evidence)
        wrong_subject["p_candidate_id"] = str(uuid.uuid4())
        status, _ = api.request(
            "POST", "/rest/v1/rpc/sigec_record_required_consents", service=True, body=wrong_subject
        )
        if status < 400:
            raise AssertionError("consent_was_recorded_for_wrong_candidate")
        checks.append("candidate_application_binding_enforced")

        status, _ = api.request("POST", "/rest/v1/sigec_consents", service=True, body={
            "application_id": application_id,
            "consent_type": "ppi",
            "document_version": "ppi:1",
            "accepted": False,
        })
        if status < 400:
            raise AssertionError("negative_acceptance_was_persisted")
        checks.append("negative_acceptance_rejected_by_constraint")

        status, _ = api.request(
            "PATCH", f"/rest/v1/sigec_processes?id=eq.{process_id}", service=True,
            body={"edital_version": "2.0"},
        )
        if status not in {200, 204}:
            raise AssertionError(f"retification_fixture: HTTP {status}")
        status, retified = api.request(
            "POST", "/rest/v1/rpc/sigec_record_required_consents", service=True, body=evidence
        )
        retified_versions = {
            item["consent_type"]: item["document_version"] for item in retified
        } if isinstance(retified, list) else {}
        if status != 200 or retified_versions.get("edital") != "edital:2.0" or retified_versions.get("requirements") != "requisitos:2.0":
            raise AssertionError("retification_did_not_require_current_versions")
        status, rows = api.request(
            "GET",
            f"/rest/v1/sigec_consents?application_id=eq.{application_id}&select=consent_type,document_version",
            service=True,
        )
        if status != 200 or not isinstance(rows, list) or len(rows) != 6:
            raise AssertionError("prior_consent_versions_were_not_preserved")
        checks.append("retification_versions_preserve_prior_evidence")
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error), "checksPassed": checks}, ensure_ascii=False, indent=2))
        return 1
    finally:
        if application_id:
            api.request("DELETE", f"/rest/v1/sigec_applications?id=eq.{application_id}", service=True)
        if process_id:
            api.request("DELETE", f"/rest/v1/sigec_processes?id=eq.{process_id}", service=True)
        if user_id:
            status, _ = api.request("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)
            cleanup_ok = status in {200, 204, 404}

    print(json.dumps({"ok": cleanup_ok, "checks": len(checks), "fixturesCleaned": cleanup_ok}, ensure_ascii=False, indent=2))
    return 0 if cleanup_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
