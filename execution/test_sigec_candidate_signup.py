"""Remote integration test for the trusted SIGEC candidate signup path."""

from __future__ import annotations

import json
import hashlib
import secrets
import sys
import uuid

from test_sigec_remote_access import Api, load_env


def valid_cpf(base: str) -> str:
    digits = [int(value) for value in base]
    for length in (9, 10):
        total = sum(digits[index] * (length + 1 - index) for index in range(length))
        result = (total * 10) % 11
        digits.append(0 if result == 10 else result)
    return "".join(str(value) for value in digits)


def main() -> int:
    env = load_env()
    api = Api(
        env["NEXT_PUBLIC_SUPABASE_URL"],
        env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
        env["SUPABASE_SERVICE_ROLE_KEY"],
    )
    run_id = uuid.uuid4().hex[:12]
    password = f"Sg!{secrets.token_urlsafe(24)}9z"
    created_users: list[str] = []
    checks: list[str] = []

    def cleanup() -> bool:
        ok = True
        for user_id in reversed(created_users):
            status, _ = api.request("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)
            ok = ok and status in {200, 204, 404}
        created_users.clear()
        return ok

    try:
        cpf = valid_cpf(f"{int(run_id[:8], 16) % 1_000_000_000:09d}")
        whatsapp = f"5598{int(run_id[1:8], 16) % 1_000_000_000:09d}"
        email = f"sigec-test-signup-{run_id}@example.invalid"
        profile = {
            "full_name": "Candidato Cadastro Sintético",
            "cpf": cpf,
            "birth_date": "1992-05-14",
            "whatsapp": whatsapp,
            "city": "São Luís",
            "state": "MA",
            "role": "admin",
            "sigec_candidate_signup": True,
        }
        signup_nonce = secrets.token_hex(32)
        nonce_digest = hashlib.sha256(signup_nonce.encode("ascii")).hexdigest()
        status, _ = api.request(
            "POST", "/rest/v1/sigec_candidate_signup_nonces", service=True,
            body={"nonce_digest": nonce_digest, "expires_at": "2099-01-01T00:00:00Z"},
        )
        if status not in {200, 201}:
            raise AssertionError(f"signup_nonce_fixture: HTTP {status}")
        profile["sigec_signup_nonce"] = signup_nonce
        status, body = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": profile,
        })
        if status != 200:
            raise AssertionError(f"candidate_signup_fixture: HTTP {status}")
        candidate_id = body["id"]
        created_users.append(candidate_id)
        checks.append("candidate_created_without_client_app_metadata")

        bypass_email = f"sigec-test-signup-bypass-{run_id}@example.invalid"
        status, _ = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": bypass_email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {key: value for key, value in profile.items() if key != "sigec_signup_nonce"},
        })
        if status < 400:
            raise AssertionError("candidate_signup_without_server_nonce_was_accepted")
        checks.append("direct_signup_bypass_rejected")

        status, persisted_user = api.request(
            "GET", f"/auth/v1/admin/users/{candidate_id}", service=True
        )
        if status != 200:
            raise AssertionError(f"candidate_reload: HTTP {status}")
        if persisted_user.get("app_metadata", {}).get("role") != "candidato":
            raise AssertionError("database_did_not_assign_candidate_role")
        if persisted_user.get("user_metadata", {}).get("role") != "admin":
            raise AssertionError("malicious_user_metadata_fixture_missing")
        checks.append("user_metadata_cannot_control_authorization_role")

        status, nonce_rows = api.request(
            "GET",
            f"/rest/v1/sigec_candidate_signup_nonces?nonce_digest=eq.{nonce_digest}&select=nonce_digest",
            service=True,
        )
        if status != 200 or nonce_rows != []:
            raise AssertionError("signup_nonce_was_not_consumed")
        checks.append("signup_nonce_consumed_once")

        status, rows = api.request(
            "GET",
            f"/rest/v1/sigec_candidate_profiles?user_id=eq.{candidate_id}&select=user_id,full_name,cpf,whatsapp,city,state",
            service=True,
        )
        if status != 200 or not isinstance(rows, list) or len(rows) != 1:
            raise AssertionError("candidate_profile_was_not_created_atomically")
        if rows[0]["cpf"] != cpf or rows[0]["whatsapp"] != whatsapp:
            raise AssertionError("candidate_profile_data_mismatch")
        checks.append("candidate_profile_created_atomically")

        status, login = api.create_email_link_session(email)
        if status != 200:
            raise AssertionError(f"candidate_login: HTTP {status}")
        token = login["access_token"]
        status, own_rows = api.request(
            "GET",
            f"/rest/v1/sigec_candidate_profiles?user_id=eq.{candidate_id}&select=user_id",
            token=token,
        )
        if status != 200 or not isinstance(own_rows, list) or len(own_rows) != 1:
            raise AssertionError("candidate_cannot_read_own_created_profile")
        checks.append("candidate_reads_own_profile")

        status, _ = api.request("PUT", "/auth/v1/user", token=token, body={"data": {"role": "admin"}})
        if status != 200:
            raise AssertionError(f"candidate_updates_user_metadata: HTTP {status}")
        status, refreshed = api.request("GET", "/auth/v1/user", token=token)
        if status != 200 or refreshed.get("app_metadata", {}).get("role") != "candidato":
            raise AssertionError("candidate_changed_authorization_through_user_metadata")
        checks.append("candidate_cannot_escalate_role_through_user_metadata")

        invalid_email = f"sigec-test-signup-invalid-{run_id}@example.invalid"
        status, _ = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": invalid_email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {**profile, "cpf": "11111111111", "whatsapp": whatsapp[:-1] + "7"},
        })
        if status < 400:
            raise AssertionError("invalid_cpf_was_accepted")
        checks.append("database_rejects_invalid_cpf")

        manager_email = f"sigec-test-signup-manager-{run_id}@example.invalid"
        status, manager = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": manager_email,
            "password": password,
            "email_confirm": True,
            "app_metadata": {"role": "gerente"},
        })
        if status != 200:
            raise AssertionError(f"internal_user_creation_regressed: HTTP {status}")
        manager_id = manager["id"]
        created_users.append(manager_id)
        status, manager_profiles = api.request(
            "GET",
            f"/rest/v1/sigec_candidate_profiles?user_id=eq.{manager_id}&select=user_id",
            service=True,
        )
        if status != 200 or manager_profiles != []:
            raise AssertionError("internal_user_received_candidate_profile")
        checks.append("internal_user_creation_preserved")

        cleaned = cleanup()
        if not cleaned:
            raise AssertionError("synthetic_users_not_cleaned")
        print(json.dumps({"ok": True, "checks": len(checks), "usersCleaned": True}, indent=2))
        return 0
    except Exception as error:
        print(json.dumps({
            "ok": False,
            "checksPassed": len(checks),
            "error": str(error).splitlines()[0],
        }, ensure_ascii=False, indent=2))
        return 1
    finally:
        cleanup()


if __name__ == "__main__":
    sys.exit(main())
