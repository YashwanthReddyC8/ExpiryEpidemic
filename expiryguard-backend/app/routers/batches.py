from datetime import date, datetime, timedelta
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.database import get_collection
from app.models.batch import BatchCreate, BatchOut, BatchStatus, BatchStatusUpdate
from app.models.user import UserOut

router = APIRouter(prefix="/batches", tags=["batches"])


# ── Helpers ───────────────────────────────────────────────────

def _dates_to_datetime(doc: dict) -> dict:
    """Store Python date fields as midnight datetime in Mongo."""
    for field in ("expiry_date", "purchase_date"):
        val = doc.get(field)
        if isinstance(val, date) and not isinstance(val, datetime):
            doc[field] = datetime.combine(val, datetime.min.time())
    return doc


def _normalize_batch(doc: dict) -> dict:
    """Convert Mongo datetime back to date for Pydantic BatchOut."""
    for field in ("expiry_date", "purchase_date"):
        val = doc.get(field)
        if isinstance(val, datetime):
            doc[field] = val.date()
    return doc


async def _batch_from_id(batch_id: str, user_id: str) -> dict:
    batches = get_collection("batches")
    doc = await batches.find_one({"_id": ObjectId(batch_id), "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")
    return doc


# ── Paginated response ─────────────────────────────────────────

class PaginatedBatches(BaseModel):
    items: list[BatchOut]
    total: int
    page: int
    limit: int


# ── Bulk response ─────────────────────────────────────────────

class BulkCreateResponse(BaseModel):
    inserted: int
    skipped: int
    items: list[BatchOut]


# ── Routes ─────────────────────────────────────────────────────

@router.get("", response_model=PaginatedBatches)
async def list_batches(
    status_filter: BatchStatus | None = Query(None, alias="status"),
    days_min: int | None = Query(None, ge=0),
    days_max: int | None = Query(None, ge=0),
    product_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserOut = Depends(get_current_user),
) -> PaginatedBatches:
    batches = get_collection("batches")
    query: dict[str, Any] = {"user_id": current_user.id}

    if status_filter:
        query["status"] = status_filter

    if product_id:
        query["product_id"] = product_id

    # Build expiry_date range filter from days_min / days_max
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    date_filter: dict[str, Any] = {}
    if days_min is not None:
        date_filter["$gte"] = today + timedelta(days=days_min)
    if days_max is not None:
        date_filter["$lte"] = today + timedelta(days=days_max)
    if date_filter:
        query["expiry_date"] = date_filter

    skip = (page - 1) * limit
    total = await batches.count_documents(query)
    cursor = batches.find(query).sort("expiry_date", 1).skip(skip).limit(limit)
    items = [BatchOut.from_mongo(_normalize_batch(doc)) async for doc in cursor]

    return PaginatedBatches(items=items, total=total, page=page, limit=limit)


@router.post("", response_model=BatchOut, status_code=status.HTTP_201_CREATED)
async def create_batch(
    payload: BatchCreate,
    current_user: UserOut = Depends(get_current_user),
) -> BatchOut:
    batches = get_collection("batches")

    # Duplicate batch_number guard (per user + product)
    if payload.batch_number:
        existing = await batches.find_one({
            "user_id": current_user.id,
            "product_id": payload.product_id,
            "batch_number": payload.batch_number,
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Batch number '{payload.batch_number}' already exists for this product",
            )

    doc: dict[str, Any] = _dates_to_datetime(payload.model_dump())
    doc["user_id"] = current_user.id
    doc["status"] = BatchStatus.active
    doc["alert_stages_sent"] = []
    doc["created_at"] = datetime.utcnow()

    result = await batches.insert_one(doc)
    created = await batches.find_one({"_id": result.inserted_id})
    return BatchOut.from_mongo(_normalize_batch(created))


@router.post("/bulk", response_model=BulkCreateResponse, status_code=status.HTTP_201_CREATED)
async def bulk_create_batches(
    payloads: list[BatchCreate],
    current_user: UserOut = Depends(get_current_user),
) -> BulkCreateResponse:
    if len(payloads) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 100 batches per bulk request",
        )

    batches = get_collection("batches")
    inserted_items: list[BatchOut] = []
    skipped = 0

    for payload in payloads:
        # Skip duplicates instead of failing
        if payload.batch_number:
            existing = await batches.find_one({
                "user_id": current_user.id,
                "product_id": payload.product_id,
                "batch_number": payload.batch_number,
            })
            if existing:
                skipped += 1
                continue

        doc: dict[str, Any] = _dates_to_datetime(payload.model_dump())
        doc["user_id"] = current_user.id
        doc["status"] = BatchStatus.active
        doc["alert_stages_sent"] = []
        doc["created_at"] = datetime.utcnow()

        result = await batches.insert_one(doc)
        created = await batches.find_one({"_id": result.inserted_id})
        inserted_items.append(BatchOut.from_mongo(_normalize_batch(created)))

    return BulkCreateResponse(
        inserted=len(inserted_items),
        skipped=skipped,
        items=inserted_items,
    )


@router.get("/{batch_id}", response_model=BatchOut)
async def get_batch(
    batch_id: str,
    current_user: UserOut = Depends(get_current_user),
) -> BatchOut:
    doc = await _batch_from_id(batch_id, current_user.id)
    return BatchOut.from_mongo(_normalize_batch(doc))


@router.put("/{batch_id}", response_model=BatchOut)
async def update_batch(
    batch_id: str,
    payload: BatchCreate,
    current_user: UserOut = Depends(get_current_user),
) -> BatchOut:
    batches = get_collection("batches")
    update_data = _dates_to_datetime(payload.model_dump(exclude_unset=True))

    updated = await batches.find_one_and_update(
        {"_id": ObjectId(batch_id), "user_id": current_user.id},
        {"$set": update_data},
        return_document=True,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")
    return BatchOut.from_mongo(_normalize_batch(updated))


@router.put("/{batch_id}/status", response_model=BatchOut)
async def update_batch_status(
    batch_id: str,
    payload: BatchStatusUpdate,
    current_user: UserOut = Depends(get_current_user),
) -> BatchOut:
    batches = get_collection("batches")
    updated = await batches.find_one_and_update(
        {"_id": ObjectId(batch_id), "user_id": current_user.id},
        {"$set": {"status": payload.status}},
        return_document=True,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")
    return BatchOut.from_mongo(_normalize_batch(updated))


@router.delete("/{batch_id}")
async def delete_batch(
    batch_id: str,
    current_user: UserOut = Depends(get_current_user),
) -> dict[str, bool]:
    batches = get_collection("batches")
    result = await batches.delete_one(
        {"_id": ObjectId(batch_id), "user_id": current_user.id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")
    return {"deleted": True}


# ── Discount suggestion ───────────────────────────────────────

_DISCOUNT_TABLE: list[tuple[int, int, str]] = [
    # (days_threshold, discount_pct, reasoning_template)
    (30, 10, "{days} days left. A 10% early-bird discount keeps the product moving while the return window is still open."),
    (15, 25, "{days} days left. A 25% discount maximises recovery — better than a full return write-off."),
    (7, 40, "{days} days left. A 40% discount is recommended for quick clearance before shelf removal is required."),
    (0, 50, "{days} days left. A 50% flash discount is the last resort to recover any value before disposal."),
]


@router.get("/{batch_id}/discount-suggestion")
async def discount_suggestion(
    batch_id: str,
    current_user: UserOut = Depends(get_current_user),
) -> dict[str, Any]:
    doc = await _batch_from_id(batch_id, current_user.id)
    batch = _normalize_batch(doc)

    expiry = batch.get("expiry_date")
    if not expiry:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Batch has no expiry date",
        )

    days_left = (expiry - date.today()).days
    purchase_price: float = batch.get("purchase_price", 0.0)
    quantity: int = batch.get("quantity", 0)

    # Walk table from tightest threshold upward
    discount_pct = 50
    reasoning_tpl = _DISCOUNT_TABLE[-1][2]
    for (threshold, pct, tpl) in _DISCOUNT_TABLE:
        if days_left >= threshold:
            discount_pct = pct
            reasoning_tpl = tpl
            break

    suggested_price = round(purchase_price * (1 - discount_pct / 100), 2)
    estimated_recovery = round(quantity * suggested_price, 2)
    vs_full_loss = round(quantity * purchase_price, 2)
    reasoning = reasoning_tpl.format(days=days_left)

    return {
        "suggested_discount_pct": discount_pct,
        "suggested_price": suggested_price,
        "original_price": purchase_price,
        "reasoning": reasoning,
        "estimated_recovery": estimated_recovery,
        "vs_full_loss": vs_full_loss,
        "days_to_expiry": days_left,
    }
