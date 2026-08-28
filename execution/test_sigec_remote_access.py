"""Remote RLS and Storage integration tests for the SIGEC foundation.

Creates isolated synthetic users and records, exercises positive and negative
access paths through the public APIs, and removes every fixture in ``finally``.
No credential or synthetic password is printed.
"""

from __future__ import annotations

import json
import secrets
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.local"
BUCKET = "sigec-candidate-documents"


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in ENV_PATH.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[name.strip()] = value
    return values


class Api:
    def __init__(self, url: str, anon_key: str, service_key: str):
        self.url = url.rstrip("/")
        self.anon_key = anon_key
        self.service_key = service_key

    def request(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        service: bool = False,
        body: Any = None,
        content_type: str = "application/json",
        prefer: str | None = None,
    ) -> tuple[int, Any]:
        key = self.service_key if service else self.anon_key
        bearer = self.service_key if service else (token or self.anon_key)
        headers = {"apikey": key, "Authorization": f"Bearer {bearer}"}
        if prefer:
            headers["Prefer"] = prefer
        data: bytes | None = None
        if body is not None:
            if isinstance(body, bytes):
                data = body
            else:
                data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = content_type
        request = Request(f"{self.url}{path}", data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=30) as response:
                raw = response.read()
                return response.status, self._decode(raw)
        except HTTPError as error:
            return error.code, self._decode(error.read())

    @staticmethod
    def _decode(raw: bytes) -> Any:
        if not raw:
            return None
        text = raw.decode("utf-8", errors="replace")
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text

    def create_email_link_session(self, email: str, link_type: str = "magiclink") -> tuple[int, Any]:
        """Create a one-use test session without bypassing CAPTCHA-protected password auth."""
        status, generated = self.request(
            "POST",
            "/auth/v1/admin/generate_link",
            service=True,
            body={"type": link_type, "email": email},
        )
        if status != 200 or not isinstance(generated, dict):
            return status, generated
        properties = generated.get("properties") if isinstance(generated.get("properties"), dict) else generated
        token_hash = properties.get("hashed_token")
        verification_type = properties.get("verification_type") or link_type
        if not token_hash:
            return 500, {"error": "admin_link_missing_hashed_token"}
        return self.request(
            "POST",
            "/auth/v1/verify",
            body={"type": verification_type, "token_hash": token_hash},
        )


def expect_status(name: str, status: int, allowed: set[int], checks: list[str]) -> None:
    if status not in allowed:
        raise AssertionError(f"{name}: expected HTTP {sorted(allowed)}, got {status}")
    checks.append(name)


def expect_rows(name: str, status: int, body: Any, count: int, checks: list[str]) -> None:
    expect_status(name, status, {200}, checks)
    if not isinstance(body, list) or len(body) != count:
        raise AssertionError(f"{name}: expected {count} rows")


def cleanup_synthetic(api: Api) -> bool:
    status, processes = api.request(
        "GET", "/rest/v1/sigec_processes?slug=like.processo-sintetico-*&select=id", service=True
    )
    if status != 200 or not isinstance(processes, list):
        return False
    for process in processes:
        process_id = process.get("id")
        if not process_id:
            continue
        api.request("DELETE", f"/rest/v1/sigec_applications?process_id=eq.{process_id}", service=True)
        api.request("DELETE", f"/rest/v1/sigec_processes?id=eq.{process_id}", service=True)

    status, users_body = api.request("GET", "/auth/v1/admin/users?page=1&per_page=1000", service=True)
    if status != 200 or not isinstance(users_body, dict):
        return False
    for user in users_body.get("users", []):
        email = str(user.get("email", ""))
        if email.startswith("sigec-test-") and email.endswith("@example.invalid"):
            api.request("DELETE", f"/auth/v1/admin/users/{user['id']}", service=True)

    status, remaining_processes = api.request(
        "GET", "/rest/v1/sigec_processes?slug=like.processo-sintetico-*&select=id", service=True
    )
    status_users, remaining_users_body = api.request(
        "GET", "/auth/v1/admin/users?page=1&per_page=1000", service=True
    )
    remaining_users = [] if not isinstance(remaining_users_body, dict) else [
        user for user in remaining_users_body.get("users", [])
        if str(user.get("email", "")).startswith("sigec-test-")
        and str(user.get("email", "")).endswith("@example.invalid")
    ]
    return (
        status == 200 and isinstance(remaining_processes, list) and not remaining_processes
        and status_users == 200 and not remaining_users
    )


