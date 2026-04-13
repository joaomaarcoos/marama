import argparse
import json
from datetime import datetime, timezone

from moodle_client import SYNC_COURSE_IDS, get_enrolled_students
from supabase_client import SupabaseRestClient


def merge_students(course_ids: list[int]) -> tuple[list[dict], list[str]]:
    student_map: dict[int, dict] = {}
    errors: list[str] = []

    for course_id in course_ids:
        try:
            enrolled = get_enrolled_students(course_id)
        except Exception as exc:  # pragma: no cover - defensive operational guard
            errors.append(f"course {course_id}: {exc}")
            continue

        for student in enrolled:
            student_id = int(student["id"])
            if student_id not in student_map:
                student_map[student_id] = {
                    "id": student_id,
                    "fullname": student.get("fullname") or "",
                    "email": student.get("email") or "",
                    "username": student.get("username") or "",
                    "courses": list(student.get("courses") or []),
                }
                continue

            existing = student_map[student_id]
            seen_course_ids = {course.get("id") for course in existing["courses"]}
            for course in student.get("courses") or []:
                if course.get("id") not in seen_course_ids:
                    existing["courses"].append(course)
                    seen_course_ids.add(course.get("id"))

    return list(student_map.values()), errors


def build_payload(students: list[dict]) -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    return [
        {
            "moodle_id": student["id"],
            "full_name": student["fullname"],
            "email": student["email"] or None,
            "username": student["username"] or None,
            "courses": student["courses"],
            "last_synced_at": now,
        }
        for student in students
    ]


def chunked(items: list[dict], size: int) -> list[list[dict]]:
    return [items[index:index + size] for index in range(0, len(items), size)]


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Moodle students into Supabase.")
    parser.add_argument("--course-id", dest="course_ids", action="append", type=int, help="Course ID to sync.")
    parser.add_argument("--batch-size", type=int, default=100, help="Supabase upsert batch size.")
    parser.add_argument("--dry-run", action="store_true", help="Collect and print without writing to Supabase.")
    args = parser.parse_args()

    course_ids = args.course_ids or list(SYNC_COURSE_IDS)
    students, errors = merge_students(course_ids)
    payload = build_payload(students)

    summary = {
        "courses_scanned": len(course_ids),
        "students_discovered": len(payload),
        "processed": 0,
        "errors": list(errors),
        "dry_run": args.dry_run,
    }

    if args.dry_run:
        print(json.dumps(summary, ensure_ascii=True, indent=2))
        return 0

    supabase = SupabaseRestClient()
    for batch_number, batch in enumerate(chunked(payload, args.batch_size), start=1):
        try:
            supabase.upsert("students", batch, on_conflict="moodle_id")
            summary["processed"] += len(batch)
        except Exception as exc:  # pragma: no cover - operational path
            summary["errors"].append(f"batch {batch_number}: {exc}")

    print(json.dumps(summary, ensure_ascii=True, indent=2))
    return 0 if not summary["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
