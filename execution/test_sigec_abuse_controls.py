"""Remote integration tests for atomic SIGEC authentication abuse controls."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import secrets

from test_sigec_remote_access import Api, load_env


def main() -> int:
    env = load_env()
    api = Api(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"], env["SUPABASE_SERVICE_ROLE_KEY"])
    checks: list[str] = []
    digests: list[str] = []
    cleanup_ok = True

    def digest() -> str:
        value = hashlib.sha256(secrets.token_bytes(32)).hexdigest()
        digests.append(value)
        return value

    def consume(key_digest: str, limit: int = 2) -> tuple[int, object]:
        return api.request("POST", "/rest/v1/rpc/sigec_consume_auth_rate_limit", service=True, body={
            "p_bucket": "signup_ip",
            "p_key_digest": key_digest,
            "p_limit": limit,
            "p_window_seconds": 900,
            "p_block_seconds": 1800,
        })

    try:
        sequential_digest = digest()
        outcomes = []
        for _ in range(3):
            status, body = consume(sequential_digest)
            if status != 200 or not isinstance(body, list) or len(body) != 1:
                raise AssertionError(f"sequential_rate_limit: HTTP {status}")
            outcomes.append(body[0])
        if [row["allowed"] for row in outcomes] != [True, True, False]:
            raise AssertionError("sequential_limit_boundary_is_incorrect")
        if outcomes[2]["retry_after_seconds"] <= 0:
            raise AssertionError("blocked_attempt_has_no_retry_after")
        checks.append("sequential_boundary_and_retry_after")

        concurrent_digest = digest()
        with ThreadPoolExecutor(max_workers=10) as executor:
            responses = list(executor.map(lambda _: consume(concurrent_digest, 3), range(10)))
        if any(status != 200 for status, _ in responses):
            raise AssertionError("concurrent_rate_limit_http_failure")
        allowed_count = sum(1 for _, body in responses if body[0]["allowed"] is True)
        if allowed_count != 3:
            raise AssertionError(f"concurrent_limit_allowed_{allowed_count}_expected_3")
        checks.append("concurrent_consumption_is_atomic")

        anon_digest = hashlib.sha256(secrets.token_bytes(32)).hexdigest()
        status, _ = api.request("POST", "/rest/v1/rpc/sigec_consume_auth_rate_limit", body={
            "p_bucket": "signup_ip", "p_key_digest": anon_digest,
            "p_limit": 2, "p_window_seconds": 900, "p_block_seconds": 1800,
        })
        if status < 400:
            raise AssertionError("anonymous_caller_reached_rate_limit_rpc")
        checks.append("rpc_is_service_role_only")

        status, _ = api.request("POST", "/rest/v1/rpc/sigec_consume_auth_rate_limit", service=True, body={
            "p_bucket": "invalid", "p_key_digest": anon_digest,
            "p_limit": 2, "p_window_seconds": 900, "p_block_seconds": 1800,
        })
        if status < 400:
            raise AssertionError("invalid_bucket_was_accepted")
        checks.append("invalid_parameters_fail_closed")
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error), "checksPassed": checks}, ensure_ascii=False, indent=2))
        return 1
    finally:
        for key_digest in digests:
            status, _ = api.request("DELETE", f"/rest/v1/sigec_auth_rate_limits?key_digest=eq.{key_digest}", service=True)
            cleanup_ok = cleanup_ok and status in {200, 204}

    result = {"ok": cleanup_ok, "checks": len(checks), "fixturesCleaned": cleanup_ok}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
