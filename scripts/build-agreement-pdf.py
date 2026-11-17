#!/usr/bin/env python3
"""Build the optional printable agreement from the versioned Markdown archive.

Requires Python 3, reportlab (validated with 4.4.9), and DejaVu Sans fonts.
Run from any directory: python3 scripts/build-agreement-pdf.py
This does not edit the accepted HTML, Markdown, consent version, or legal text.
"""

from __future__ import annotations

import argparse
from datetime import date
import hashlib
from html import escape
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def paragraph_markup(text: str) -> str:
    """Render the archive's small Markdown subset without executing HTML."""
    # The printed copy keeps link labels; the live agreement provides the links.
    text = re.sub(r"\[([^\]]+)\]\([^\s)]+\)", r"\1", text)
    text = escape(text)
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text, flags=re.DOTALL)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default="2026-11-14-r2")
    parser.add_argument(
        "--font-directory", type=Path,
        default=Path("/usr/share/fonts/truetype/dejavu"),
        help="Directory containing DejaVuSans.ttf and DejaVuSans-Bold.ttf",
    )
    args = parser.parse_args()
    version_parts = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})(?:-r([1-9]\d*))?", args.version)
    if not version_parts:
        parser.error("--version must have the form YYYY-MM-DD or YYYY-MM-DD-rN")
    try:
        date(*(int(value) for value in version_parts.groups()[:3]))
    except ValueError:
        parser.error("--version must contain a valid calendar date")

    try:
        from reportlab import Version as reportlab_version
        from reportlab.lib.enums import TA_LEFT
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.platypus import Paragraph, SimpleDocTemplate
    except ImportError as error:
        raise SystemExit("Install the optional PDF dependency: pip install reportlab==4.4.9") from error

    source = ROOT / "docs/legal" / f"user-agreement-{args.version}.md"
    output = source.with_suffix(".pdf")
    metadata = source.with_name(f"agreement-print-{args.version}.json")
    source_digest = sha256(source)
    regular = args.font_directory / "DejaVuSans.ttf"
    bold = args.font_directory / "DejaVuSans-Bold.ttf"
    for font in (regular, bold):
        if not font.is_file():
            raise SystemExit(f"Missing font: {font}. Set --font-directory.")
    pdfmetrics.registerFont(TTFont("AgreementSans", str(regular)))
    pdfmetrics.registerFont(TTFont("AgreementSans-Bold", str(bold)))
    pdfmetrics.registerFontFamily("AgreementSans", normal="AgreementSans", bold="AgreementSans-Bold")

    styles = {
        "body": ParagraphStyle(
            "AgreementBody", fontName="AgreementSans", fontSize=11,
            leading=16, spaceAfter=8, alignment=TA_LEFT,
        ),
        "title": ParagraphStyle(
            "AgreementTitle", fontName="AgreementSans-Bold", fontSize=18,
            leading=24, spaceAfter=16, keepWithNext=True,
        ),
        "heading": ParagraphStyle(
            "AgreementHeading", fontName="AgreementSans-Bold", fontSize=12.5,
            leading=18, spaceBefore=12, spaceAfter=8, keepWithNext=True,
        ),
    }

    year, month, day, revision = version_parts.groups()
    edition = f"{day}.{month}.{year}" + (f" (редакция {revision})" if revision else "")
    pages = 0

    def footer(canvas, document):
        nonlocal pages
        pages = max(pages, document.page)
        canvas.saveState()
        canvas.setFont("AgreementSans", 8)
        canvas.setFillColorRGB(0.32, 0.36, 0.4)
        canvas.drawString(20 * mm, 11 * mm, f"Проект для демоверсии · Редакция {edition}")
        canvas.drawRightString(A4[0] - 20 * mm, 11 * mm, str(document.page))
        canvas.restoreState()

    story = []
    for block in re.split(r"\n\s*\n", source.read_text(encoding="utf-8").strip()):
        text = " ".join(block.splitlines())
        if text.startswith("## "):
            style, text = "heading", text[3:]
        elif text.startswith("# "):
            style, text = "title", text[2:]
        else:
            style = "body"
        story.append(Paragraph(paragraph_markup(text), styles[style]))

    document = SimpleDocTemplate(
        str(output), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=18 * mm, bottomMargin=20 * mm,
        title=f"Пользовательское соглашение ФАС торги — проект {edition}",
        author="ООО «Региональная служба взыскания долгов»",
        invariant=1, pageCompression=1,
    )
    # Invariant metadata makes repeated builds byte-identical with the same
    # source, fonts and ReportLab version; it is not a claim of publication time.
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    if sha256(source) != source_digest:
        raise SystemExit("Agreement source changed during PDF generation; rebuild before release.")
    result = {
        "version": args.version,
        "pages": pages,
        "page_format": "A4",
        "body_font_points": 11,
        "body_leading_points": 16,
        "margins_mm": {"left": 20, "right": 20, "top": 18, "bottom": 20},
        "path": output.relative_to(ROOT).as_posix(),
        "bytes": output.stat().st_size,
        "sha256": sha256(output),
        "source_md_sha256": source_digest,
        "generator": "scripts/build-agreement-pdf.py",
        "reportlab_version": reportlab_version,
        "deterministic_metadata": True,
    }
    metadata.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
