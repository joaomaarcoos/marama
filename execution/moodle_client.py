import json
import os
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen


SYNC_COURSE_IDS = [
    2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 34, 36, 37, 38, 39, 40, 41,
]


def get_required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required.")
    return value


def build_url(wsfunction: str, params: dict[str, str] | None = None) -> str:
    query = {
        "wstoken": get_required_env("MOODLE_WSTOKEN"),
        "moodlewsrestformat": "json",
        "wsfunction": wsfunction,
    }
    if params:
        query.update(params)
    return f"{get_required_env('MOODLE_URL').rstrip('/')}/webservice/rest/server.php?{urlencode(query)}"


def moodle_get(wsfunction: str, params: dict[str, str] | None = None) -> Any:
    url = build_url(wsfunction, params)
    try:
        with urlopen(url) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Moodle HTTP error {exc.code} for {wsfunction}: {raw}") from exc

    data = json.loads(raw)
    if isinstance(data, dict) and data.get("exception"):
        raise RuntimeError(f"Moodle API error [{wsfunction}]: {data.get('message')}")
    return data


def get_enrolled_students(course_id: int) -> list[dict[str, Any]]:
    data = moodle_get("core_enrol_get_enrolled_users", {"courseid": str(course_id)})
    if not isinstance(data, list):
        return []

    students: list[dict[str, Any]] = []
    for user in data:
        roles = user.get("roles") or []
        if not any(role.get("shortname") == "student" for role in roles):
            continue
        students.append(
            {
                "id": user.get("id"),
                "fullname": user.get("fullname") or "",
                "email": user.get("email") or "",
                "username": user.get("username") or "",
                "courses": user.get("enrolledcourses") or [],
            }
        )
    return students
