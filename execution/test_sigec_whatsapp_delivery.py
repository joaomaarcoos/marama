"""Run one authorized end-to-end SIGEC WhatsApp OTP delivery smoke.

The generated code exists only in process memory and is sent through Evolution.
Supabase stores its HMAC. A small local state file retains only identifiers needed
to validate the code on a later invocation. The synthetic user is removed after
successful validation or by the explicit cleanup command.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from pathlib import Path
import re
import secrets
import uuid
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = ROOT / ".tmp" / "sigec-whatsapp-delivery.json"


def normalize_brazil_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if len(digits) in {10, 11}:
        digits = "55" + digits
    if not re.fullmatch(r"55[1-9][0-9]{9,10}", digits):
        raise ValueError("Informe um telefone brasileiro com DDD.")
    return digits


def mask_phone(phone: str) -> str:
    return f"+{phone[:2]} ({phone[2:4]}) *****-{phone[-4:]}"


def code_hash(secret: str, verification_id: str, code: str) -> str:
    return hmac.new(secret.encode(), f"{verification_id}:{code}".encode(), hashlib.sha256).hexdigest()


def cleanup_fixture(api: Api, state: dict[str, str], *, remove_state: bool = True) -> bool:
    user_id = state.get("userId")
    if not user_id:
        return False
    api.request("DELETE", f"/rest/v1/sigec_audit_events?actor_id=eq.{user_id}", service=True)
    status, _ = api.request("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)
    cleaned = status in {200, 204, 404}
    if cleaned and remove_state:
        STATE_PATH.unlink(missing_ok=True)
    return cleaned


def load_state() -> dict[str, str]:
    if not STATE_PATH.is_file():
        raise RuntimeError("Nenhum teste de entrega esta pendente.")
    data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError("Estado local do teste invalido.")
    return {str(key): str(value) for key, value in data.items()}


def send_evolution(env: dict[str, str], phone: str, message: str) -> None:
    url = (
        env["EVOLUTION_API_URL"].rstrip("/")
        + "/message/sendText/"
        + env["EVOLUTION_INSTANCE_NAME"]
    )
    request = Request(
        url,
        data=json.dumps({"number": phone, "text": message}).encode("utf-8"),
        headers={"Content-Type": "application/json", "apikey": env["EVOLUTION_API_KEY"]},
        method="POST",
    )
    try:
        with urlopen(request, timeout=15) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"Evolution recusou o envio: HTTP {response.status}")
    except HTTPError as error:
        raise RuntimeError(f"Evolution recusou o envio: HTTP {error.code}") from error


def issue(phone_raw: str) -> int:
    env = load_env()
    otp_secret = env.get("SIGEC_WHATSAPP_OTP_SECRET", "")
    if len(otp_secret) < 32:
        raise RuntimeError("SIGEC_WHATSAPP_OTP_SECRET nao esta configurado.")
    phone = normalize_brazil_phone(phone_raw)
    api = Api(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"], env["SUPABASE_SERVICE_ROLE_KEY"])

    if STATE_PATH.is_file():
        previous = load_state()
        expires_at = datetime.fromisoformat(previous["expiresAt"])
        if expires_at > datetime.now(timezone.utc):
            raise RuntimeError("Ja existe um teste de entrega ativo. Valide ou limpe antes de reenviar.")
        cleanup_fixture(api, previous)

    run_id = uuid.uuid4().hex[:12]
    user_id: str | None = None
    state: dict[str, str] = {}
    try:
        signup_nonce = secrets.token_hex(32)
        status, _ = api.request("POST", "/rest/v1/sigec_candidate_signup_nonces", service=True, body={
            "nonce_digest": hashlib.sha256(signup_nonce.encode()).hexdigest(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
        })
        if status not in {200, 201}:
            raise RuntimeError(f"Nao foi possivel preparar a fixture: HTTP {status}")

        status, created = api.request("POST", "/auth/v1/admin/users", service=True, body={
            "email": f"sigec-delivery-{run_id}@example.invalid",
            "password": f"Otp!{secrets.token_urlsafe(24)}8z",
            "email_confirm": True,
            "user_metadata": {
                "full_name": "Candidato Teste Entrega OTP",
                "cpf": valid_cpf(f"{int(run_id[:8], 16) % 1_000_000_000:09d}"),
                "birth_date": "1991-06-20",
                "whatsapp": phone,
                "city": "Sao Luis",
                "state": "MA",
                "sigec_candidate_signup": True,
                "sigec_signup_nonce": signup_nonce,
            },
        })
        if status != 200 or not isinstance(created, dict) or not created.get("id"):
            raise RuntimeError(f"Nao foi possivel criar a fixture: HTTP {status}")
        user_id = str(created["id"])

        verification_id = str(uuid.uuid4())
        code = f"{secrets.randbelow(1_000_000):06d}"
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
        status, issue_result = api.request(
            "POST",
            "/rest/v1/rpc/sigec_issue_whatsapp_verification",
            service=True,
            body={
                "p_verification_id": verification_id,
                "p_user_id": user_id,
                "p_whatsapp": phone,
                "p_code_hash": code_hash(otp_secret, verification_id, code),
                "p_expires_at": expires_at.isoformat(),
                "p_request_ip_digest": hashlib.sha256(secrets.token_bytes(32)).hexdigest(),
            },
        )
        if status != 200 or issue_result != "issued":
            raise RuntimeError(f"Supabase recusou a emissao do OTP: HTTP {status}")

        send_evolution(
            env,
            phone,
            f"SIGEC Processos: seu codigo de verificacao e {code}. Ele expira em 10 minutos. Nao compartilhe este codigo.",
        )
        status, _ = api.request(
            "PATCH",
            f"/rest/v1/sigec_whatsapp_verifications?id=eq.{verification_id}",
            service=True,
            body={"sent_at": datetime.now(timezone.utc).isoformat()},
        )
        if status not in {200, 204}:
            raise RuntimeError(f"Envio ocorreu, mas o registro de entrega falhou: HTTP {status}")

        state = {
            "userId": user_id,
            "verificationId": verification_id,
            "expiresAt": expires_at.isoformat(),
            "maskedPhone": mask_phone(phone),
        }
        STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        if user_id:
            cleanup_fixture(api, {"userId": user_id})
        raise

    print(json.dumps({
        "ok": True,
        "status": "sent",
        "phone": state["maskedPhone"],
        "expiresAt": state["expiresAt"],
        "plaintextStored": False,
        "fixturePendingCleanup": True,
    }, ensure_ascii=False, indent=2))
    return 0


def verify(code: str) -> int:
    if not re.fullmatch(r"\d{6}", code):
        raise ValueError("O codigo deve conter seis digitos.")
    env = load_env()
    state = load_state()
    api = Api(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"], env["SUPABASE_SERVICE_ROLE_KEY"])
    expires_at = datetime.fromisoformat(state["expiresAt"])
    if expires_at <= datetime.now(timezone.utc):
        cleaned = cleanup_fixture(api, state)
        print(json.dumps({"ok": False, "status": "expired", "fixturesCleaned": cleaned}, indent=2))
        return 1

    status, result = api.request(
        "POST",
        "/rest/v1/rpc/sigec_verify_whatsapp_code",
        service=True,
        body={
            "p_verification_id": state["verificationId"],
            "p_user_id": state["userId"],
            "p_code_hash": code_hash(env["SIGEC_WHATSAPP_OTP_SECRET"], state["verificationId"], code),
        },
    )
    if status != 200:
        raise RuntimeError(f"Supabase recusou a validacao: HTTP {status}")
    if result == "verified":
        check_status, rows = api.request(
            "GET",
            f"/rest/v1/sigec_candidate_profiles?user_id=eq.{state['userId']}&select=whatsapp_verified_at",
            service=True,
        )
        marked = check_status == 200 and isinstance(rows, list) and bool(rows) and bool(rows[0].get("whatsapp_verified_at"))
        cleaned = cleanup_fixture(api, state)
        print(json.dumps({
            "ok": marked and cleaned,
            "status": "verified" if marked else "verification_not_persisted",
            "profileMarked": marked,
            "fixturesCleaned": cleaned,
        }, indent=2))
        return 0 if marked and cleaned else 1

    print(json.dumps({"ok": False, "status": result, "fixturesCleaned": False}, indent=2))
    return 1


def cleanup() -> int:
    env = load_env()
    state = load_state()
    api = Api(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"], env["SUPABASE_SERVICE_ROLE_KEY"])
    cleaned = cleanup_fixture(api, state)
    print(json.dumps({"ok": cleaned, "status": "cleaned" if cleaned else "cleanup_failed"}, indent=2))
    return 0 if cleaned else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Authorized SIGEC WhatsApp OTP delivery smoke.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    issue_parser = subparsers.add_parser("issue")
    issue_parser.add_argument("--phone", required=True)
    verify_parser = subparsers.add_parser("verify")
    verify_parser.add_argument("--code", required=True)
    subparsers.add_parser("cleanup")
    args = parser.parse_args()

    try:
        if args.command == "issue":
            return issue(args.phone)
        if args.command == "verify":
            return verify(args.code)
        return cleanup()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
