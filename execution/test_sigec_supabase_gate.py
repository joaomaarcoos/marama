"""Regression tests for the SIGEC migration safety gate."""

from sigec_supabase_gate import validation_sql


def main() -> int:
    migration = """begin;
create table example(id integer);
create function example_fn() returns void language plpgsql as $$
begin
  perform 1;
end;
$$;
commit;
"""
    sanitized = validation_sql(migration)
    assert "begin;" not in sanitized.lower()
    assert "commit;" not in sanitized.lower()
    assert "\nbegin\n  perform 1;" in sanitized
    assert "create table example" in sanitized
    print('{"ok": true, "checks": 4}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
