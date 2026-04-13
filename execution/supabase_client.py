import json
import os
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def get_required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required.")
    return value


class SupabaseRestClient:
    def __init__(self, base_url: str | None = None, service_role_key: str | None = None) -> None:
        self.base_url = (base_url or get_required_env("NEXT_PUBLIC_SUPABASE_URL")).rstrip("/")
        self.service_role_key = service_role_key or get_required_env("SUPABASE_SERVICE_ROLE_KEY")

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": "application/json",
        }
        if extra:
            headers.update(extra)
        return headers

    def _request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        payload: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        url = f"{self.base_url}{path}"
        if query:
            serialized = {key: str(value) for key, value in query.items() if value is not None}
            url = f"{url}?{urlencode(serialized)}"

        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(url, data=body, method=method, headers=self._headers(headers))

        try:
            with urlopen(request) as response:
                raw = response.read().decode("utf-8")
                if not raw:
                    return None
                return json.loads(raw)
        except HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            detail = raw
            try:
                parsed = json.loads(raw)
                detail = parsed.get("message") or parsed.get("error_description") or raw
            except json.JSONDecodeError:
                pass
            raise RuntimeError(f"Supabase REST error {exc.code} on {path}: {detail}") from exc

    def select(
        self,
        table: str,
        *,
        columns: str = "*",
        filters: dict[str, str] | None = None,
        order: str | None = None,
        limit: int | None = None,
    ) -> Any:
        query: dict[str, Any] = {"select": columns}
        if filters:
            query.update(filters)
        if order:
            query["order"] = order
        if limit is not None:
            query["limit"] = limit
        return self._request("GET", f"/rest/v1/{table}", query=query)

    def insert(self, table: str, rows: Any, *, returning: str = "representation") -> Any:
        return self._request(
            "POST",
            f"/rest/v1/{table}",
            payload=rows,
            headers={"Prefer": f"return={returning}"},
        )

    def upsert(self, table: str, rows: Any, *, on_conflict: str) -> Any:
        return self._request(
            "POST",
            f"/rest/v1/{table}",
            query={"on_conflict": on_conflict},
            payload=rows,
            headers={"Prefer": "resolution=merge-duplicates,return=representation"},
        )

    def update(self, table: str, values: dict[str, Any], *, filters: dict[str, str]) -> Any:
        return self._request(
            "PATCH",
            f"/rest/v1/{table}",
            query=filters,
            payload=values,
            headers={"Prefer": "return=representation"},
        )

    def delete(self, table: str, *, filters: dict[str, str]) -> Any:
        return self._request(
            "DELETE",
            f"/rest/v1/{table}",
            query=filters,
            headers={"Prefer": "return=representation"},
        )

    def rpc(self, function_name: str, params: dict[str, Any]) -> Any:
        return self._request("POST", f"/rest/v1/rpc/{function_name}", payload=params)
