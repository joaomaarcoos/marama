"""Verify that the public sitekey exists and Supabase Auth enforces CAPTCHA.

No real account is used or created. The request intentionally omits a CAPTCHA
token and must be rejected by Supabase before credential validation.
"""

from __future__ import annotations

import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from test_sigec_remote_access import load_env


def main() -> int:
    env = load_env()
    sitekey = env.get("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    if not sitekey:
        print(json.dumps({"ok": False, "error": "turnstile_sitekey_missing"}, indent=2))
        return 1

    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/auth/v1/token?grant_type=password"
    anon_key = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    request = Request(
        url,
        data=json.dumps({
            "email": "sigec-captcha-probe@example.invalid",
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

    code = body.get("code") if isinstance(body, dict) else None
    message = str(body.get("message") or body.get("msg") or body.get("error_description") or "") if isinstance(body, dict) else ""
    captcha_enforced = code == "captcha_verification_failed" or "captcha" in message.lower()
    if captcha_enforced:
        response_category = "captcha_required"
    elif "invalid login credentials" in message.lower():
        response_category = "credentials_checked_without_captcha"
    else:
        response_category = "unexpected_auth_error"
    result = {
        "ok": status == 400 and captcha_enforced,
        "sitekeyConfigured": True,
        "supabaseCaptchaEnforced": captcha_enforced,
        "httpStatus": status,
        "errorCode": code,
        "responseCategory": response_category,
        "authMessage": message[:160],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
