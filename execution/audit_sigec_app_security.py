"""Static application security gate for SIGEC role isolation.

Run alongside audit_sigec_security.py before releasing candidate access.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def main() -> int:
    findings: list[dict[str, str]] = []

    checks = {
        "candidate_api_isolation": (
            "middleware.ts",
            "role === 'candidato' && !isCandidateApi",
        ),
        "unknown_role_fails_closed": (
            "lib/roles.ts",
            "? role : 'sem_acesso'",
        ),
        "roles_from_app_metadata": (
            "lib/roles.ts",
            "user?.app_metadata?.role",
        ),
        "webhook_fails_closed": (
            "lib/webhook-auth.ts",
            "if (!expected)",
        ),
        "constant_time_webhook_secret": (
            "lib/webhook-auth.ts",
            "timingSafeEqual",
        ),
        "candidate_layout_guard": (
            "app/(candidate)/minha-area/layout.tsx",
            "role !== 'candidato'",
        ),
        "documents_role_guard": (
            "app/api/documentos/route.ts",
            "requireApiUser(['admin', 'gerente'])",
        ),
        "reports_role_guard": (
            "app/api/relatorios/route.ts",
            "requireApiUser(['admin', 'gerente'])",
        ),
        "logs_admin_guard": (
            "app/api/logs/evolution/route.ts",
            "requireApiUser(['admin'])",
        ),
        "process_manager_guard": (
            "app/(dashboard)/sigec-processos/actions.ts",
            "role === 'admin' || role === 'gerente'",
        ),
        "draft_only_process_edit": (
            "app/(dashboard)/sigec-processos/actions.ts",
            ".eq('status', 'draft')",
        ),
    }

    for name, (path, expected) in checks.items():
        try:
            contents = read(path)
        except FileNotFoundError:
            findings.append({"severity": "critical", "check": name, "detail": f"Missing {path}"})
            continue
        if expected not in contents:
            findings.append({"severity": "high", "check": name, "detail": f"Control absent in {path}"})

    webhook_coord = read("app/api/webhook/evolution-coord/route.ts")
    webhook_mara = read("app/api/webhook/evolution/route.ts")
    for name, contents in (("evolution_coord", webhook_coord), ("evolution", webhook_mara)):
        if "verifyWebhookSecret" not in contents:
            findings.append({"severity": "critical", "check": f"{name}_webhook_auth", "detail": "Webhook has no shared-secret gate."})

    process_actions = read("app/(dashboard)/sigec-processos/actions.ts")
    if ".delete()" in process_actions:
        findings.append({
            "severity": "high",
            "check": "process_archive_is_non_destructive",
            "detail": "Process actions must archive instead of hard deleting records.",
        })

    result = {"ok": not findings, "checks": len(checks) + 3, "findings": findings}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
