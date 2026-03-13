"""
routers/ocr.py
--------------
Invoice image → structured line-item extraction with confidence scores.
Uses pytesseract + Pillow. Requires Tesseract OCR installed on the host.
"""

import io
import os
import re
import tempfile
import time
from typing import Any

import pytesseract
from PIL import Image
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.auth.dependencies import get_current_user
from app.models.user import UserOut

router = APIRouter(prefix="/ocr", tags=["ocr"])


# ── Regex patterns ────────────────────────────────────────────

_BATCH_KW_RE = re.compile(
    r"(?:Batch|B\.?No\.?|LOT|Lot No\.?)[:\s#]*([A-Za-z0-9\-/]+)",
    re.IGNORECASE,
)
_BATCH_GUESS_RE = re.compile(r"\b([A-Z]{1,4}[\-/]?\d{4,}[A-Z0-9]*)\b")

_EXPIRY_FULL_RE = re.compile(
    r"(?:Exp(?:iry)?\.?|Best Before|Use By|EXP)[:\s]*"
    r"(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
    re.IGNORECASE,
)
_EXPIRY_DATE_RE = re.compile(r"\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b")
_EXPIRY_MY_RE = re.compile(
    r"(?:Exp(?:iry)?\.?|Best Before|EXP)[:\s]*(\d{2})[\/\-](\d{4})",
    re.IGNORECASE,
)

_QTY_KW_RE = re.compile(
    r"(?:Qty|Quantity|Pcs|Units|Nos)[:\s.]*(\d+)", re.IGNORECASE
)
_QTY_GUESS_RE = re.compile(r"\b(\d{1,5})\s*(?:pcs|units|nos|tabs|caps)\b", re.IGNORECASE)

_PRODUCT_SKIP_RE = re.compile(
    r"\b(Invoice|Receipt|Tax|GST|GSTIN|Date|Bill|Total|Amount|MRP|Batch|LOT|Qty|Exp)\b",
    re.IGNORECASE,
)


# ── Extraction helpers ────────────────────────────────────────

def _extract_batch(text: str) -> tuple[str | None, float]:
    m = _BATCH_KW_RE.search(text)
    if m:
        return m.group(1).strip(), 0.95

    m = re.search(r"\b(?:LOT|B\.No)[:\s]*([A-Za-z0-9\-/]+)", text, re.I)
    if m:
        return m.group(1).strip(), 0.70

    m = _BATCH_GUESS_RE.search(text)
    if m:
        return m.group(1).strip(), 0.40

    return None, 0.0


def _parse_date_parts(d: str, mo: str, y: str) -> str | None:
    """Return ISO date string or None if invalid."""
    try:
        day, month, year = int(d), int(mo), int(y)
        if year < 100:
            year += 2000
        if not (1 <= month <= 12 and 1 <= day <= 31):
            return None
        return f"{year:04d}-{month:02d}-{day:02d}"
    except ValueError:
        return None


def _extract_expiry(text: str) -> tuple[str | None, float]:
    # Keyword-prefixed full date → highest confidence
    m = _EXPIRY_FULL_RE.search(text)
    if m:
        parts = re.split(r"[\/\-]", m.group(1))
        if len(parts) == 3:
            parsed = _parse_date_parts(parts[0], parts[1], parts[2])
            if parsed:
                return parsed, 0.95

    # MM/YYYY keyword-prefixed
    m = _EXPIRY_MY_RE.search(text)
    if m:
        month, year = int(m.group(1)), int(m.group(2))
        if 1 <= month <= 12:
            return f"{year:04d}-{month:02d}-01", 0.75

    # Bare date pattern
    m = _EXPIRY_DATE_RE.search(text)
    if m:
        parsed = _parse_date_parts(m.group(1), m.group(2), m.group(3))
        if parsed:
            return parsed, 0.40

    return None, 0.0


def _extract_quantity(text: str) -> tuple[int | None, float]:
    m = _QTY_KW_RE.search(text)
    if m:
        return int(m.group(1)), 0.95

    m = _QTY_GUESS_RE.search(text)
    if m:
        return int(m.group(1)), 0.60

    return None, 0.0


