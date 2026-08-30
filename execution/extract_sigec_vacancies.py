"""Extract SIGEC vacancy annexes from DOCX into a reviewable JSON preview.

This script never writes to Supabase. It preserves raw labels, adds normalized
keys, joins course requirements and reports duplicates/issues for human review.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def text(node: ET.Element) -> str:
    return " ".join("".join(item.itertext()).strip() for item in node.findall(".//w:p", NS) if "".join(item.itertext()).strip())


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_text = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"[^A-Z0-9]+", " ", ascii_text.upper()).strip()


def slugify(value: str) -> str:
    return normalize(value).lower().replace(" ", "-")


def read_tables(path: Path) -> list[list[list[str]]]:
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    tables: list[list[list[str]]] = []
    for table in root.findall(".//w:tbl", NS):
        rows: list[list[str]] = []
        for row in table.findall("./w:tr", NS):
            rows.append([text(cell) for cell in row.findall("./w:tc", NS)])
        tables.append(rows)
    return tables


def build_preview(path: Path) -> dict[str, object]:
    tables = read_tables(path)
    if len(tables) < 3:
        raise ValueError("SIGEC_DOCX_ANNEX_TABLES_NOT_FOUND")

    requirements: dict[str, tuple[str, str]] = {}
    current_proof = ""
    for row in tables[2][1:]:
        if len(row) >= 4 and row[1].strip():
            if row[3].strip():
                current_proof = row[3].strip()
            requirements[normalize(row[1])] = (row[2].strip(), current_proof)

    modalities = (
        ("Centros Educa Mais", "centros-educa-mais", tables[0]),
        ("EJATEC", "ejatec", tables[1]),
    )
    rows: list[dict[str, object]] = []
    issues: list[dict[str, object]] = []
    for modality_name, modality_slug, table in modalities:
        current_municipality = ""
        for source_row, row in enumerate(table[1:], start=2):
            if len(row) >= 2 and row[1].strip():
                current_municipality = row[1].strip()
            if len(row) < 4 or not current_municipality or not row[2].strip():
                issues.append({"table": modality_slug, "row": source_row, "code": "missing_required_cell"})
                continue
            municipality, course, vacancy_text = current_municipality, row[2].strip(), row[3].strip()
            requirement = requirements.get(normalize(course))
            kind = "cadastro_reserva" if normalize(vacancy_text) == "CR" else "quantidade"
            count = None
            if kind == "quantidade":
                digits = re.sub(r"\D", "", vacancy_text)
                count = int(digits) if digits else None
                if not count:
                    issues.append({"table": modality_slug, "row": source_row, "code": "invalid_vacancy_count", "value": vacancy_text})
            if not requirement:
                issues.append({"table": modality_slug, "row": source_row, "code": "missing_course_requirement", "course": course})
            rows.append({
                "sourceRow": source_row,
                "modalityName": modality_name,
                "modalitySlug": modality_slug,
                "municipality": municipality,
                "municipalityNormalized": normalize(municipality),
                "courseName": course,
                "courseNormalized": normalize(course),
                "vacancyKind": kind,
                "vacancyCount": count,
                "acceptedEducation": requirement[0] if requirement else "",
                "proofInstructions": requirement[1] if requirement else "",
                "sourceReference": f"SIGDOC.docx tabela {1 if modality_slug == 'centros-educa-mais' else 2}, linha {source_row}",
            })

    keys = [f"{row['modalitySlug']}|{row['municipalityNormalized']}|{row['courseNormalized']}" for row in rows]
    duplicate_keys = {key for key, count in Counter(keys).items() if count > 1}
    duplicates = [row for row, key in zip(rows, keys) if key in duplicate_keys]
    affected_rows = {(item["table"], item["row"]) for item in issues}
    affected_rows.update((str(row["modalitySlug"]), int(row["sourceRow"])) for row in duplicates)
    return {
        "schemaVersion": 1,
        "sourceFile": path.name,
        "sourceSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "rows": rows,
        "report": {
            "totalRows": len(rows),
            "validRows": max(0, len(rows) - len(affected_rows)),
            "issueCount": len(issues),
            "duplicateCount": len(duplicates),
            "issues": issues,
            "duplicates": duplicates,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("docx", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    preview = build_preview(args.docx.resolve())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(preview, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(preview["report"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
