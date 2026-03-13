from datetime import datetime
import re
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.database import get_collection
from app.models.product import ProductCreate, ProductOut
from app.models.user import UserOut

router = APIRouter(prefix="/products", tags=["products"])


class ImportSupplierProductRequest(BaseModel):
    supplier_sku: str


@router.get("", response_model=list[ProductOut])
async def list_products(
    current_user: UserOut = Depends(get_current_user),
) -> list[ProductOut]:
    products = get_collection("products")
    cursor = products.find({"user_id": current_user.id}).sort("name", 1)
    return [ProductOut.from_mongo(doc) async for doc in cursor]


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    current_user: UserOut = Depends(get_current_user),
) -> ProductOut:
    products = get_collection("products")
    if not payload.sku:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SKU is required",
        )

    existing = await products.find_one({"user_id": current_user.id, "sku": payload.sku})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="SKU already exists in your catalog",
        )

    doc: dict[str, Any] = payload.model_dump()
    doc["user_id"] = current_user.id
    doc["created_at"] = datetime.utcnow()
    result = await products.insert_one(doc)
    created = await products.find_one({"_id": result.inserted_id})
    return ProductOut.from_mongo(created)


@router.post("/import-from-supplier", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def import_product_from_supplier(
    payload: ImportSupplierProductRequest,
    current_user: UserOut = Depends(get_current_user),
) -> ProductOut:
    """Import a product into a shopkeeper catalog using connected distributor SKU."""
    if current_user.role != "shopkeeper":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only shopkeepers can import supplier products",
        )

    supplier_sku = payload.supplier_sku.strip()
    if not supplier_sku:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="supplier_sku is required",
        )
    normalized_supplier_sku = supplier_sku.upper()

    users = get_collection("users")
    network = get_collection("distributor_network")
    products = get_collection("products")

    connected_distributor_ids = {
        distributor_id
        for distributor_id in current_user.distributor_network
        if distributor_id
    }

    # Include links persisted in distributor_network collection.
    links = await network.find({"retailer_id": current_user.id}).to_list(length=None)
    for link in links:
        distributor_id = link.get("distributor_id")
        if distributor_id:
            connected_distributor_ids.add(distributor_id)

    if not connected_distributor_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No connected distributors found",
        )

    connected_distributor_oids: list[ObjectId] = []
    for distributor_id in connected_distributor_ids:
        try:
            connected_distributor_oids.append(ObjectId(distributor_id))
        except Exception:
            continue

    if not connected_distributor_oids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid distributor links found",
        )

    distributor_docs = await users.find(
        {"_id": {"$in": connected_distributor_oids}, "role": "distributor"},
        {"_id": 1},
    ).to_list(length=None)
    allowed_distributor_ids = {str(doc["_id"]) for doc in distributor_docs}

    source_product = await products.find_one(
        {
            "user_id": {"$in": list(allowed_distributor_ids)},
            "$or": [
                {"sku": normalized_supplier_sku},
                {"sku": {"$regex": f"^{re.escape(supplier_sku)}$", "$options": "i"}},
            ],
        }
    )
    if not source_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier SKU not found in your connected network",
        )

    duplicate = await products.find_one(
        {
            "user_id": current_user.id,
            "name": source_product.get("name"),
            "barcode": source_product.get("barcode"),
            "unit": source_product.get("unit"),
        }
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This product already exists in your catalog",
        )

    doc: dict[str, Any] = {
        "name": source_product.get("name", ""),
        "sku": source_product.get("sku"),
        "barcode": source_product.get("barcode"),
        "category": source_product.get("category", ""),
        "unit": source_product.get("unit", "pcs"),
        "default_supplier_id": source_product.get("user_id"),
        "user_id": current_user.id,
        "created_at": datetime.utcnow(),
    }
    result = await products.insert_one(doc)
    created = await products.find_one({"_id": result.inserted_id})
    return ProductOut.from_mongo(created)


@router.put("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: str,
    payload: ProductCreate,
    current_user: UserOut = Depends(get_current_user),
) -> ProductOut:
    products = get_collection("products")
    if not payload.sku:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SKU is required",
        )

    duplicate = await products.find_one(
        {
            "_id": {"$ne": ObjectId(product_id)},
            "user_id": current_user.id,
            "sku": payload.sku,
        }
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="SKU already exists in your catalog",
        )

    updated = await products.find_one_and_update(
        {"_id": ObjectId(product_id), "user_id": current_user.id},
        {"$set": payload.model_dump(exclude_unset=True)},
        return_document=True,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return ProductOut.from_mongo(updated)


@router.delete("/{product_id}")
async def delete_product(
    product_id: str,
    current_user: UserOut = Depends(get_current_user),
) -> dict[str, bool]:
    products = get_collection("products")
    result = await products.delete_one(
        {"_id": ObjectId(product_id), "user_id": current_user.id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return {"deleted": True}
