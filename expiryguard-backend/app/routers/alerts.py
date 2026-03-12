from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.database import get_collection
from app.models.alert import AlertOut
from app.models.user import UserOut

router = APIRouter(prefix="/alerts", tags=["alerts"])


class PaginatedAlerts(BaseModel):
    items: list[AlertOut]
    unread_count: int


class MarkAllReadResponse(BaseModel):
    updated: int


@router.get("", response_model=PaginatedAlerts)
async def list_alerts(
    read: bool | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: UserOut = Depends(get_current_user),
) -> PaginatedAlerts:
    alerts = get_collection("alerts")
    query: dict = {"user_id": current_user.id}
    if read is not None:
        query["read"] = read

    skip = (page - 1) * limit
    cursor = alerts.find(query).sort("sent_at", -1).skip(skip).limit(limit)
    items = [AlertOut.from_mongo(doc) async for doc in cursor]

    # Always provide the total unread count regardless of filter
    unread_count = await alerts.count_documents({"user_id": current_user.id, "read": False})

    return PaginatedAlerts(items=items, unread_count=unread_count)


@router.put("/{alert_id}/read", response_model=AlertOut)
async def mark_alert_read(
    alert_id: str,
    current_user: UserOut = Depends(get_current_user),
) -> AlertOut:
    alerts = get_collection("alerts")
    updated = await alerts.find_one_and_update(
        {"_id": ObjectId(alert_id), "user_id": current_user.id},
        {"$set": {"read": True}},
        return_document=True,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return AlertOut.from_mongo(updated)


@router.put("/read-all", response_model=MarkAllReadResponse)
async def mark_all_read(
    current_user: UserOut = Depends(get_current_user),
) -> MarkAllReadResponse:
    alerts = get_collection("alerts")
    result = await alerts.update_many(
        {"user_id": current_user.id, "read": False},
        {"$set": {"read": True}},
    )
    return MarkAllReadResponse(updated=result.modified_count)
