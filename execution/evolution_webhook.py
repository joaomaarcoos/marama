import argparse
import json
import sys
from pathlib import Path
from typing import Any


SUPPORTED_EVENTS = {"messages.upsert", "MESSAGES_UPSERT"}


def normalize_conversation_id(value: Any) -> str | None:
    if not value:
        return None
    raw = str(value).strip()
    if not raw or raw.endswith("@g.us"):
        return None
    if raw.endswith("@lid"):
        return raw
    if "@" in raw:
        raw = raw.split("@", 1)[0]
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) < 8:
        return raw or None
    if digits.startswith("55") and len(digits) >= 12:
        return digits
    if len(digits) in (10, 11):
        return f"55{digits}"
    return digits


def resolve_contact_ids(data: dict[str, Any], key: dict[str, Any]) -> dict[str, str] | None:
    original_jid = key.get("remoteJid")
    original_id = normalize_conversation_id(original_jid)
    if not original_id:
        return None

    candidates = [
        key.get("remoteJidAlt"),
        data.get("remoteJidAlt"),
        key.get("participantAlt"),
        data.get("participantAlt"),
        key.get("senderPn"),
        data.get("senderPn"),
        key.get("participant"),
        data.get("participant"),
        original_jid,
    ]
    preferred_real = next((value for value in candidates if value and not str(value).endswith("@lid")), None)
    real_id = normalize_conversation_id(preferred_real)

    return {
        "jid_original": str(original_jid),
        "jid_real": str(preferred_real) if preferred_real else str(original_jid),
        "conversation_id": real_id or original_id,
    }


def load_payload(payload_path: str) -> dict[str, Any]:
    if payload_path == "-":
        return json.load(sys.stdin)
    return json.loads(Path(payload_path).read_text(encoding="utf-8"))


def normalize_payload(body: dict[str, Any]) -> dict[str, Any] | None:
    event = body.get("event")
    if event not in SUPPORTED_EVENTS:
        return None

    data = body.get("data") or {}
    key = data.get("key") or {}
    if key.get("fromMe") is True:
        return None

    resolved_contact = resolve_contact_ids(data, key)
    if not resolved_contact:
        return None
    message_data = data.get("message") or {}
    if not isinstance(message_data, dict):
        return None

    normalized = {
        "event": event,
        "phone": resolved_contact["conversation_id"],
        "jid_original": resolved_contact["jid_original"],
        "jid_real": resolved_contact["jid_real"],
        "message": {
            "type": "unknown",
            "text": None,
            "caption": None,
            "mediaId": None,
            "mimetype": None,
        },
    }

    if message_data.get("conversation"):
        normalized["message"]["type"] = "text"
        normalized["message"]["text"] = message_data.get("conversation")
    elif message_data.get("extendedTextMessage"):
        extended = message_data.get("extendedTextMessage") or {}
        normalized["message"]["type"] = "text"
        normalized["message"]["text"] = extended.get("text")
    elif message_data.get("audioMessage"):
        audio = message_data.get("audioMessage") or {}
        normalized["message"]["type"] = "audio"
        normalized["message"]["mediaId"] = key.get("id")
        normalized["message"]["mimetype"] = audio.get("mimetype") or "audio/ogg"
    elif message_data.get("imageMessage"):
        image = message_data.get("imageMessage") or {}
        normalized["message"]["type"] = "image"
        normalized["message"]["mediaId"] = key.get("id")
        normalized["message"]["caption"] = image.get("caption")
        normalized["message"]["mimetype"] = image.get("mimetype") or "image/jpeg"
    elif message_data.get("documentMessage"):
        document = message_data.get("documentMessage") or {}
        normalized["message"]["type"] = "document"
        title = document.get("title") or "sem titulo"
        normalized["message"]["text"] = f"[Documento recebido: {title}]"

    if normalized["message"]["type"] == "unknown" and not normalized["message"]["text"]:
        return None

    return normalized


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize Evolution webhook payloads for replay/debug.")
    parser.add_argument("--payload", required=True, help="Path to a raw webhook JSON file or '-' for stdin.")
    parser.add_argument("--write-normalized", help="Optional path to persist normalized JSON.")
    parser.add_argument("--fail-on-ignored", action="store_true", help="Exit non-zero when the event is ignored.")
    args = parser.parse_args()

    payload = load_payload(args.payload)
    normalized = normalize_payload(payload)

    if normalized is None:
        result = {"processed": False, "reason": "ignored_by_filters"}
        print(json.dumps(result, ensure_ascii=True, indent=2))
        return 1 if args.fail_on_ignored else 0

    if args.write_normalized:
        Path(args.write_normalized).write_text(json.dumps(normalized, ensure_ascii=True, indent=2), encoding="utf-8")

    print(json.dumps({"processed": True, "normalized": normalized}, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