def main() -> int:
    env = load_env()
    api = Api(
        env["NEXT_PUBLIC_SUPABASE_URL"],
        env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
        env["SUPABASE_SERVICE_ROLE_KEY"],
    )
    if not cleanup_synthetic(api):
        print(json.dumps({"ok": False, "error": "Could not clean previous synthetic fixtures"}))
        return 1
    run_id = uuid.uuid4().hex[:12]
    password = f"Sg!{secrets.token_urlsafe(24)}9z"
    users: list[str] = []
    object_paths: list[str] = []
    process_id: str | None = None
    checks: list[str] = []

    def create_user(label: str, role: str | None) -> tuple[str, str]:
        email = f"sigec-test-{label}-{run_id}@example.invalid"
        payload: dict[str, Any] = {"email": email, "password": password, "email_confirm": True}
        if role:
            payload["app_metadata"] = {"role": role}
        status, body = api.request("POST", "/auth/v1/admin/users", service=True, body=payload)
        expect_status(f"create_user_{label}", status, {200}, checks)
        user_id = body["id"]
        users.append(user_id)
        status, token_body = api.create_email_link_session(email)
        expect_status(f"login_{label}", status, {200}, checks)
        return user_id, token_body["access_token"]

    try:
        candidate_a, token_a = create_user("candidate-a", "candidato")
        candidate_b, token_b = create_user("candidate-b", "candidato")
        manager, token_manager = create_user("manager", "gerente")
        _, token_attendant = create_user("attendant", "atendente")
        _, token_no_role = create_user("no-role", "sem_acesso")

        now = datetime.now(timezone.utc)
        profile_rows = [
            {
                "user_id": candidate_a, "full_name": "Candidato Sintético A",
                "cpf": f"{int(run_id[:8], 16) % 100000000:08d}101", "birth_date": "1990-01-01",
                "whatsapp": f"5598{int(run_id[:7], 16) % 1000000000:09d}", "city": "São Luís",
                "state": "MA", "whatsapp_verified_at": now.isoformat(),
                "profile_completed_at": now.isoformat(),
            },
            {
                "user_id": candidate_b, "full_name": "Candidato Sintético B",
                "cpf": f"{int(run_id[2:10], 16) % 100000000:08d}202", "birth_date": "1991-01-01",
                "whatsapp": f"5599{int(run_id[1:8], 16) % 1000000000:09d}", "city": "São Luís",
                "state": "MA", "whatsapp_verified_at": now.isoformat(),
                "profile_completed_at": now.isoformat(),
            },
        ]
        status, _ = api.request("POST", "/rest/v1/sigec_candidate_profiles", service=True,
                                body=profile_rows, prefer="return=minimal")
        expect_status("seed_profiles", status, {201}, checks)

        process_payload = {
            "title": f"Processo sintético {run_id}", "slug": f"processo-sintetico-{run_id}",
            "status": "open", "edital_version": "test",
            "published_at": (now - timedelta(minutes=5)).isoformat(),
            "applications_open_at": (now - timedelta(hours=1)).isoformat(),
            "applications_close_at": (now + timedelta(hours=1)).isoformat(),
            "created_by": manager,
        }
        status, body = api.request("POST", "/rest/v1/sigec_processes", service=True,
                                   body=process_payload, prefer="return=representation")
        expect_status("seed_process", status, {201}, checks)
        process_id = body[0]["id"]
        status, body = api.request("POST", "/rest/v1/sigec_applications", service=True,
                                   body={"process_id": process_id, "candidate_id": candidate_a},
                                   prefer="return=representation")
        expect_status("seed_application", status, {201}, checks)
        application_id = body[0]["id"]

        process_filter = f"id=eq.{process_id}&select=id"
        expect_rows("anon_reads_published_process", *api.request("GET", f"/rest/v1/sigec_processes?{process_filter}"), 1, checks)
        expect_rows("candidate_a_reads_own_profile", *api.request("GET", f"/rest/v1/sigec_candidate_profiles?user_id=eq.{candidate_a}&select=user_id", token=token_a), 1, checks)
        expect_rows("candidate_a_cannot_read_b", *api.request("GET", f"/rest/v1/sigec_candidate_profiles?user_id=eq.{candidate_b}&select=user_id", token=token_a), 0, checks)
        expect_rows("candidate_b_cannot_read_a", *api.request("GET", f"/rest/v1/sigec_candidate_profiles?user_id=eq.{candidate_a}&select=user_id", token=token_b), 0, checks)
        expect_rows("candidate_a_reads_own_application", *api.request("GET", f"/rest/v1/sigec_applications?id=eq.{application_id}&select=id", token=token_a), 1, checks)
        expect_rows("candidate_b_cannot_read_a_application", *api.request("GET", f"/rest/v1/sigec_applications?id=eq.{application_id}&select=id", token=token_b), 0, checks)
        fixture_profiles = f"/rest/v1/sigec_candidate_profiles?user_id=in.({candidate_a},{candidate_b})&select=user_id"
        expect_rows("manager_reads_profiles", *api.request("GET", fixture_profiles, token=token_manager), 2, checks)
        expect_rows("attendant_has_no_sigec_profile_access", *api.request("GET", "/rest/v1/sigec_candidate_profiles?select=user_id", token=token_attendant), 0, checks)
        expect_rows("no_role_has_no_sigec_profile_access", *api.request("GET", "/rest/v1/sigec_candidate_profiles?select=user_id", token=token_no_role), 0, checks)

        status, _ = api.request("PATCH", f"/rest/v1/sigec_candidate_profiles?user_id=eq.{candidate_a}",
                                token=token_a, body={"whatsapp_verified_at": None})
        expect_status("candidate_cannot_self_verify", status, {401, 403}, checks)
        status, error_body = api.request("POST", "/rest/v1/sigec_applications", token=token_a,
                                         body={"process_id": process_id, "candidate_id": candidate_b})
        if status not in {401, 403}:
            detail = {
                "code": error_body.get("code"), "message": error_body.get("message")
            } if isinstance(error_body, dict) else {"responseType": type(error_body).__name__}
            raise AssertionError(
                f"candidate_cannot_apply_as_another_user: expected HTTP [401, 403], got {status}, detail={detail}"
            )
        checks.append("candidate_cannot_apply_as_another_user")
        status, _ = api.request("GET", "/rest/v1/sigec_internal_notes?select=id", token=token_a)
        expect_status("candidate_cannot_read_internal_notes", status, {401, 403}, checks)

        own_path = f"{candidate_a}/{application_id}/proof-{run_id}.pdf"
        forged_path = f"{candidate_b}/{application_id}/forged-{run_id}.pdf"
        diligence_path = f"{candidate_a}/{application_id}/diligence-{run_id}.pdf"
        expired_path = f"{candidate_a}/{application_id}/expired-{run_id}.pdf"
        pdf = b"%PDF-1.4\n% synthetic SIGEC security fixture\n%%EOF\n"

        status, _ = api.request("POST", f"/storage/v1/object/{BUCKET}/{own_path}", token=token_a,
                                body=pdf, content_type="application/pdf")
        expect_status("candidate_uploads_own_application", status, {200}, checks)
        object_paths.append(own_path)
        status, _ = api.request("POST", f"/storage/v1/object/{BUCKET}/{forged_path}", token=token_a,
                                body=pdf, content_type="application/pdf")
        expect_status("candidate_cannot_forge_storage_owner", status, {400, 401, 403}, checks)
        status, _ = api.request("GET", f"/storage/v1/object/authenticated/{BUCKET}/{own_path}", token=token_b)
        expect_status("candidate_b_cannot_read_a_object", status, {400, 401, 403, 404}, checks)
        status, _ = api.request("GET", f"/storage/v1/object/authenticated/{BUCKET}/{own_path}", token=token_manager)
        expect_status("manager_reads_candidate_object", status, {200}, checks)
        status, _ = api.request("POST", f"/storage/v1/object/{BUCKET}/{own_path}", token=token_a,
                                body=pdf, content_type="application/pdf", prefer=None)
        expect_status("candidate_cannot_overwrite_immutable_object", status, {400, 401, 403, 409}, checks)

        status, _ = api.request("PATCH", f"/rest/v1/sigec_processes?id=eq.{process_id}", service=True,
                                body={"applications_close_at": (now - timedelta(minutes=1)).isoformat()})
        expect_status("close_process_window", status, {204}, checks)
        status, _ = api.request("POST", f"/storage/v1/object/{BUCKET}/{expired_path}", token=token_a,
                                body=pdf, content_type="application/pdf")
        expect_status("candidate_cannot_upload_after_deadline", status, {400, 401, 403}, checks)

        status, body = api.request("POST", "/rest/v1/sigec_information_requests", service=True, body={
            "application_id": application_id, "message": "Comprovação adicional sintética",
            "requested_fields": ["document"], "due_at": (now + timedelta(hours=1)).isoformat(),
            "requested_by": manager,
        }, prefer="return=representation")
        expect_status("open_diligence", status, {201}, checks)
        request_id = body[0]["id"]
        status, _ = api.request("POST", f"/storage/v1/object/{BUCKET}/{diligence_path}", token=token_a,
                                body=pdf, content_type="application/pdf")
        expect_status("candidate_uploads_during_diligence", status, {200}, checks)
        object_paths.append(diligence_path)
        status, _ = api.request("PATCH", f"/rest/v1/sigec_information_requests?id=eq.{request_id}",
                                service=True, body={"due_at": (now - timedelta(minutes=1)).isoformat()})
        expect_status("expire_diligence", status, {204}, checks)
        status, _ = api.request("POST", f"/storage/v1/object/{BUCKET}/{expired_path}", token=token_a,
                                body=pdf, content_type="application/pdf")
        expect_status("expired_diligence_does_not_reopen_upload", status, {400, 401, 403}, checks)

        cleaned = cleanup_synthetic(api)
        if not cleaned:
            raise AssertionError("Synthetic fixtures were not fully cleaned")
        process_id = None
        users.clear()
        print(json.dumps({"ok": True, "checks": len(checks), "fixturesCleaned": cleaned}, indent=2))
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "checksPassed": len(checks), "error": str(error)}, ensure_ascii=False, indent=2))
        return 1
    finally:
        for object_path in object_paths:
            api.request("DELETE", f"/storage/v1/object/{BUCKET}/{quote(object_path, safe='/')}", service=True)
        if process_id:
            api.request("DELETE", f"/rest/v1/sigec_applications?process_id=eq.{process_id}", service=True)
            api.request("DELETE", f"/rest/v1/sigec_processes?id=eq.{process_id}", service=True)
        for user_id in reversed(users):
            api.request("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)
        cleanup_synthetic(api)


if __name__ == "__main__":
    sys.exit(main())
