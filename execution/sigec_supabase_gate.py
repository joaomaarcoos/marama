"""Safe, deterministic Supabase migration gate for SIGEC.

The command validates the expected project before passing the local credential
to the pinned Supabase CLI. Secrets are never printed. The default action is a
dry-run; applying migrations requires the explicit ``apply`` action.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import quote, unquote


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.local"
EXPECTED_PROJECT_REF = "hvvgyiafelqylbzkzjbi"
EXPECTED_PROJECT_URL = f"https://{EXPECTED_PROJECT_REF}.supabase.co"


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[name] = value
    return values


def credential_args(values: dict[str, str]) -> tuple[list[str], str]:
    project_url = values.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    if project_url != EXPECTED_PROJECT_URL:
        raise ValueError("NEXT_PUBLIC_SUPABASE_URL does not match the approved SIGEC project")

    credential = values.get("POSTGRES", "")
    if not credential:
        raise ValueError("POSTGRES is missing or empty in .env.local")

    if credential.startswith(("postgres://", "postgresql://")):
        scheme, separator, remainder = credential.partition("://")
        authority, at, destination = remainder.rpartition("@")
        username, colon, password = authority.partition(":")
        if not separator or not at or not colon or not username or not password:
            raise ValueError("POSTGRES connection string is incomplete")
        if EXPECTED_PROJECT_REF not in f"{username} {destination}":
            raise ValueError("POSTGRES connection string does not match the approved project")
        normalized_password = quote(unquote(password), safe="")
        normalized = f"{scheme}://{username}:{normalized_password}@{destination}"
        return ["--db-url", normalized], normalized

    return ["--project-ref", EXPECTED_PROJECT_REF, "--password", credential], credential


def sanitized(text: str, secret: str) -> str:
    return text.replace(secret, "[REDACTED]") if secret else text


def validation_sql(contents: str) -> str:
    """Remove migration-level transaction controls before the outer rollback.

    A COMMIT inside a migration would otherwise escape the validation
    transaction and persist objects while still reporting ``rolledBack``.
    PL/pgSQL blocks use ``begin`` without a semicolon and are preserved.
    """
    return re.sub(r"(?im)^\s*(?:begin|commit|rollback)\s*;\s*$", "", contents)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the SIGEC Supabase migration safety gate.")
    parser.add_argument(
        "action",
        choices=("dry-run", "isolated-dry-run", "isolated-validate", "isolated-apply", "verify", "advisors", "advisors-sigec", "history", "fetch-history"),
        nargs="?",
        default="dry-run",
    )
    args = parser.parse_args()

    if not ENV_PATH.is_file():
        raise SystemExit(".env.local not found")

    values = load_env(ENV_PATH)
    try:
        connection_args, secret = credential_args(values)
    except ValueError as error:
        print(json.dumps({"ok": False, "stage": "preflight", "error": str(error)}, ensure_ascii=False))
        return 2

    npx = shutil.which("npx.cmd" if os.name == "nt" else "npx")
    if not npx:
        raise SystemExit("npx was not found")

    temporary_directory: tempfile.TemporaryDirectory[str] | None = None
    preliminary_output = ""
    if args.action in ("fetch-history", "isolated-dry-run", "isolated-validate", "isolated-apply"):
        temporary_directory = tempfile.TemporaryDirectory(prefix="sigec-remote-history-")
        workdir = Path(temporary_directory.name)
        (workdir / "supabase" / "migrations").mkdir(parents=True)
        fetch_command = [npx, "--no-install", "supabase", "migration", "fetch", *connection_args,
                         "--workdir", str(workdir)]
        fetch_result = subprocess.run(
            fetch_command,
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        preliminary_output = sanitized(
            "\n".join(part for part in (fetch_result.stdout, fetch_result.stderr) if part), secret
        ).strip()
        if fetch_result.returncode != 0:
            print(json.dumps({
                "ok": False,
                "action": args.action,
                "projectRef": EXPECTED_PROJECT_REF,
                "exitCode": fetch_result.returncode,
                "output": preliminary_output,
            }, ensure_ascii=False, indent=2))
            temporary_directory.cleanup()
            return fetch_result.returncode

        if args.action in ("isolated-dry-run", "isolated-validate", "isolated-apply"):
            migration_dir = workdir / "supabase" / "migrations"
            remote_names = {path.name for path in migration_dir.glob("*.sql")}
            sigec_migrations = sorted((ROOT / "supabase" / "migrations").glob("*_sigec_*.sql"))
            for sigec_migration in sigec_migrations:
                shutil.copy2(sigec_migration, migration_dir / sigec_migration.name)
            expected = [migration.name for migration in sigec_migrations if migration.name not in remote_names]
            if not expected:
                print(json.dumps({
                    "ok": True,
                    "action": args.action,
                    "projectRef": EXPECTED_PROJECT_REF,
                    "exitCode": 0,
                    "upToDate": True,
                    "pendingMigrations": [],
                }, ensure_ascii=False, indent=2))
                temporary_directory.cleanup()
                return 0
            dry_run_command = [npx, "--no-install", "supabase", "db", "push", *connection_args,
                               "--skip-vault", "--dry-run", "--workdir", str(workdir)]
            if args.action == "isolated-validate":
                validation_file = workdir / "sigec_pending_validation.sql"
                validation_parts = ["begin;"]
                for migration_name in expected:
                    migration_sql = (migration_dir / migration_name).read_text(encoding="utf-8")
                    validation_parts.append(validation_sql(migration_sql))
                validation_parts.append("rollback;")
                validation_file.write_text("\n\n".join(validation_parts), encoding="utf-8")
                if not secret.startswith(("postgres://", "postgresql://")):
                    print(json.dumps({
                        "ok": False,
                        "action": args.action,
                        "projectRef": EXPECTED_PROJECT_REF,
                        "exitCode": 2,
                        "error": "Transactional validation requires POSTGRES to be a connection URI.",
                    }, ensure_ascii=False, indent=2))
                    temporary_directory.cleanup()
                    return 2
                connection = None
                try:
                    import psycopg2

                    connection = psycopg2.connect(secret)
                    connection.autocommit = False
                    with connection.cursor() as cursor:
                        cursor.execute(validation_file.read_text(encoding="utf-8"))
                    connection.rollback()
                    print(json.dumps({
                        "ok": True,
                        "action": args.action,
                        "projectRef": EXPECTED_PROJECT_REF,
                        "exitCode": 0,
                        "rolledBack": True,
                        "validatedMigrations": expected,
                    }, ensure_ascii=False, indent=2))
                    temporary_directory.cleanup()
                    return 0
                except Exception as error:
                    if connection is not None:
                        connection.rollback()
                    print(json.dumps({
                        "ok": False,
                        "action": args.action,
                        "projectRef": EXPECTED_PROJECT_REF,
                        "exitCode": 1,
                        "rolledBack": True,
                        "error": sanitized(str(error), secret),
                    }, ensure_ascii=False, indent=2))
                    temporary_directory.cleanup()
                    return 1
                finally:
                    if connection is not None:
                        connection.close()
            elif args.action == "isolated-apply":
                dry_run_result = subprocess.run(
                    dry_run_command,
                    cwd=ROOT,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    check=False,
                )
                dry_run_output = sanitized(
                    "\n".join(part for part in (dry_run_result.stdout, dry_run_result.stderr) if part), secret
                ).strip()
                preliminary_output = f"{preliminary_output}\n{dry_run_output}".strip()
                dry_run_summaries: list[dict[str, object]] = []
                for line in dry_run_result.stdout.splitlines():
                    try:
                        item = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(item, dict) and item.get("dryRun") is True:
                        dry_run_summaries.append(item)
                exact_migration_set = any(item.get("migrations") == expected for item in dry_run_summaries)
                if dry_run_result.returncode != 0 or not exact_migration_set:
                    print(json.dumps({
                        "ok": False,
                        "action": args.action,
                        "projectRef": EXPECTED_PROJECT_REF,
                        "exitCode": dry_run_result.returncode or 3,
                        "error": "Apply aborted because preflight did not contain exactly the expected SIGEC migrations.",
                        "output": preliminary_output,
                    }, ensure_ascii=False, indent=2))
                    temporary_directory.cleanup()
                    return dry_run_result.returncode or 3
                command = [npx, "--no-install", "supabase", "db", "push", *connection_args,
                           "--skip-vault", "--workdir", str(workdir)]
            else:
                command = dry_run_command
        else:
            command = [npx, "--no-install", "supabase", "migration", "list", *connection_args,
                       "--workdir", str(workdir)]
    elif args.action == "history":
        command = [npx, "--no-install", "supabase", "migration", "list", *connection_args]
    elif args.action in ("advisors", "advisors-sigec"):
        command = [npx, "--no-install", "supabase", "db", "advisors", *connection_args,
                   "--type", "all", "--level", "info", "--fail-on", "error"]
    elif args.action == "verify":
        command = [npx, "--no-install", "supabase", "db", "query", *connection_args,
                   "--file", str(ROOT / "execution" / "sigec_remote_verify.sql")]
    else:
        command = [npx, "--no-install", "supabase", "db", "push", *connection_args,
                   "--skip-vault", "--dry-run"]

    result = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    output = sanitized("\n".join(part for part in (result.stdout, result.stderr) if part), secret).strip()
    if preliminary_output:
        output = f"{preliminary_output}\n{output}".strip()
    response: dict[str, object] = {
        "ok": result.returncode == 0,
        "action": args.action,
        "projectRef": EXPECTED_PROJECT_REF,
        "exitCode": result.returncode,
        "output": output,
    }
    if args.action == "advisors-sigec" and result.returncode == 0:
        advisor_results: list[dict[str, object]] = []
        for line in result.stdout.splitlines():
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(item, dict) and isinstance(item.get("results"), list):
                advisor_results = [entry for entry in item["results"] if isinstance(entry, dict)]
        sigec_findings = []
        for finding in advisor_results:
            metadata = finding.get("metadata") if isinstance(finding.get("metadata"), dict) else {}
            object_name = str(metadata.get("name", ""))
            if object_name.startswith("sigec_") or "sigec_" in str(finding.get("detail", "")):
                sigec_findings.append({
                    "name": finding.get("name"),
                    "level": finding.get("level"),
                    "object": object_name,
                    "detail": finding.get("detail"),
                })
        response["output"] = sanitized(result.stderr, secret).strip()
        response["allFindingCount"] = len(advisor_results)
        response["sigecFindingCount"] = len(sigec_findings)
        response["sigecActionableFindingCount"] = sum(
            1 for finding in sigec_findings if finding.get("level") in ("WARN", "ERROR")
        )
        response["sigecFindings"] = sigec_findings
    if temporary_directory is not None and result.returncode == 0:
        migration_dir = Path(temporary_directory.name) / "supabase" / "migrations"
        response["fetchedMigrations"] = [path.name for path in sorted(migration_dir.glob("*.sql"))]
    print(json.dumps(response, ensure_ascii=False, indent=2))
    if temporary_directory is not None:
        temporary_directory.cleanup()
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
