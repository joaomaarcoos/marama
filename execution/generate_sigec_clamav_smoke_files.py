"""Generate structurally valid PDF fixtures for the SIGEC ClamAV smoke test.

The infected fixture contains the industry-standard, harmless EICAR signature.
It must only be used to verify antivirus detection in a controlled environment.
"""

from __future__ import annotations

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / ".tmp" / "sigec-clamav-smoke"
EICAR_SIGNATURE = (
    b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-"
    b"ANTIVIRUS-TEST-FILE!$H+H*"
)


def build_pdf(label: str, marker: bytes | None = None) -> bytes:
    page_contents = b"[4 0 R 6 0 R]" if marker else b"4 0 R"
    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents " + page_contents + b" >>",
    ]
    text = f"BT /F1 18 Tf 72 720 Td ({label}) Tj ET".encode("ascii")
    objects.append(b"<< /Length " + str(len(text)).encode("ascii") + b" >>\nstream\n" + text + b"\nendstream")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    if marker:
        # ClamAV scans extracted PDF streams. Keeping the harmless EICAR payload
        # in its own uncompressed 68-byte stream exercises that production path.
        objects.append(
            b"<< /Length " + str(len(marker)).encode("ascii") + b" >>\nstream\n"
            + marker
            + b"\nendstream"
        )

    content = bytearray(b"%PDF-1.4\n% SIGEC controlled smoke fixture\n")

    offsets = [0]
    for index, body in enumerate(objects, start=1):
        offsets.append(len(content))
        content.extend(f"{index} 0 obj\n".encode("ascii"))
        content.extend(body)
        content.extend(b"\nendobj\n")

    xref_offset = len(content)
    content.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    content.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        content.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    content.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(content)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", nargs="?", choices=("create", "cleanup"), default="create")
    args = parser.parse_args()
    if args.action == "cleanup":
        for path in (
            OUTPUT_DIR / "sigec-smoke-limpo.pdf",
            OUTPUT_DIR / "sigec-smoke-eicar.pdf",
            OUTPUT_DIR / "rendered" / "limpo.png",
            OUTPUT_DIR / "rendered" / "eicar.png",
            OUTPUT_DIR / "rendered" / "eicar-v2.png",
        ):
            path.unlink(missing_ok=True)
        for directory in (OUTPUT_DIR / "rendered", OUTPUT_DIR):
            try:
                directory.rmdir()
            except FileNotFoundError:
                pass
        print(OUTPUT_DIR)
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    clean_path = OUTPUT_DIR / "sigec-smoke-limpo.pdf"
    eicar_path = OUTPUT_DIR / "sigec-smoke-eicar.pdf"
    clean_path.write_bytes(build_pdf("SIGEC - arquivo limpo para smoke ClamAV"))
    eicar_path.write_bytes(build_pdf("SIGEC - arquivo EICAR controlado", EICAR_SIGNATURE))
    print(clean_path)
    print(eicar_path)


if __name__ == "__main__":
    main()
