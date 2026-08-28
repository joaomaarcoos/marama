"""Deterministic tests for SIGEC vacancy import normalization."""

from extract_sigec_vacancies import normalize, slugify


def main() -> int:
    cases = {
        "Açailândia": "ACAILANDIA",
        " Técnico em  Administração ": "TECNICO EM ADMINISTRACAO",
        "EJA-Tec": "EJA TEC",
    }
    for source, expected in cases.items():
        assert normalize(source) == expected
    assert slugify("Centros Educa Mais") == "centros-educa-mais"
    print('{"ok": true, "checks": 4}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
