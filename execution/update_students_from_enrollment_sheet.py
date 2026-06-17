import argparse
import csv
import json
import os
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import pandas as pd

from supabase_client import SupabaseRestClient


DEFAULT_INPUT = r"C:\Users\joaom\Downloads\inscricoes-16-06-26_11-37-14.xlsx"
DEFAULT_REPORT = ".tmp/student_enrollment_update_report.csv"
PAGE_SIZE = 1000
WRITE_BATCH_SIZE = 100


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def get_required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required.")
    return value


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def normalize_header(value: Any) -> str:
    text = strip_accents(str(value or "").strip().lower())
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def normalize_name(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = strip_accents(str(value).strip().lower())
    text = re.sub(r"\s+", " ", text)
    return text or None


def normalize_email(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip().lower()
    return text or None


def display_name_from_normalized(value: str | None) -> str | None:
    if not value:
        return None
    return " ".join(part.capitalize() for part in value.split())


def normalize_cpf(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    digits = re.sub(r"\D", "", str(value))
    if len(digits) != 11:
        return None
    return digits


def normalize_phone(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    digits = re.sub(r"\D", "", str(value))
    if len(digits) < 8:
        return None
    if digits.startswith("55") and len(digits) >= 12:
        return digits
    if len(digits) in (10, 11):
        return f"55{digits}"
    return digits


def clean_text(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = re.sub(r"\s+", " ", str(value).strip())
    return text or None


def course_key(value: Any) -> str | None:
    text = normalize_name(value)
    if not text:
        return None
    return re.sub(r"[^a-z0-9]+", "", text)


def find_column(columns: list[str], candidates: list[str]) -> str | None:
    normalized = {normalize_header(column): column for column in columns}
    for candidate in candidates:
        key = normalize_header(candidate)
        if key in normalized:
            return normalized[key]
    return None


def read_source(path: Path, sheet_name: str | None) -> tuple[list[dict[str, Any]], dict[str, str | None]]:
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")

    if path.suffix.lower() in {".xlsx", ".xls"}:
        df = pd.read_excel(path, sheet_name=sheet_name or 0, dtype=str)
    else:
        df = pd.read_csv(path, dtype=str)

    columns = list(df.columns)
    mapping = {
        "name": find_column(columns, ["nome", "name", "full_name", "full name"]),
        "email": find_column(columns, ["email", "e-mail", "mail"]),
        "cpf": find_column(columns, ["cpf"]),
        "phone": find_column(columns, ["celular", "telefone", "phone", "whatsapp", "numero de celular", "número de celular"]),
        "selection_process": find_column(columns, ["processo seletivo", "processo"]),
        "course": find_column(columns, ["curso", "course"]),
        "enrollment_status": find_column(columns, ["status"]),
        "course_requirement_status": find_column(columns, ["requisitos do curso", "requisito do curso"]),
        "quota": find_column(columns, ["cota", "cotas"]),
        "quota_status": find_column(columns, ["status da cota"]),
    }
    if not mapping["name"] or not mapping["email"]:
        raise RuntimeError(f"Expected at least name and email columns. Found: {columns}")

    rows: list[dict[str, Any]] = []
    for index, raw in df.iterrows():
        name = normalize_name(raw.get(mapping["name"]))
        email = normalize_email(raw.get(mapping["email"]))
        cpf = normalize_cpf(raw.get(mapping["cpf"])) if mapping["cpf"] else None
        phone = normalize_phone(raw.get(mapping["phone"])) if mapping["phone"] else None
        course_name = clean_text(raw.get(mapping["course"])) if mapping["course"] else None
        requirement_status = clean_text(raw.get(mapping["course_requirement_status"])) if mapping["course_requirement_status"] else None
        course_entry = None
        if course_name and (not requirement_status or normalize_name(requirement_status) == "aprovado"):
            course_entry = {
                "fullname": course_name,
                "shortname": course_name,
                "source": "selection_sheet",
                "processo_seletivo": clean_text(raw.get(mapping["selection_process"])) if mapping["selection_process"] else None,
            }
            course_entry = {key: value for key, value in course_entry.items() if value not in (None, "")}
        if not name and not email:
            continue
        rows.append({
            "source_row": int(index) + 2,
            "name": name,
            "email": email,
            "cpf": cpf,
            "phone": phone,
            "course": course_entry,
        })
    return rows, mapping


def collapse_source_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row.get("cpf"):
            groups[("cpf", row["cpf"])].append(row)
        elif row.get("email"):
            groups[("email", row["email"])].append(row)
        else:
            groups[("name", row.get("name") or "")].append(row)

    collapsed: list[dict[str, Any]] = []
    warnings: list[str] = []
    for (_group_type, _group_value), items in groups.items():
        emails = sorted({item["email"] for item in items if item.get("email")})
        names = sorted({item["name"] for item in items if item.get("name")})
        cpfs = sorted({item["cpf"] for item in items if item.get("cpf")})
        phones = sorted({item["phone"] for item in items if item.get("phone")})
        courses = merge_courses([], [item["course"] for item in items if item.get("course")])
        email = emails[0] if emails else None
        name = names[0] if len(names) == 1 else None
        if len(emails) > 1:
            warnings.append(f"Email variants for {cpfs[0] if cpfs else _group_value}: {', '.join(emails[:5])}")
        if len(names) > 1:
            warnings.append(f"Name variants for {email or _group_value}: {', '.join(names[:5])}")
        if len(cpfs) > 1:
            warnings.append(f"Conflicting CPFs for {email or name or _group_value}: {', '.join(cpfs)}")
        if len(phones) > 1:
            warnings.append(f"Conflicting phones for {email or name or _group_value}: {', '.join(phones)}")
        collapsed.append({
            "source_rows": ",".join(str(item["source_row"]) for item in items),
            "name": name,
            "email": email,
            "cpf": cpfs[0] if len(cpfs) == 1 else None,
            "phone": phones[0] if len(phones) == 1 else None,
            "courses": courses,
            "source_count": len(items),
        })
    return collapsed, warnings


def merge_courses(existing_courses: Any, new_courses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    index: dict[str, int] = {}

    if isinstance(existing_courses, list):
        for course in existing_courses:
            if not isinstance(course, dict):
                continue
            copied = dict(course)
            key = (
                f"id:{copied.get('id')}"
                if copied.get("id") is not None
                else course_key(copied.get("fullname") or copied.get("shortname") or copied.get("name"))
            )
            merged.append(copied)
            if key:
                index[str(key)] = len(merged) - 1

    for course in new_courses:
        if not isinstance(course, dict):
            continue
        key = course_key(course.get("fullname") or course.get("shortname") or course.get("name"))
        if key and key in index:
            existing = merged[index[key]]
            existing.update({k: v for k, v in course.items() if v not in (None, "")})
            continue
        merged.append(dict(course))
        if key:
            index[key] = len(merged) - 1

    return merged


def fetch_all_students(client: SupabaseRestClient) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        page = client.select(
            "students",
            columns="id,moodle_id,full_name,email,phone,phone2,cpf,role,username,courses",
            filters={"offset": str(offset)},
            order="email.asc",
            limit=PAGE_SIZE,
        )
        if not page:
            break
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def moodle_post(wsfunction: str, params: list[tuple[str, str]]) -> Any:
    query = {
        "wstoken": get_required_env("MOODLE_WSTOKEN"),
        "moodlewsrestformat": "json",
        "wsfunction": wsfunction,
    }
    url = f"{get_required_env('MOODLE_URL').rstrip('/')}/webservice/rest/server.php?{urlencode(query)}"
    body = urlencode(params).encode("utf-8")
    request = Request(url, data=body, method="POST", headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urlopen(request, timeout=60) as response:
        raw = response.read().decode("utf-8")
    data = json.loads(raw)
    if isinstance(data, dict) and data.get("exception"):
        raise RuntimeError(f"Moodle API error [{wsfunction}]: {data.get('message')}")
    return data


def lookup_moodle_users_by_email(emails: list[str], batch_size: int) -> tuple[dict[str, dict[str, Any]], list[str]]:
    found: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []
    unique_emails = sorted({email for email in emails if email})

    for start in range(0, len(unique_emails), batch_size):
        batch = unique_emails[start:start + batch_size]
        params: list[tuple[str, str]] = [("field", "email")]
        params.extend((f"values[{index}]", email) for index, email in enumerate(batch))
        data = moodle_post("core_user_get_users_by_field", params)
        if not isinstance(data, list):
            warnings.append(f"Moodle returned non-list response for email batch starting at {start}")
            continue
        for user in data:
            email = normalize_email(user.get("email"))
            if not email:
                continue
            if email in found and found[email].get("id") != user.get("id"):
                warnings.append(f"Duplicate Moodle users for email {email}: {found[email].get('id')} and {user.get('id')}")
                continue
            found[email] = user

    return found, warnings


def unique_index(rows: list[dict[str, Any]], key_fn) -> dict[str, dict[str, Any]]:
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        key = key_fn(row)
        if key:
            buckets[key].append(row)
    return {key: values[0] for key, values in buckets.items() if len(values) == 1}


def status_for(source: dict[str, Any], student: dict[str, Any] | None) -> tuple[str, dict[str, Any], str]:
    if not student:
        return "not_found", {}, ""

    updates: dict[str, Any] = {}
    notes: list[str] = []

    if source.get("cpf"):
        if student.get("cpf") and student["cpf"] != source["cpf"]:
            notes.append(f"cpf_conflict existing={student['cpf']} source={source['cpf']}")
        elif not student.get("cpf"):
            updates["cpf"] = source["cpf"]

    if source.get("phone"):
        if student.get("phone") and student["phone"] != source["phone"]:
            if not student.get("phone2"):
                updates["phone2"] = source["phone"]
            elif student.get("phone2") != source["phone"]:
                notes.append(f"phone_conflict existing={student['phone']} phone2={student.get('phone2')} source={source['phone']}")
        elif not student.get("phone"):
            updates["phone"] = source["phone"]

    merged_courses = merge_courses(student.get("courses"), source.get("courses") or [])
    if merged_courses != (student.get("courses") or []):
        updates["courses"] = merged_courses

    if notes:
        return "conflict", updates, "; ".join(notes)
    if updates:
        return "ready", updates, ""
    return "no_change", {}, ""


def build_plan(source_rows: list[dict[str, Any]], students: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return build_plan_with_moodle(source_rows, students, {})


def build_new_student_payload(source: dict[str, Any], moodle_user: dict[str, Any]) -> dict[str, Any]:
    return {
        "moodle_id": moodle_user.get("id"),
        "full_name": moodle_user.get("fullname") or display_name_from_normalized(source.get("name")) or source.get("email"),
        "email": normalize_email(moodle_user.get("email")) or source.get("email"),
        "username": moodle_user.get("username") or None,
        "cpf": source.get("cpf"),
        "phone": source.get("phone"),
        "role": "aluno",
        "courses": merge_courses([], source.get("courses") or []),
        "last_synced_at": datetime.now(timezone.utc).isoformat(),
    }


def build_sheet_student_payload(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "full_name": display_name_from_normalized(source.get("name")) or source.get("email"),
        "email": source.get("email"),
        "cpf": source.get("cpf"),
        "phone": source.get("phone"),
        "role": "aluno",
        "courses": merge_courses([], source.get("courses") or []),
        "last_synced_at": datetime.now(timezone.utc).isoformat(),
    }


def build_plan_with_moodle(
    source_rows: list[dict[str, Any]],
    students: list[dict[str, Any]],
    moodle_by_email: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    by_email = unique_index(students, lambda row: normalize_email(row.get("email")))
    by_cpf = unique_index(students, lambda row: normalize_cpf(row.get("cpf")))
    by_name = unique_index(students, lambda row: normalize_name(row.get("full_name")))
    email_counts = Counter(normalize_email(row.get("email")) for row in students if normalize_email(row.get("email")))
    cpf_counts = Counter(normalize_cpf(row.get("cpf")) for row in students if normalize_cpf(row.get("cpf")))
    name_counts = Counter(normalize_name(row.get("full_name")) for row in students if normalize_name(row.get("full_name")))

    report: list[dict[str, Any]] = []
    for source in source_rows:
        match = None
        match_mode = ""
        new_payload: dict[str, Any] | None = None
        if source.get("email") and email_counts[source["email"]] == 1:
            match = by_email.get(source["email"])
            match_mode = "email"
        elif source.get("email") and email_counts[source["email"]] > 1:
            match_mode = "ambiguous_email"
        elif source.get("cpf") and cpf_counts[source["cpf"]] == 1:
            match = by_cpf.get(source["cpf"])
            match_mode = "cpf"
        elif source.get("cpf") and cpf_counts[source["cpf"]] > 1:
            match_mode = "ambiguous_cpf"
        elif source.get("email") and source["email"] in moodle_by_email:
            new_payload = build_new_student_payload(source, moodle_by_email[source["email"]])
            match_mode = "moodle_email"
        elif source.get("email"):
            match_mode = "email_not_found"
            new_payload = build_sheet_student_payload(source)
        elif source.get("name") and name_counts[source["name"]] == 1:
            match = by_name.get(source["name"])
            match_mode = "name"
        elif source.get("name") and name_counts[source["name"]] > 1:
            match_mode = "ambiguous_name"

        if new_payload:
            status = "ready_create" if new_payload.get("moodle_id") else "ready_insert"
            updates, notes = new_payload, ""
        else:
            status, updates, notes = status_for(source, match)
        if match_mode.startswith("ambiguous"):
            status = "ambiguous"
        report.append({
            "status": status,
            "match_mode": match_mode,
            "source_rows": source.get("source_rows"),
            "source_name": source.get("name"),
            "source_email": source.get("email"),
            "source_cpf": source.get("cpf"),
            "source_phone": source.get("phone"),
            "source_courses": json.dumps(source.get("courses") or [], ensure_ascii=False, sort_keys=True),
            "student_id": match.get("id") if match else None,
            "student_name": match.get("full_name") if match else None,
            "student_email": match.get("email") if match else None,
            "existing_cpf": match.get("cpf") if match else None,
            "existing_phone": match.get("phone") if match else None,
            "existing_phone2": match.get("phone2") if match else None,
            "updates": json.dumps(updates, ensure_ascii=False, sort_keys=True),
            "notes": notes,
        })
    return report


def write_report(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "status",
        "match_mode",
        "source_rows",
        "source_name",
        "source_email",
        "source_cpf",
        "source_phone",
        "source_courses",
        "student_id",
        "student_name",
        "student_email",
        "existing_cpf",
        "existing_phone",
        "existing_phone2",
        "updates",
        "notes",
    ]
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def chunked(items: list[Any], size: int) -> list[list[Any]]:
    return [items[index:index + size] for index in range(0, len(items), size)]


def apply_updates(client: SupabaseRestClient, report: list[dict[str, Any]]) -> tuple[int, list[str]]:
    applied = 0
    errors: list[str] = []
    update_rows: list[dict[str, Any]] = []
    create_rows: list[dict[str, Any]] = []
    insert_rows: list[dict[str, Any]] = []

    for row in report:
        if row["status"] not in ("ready", "ready_create", "ready_insert"):
            continue
        updates = json.loads(row["updates"])
        if not updates:
            continue
        if row["status"] == "ready_create":
            create_rows.append(updates)
            continue
        if row["status"] == "ready_insert":
            insert_rows.append(updates)
            continue
        update_rows.append({
            "id": row["student_id"],
            "full_name": row.get("student_name") or display_name_from_normalized(row.get("source_name")) or row.get("source_email"),
            "email": row.get("student_email") or row.get("source_email"),
            **updates,
        })

    for batch in chunked(update_rows, WRITE_BATCH_SIZE):
        try:
            client.upsert("students", batch, on_conflict="id")
            applied += len(batch)
        except Exception as exc:
            errors.append(f"ready update batch: {exc}")

    for batch in chunked(create_rows, WRITE_BATCH_SIZE):
        try:
            client.upsert("students", batch, on_conflict="moodle_id")
            applied += len(batch)
        except Exception as exc:
            errors.append(f"ready_create batch: {exc}")

    for batch in chunked(insert_rows, WRITE_BATCH_SIZE):
        try:
            client.insert("students", batch)
            applied += len(batch)
        except Exception as exc:
            errors.append(f"ready_insert batch: {exc}")

    return applied, errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Update students CPF/phone from enrollment spreadsheet.")
    parser.add_argument("--input", default=DEFAULT_INPUT, help="Path to .xlsx/.csv source file.")
    parser.add_argument("--sheet", default=None, help="Worksheet name. Defaults to first sheet.")
    parser.add_argument("--report", default=DEFAULT_REPORT, help="CSV report path.")
    parser.add_argument("--apply", action="store_true", help="Apply non-conflicting updates.")
    parser.add_argument("--skip-moodle-lookup", action="store_true", help="Do not resolve missing students through Moodle.")
    parser.add_argument("--moodle-batch-size", type=int, default=50, help="Emails per Moodle lookup request.")
    args = parser.parse_args()

    load_dotenv(Path(".env"))

    source, mapping = read_source(Path(args.input), args.sheet)
    collapsed, warnings = collapse_source_rows(source)
    client = SupabaseRestClient()
    students = fetch_all_students(client)
    preliminary = build_plan(collapsed, students)
    missing_emails = [
        row["source_email"]
        for row in preliminary
        if row["match_mode"] == "email_not_found" and row.get("source_email")
    ]
    moodle_by_email: dict[str, dict[str, Any]] = {}
    moodle_warnings: list[str] = []
    if missing_emails and not args.skip_moodle_lookup:
        moodle_by_email, moodle_warnings = lookup_moodle_users_by_email(missing_emails, args.moodle_batch_size)
    report = build_plan_with_moodle(collapsed, students, moodle_by_email)
    write_report(Path(args.report), report)

    counts = Counter(row["status"] for row in report)
    summary = {
        "input_rows": len(source),
        "unique_source_identities": len(collapsed),
        "students_loaded": len(students),
        "columns": mapping,
        "status_counts": dict(sorted(counts.items())),
        "report": str(Path(args.report).resolve()),
        "applied": 0,
        "errors": [],
        "warnings": warnings[:50],
        "warnings_total": len(warnings),
        "moodle_lookup_requested": 0 if args.skip_moodle_lookup else len(missing_emails),
        "moodle_lookup_found": len(moodle_by_email),
        "moodle_warnings": moodle_warnings[:50],
        "moodle_warnings_total": len(moodle_warnings),
        "dry_run": not args.apply,
    }

    if args.apply:
        applied, errors = apply_updates(client, report)
        summary["applied"] = applied
        summary["errors"] = errors

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not summary["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
