"""Deterministic contract tests for the provisional SIGEC scoring rubric."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "sigec-provisional-scoring.json"


def calculate(config: dict, supplied: dict[str, float]) -> tuple[float, dict[str, float]]:
    scores: dict[str, float] = {}
    for category in config["categories"]:
        value = supplied.get(category["code"], 0)
        if not isinstance(value, (int, float)) or value < 0:
            raise ValueError(f"Invalid quantity for {category['code']}")
        units = int(value // category["unitSize"])
        scores[category["code"]] = min(
            units * category["pointsPerUnit"], category["maxPoints"]
        )
    return min(sum(scores.values()), config["maxPoints"]), scores


def main() -> int:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    categories = config["categories"]
    codes = [category["code"] for category in categories]

    assert config["status"] == "provisional_product_approved"
    assert config["officialPublicationAllowed"] is False
    assert config["maxPoints"] == 30
    assert len(codes) == len(set(codes))
    assert sum(category["maxPoints"] for category in categories) == 30
    assert all(category["unitSize"] > 0 for category in categories)
    assert all(category["pointsPerUnit"] > 0 for category in categories)
    assert all(category["maxPoints"] >= category["pointsPerUnit"] for category in categories)
    assert all(config["rules"].values())

    zero, _ = calculate(config, {})
    assert zero == 0

    maximum, maximum_breakdown = calculate(config, {
        "artigo_cientifico": 99,
        "livro_ou_capitulo": 99,
        "producao_tecnica_didatica": 99,
        "apresentacao_evento": 99,
        "formacao_continuada": 999,
    })
    assert maximum == 30
    assert maximum_breakdown == {
        "artigo_cientifico": 10,
        "livro_ou_capitulo": 5,
        "producao_tecnica_didatica": 6,
        "apresentacao_evento": 4,
        "formacao_continuada": 5,
    }

    partial, partial_breakdown = calculate(config, {
        "artigo_cientifico": 1,
        "livro_ou_capitulo": 1,
        "producao_tecnica_didatica": 1,
        "apresentacao_evento": 1,
        "formacao_continuada": 39,
    })
    assert partial == 16
    assert partial_breakdown["formacao_continuada"] == 1

    try:
        calculate(config, {"artigo_cientifico": -1})
    except ValueError:
        pass
    else:
        raise AssertionError("Negative evidence quantity must fail closed")

    print(json.dumps({
        "ok": True,
        "config": str(CONFIG_PATH.relative_to(ROOT)),
        "version": config["version"],
        "categories": len(categories),
        "maxPoints": config["maxPoints"],
        "tests": 5,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
