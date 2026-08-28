"""Remote database test for the SIGEC WhatsApp OTP lifecycle (no real message is sent)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
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
    checks: list[str] = []
    cleanup_ok = True
    otp_secret = secrets.token_bytes(32)

    def code_hash(verification_id: str, code: str) -> str:
        return hmac.new(otp_secret, f"{verification_id}:{code}".encode(), hashlib.sha256).hexdigest()

    try:
        phone = f"5598{int(run_id[1:8], 16) % 1_000_000_000:09d}"
        signup_nonce = secrets.token_hex(32)
        nonce_digest = hashlib.sha256(signup_nonce.encode()).hexdigest()
        status, _ = api.request("POST", "/rest/v1/sigec_candidate_signup_nonces", service=True, body={
            "nonce_digest": nonce_digest,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
        })
        if status not in {200, 201}:
            raise AssertionError(f"nonce_fixture: HTTP {status}")

        status, created = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": f"sigec-test-whatsapp-{run_id}@example.invalid",
            "password": f"Otp!{secrets.token_urlsafe(24)}8z",
            "email_confirm": True,
            "user_metadata": {
                "full_name": "Candidato OTP Sintético",
                "cpf": valid_cpf(f"{int(run_id[:8], 16) % 1_000_000_000:09d}"),
                "birth_date": "1991-06-20",
                "whatsapp": phone,
                "city": "São Luís",
                "state": "MA",
                "sigec_candidate_signup": True,
                "sigec_signup_nonce": signup_nonce,
            },
        })
        if status != 200:
            raise AssertionError(f"candidate_fixture: HTTP {status}")
        user_id = created["id"]
        checks.append("candidate_fixture_created")

        verification_id = str(uuid.uuid4())
        correct_code = "482731"
        status, issue_result = api.request("POST", "/rest/v1/rpc/sigec_issue_whatsapp_verification", service=True, body={
            "p_verification_id": verification_id,
            "p_user_id": user_id,
            "p_whatsapp": phone,
            "p_code_hash": code_hash(verification_id, correct_code),
            "p_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            "p_request_ip_digest": hashlib.sha256(secrets.token_bytes(32)).hexdigest(),
        })
        if status != 200 or issue_result != "issued":
            raise AssertionError(f"otp_issue: HTTP {status} result={issue_result}")
        checks.append("otp_issued_without_plaintext")

        wrong_hash = code_hash(verification_id, "000000")
        for attempt in range(1, 6):
            status, result = api.request("POST", "/rest/v1/rpc/sigec_verify_whatsapp_code", service=True, body={
                "p_verification_id": verification_id,
                "p_user_id": user_id,
                "p_code_hash": wrong_hash,
            })
            expected = "locked" if attempt == 5 else "invalid"
            if status != 200 or result != expected:
                raise AssertionError(f"wrong_attempt_{attempt}: HTTP {status} result={result}")
        checks.append("five_wrong_attempts_lock_code")

        status, result = api.request("POST", "/rest/v1/rpc/sigec_verify_whatsapp_code", service=True, body={
            "p_verification_id": verification_id,
            "p_user_id": user_id,
            "p_code_hash": code_hash(verification_id, correct_code),
        })
        if status != 200 or result != "invalidated":
            raise AssertionError("locked_code_was_reused")
        checks.append("locked_code_cannot_be_reused")

        valid_id = str(uuid.uuid4())
        valid_code = "193604"
        status, issue_result = api.request("POST", "/rest/v1/rpc/sigec_issue_whatsapp_verification", service=True, body={
            "p_verification_id": valid_id,
            "p_user_id": user_id,
            "p_whatsapp": phone,
            "p_code_hash": code_hash(valid_id, valid_code),
            "p_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            "p_request_ip_digest": hashlib.sha256(secrets.token_bytes(32)).hexdigest(),
        })
        if status != 200 or issue_result != "issued":
            raise AssertionError("replacement_code_was_not_issued")

        status, result = api.request("POST", "/rest/v1/rpc/sigec_verify_whatsapp_code", service=True, body={
            "p_verification_id": valid_id,
            "p_user_id": str(uuid.uuid4()),
            "p_code_hash": code_hash(valid_id, valid_code),
        })
        if status != 200 or result != "not_found":
            raise AssertionError("cross_user_verification_was_not_rejected")
        checks.append("cross_user_verification_rejected")

        status, result = api.request("POST", "/rest/v1/rpc/sigec_verify_whatsapp_code", service=True, body={
            "p_verification_id": valid_id,
            "p_user_id": user_id,
            "p_code_hash": code_hash(valid_id, valid_code),
        })
        if status != 200 or result != "verified":
            raise AssertionError("valid_code_was_not_accepted")
        status, rows = api.request("GET", f"/rest/v1/sigec_candidate_profiles?user_id=eq.{user_id}&select=whatsapp_verified_at", service=True)
        if status != 200 or not rows or not rows[0]["whatsapp_verified_at"]:
            raise AssertionError("profile_was_not_marked_verified")
        checks.append("valid_code_marks_profile_atomically")

        status, replay_result = api.request("POST", "/rest/v1/rpc/sigec_verify_whatsapp_code", service=True, body={
            "p_verification_id": valid_id,
            "p_user_id": user_id,
            "p_code_hash": code_hash(valid_id, valid_code),
        })
        if status != 200 or replay_result != "already_used":
            raise AssertionError("verified_code_replay_was_not_rejected")
        checks.append("verified_code_replay_rejected")

        changed_phone = phone[:-1] + ("1" if phone[-1] != "1" else "2")
        status, _ = api.request("PATCH", f"/rest/v1/sigec_candidate_profiles?user_id=eq.{user_id}", service=True, body={"whatsapp": changed_phone})
        if status not in {200, 204}:
            raise AssertionError(f"phone_change: HTTP {status}")
        status, rows = api.request("GET", f"/rest/v1/sigec_candidate_profiles?user_id=eq.{user_id}&select=whatsapp_verified_at", service=True)
        if status != 200 or rows[0]["whatsapp_verified_at"] is not None:
            raise AssertionError("phone_change_did_not_reset_verification")
        checks.append("phone_change_resets_verification")

        status, _ = api.request("POST", "/rest/v1/rpc/sigec_verify_whatsapp_code", body={
            "p_verification_id": valid_id, "p_user_id": user_id,
            "p_code_hash": code_hash(valid_id, valid_code),
        })
        if status < 400:
            raise AssertionError("anonymous_caller_reached_otp_rpc")
        checks.append("otp_rpc_is_service_role_only")
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error), "checksPassed": checks}, ensure_ascii=False, indent=2))
        return 1
    finally:
        if user_id:
            api.request("DELETE", f"/rest/v1/sigec_audit_events?actor_id=eq.{user_id}", service=True)
            status, _ = api.request("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)
            cleanup_ok = status in {200, 204, 404}

    print(json.dumps({"ok": cleanup_ok, "checks": len(checks), "fixturesCleaned": cleanup_ok}, ensure_ascii=False, indent=2))
    return 0 if cleanup_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
