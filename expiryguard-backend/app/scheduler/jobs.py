"""
scheduler/jobs.py
-----------------
Daily expiry alert job for ExpiryGuard.
Runs at 08:00 every day via APScheduler.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING
from urllib.parse import quote

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import settings
from app.database import get_database
from app.models.alert import AlertType
from app.models.batch import BatchStatus

if TYPE_CHECKING:
    from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

# Alert thresholds: (days_threshold, AlertType)
_THRESHOLDS: list[tuple[int, AlertType]] = [
    (60, AlertType.d60),
    (30, AlertType.d30),
    (15, AlertType.d15),
    (7, AlertType.d7),
]


# ── Message builders ──────────────────────────────────────────

def build_alert_message(batch: dict, days: int) -> str:
    product = batch.get("product_name", "Unknown Product")
    batch_no = batch.get("batch_number", "N/A")
    qty = batch.get("quantity", 0)
    expiry = batch.get("expiry_date")
    if isinstance(expiry, datetime):
        expiry = expiry.date()
    elif isinstance(expiry, str):
        expiry = datetime.fromisoformat(expiry.replace('Z', '+00:00')).date()
        
    expiry_str = expiry.strftime("%d/%m/%Y") if expiry else "N/A"

    if days >= 60:
        return (
            f"⏰ {product} is expiring soon. "
            f"Return window is still open — act early to recover value."
        )
    elif days >= 30:
        return (
            f"⚠️ Return deadline approaching for {product} (Batch {batch_no}). "
            f"Tap to generate a return request before the supplier window closes."
        )
    elif days >= 15:
        return (
            f"🔖 Last chance to discount or donate {product} (Qty: {qty}). "
            f"Expires {expiry_str}."
        )
    else:
        return (
            f"🚨 URGENT: {product} expires in {days} days. "
            f"Remove from shelf immediately and arrange return or disposal."
        )


def _expired_message(batch: dict) -> str:
    product = batch.get("product_name", "Unknown Product")
    batch_no = batch.get("batch_number", "N/A")
    return (
        f"❌ {product} (Batch {batch_no}) has EXPIRED. "
        f"Remove from shelf immediately. Generate a return or disposal request."
    )


# ── WhatsApp (Twilio) ─────────────────────────────────────────

async def send_whatsapp_alert(user: dict, message: str) -> bool:
    """
    Send a WhatsApp message via Twilio.
    Returns True on success, False on any failure.
    Does NOT raise — caller continues regardless.
    """
    prefs = user.get("alert_prefs", {})
    if not prefs.get("whatsapp_alerts", False):
        print(f"Skipping WA: user {user.get('email')} has whatsapp_alerts=False")
        return False

    whatsapp_number = user.get("whatsapp_number")
    if not whatsapp_number:
        print("Skipping WA: no whatsapp number found")
        return False

    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        logger.debug("Twilio credentials not configured, skipping WhatsApp send")
        print("Skipping WA: TWILIO ENV vars missing")
        return False

    try:
        from twilio.rest import Client

        # ensure format whatsapp:+91xxxxxxxxxx
        num = whatsapp_number.replace(" ", "").replace("-", "").lstrip("+")
        if not num.startswith("91"):
            num = "91" + num
        to_number = f"whatsapp:+{num}"
        
        print(f"Attempting to send WA to {to_number} using {settings.TWILIO_WHATSAPP_FROM}")
        
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        msg = client.messages.create(
            body=message,
            from_=settings.TWILIO_WHATSAPP_FROM,
            to=to_number,
        )
        logger.info("WhatsApp sent to %s (SID: %s)", to_number, msg.sid)
        print("WA Success!", msg.sid)
        return True
    except ImportError:
        logger.warning("twilio package not installed; skipping WhatsApp send")
        print("WA Failed: Twilio package missing")
        return False
    except Exception as exc:
        logger.warning("WhatsApp send failed: %s", exc)
        print("WA Exception:", str(exc))
        return False


# ── Core job ──────────────────────────────────────────────────

async def run_expiry_alerts(db: AsyncIOMotorDatabase | None = None) -> dict:
    """
    Scan every active batch across all users.
    Create in-app alerts (and attempt WhatsApp) at each threshold.
    Returns a summary dict for logging / admin endpoint.
    """
    if db is None:
        db = get_database()

    batches_col = db["batches"]
    alerts_col = db["alerts"]
    users_col = db["users"]

    today = date.today()
    now = datetime.utcnow()

    active_statuses = [BatchStatus.active.value, BatchStatus.expiring_soon.value]
    cursor = batches_col.find({"status": {"$in": active_statuses}})

    alerts_created = 0
    batches_updated = 0
    whatsapp_sent = 0

    # Cache users to avoid repeated DB hits
    user_cache: dict[str, dict] = {}

    async def _get_user(user_id: str) -> dict:
        if not user_id:
            return {}
        if user_id not in user_cache:
            try:
                doc = await users_col.find_one({"_id": __import__("bson").ObjectId(user_id)})
            except __import__("bson").errors.InvalidId:
                doc = None
            user_cache[user_id] = doc or {}
        return user_cache[user_id]

    async for batch in cursor:
        expiry = batch.get("expiry_date")
        if not expiry:
            continue
        if isinstance(expiry, datetime):
            expiry = expiry.date()
        elif isinstance(expiry, str):
            expiry = datetime.fromisoformat(expiry.replace('Z', '+00:00')).date()

        days_left = (expiry - today).days
        batch_id = str(batch["_id"])
        user_id = batch.get("owner_id", batch.get("user_id", ""))
        product_name = batch.get("product_name", "Unknown")
        stages_sent: list[int] = list(batch.get("alert_stages_sent", []))
        update_fields: dict = {}

        user_doc = await _get_user(user_id)

        # ── Expired ────────────────────────────────────────────
        if days_left < 0 and -1 not in stages_sent:
            message = _expired_message(batch)
            alert_doc = {
                "user_id": user_id,
                "batch_id": batch_id,
                "product_name": product_name,
                "alert_type": AlertType.expired.value,
                "message": message,
                "sent_via": "in_app",
                "sent_at": now,
                "read": False,
            }
            wa_ok = await send_whatsapp_alert(user_doc, message)
            if wa_ok:
                alert_doc["sent_via"] = "whatsapp"
                whatsapp_sent += 1

            await alerts_col.insert_one(alert_doc)
            stages_sent.append(-1)
            alerts_created += 1
            update_fields["status"] = BatchStatus.expired.value

        # ── Threshold alerts ───────────────────────────────────
        for threshold, alert_type in _THRESHOLDS:
            if days_left <= threshold and threshold not in stages_sent:
                message = build_alert_message(batch, days_left)
                alert_doc = {
                    "user_id": user_id,
                    "batch_id": batch_id,
                    "product_name": product_name,
                    "alert_type": alert_type.value,
                    "message": message,
                    "sent_via": "in_app",
                    "sent_at": now,
                    "read": False,
                }
                wa_ok = await send_whatsapp_alert(user_doc, message)
                if wa_ok:
                    alert_doc["sent_via"] = "whatsapp"
                    whatsapp_sent += 1

                await alerts_col.insert_one(alert_doc)
                stages_sent.append(threshold)
                alerts_created += 1

        # Update status for expiring_soon if not already expired
        if "status" not in update_fields and days_left <= 30 and batch.get("status") == BatchStatus.active.value:
            update_fields["status"] = BatchStatus.expiring_soon.value

        update_fields["alert_stages_sent"] = stages_sent

        await batches_col.update_one(
            {"_id": batch["_id"]},
            {"$set": update_fields},
        )
        batches_updated += 1

    summary = {
        "alerts_created": alerts_created,
        "batches_processed": batches_updated,
        "whatsapp_sent": whatsapp_sent,
        "ran_at": now.isoformat(),
    }
    logger.info("run_expiry_alerts complete: %s", summary)
    return summary


# ── Scheduler helpers ─────────────────────────────────────────

def start_scheduler() -> None:
    scheduler.add_job(
        run_expiry_alerts,
        trigger=CronTrigger(hour=8, minute=0),
        id="run_expiry_alerts",
        name="Daily Expiry Alert Check",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.start()
    logger.info("APScheduler started")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")
