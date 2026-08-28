"""Audit SIGEC P1 runtime readiness without exposing secret values.

This gate is intentionally read-only. It validates local configuration, checks
that secrets are independent, probes Supabase CAPTCHA enforcement, and confirms
that the configured Evolution instance is connected. It never creates users,
sends messages, or prints credentials.
"""

from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from evolution_api import get_status
from test_sigec_remote_access import load_env


def probe_captcha(env: dict[str, str]) -> dict[str, Any]:
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/auth/v1/token?grant_type=password"
    anon_key = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    request = Request(
        url,
        data=json.dumps({
            "email": "sigec-p1-readiness@example.invalid",
            "password": "NotARealCredential!123",
        }).encode("utf-8"),
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    status = 0
    body: object = {}
    try:
        with urlopen(request, timeout=30) as response:
            status = response.status
            body = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        status = error.code
        body = json.loads(error.read().decode("utf-8"))

    message = ""
    if isinstance(body, dict):
        message = str(body.get("message") or body.get("msg") or body.get("error_description") or "")
    return {
        "enforced": status == 400 and "captcha" in message.lower(),
        "httpStatus": status,
    }


def main() -> int:
    env = load_env()
    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool, blocker: str) -> None:
        checks.append({"name": name, "ok": passed, "blocker": None if passed else blocker})

    sitekey = env.get("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    rate_secret = env.get("SIGEC_RATE_LIMIT_SECRET", "")
    otp_secret = env.get("SIGEC_WHATSAPP_OTP_SECRET", "")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    webhook_secret = env.get("WEBHOOK_SECRET", "")

    check("turnstile_sitekey", bool(sitekey), "NEXT_PUBLIC_TURNSTILE_SITE_KEY ausente")
    check(
        "captcha_expected_by_app",
        env.get("SIGEC_SUPABASE_CAPTCHA_ENABLED") == "true",
        "SIGEC_SUPABASE_CAPTCHA_ENABLED deve ser true no ambiente que receber a nova versao",
    )
    check("rate_limit_secret", len(rate_secret) >= 32, "SIGEC_RATE_LIMIT_SECRET deve ter ao menos 32 caracteres")
    check("whatsapp_otp_secret", len(otp_secret) >= 32, "SIGEC_WHATSAPP_OTP_SECRET deve ter ao menos 32 caracteres")
    check(
        "secrets_are_independent",
        not (rate_secret and otp_secret)
        or len({rate_secret, otp_secret, service_key, webhook_secret}) == 4,
        "os segredos SIGEC devem ser distintos entre si e das demais credenciais",
    )
    check(
        "evolution_configuration",
        all(env.get(name) for name in ("EVOLUTION_API_URL", "EVOLUTION_API_KEY", "EVOLUTION_INSTANCE_NAME")),
        "configuracao da Evolution incompleta",
    )

    try:
        captcha = probe_captcha(env)
        check("supabase_captcha_enforced", captcha["enforced"], "Supabase Auth nao exigiu CAPTCHA")
    except Exception as error:  # noqa: BLE001 - report a safe class name only
        captcha = {"enforced": False, "errorType": type(error).__name__}
        check("supabase_captcha_enforced", False, "nao foi possivel validar o CAPTCHA no Supabase")

    try:
        evolution = get_status()
        check("evolution_instance_open", evolution.get("state") == "open", "instancia Evolution nao esta conectada")
    except Exception as error:  # noqa: BLE001 - report a safe class name only
        evolution = {"state": "unknown", "errorType": type(error).__name__}
        check("evolution_instance_open", False, "nao foi possivel validar a instancia Evolution")

    blockers = [item["blocker"] for item in checks if not item["ok"]]
    result = {
        "ok": not blockers,
        "registrationEnabled": env.get("SIGEC_CANDIDATE_REGISTRATION_ENABLED") == "true",
        "checks": checks,
        "external": {
            "captchaEnforced": captcha.get("enforced", False),
            "evolutionState": evolution.get("state", "unknown"),
        },
        "blockerCount": len(blockers),
        "blockers": blockers,
        "notes": [
            "Este gate nao envia WhatsApp e nao substitui o smoke com token Turnstile valido no hostname oficial.",
            "Mantenha SIGEC_CANDIDATE_REGISTRATION_ENABLED=false ate todos os bloqueios serem resolvidos.",
        ],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
