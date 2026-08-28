"""Remote integration test for SIGEC email/password session lifecycle."""

from __future__ import annotations

import json
import secrets
import sys
import uuid

from test_sigec_remote_access import Api, load_env


def main() -> int:
    env = load_env()
    api = Api(
        env["NEXT_PUBLIC_SUPABASE_URL"],
        env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
        env["SUPABASE_SERVICE_ROLE_KEY"],
    )
    run_id = uuid.uuid4().hex[:12]
    email = f"sigec-test-auth-{run_id}@example.invalid"
    old_password = f"Old!{secrets.token_urlsafe(24)}7a"
    new_password = f"New!{secrets.token_urlsafe(24)}9z"
    user_id: str | None = None
    checks: list[str] = []
    cleanup_ok = True

    try:
        status, settings = api.request("GET", "/auth/v1/settings")
        if status != 200 or settings.get("mailer_autoconfirm") is not False:
            raise AssertionError("hosted_email_confirmation_is_not_required")
        checks.append("email_confirmation_required")

        status, created = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": email,
            "password": old_password,
            "email_confirm": True,
            "app_metadata": {"role": "sem_acesso"},
        })
        if status != 200:
            raise AssertionError(f"auth_fixture_creation: HTTP {status}")
        user_id = created["id"]
        checks.append("auth_fixture_created")

        sessions = []
        for _ in range(2):
            status, session = api.create_email_link_session(email)
            if status != 200:
                raise AssertionError(f"independent_session_creation: HTTP {status}")
            sessions.append(session)
        checks.append("independent_sessions_created")

        status, _ = api.request(
            "PUT", "/auth/v1/user", token=sessions[0]["access_token"],
            body={"password": new_password},
        )
        if status != 200:
            raise AssertionError(f"password_update: HTTP {status}")
        checks.append("password_updated")

        status, _ = api.request(
            "POST", "/auth/v1/logout?scope=global", token=sessions[0]["access_token"]
        )
        if status not in {200, 204}:
            raise AssertionError(f"global_logout: HTTP {status}")
        checks.append("global_logout_accepted")

        for index, session in enumerate(sessions):
            status, _ = api.request(
                "POST", "/auth/v1/token?grant_type=refresh_token",
                body={"refresh_token": session["refresh_token"]},
            )
            if status < 400:
                raise AssertionError(f"refresh_token_{index + 1}_survived_global_logout")
        checks.append("all_refresh_tokens_revoked")

        status, recovery_session = api.create_email_link_session(email, "recovery")
        if status != 200 or not isinstance(recovery_session, dict) or not recovery_session.get("access_token"):
            raise AssertionError(f"recovery_session_creation: HTTP {status}")
        status, recovered_user = api.request(
            "GET", "/auth/v1/user", token=recovery_session["access_token"],
        )
        if status != 200 or recovered_user.get("id") != user_id:
            raise AssertionError("recovery_session_does_not_match_user")
        checks.append("recovery_link_restores_access_after_global_logout")
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error), "checksPassed": checks}, ensure_ascii=False, indent=2))
        return 1
    finally:
        if user_id:
            status, _ = api.request("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)
            cleanup_ok = status in {200, 204, 404}

    result = {"ok": cleanup_ok, "checks": len(checks), "userCleaned": cleanup_ok}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
