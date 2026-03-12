from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import get_current_user
from app.database import get_collection
from app.models.user import UserOut

router = APIRouter(prefix="/barcode", tags=["barcode"])

_OFF_URL = "https://world.openfoodfacts.org/api/v0/product/{code}.json"


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
    # ── 1. Local catalog ──────────────────────────────────────
    products = get_collection("products")
    local = await products.find_one({"user_id": current_user.id, "barcode": barcode_code})
    if local:
        return {
            "found": True,
            "source": "local",
            "product_name": local.get("name"),
            "brand": None,
            "category": local.get("category"),
            "barcode": barcode_code,
            "product_id": str(local["_id"]),
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

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"No product found for barcode {barcode_code}",
    )
