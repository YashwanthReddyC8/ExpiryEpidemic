from datetime import datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import get_current_user
from app.database import get_collection
from app.models.product import ProductCreate, ProductOut
from app.models.user import UserOut

router = APIRouter(prefix="/products", tags=["products"])


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
    doc: dict[str, Any] = payload.model_dump()
    doc["user_id"] = current_user.id
    doc["created_at"] = datetime.utcnow()
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
