import argparse
import json
import os
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def get_required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required.")
    return value


def get_config() -> dict[str, str]:
    return {
        "base_url": get_required_env("EVOLUTION_API_URL").rstrip("/"),
        "api_key": get_required_env("EVOLUTION_API_KEY"),
        "instance": get_required_env("EVOLUTION_INSTANCE_NAME"),
    }


def get_headers() -> dict[str, str]:
    config = get_config()
    return {
        "Content-Type": "application/json",
        "apikey": config["api_key"],
    }


def get_webhook_url() -> str:
    app_url = get_required_env("NEXT_PUBLIC_APP_URL").rstrip("/")
    secret = os.environ.get("WEBHOOK_SECRET")
    webhook_url = f"{app_url}/api/webhook/evolution"
    if not secret:
        return webhook_url
    return f"{webhook_url}?secret={secret}"


def request_json(method: str, path: str, payload: Any | None = None) -> Any:
    config = get_config()
    url = f"{config['base_url']}{path}"
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(url, data=body, method=method, headers=get_headers())

    try:
        with urlopen(request) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Evolution API error {exc.code} on {path}: {raw}") from exc


def configure_webhook() -> dict[str, Any]:
    config = get_config()
    payload = {
        "enabled": True,
        "url": get_webhook_url(),
        "webhookByEvents": False,
        "webhookBase64": True,
        "events": ["MESSAGES_UPSERT"],
    }
    return request_json("POST", f"/webhook/set/{config['instance']}", payload)


def create_instance() -> dict[str, Any]:
    config = get_config()
    payload = {
        "instanceName": config["instance"],
        "integration": "WHATSAPP-BAILEYS",
        "qrcode": False,
        "webhook": {
            "url": get_webhook_url(),
            "byEvents": False,
            "base64": True,
            "events": ["MESSAGES_UPSERT"],
        },
    }
    try:
        result = request_json("POST", "/instance/create", payload)
    except RuntimeError as exc:
        message = str(exc).lower()
        if "already" in message or "exists" in message or "409" in message:
            configure_webhook()
            return {"instanceName": config["instance"], "alreadyExists": True}
        raise

    configure_webhook()
    return {"instanceName": config["instance"], "alreadyExists": False, "raw": result}


def get_status() -> dict[str, Any]:
    config = get_config()
    try:
        data = request_json("GET", f"/instance/connectionState/{config['instance']}")
    except RuntimeError as exc:
        message = str(exc)
        if "404" in message:
            return {"state": "unknown", "exists": False, "instanceName": config["instance"]}
        return {"state": "unknown", "exists": True, "instanceName": config["instance"], "error": message}

    instance = data.get("instance") or {}
    return {
        "state": instance.get("state") or data.get("state") or "unknown",
        "exists": True,
        "instanceName": config["instance"],
        "profileName": instance.get("profileName"),
        "profilePicUrl": instance.get("profilePicUrl"),
    }


def disconnect() -> dict[str, Any]:
    config = get_config()
    return request_json("DELETE", f"/instance/logout/{config['instance']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Operate Evolution API instance and webhook.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("status")
    subparsers.add_parser("configure-webhook")
    subparsers.add_parser("create")
    subparsers.add_parser("disconnect")
    args = parser.parse_args()

    if args.command == "status":
        result = get_status()
    elif args.command == "configure-webhook":
        result = configure_webhook()
    elif args.command == "create":
        result = create_instance()
    else:
        result = disconnect()

    print(json.dumps(result, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
