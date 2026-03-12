from datetime import date, datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.dependencies import get_current_user, get_distributor_user
from app.database import get_collection
from app.models.supplier import SupplierCreate, SupplierOut
from app.models.user import UserOut

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


# ── Standard CRUD ─────────────────────────────────────────────

@router.get("", response_model=list[SupplierOut])
async def list_suppliers(
    current_user: UserOut = Depends(get_current_user),
) -> list[SupplierOut]:
    suppliers = get_collection("suppliers")
    cursor = suppliers.find({"user_id": current_user.id}).sort("name", 1)
    return [SupplierOut.from_mongo(doc) async for doc in cursor]


@router.post("", response_model=SupplierOut, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    payload: SupplierCreate,
    current_user: UserOut = Depends(get_current_user),
) -> SupplierOut:
    suppliers = get_collection("suppliers")
    doc: dict[str, Any] = payload.model_dump()
    doc["user_id"] = current_user.id
    doc["created_at"] = datetime.utcnow()
    result = await suppliers.insert_one(doc)
    created = await suppliers.find_one({"_id": result.inserted_id})
    return SupplierOut.from_mongo(created)


@router.put("/{supplier_id}", response_model=SupplierOut)
async def update_supplier(
    supplier_id: str,
    payload: SupplierCreate,
    current_user: UserOut = Depends(get_current_user),
) -> SupplierOut:
    suppliers = get_collection("suppliers")
    updated = await suppliers.find_one_and_update(
        {"_id": ObjectId(supplier_id), "user_id": current_user.id},
        {"$set": payload.model_dump(exclude_unset=True)},
        return_document=True,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return SupplierOut.from_mongo(updated)


@router.delete("/{supplier_id}")
async def delete_supplier(
    supplier_id: str,
    current_user: UserOut = Depends(get_current_user),
) -> dict[str, bool]:
    suppliers = get_collection("suppliers")
    result = await suppliers.delete_one(
        {"_id": ObjectId(supplier_id), "user_id": current_user.id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return {"deleted": True}


# ── Distributor network ───────────────────────────────────────

class LinkDistributorRequest(BaseModel):
    distributor_id: str


@router.post("/distributor/link")
async def link_distributor(
    body: LinkDistributorRequest,
    current_user: UserOut = Depends(get_current_user),
) -> dict[str, bool]:
    """Shop owner links themselves to a distributor."""
    if current_user.role != "shop_owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only shop owners can link to a distributor",
        )

    # Verify the distributor exists
    users = get_collection("users")
    distributor = await users.find_one(
        {"_id": ObjectId(body.distributor_id), "role": "distributor"}
    )
    if not distributor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Distributor not found",
        )

    network = get_collection("distributor_network")

    # Idempotent — don't duplicate the link
    existing = await network.find_one(
        {"distributor_id": body.distributor_id, "retailer_id": current_user.id}
    )
    if not existing:
        await network.insert_one({
            "distributor_id": body.distributor_id,
            "retailer_id": current_user.id,
            "linked_at": datetime.utcnow(),
        })

    return {"linked": True}


@router.get("/distributor/retailers", response_model=list[UserOut])
async def get_linked_retailers(
    distributor: UserOut = Depends(get_distributor_user),
) -> list[UserOut]:
    """Return all retailers linked to the authenticated distributor."""
    network = get_collection("distributor_network")
    links = await network.find({"distributor_id": distributor.id}).to_list(length=None)
    retailer_ids = [ObjectId(link["retailer_id"]) for link in links]

    if not retailer_ids:
        return []

    users = get_collection("users")
    cursor = users.find({"_id": {"$in": retailer_ids}})
    return [UserOut.from_mongo(doc) async for doc in cursor]


# ── Bulk pickup scheduling ────────────────────────────────────

class BulkPickupRequest(BaseModel):
    batch_ids: list[str]
    pickup_date: date


@router.post("/distributor/bulk-pickup")
async def bulk_pickup(
    body: BulkPickupRequest,
    distributor: UserOut = Depends(get_distributor_user),
) -> dict[str, int]:
    """
    Distributor schedules pickup for a list of batches.
    Updates each batch status to pickup_scheduled and notifies
    the owning retailer with an in-app alert.
    """
    if not body.batch_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="batch_ids cannot be empty"
        )

    batches = get_collection("batches")
    alerts = get_collection("alerts")
    network = get_collection("distributor_network")

    # Build set of retailer IDs linked to this distributor for auth check
    links = await network.find({"distributor_id": distributor.id}).to_list(length=None)
    allowed_retailer_ids = {link["retailer_id"] for link in links}

    pickup_date_str = body.pickup_date.strftime("%d/%m/%Y")
    scheduled = 0
    notified_retailers: set[str] = set()
    now = datetime.utcnow()

    for batch_id in body.batch_ids:
        try:
            oid = ObjectId(batch_id)
        except Exception:
            continue

        batch = await batches.find_one({"_id": oid})
        if not batch:
            continue

        # Only act on batches owned by linked retailers
        owner_id = batch.get("user_id", "")
        if owner_id not in allowed_retailer_ids:
            continue

        await batches.update_one(
            {"_id": oid},
            {"$set": {"status": "pickup_scheduled"}},
        )
        scheduled += 1

        # Create in-app alert for the retailer
        product_name = batch.get("product_name", "Unknown")
        batch_no = batch.get("batch_number", "N/A")
        await alerts.insert_one({
            "user_id": owner_id,
            "batch_id": batch_id,
            "product_name": product_name,
            "alert_type": "pickup_scheduled",
            "message": (
                f"📦 Pickup scheduled for {product_name} (Batch {batch_no}) "
                f"on {pickup_date_str}. Please keep the stock ready."
            ),
            "sent_via": "in_app",
            "sent_at": now,
            "read": False,
        })
        notified_retailers.add(owner_id)

    return {
        "scheduled": scheduled,
        "notified_retailers": len(notified_retailers),
    }
