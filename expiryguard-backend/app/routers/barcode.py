from typing import Any
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import get_current_user
from app.database import get_collection
from app.models.user import UserOut

router = APIRouter(prefix="/barcode", tags=["barcode"])

_OFF_URL = "https://world.openfoodfacts.org/api/v0/product/{code}.json"
_DIRECT_INVOICE_RE = re.compile(r"^EG-DIR-[A-Z0-9]+$")


def _normalize_code(raw_code: str) -> str:
    return "".join((raw_code or "").strip().split()).upper()


def _normalize_direct_invoice_code(raw_code: str) -> str | None:
    """Normalize scanner variants to canonical EG-DIR-XXXXXXXX format."""
    code = _normalize_code(raw_code).replace("_", "-")
    code = re.sub(r"-+", "-", code)

    if code.startswith("EGDIR-"):
        code = "EG-DIR-" + code[len("EGDIR-"):]
    elif code.startswith("EGDIR"):
        code = "EG-DIR-" + code[len("EGDIR"):]
    elif code.startswith("DIR-"):
        code = "EG-" + code
    elif code.startswith("DIR"):
        code = "EG-DIR-" + code[len("DIR"):]

    return code if _DIRECT_INVOICE_RE.fullmatch(code) else None


def _alternate_codes(code: str) -> list[str]:
    """
    Return alternate representations to try in DB lookup.
    Handles EAN-13 ↔ UPC-A equivalence:
      - UPC-A is 12 digits; EAN-13 is UPC-A padded with a leading '0'.
      - A scanner may return either form for the same physical barcode.
    """
    alts: list[str] = [code]
    if code.isdigit():
        if len(code) == 12:
            # UPC-A → also try EAN-13 (prepend 0)
            alts.append("0" + code)
        elif len(code) == 13 and code.startswith("0"):
            # EAN-13 → also try UPC-A (strip leading 0)
            alts.append(code[1:])
    return alts


@router.get("/{barcode_code}")
async def lookup_barcode(
    barcode_code: str,
    current_user: UserOut = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Look up a product barcode.
    1. Check user's own product catalog first (instant).
    2. Fall back to Open Food Facts API.
    Returns { found, product_name, brand, category, barcode }.
    """
    barcode_code = _normalize_code(barcode_code)
    direct_invoice_code = _normalize_direct_invoice_code(barcode_code)
    alts = _alternate_codes(barcode_code)

    # ── 1. Local catalog / SKU fallback ───────────────────────
    products = get_collection("products")
    ownership_filter = {"$or": [{"user_id": current_user.id}, {"owner_id": current_user.id}]}
    barcode_alts_filter = [{"barcode": c} for c in alts]
    local = await products.find_one(
        {
            **ownership_filter,
            "$or": [
                *barcode_alts_filter,
                {"sku": barcode_code},
                {"sku": {"$regex": f"^{re.escape(barcode_code)}$", "$options": "i"}},
            ],
        }
    )
    if local:
        return {
            "found": True,
            "source": "local",
            "product_name": local.get("name"),
            "brand": None,
            "category": local.get("category"),
            "barcode": local.get("barcode") or barcode_code,
            "sku": local.get("sku"),
            "product_id": str(local["_id"]),
        }

    # ── 1.5 Direct invoice barcode support ───────────────────
    if direct_invoice_code:
        direct_invoices = get_collection("direct_invoices")
        ownership_filter = {
            "$or": [
                {"distributor_id": current_user.id},
                {"shopkeeper_id": current_user.id},
            ]
        }
        invoice = await direct_invoices.find_one(
            {
                **ownership_filter,
                "invoice_no": direct_invoice_code,
            }
        )
        if not invoice:
            # Backward compatibility: older direct invoices did not persist invoice_no.
            suffix = direct_invoice_code.split("EG-DIR-")[-1].upper()
            cursor = direct_invoices.find(ownership_filter, {"_id": 1})
            async for doc in cursor:
                if str(doc.get("_id", ""))[-8:].upper() == suffix:
                    invoice = doc
                    break
        if invoice:
            return {
                "found": True,
                "source": "direct_invoice",
                "product_name": f"Invoice {direct_invoice_code}",
                "brand": None,
                "category": "invoice",
                "barcode": direct_invoice_code,
                "invoice_id": str(invoice.get("_id")),
                "invoice_no": direct_invoice_code,
            }
        return {
            "found": False,
            "source": "direct_invoice",
            "product_name": None,
            "brand": None,
            "category": "invoice",
            "barcode": direct_invoice_code,
            "detail": "Invoice barcode not found for current user",
        }

    # ── 2. Open Food Facts ────────────────────────────────────
    url = _OFF_URL.format(code=barcode_code)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers={"User-Agent": "ExpiryGuard/1.0"})
        data = resp.json()
    except Exception:
        data = {}

    if data.get("status") == 1:
        p = data.get("product", {})
        categories = p.get("categories_tags", [])
        category = categories[0].replace("en:", "") if categories else p.get("categories")
        return {
            "found": True,
            "source": "open_food_facts",
            "product_name": p.get("product_name") or p.get("product_name_en"),
            "brand": p.get("brands"),
            "category": category,
            "barcode": barcode_code,
        }

    if "status" in data:
        return {
            "found": False,
            "source": "open_food_facts",
            "product_name": None,
            "brand": None,
            "category": None,
            "barcode": barcode_code,
            "detail": data.get("status_verbose") or f"No product found for barcode {barcode_code}",
        }

    return {
        "found": False,
        "source": "unknown",
        "product_name": None,
        "brand": None,
        "category": None,
        "barcode": barcode_code,
        "detail": f"No product found for barcode {barcode_code}",
    }
