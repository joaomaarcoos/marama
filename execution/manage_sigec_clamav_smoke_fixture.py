"""Create or remove the persistent candidate used by the production ClamAV smoke.

The fixture is private (draft process), clearly labelled as synthetic and can be
removed with the ``cleanup`` action after the clean/EICAR checks. Credentials are
written only under ``.tmp`` and are never printed by this program.
"""

from __future__ import annotations

import argparse
import json
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.local"
CREDENTIALS_PATH = ROOT / ".tmp" / "sigec-clamav-smoke-credentials.json"
EXPECTED_PROJECT_URL = "https://hvvgyiafelqylbzkzjbi.supabase.co"
EMAIL = "sigec-smoke-clamav@example.invalid"
PROCESS_SLUG = "sigec-smoke-clamav"
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
        service: bool = True,
        token: str | None = None,
        body: Any = None,
        prefer: str | None = None,
    ) -> tuple[int, Any]:
        api_key = self.service_key if service else self.anon_key
        bearer = self.service_key if service else (token or self.anon_key)
        headers = {"apikey": api_key, "Authorization": f"Bearer {bearer}"}
        if prefer:
            headers["Prefer"] = prefer
        data = None if body is None else json.dumps(body).encode("utf-8")
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = Request(f"{self.url}{path}", data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=30) as response:
                return response.status, self._decode(response.read())
        except HTTPError as error:
            return error.code, self._decode(error.read())

    def delete_object(self, path: str) -> tuple[int, Any]:
        return self.request("DELETE", f"/storage/v1/object/{BUCKET}/{quote(path, safe='/')}")

    @staticmethod
    def _decode(raw: bytes) -> Any:
        if not raw:
            return None
        text = raw.decode("utf-8", errors="replace")
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text


def require(status: int, expected: set[int], stage: str, body: Any) -> Any:
    if status not in expected:
        detail = body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)
        raise RuntimeError(f"{stage}: HTTP {status}: {detail[:300]}")
    return body


def find_user(api: Api) -> dict[str, Any] | None:
    status, body = api.request("GET", "/auth/v1/admin/users?page=1&per_page=1000")
    require(status, {200}, "list_auth_users", body)
    users = body.get("users", []) if isinstance(body, dict) else []
    return next((user for user in users if user.get("email") == EMAIL), None)


def cleanup(api: Api) -> dict[str, Any]:
    removed_objects = 0
    status, processes = api.request(
        "GET",
        f"/rest/v1/sigec_processes?slug=eq.{PROCESS_SLUG}&select=id",
    )
    require(status, {200}, "find_process", processes)
    for process in processes:
        process_id = process["id"]
        status, documents = api.request(
            "GET",
            "/rest/v1/sigec_application_documents"
            f"?select=storage_path,sigec_applications!inner(process_id)"
            f"&sigec_applications.process_id=eq.{process_id}",
        )
        require(status, {200}, "find_documents", documents)
        for document in documents:
            object_status, object_body = api.delete_object(document["storage_path"])
            object_missing = (
                object_status in {400, 404}
                and isinstance(object_body, dict)
                and object_body.get("code") == "NoSuchKey"
            )
            if not object_missing:
                require(object_status, {200}, "delete_storage_object", object_body)
                removed_objects += 1
        status, body = api.request(
            "DELETE", f"/rest/v1/sigec_applications?process_id=eq.{process_id}"
        )
        require(status, {204}, "delete_applications", body)
        status, body = api.request("DELETE", f"/rest/v1/sigec_processes?id=eq.{process_id}")
        require(status, {204}, "delete_process", body)

    user = find_user(api)
    if user:
        status, body = api.request("DELETE", f"/auth/v1/admin/users/{user['id']}")
        require(status, {200}, "delete_auth_user", body)
    CREDENTIALS_PATH.unlink(missing_ok=True)
    return {
        "processesRemoved": len(processes),
        "objectsRemoved": removed_objects,
        "userRemoved": bool(user),
    }


def valid_cpf(seed: str) -> str:
    digits = [int(char) for char in seed[:9].ljust(9, "1")]
    first_sum = sum(value * weight for value, weight in zip(digits, range(10, 1, -1)))
    first = 0 if 11 - first_sum % 11 >= 10 else 11 - first_sum % 11
    second_sum = sum(value * weight for value, weight in zip(digits + [first], range(11, 1, -1)))
    second = 0 if 11 - second_sum % 11 >= 10 else 11 - second_sum % 11
    return "".join(str(value) for value in digits + [first, second])


