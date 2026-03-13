from datetime import date, datetime
import re

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.config import settings
from app.database import get_collection
from app.models.alert import AlertOut
from app.models.user import UserOut
from app.scheduler.jobs import build_alert_message, send_whatsapp_alert

router = APIRouter(prefix="/alerts", tags=["alerts"])

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def _clean_error_text(text: str) -> str:
    cleaned = _ANSI_RE.sub("", text or "")
    return " ".join(cleaned.split())


async def _get_whatsapp_test_message(user_id: str) -> str:
    alerts = get_collection("alerts")
    batches = get_collection("batches")

    latest_alert = await alerts.find_one(
        {"user_id": user_id},
        sort=[("sent_at", -1)],
    )
    if latest_alert and latest_alert.get("message"):
        return str(latest_alert["message"])

    batch = await batches.find_one(
        {"user_id": user_id},
        sort=[("expiry_date", 1)],
    )
    if batch:
        expiry = batch.get("expiry_date")
        if isinstance(expiry, datetime):
            expiry = expiry.date()
        elif isinstance(expiry, str):
            expiry = datetime.fromisoformat(expiry.replace("Z", "+00:00")).date()

        if isinstance(expiry, date):
            days_left = (expiry - date.today()).days
            if days_left < 0:
                product = batch.get("product_name", "Unknown Product")
                batch_no = batch.get("batch_number", "N/A")
                return (
                    f"❌ {product} (Batch {batch_no}) has EXPIRED. "
                    f"Remove from shelf immediately. Generate a return or disposal request."
                )
            return build_alert_message(batch, days_left)

    return "⏰ Test alert: no recent batch data found. Add inventory to receive real expiry alerts."


class PaginatedAlerts(BaseModel):
    items: list[AlertOut]
    unread_count: int


class MarkAllReadResponse(BaseModel):
    updated: int


class TestWhatsappResponse(BaseModel):
    ok: bool
    detail: str
    sent_to: str | None = None


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


@router.post("/test-whatsapp", response_model=TestWhatsappResponse)
async def send_test_whatsapp_alert(
    current_user: UserOut = Depends(get_current_user),
) -> TestWhatsappResponse:
    users = get_collection("users")
    user_doc = await users.find_one({"_id": ObjectId(current_user.id)})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    whatsapp_number = user_doc.get("whatsapp_number")
    if not whatsapp_number:
        raise HTTPException(status_code=400, detail="Please add WhatsApp number in Settings first")

    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        raise HTTPException(status_code=500, detail="Twilio is not configured on server")

    # Force-enable whatsapp_alerts for test message only, so users can verify setup quickly.
    test_user = dict(user_doc)
    prefs = dict(test_user.get("alert_prefs") or {})
    prefs["whatsapp_alerts"] = True
    test_user["alert_prefs"] = prefs

    message = await _get_whatsapp_test_message(current_user.id)
    try:
        sent = await send_whatsapp_alert(test_user, message, raise_on_error=True)
    except Exception as exc:
        code = getattr(exc, "code", None)
        detail = _clean_error_text(str(exc)) or "Failed to send WhatsApp test message"
        if code == 20003:
            detail = (
                "Twilio authentication failed (20003). "
                "Update TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in backend .env, then restart server."
            )
        elif code:
            detail = f"Twilio error {code}: {detail}"
        raise HTTPException(status_code=502, detail=detail)

    if not sent:
        raise HTTPException(status_code=502, detail="Failed to send WhatsApp test message")

    return TestWhatsappResponse(
        ok=True,
        detail="WhatsApp test message sent",
        sent_to=whatsapp_number,
    )
