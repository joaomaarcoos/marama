"""Audita consistência mínima do handoff/status do SIGEC Processos."""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / "docs" / "sigec-handoff-status.md"

REQUIRED_SECTIONS = (
    "## 1. Objetivo deste arquivo",
    "## 2. Resumo executivo",
    "## 3. Regras extraídas",
    "## 4. Decisões normativas pendentes",
    "## 5. Plano priorizado de execução",
    "## 6. Auditoria do plano",
    "## 7. Protocolo obrigatório de atualização",
    "## 8. Histórico de execução",
)

REQUIRED_PREFIXES = (
    "SIGEC-FND-",
    "SIGEC-DEC-",
    "SIGEC-P0-",
    "SIGEC-P1-",
    "SIGEC-P2-",
    "SIGEC-P3-",
    "SIGEC-P4-",
    "SIGEC-P5-",
    "SIGEC-P6-",
    "SIGEC-P7-",
    "SIGEC-P8-",
    "SIGEC-P9-",
    "SIGEC-P10-",
)

REQUIRED_CONTROLS = (
    "RLS",
    "Storage",
    "CAPTCHA",
    "rate limit",
    "antimalware",
    "idempotente",
    "snapshot",
    "MFA",
    "LGPD",
    "America/Sao_Paulo",
    "uma inscrição",
    "30 pontos",
    "produção acadêmica",
)


def main() -> int:
    findings: list[dict[str, str]] = []
    if not PLAN.is_file():
        print(json.dumps({"ok": False, "findings": [{"severity": "critical", "detail": "Arquivo de plano ausente"}]}, ensure_ascii=False, indent=2))
        return 1

    text = PLAN.read_text(encoding="utf-8")

    for section in REQUIRED_SECTIONS:
        if section not in text:
            findings.append({"severity": "high", "check": "required_section", "detail": section})

    task_matches = re.findall(r"- \[([ xX])\] (SIGEC-[A-Z0-9-]+)\s+—", text)
    task_ids = [task_id for _, task_id in task_matches]
    duplicates = sorted(task_id for task_id, count in Counter(task_ids).items() if count > 1)
    if duplicates:
        findings.append({"severity": "high", "check": "duplicate_task_ids", "detail": ", ".join(duplicates)})

    for prefix in REQUIRED_PREFIXES:
        if not any(task_id.startswith(prefix) for task_id in task_ids):
            findings.append({"severity": "high", "check": "missing_task_family", "detail": prefix})

    for control in REQUIRED_CONTROLS:
        if control.lower() not in text.lower():
            findings.append({"severity": "high", "check": "missing_control", "detail": control})

    completed = sum(mark.lower() == "x" for mark, _ in task_matches)
    pending = len(task_matches) - completed
    result = {
        "ok": not findings,
        "plan": str(PLAN.relative_to(ROOT)),
        "tasks": len(task_matches),
        "completed": completed,
        "pending": pending,
        "findings": findings,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