def _extract_product_names(lines: list[str]) -> list[tuple[str, float]]:
    """Return candidate product name lines with confidence."""
    candidates: list[tuple[str, float]] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or len(stripped) < 4:
            continue
        if _PRODUCT_SKIP_RE.search(stripped):
            continue
        # Heuristic: title-case lines, no leading digits
        if re.match(r"^[A-Z][A-Za-z\s\-().%+]+$", stripped) and not re.match(r"^\d", stripped):
            candidates.append((stripped, 0.90))
        elif re.match(r"^[A-Za-z]", stripped):
            candidates.append((stripped, 0.60))
        else:
            candidates.append((stripped, 0.30))
    return candidates


def _confidence_field(value: Any, confidence: float) -> dict[str, Any]:
    return {"value": value, "confidence": round(confidence, 2)}


def _extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from a PDF file without OCR rasterization."""
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PDF support is not available: missing 'pypdf' dependency. Install backend requirements and restart server.",
        ) from exc

    reader = PdfReader(io.BytesIO(pdf_bytes))
    chunks: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text.strip():
            chunks.append(page_text)
    return "\n\n".join(chunks).strip()


# ── Invoice parsing ───────────────────────────────────────────

def _parse_invoice_text(raw_text: str) -> list[dict[str, Any]]:
    """
    Split the OCR text into logical blocks and extract structured fields
    with confidence scores from each block.
    """
    # Split into line groups separated by blank lines
    blocks = [b.strip() for b in re.split(r"\n{2,}", raw_text) if b.strip()]
    if not blocks:
        blocks = [raw_text]

    items: list[dict[str, Any]] = []

    for block in blocks:
        lines = block.splitlines()

        batch_val, batch_conf = _extract_batch(block)
        expiry_val, expiry_conf = _extract_expiry(block)
        qty_val, qty_conf = _extract_quantity(block)
        product_candidates = _extract_product_names(lines)

        # Only emit an item if we found at least one meaningful field
        if not any([batch_val, expiry_val, qty_val, product_candidates]):
            continue

        if product_candidates:
            prod_name, prod_conf = product_candidates[0]
        else:
            prod_name, prod_conf = None, 0.0

        items.append({
            "product_name": _confidence_field(prod_name, prod_conf),
            "batch_number": _confidence_field(batch_val, batch_conf),
            "expiry_date": _confidence_field(expiry_val, expiry_conf),
            "quantity": _confidence_field(qty_val, qty_conf),
        })

    return items if items else [{
        "product_name": _confidence_field(None, 0.0),
        "batch_number": _confidence_field(None, 0.0),
        "expiry_date": _confidence_field(None, 0.0),
        "quantity": _confidence_field(None, 0.0),
    }]


# ── Endpoint ──────────────────────────────────────────────────

@router.post("/invoice")
async def extract_invoice(
    image: UploadFile = File(...),
    current_user: UserOut = Depends(get_current_user),
) -> dict[str, Any]:
    content_type = (image.content_type or "").lower()
    filename = (image.filename or "").lower()
    ext = os.path.splitext(filename)[1]
    is_image_ext = ext in {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif"}
    is_pdf_ext = ext == ".pdf"
    is_image = content_type.startswith("image/") or is_image_ext
    is_pdf = content_type == "application/pdf" or is_pdf_ext

    if not (is_image or is_pdf):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image files or PDFs are accepted (image/*, application/pdf)",
        )

    raw_bytes = await image.read()
    tmp_path: str | None = None
    raw_text = ""

    try:
        t0 = time.monotonic()

        if is_pdf:
            raw_text = _extract_text_from_pdf(raw_bytes)
            if not raw_text.strip():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="PDF contains no extractable text. Upload a clear image/JPG/PNG for OCR.",
                )
        else:
            # Write to a temp file so Tesseract can access it reliably.
            suffix = os.path.splitext(image.filename or "upload.jpg")[1] or ".jpg"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(raw_bytes)
                tmp_path = tmp.name

            pil_image = Image.open(tmp_path)
            raw_text = pytesseract.image_to_string(pil_image, config="--psm 6")

        items = _parse_invoice_text(raw_text)
        processing_ms = round((time.monotonic() - t0) * 1000)

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"OCR processing failed: {exc}",
        )
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    return {
        "items": items,
        "raw_text": raw_text.strip(),
        "processing_time_ms": processing_ms,
    }
