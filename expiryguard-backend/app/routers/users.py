from typing import Any
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from app.auth.dependencies import get_current_user
from app.database import get_collection
from app.models.user import UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

@router.patch("/me", response_model=UserOut)
async def update_me(
    payload: UserUpdate,
    current_user: UserOut = Depends(get_current_user)
) -> UserOut:
    users = get_collection("users")
    
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    
    if not update_data:
        return current_user

    result = await users.update_one(
        {"_id": ObjectId(current_user.id)},
        {"$set": update_data}
    )

    if result.modified_count == 0:
        # It's possible the data was the same, so no modification occurred.
        # But we still return the user.
        pass

    updated_doc = await users.find_one({"_id": ObjectId(current_user.id)})
    if not updated_doc:
        raise HTTPException(status_code=404, detail="User not found")
        
    return UserOut.from_mongo(updated_doc)