def create(api: Api) -> dict[str, Any]:
    cleanup(api)
    password = f"Sg!{secrets.token_urlsafe(24)}9a"
    marker = secrets.token_hex(8)
    user_payload = {
        "email": EMAIL,
        "password": password,
        "email_confirm": True,
        "app_metadata": {"role": "candidato", "sigec_test_fixture": True},
        "user_metadata": {"full_name": "Candidato Teste ClamAV", "sigec_test_fixture": True},
    }
    status, user = api.request("POST", "/auth/v1/admin/users", body=user_payload)
    require(status, {200}, "create_auth_user", user)
    user_id = user["id"]
    process_id: str | None = None
    try:
        numeric_seed = "".join(str(int(char, 16) % 10) for char in marker)
        now = datetime.now(timezone.utc)
        profile = {
            "user_id": user_id,
            "full_name": "Candidato Teste ClamAV",
            "cpf": valid_cpf(numeric_seed),
            "birth_date": "1990-01-01",
            "whatsapp": f"55989{numeric_seed[:8]}",
            "city": "São Luís",
            "state": "MA",
        }
        status, body = api.request(
            "POST", "/rest/v1/sigec_candidate_profiles", body=profile, prefer="return=minimal"
        )
        require(status, {201}, "create_candidate_profile", body)

        process_payload = {
            "title": "[TESTE] Smoke antimalware ClamAV",
            "slug": PROCESS_SLUG,
            "summary": "Fixture privada para homologação do upload e quarentena.",
            "status": "draft",
            "edital_version": "teste-clamav-1",
            "applications_open_at": (now - timedelta(hours=1)).isoformat(),
            "applications_close_at": (now + timedelta(days=7)).isoformat(),
            "created_by": user_id,
        }
        status, body = api.request(
            "POST", "/rest/v1/sigec_processes", body=process_payload, prefer="return=representation"
        )
        require(status, {201}, "create_test_process", body)
        process_id = body[0]["id"]

        requirement_payload = {
            "process_id": process_id,
            "code": "documento_smoke_antimalware",
            "label": "Documento para teste antimalware",
            "instructions": "Use somente arquivos controlados para o smoke limpo/EICAR.",
            "required": True,
            "accepted_mime_types": ["application/pdf", "image/jpeg", "image/png"],
            "max_file_size_bytes": 10485760,
            "position": 1,
        }
        status, body = api.request(
            "POST", "/rest/v1/sigec_document_requirements", body=requirement_payload,
            prefer="return=representation",
        )
        require(status, {201}, "create_document_requirement", body)
        requirement_id = body[0]["id"]

        status, body = api.request(
            "POST", "/rest/v1/sigec_applications",
            body={"process_id": process_id, "candidate_id": user_id, "application_state": "draft"},
            prefer="return=representation",
        )
        require(status, {201}, "create_application", body)
        application_id = body[0]["id"]

        credentials = {
            "email": EMAIL,
            "password": password,
            "loginUrl": "https://mara.joaodantasia.com.br/login",
            "cleanupCommand": "python execution/manage_sigec_clamav_smoke_fixture.py cleanup",
        }
        CREDENTIALS_PATH.parent.mkdir(parents=True, exist_ok=True)
        CREDENTIALS_PATH.write_text(json.dumps(credentials, ensure_ascii=False, indent=2), encoding="utf-8")

        return {
            "userId": user_id,
            "processId": process_id,
            "applicationId": application_id,
            "requirementId": requirement_id,
            "credentialsPath": str(CREDENTIALS_PATH),
        }
    except Exception:
        cleanup(api)
        raise


def status(api: Api) -> dict[str, Any]:
    user = find_user(api)
    process_status, processes = api.request(
        "GET", f"/rest/v1/sigec_processes?slug=eq.{PROCESS_SLUG}&select=id,status,title"
    )
    require(process_status, {200}, "status_process", processes)
    application_count = 0
    requirement_count = 0
    documents: list[dict[str, Any]] = []
    if processes:
        process_id = processes[0]["id"]
        app_status, applications = api.request(
            "GET", f"/rest/v1/sigec_applications?process_id=eq.{process_id}&select=id"
        )
        require(app_status, {200}, "status_application", applications)
        req_status, requirements = api.request(
            "GET", f"/rest/v1/sigec_document_requirements?process_id=eq.{process_id}&select=id"
        )
        require(req_status, {200}, "status_requirement", requirements)
        doc_status, documents = api.request(
            "GET",
            "/rest/v1/sigec_application_documents"
            "?select=id,version,original_name,technical_status,malware_status,malware_scan_attempts,storage_path,"
            "sigec_applications!inner(process_id)"
            f"&sigec_applications.process_id=eq.{process_id}&order=version.asc",
        )
        require(doc_status, {200}, "status_documents", documents)
        application_count = len(applications)
        requirement_count = len(requirements)
    return {
        "authUser": bool(user),
        "role": None if not user else user.get("app_metadata", {}).get("role"),
        "processes": len(processes),
        "applications": application_count,
        "requirements": requirement_count,
        "documents": [
            {
                "id": document["id"],
                "version": document["version"],
                "originalName": document["original_name"],
                "technicalStatus": document["technical_status"],
                "malwareStatus": document["malware_status"],
                "scanAttempts": document["malware_scan_attempts"],
                "storagePath": document["storage_path"],
            }
            for document in documents
        ],
        "credentialsPresent": CREDENTIALS_PATH.is_file(),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("create", "status", "cleanup"))
    args = parser.parse_args()
    env = load_env()
    project_url = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    if project_url != EXPECTED_PROJECT_URL:
        print(json.dumps({"ok": False, "error": "unexpected_project"}))
        return 2
    required = ("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY")
    if any(not env.get(name) for name in required):
        print(json.dumps({"ok": False, "error": "missing_credentials"}))
        return 2
    api = Api(project_url, env[required[0]], env[required[1]])
    try:
        result = create(api) if args.action == "create" else cleanup(api) if args.action == "cleanup" else status(api)
        print(json.dumps({"ok": True, "action": args.action, **result}, ensure_ascii=False, indent=2))
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "action": args.action, "error": str(error)}, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    sys.exit(main())
