"""Build deterministic image-only and mixed PDFs from hash-pinned OCR holdout images.

Requires Pillow and reportlab (the Codex workspace Python bundle supplies both).
The outputs are ignored local evaluation inputs, not redistributed source data.
"""
from __future__ import annotations

import hashlib
import json
from io import BytesIO
from pathlib import Path

from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / "bench/ocr-holdout-manifest.json").read_text())
OUT = ROOT / "bench/corpus/ocr-pdf-smoke"
OUT.mkdir(parents=True, exist_ok=True)
SAMPLES = {"de": "beleg-000000", "en": "82092117"}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def make_pdf(image: Image.Image, *, mixed: bool, language: str) -> bytes:
    output = BytesIO()
    page_width, page_height = image.width / 3, image.height / 3
    pdf = canvas.Canvas(output, pagesize=(page_width, page_height), invariant=1, pageCompression=1)
    if mixed:
        pdf.setFont("Helvetica", 18)
        pdf.drawString(28, page_height - 50, f"MIXED PDF TEXT LAYER CONTROL {language.upper()} 2026")
        pdf.setFont("Helvetica", 11)
        for n in range(3):
            pdf.drawString(28, page_height - 90 - n * 20, "This page has selectable text and does not need OCR.")
        pdf.showPage()
    pdf.drawImage(ImageReader(image), 0, 0, width=page_width, height=page_height)
    pdf.showPage()
    pdf.save()
    return output.getvalue()


receipts = []
for language, doc_id in SAMPLES.items():
    doc = next(item for item in MANIFEST["languages"][language]["documents"] if item["id"] == doc_id)
    base = ROOT / ("bench/corpus/ocr-de-belege" if language == "de" else "bench/corpus/ocr-en-funsd")
    source = (base / doc["image_path"]).read_bytes()
    if digest(source) != doc["image_sha256"]:
        raise ValueError(f"Source image hash mismatch: {doc_id}")
    image = Image.open(BytesIO(source)).convert("RGB")
    for mixed in (False, True):
        name = f"{language}-{'mixed' if mixed else 'image-only'}.pdf"
        pdf = make_pdf(image, mixed=mixed, language=language)
        (OUT / name).write_bytes(pdf)
        receipts.append({"language": language, "doc_id": doc_id, "file": name, "pages": 2 if mixed else 1,
                         "source_sha256": doc["image_sha256"], "pdf_sha256": digest(pdf)})
print(json.dumps({"outputs": receipts}, ensure_ascii=False))
