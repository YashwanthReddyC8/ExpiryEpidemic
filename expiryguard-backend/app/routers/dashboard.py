from datetime import datetime, timedelta
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user, get_distributor_user
from app.database import get_collection
from app.models.batch import BatchStatus
from app.models.user import UserOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _today_midnight() -> datetime:
    return datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)


# ── /summary ─────────────────────────────────────────────────

@router.get("/summary")
async def get_summary(current_user: UserOut = Depends(get_current_user)) -> dict[str, Any]:
    batches = get_collection("batches")
    today = _today_midnight()
    active_statuses = [BatchStatus.active, BatchStatus.expiring_soon]
    user_filter: dict[str, Any] = {"user_id": current_user.id}

    # ── Scalar counts ─────────────────────────────────────────
    total_active = await batches.count_documents(
        {**user_filter, "status": {"$in": active_statuses}}
    )
    expired_count = await batches.count_documents(
        {**user_filter, "status": BatchStatus.expired}
    )

    def _expiry_filter(days: int) -> dict:
        return {
            **user_filter,
            "status": {"$in": active_statuses},
            "expiry_date": {"$gte": today, "$lte": today + timedelta(days=days)},
        }

    expiring_7 = await batches.count_documents(_expiry_filter(7))
    expiring_30 = await batches.count_documents(_expiry_filter(30))
    expiring_60 = await batches.count_documents(_expiry_filter(60))

    # ── Distinct SKUs ─────────────────────────────────────────
    total_skus = len(
        await batches.distinct("product_id", user_filter)
    )

    # ── At-risk value: sum(qty * price) for batches expiring ≤ 30 days ─
    at_risk_pipeline = [
        {"$match": _expiry_filter(30)},
        {
            "$group": {
                "_id": None,
                "at_risk_value": {"$sum": {"$multiply": ["$quantity", "$purchase_price"]}},
            }
        },
    ]
    at_risk_result = await batches.aggregate(at_risk_pipeline).to_list(length=1)
    at_risk_value: float = at_risk_result[0]["at_risk_value"] if at_risk_result else 0.0

    # ── Weekly expiry chart (next 8 weeks) ────────────────────
    eight_weeks = today + timedelta(weeks=8)
    weekly_pipeline = [
        {
            "$match": {
                **user_filter,
                "status": {"$in": active_statuses},
                "expiry_date": {"$gte": today, "$lte": eight_weeks},
            }
        },
        {
            "$group": {
                "_id": {
                    "$toInt": {
                        "$divide": [
                            {"$subtract": ["$expiry_date", today]},
                            1000 * 60 * 60 * 24 * 7,  # ms per week
                        ]
                    }
                },
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    raw_weeks = await batches.aggregate(weekly_pipeline).to_list(length=None)

    # Build a complete 8-week list including zeros
    week_map: dict[int, int] = {r["_id"]: r["count"] for r in raw_weeks}
    weekly_expiry_chart = [
        {
            "week_label": f"Week {w + 1} (+{w * 7}–{(w + 1) * 7}d)",
            "count": week_map.get(w, 0),
        }
        for w in range(8)
    ]

    return {
        "total_active_batches": total_active,
        "expiring_7": expiring_7,
        "expiring_30": expiring_30,
        "expiring_60": expiring_60,
        "expired_count": expired_count,
        "total_skus": total_skus,
        "at_risk_value": round(at_risk_value, 2),
        "weekly_expiry_chart": weekly_expiry_chart,
        "generated_at": datetime.utcnow().isoformat(),
    }


# ── /distributor ──────────────────────────────────────────────

@router.get("/distributor")
async def distributor_dashboard(
    distributor: UserOut = Depends(get_distributor_user),
) -> dict[str, Any]:
    network = get_collection("distributor_network")
    batches = get_collection("batches")
    users = get_collection("users")

    # All retailer IDs linked to this distributor
    links = await network.find({"distributor_id": distributor.id}).to_list(length=None)
    retailer_ids = [link["retailer_id"] for link in links]
    linked_retailers = len(retailer_ids)

    if not retailer_ids:
        return {
            "linked_retailers": 0,
            "total_at_risk_batches": 0,
            "batches": [],
            "return_requests_pending": 0,
        }

    today = _today_midnight()
    day30 = today + timedelta(days=30)
    active_statuses = [BatchStatus.active, BatchStatus.expiring_soon]

    at_risk_query: dict[str, Any] = {
        "user_id": {"$in": retailer_ids},
        "status": {"$in": active_statuses},
        "expiry_date": {"$gte": today, "$lte": day30},
    }
    total_at_risk = await batches.count_documents(at_risk_query)

    # Fetch user map for retailer names
    user_docs = await users.find({"_id": {"$in": [ObjectId(rid) for rid in retailer_ids]}}).to_list(length=None)
    user_map = {str(u["_id"]): u for u in user_docs}

    # Fetch at-risk batch details
    cursor = batches.find(at_risk_query).sort("expiry_date", 1)
    batch_list: list[dict[str, Any]] = []
    async for b in cursor:
        expiry = b.get("expiry_date")
        if isinstance(expiry, datetime):
            expiry = expiry.date()
        days_left = (expiry - today.date()).days if expiry else None
        retailer = user_map.get(b.get("user_id", ""), {})
        batch_list.append({
            "retailer_name": retailer.get("name", "Unknown"),
            "retailer_shop": retailer.get("shop_name", "Unknown"),
            "product_name": b.get("product_name"),
            "batch_number": b.get("batch_number"),
            "expiry_date": str(expiry),
            "quantity": b.get("quantity"),
            "days_left": days_left,
        })

    # Count returned/pickup_scheduled across all linked retailers
    return_requests_pending = await batches.count_documents({
        "user_id": {"$in": retailer_ids},
        "status": BatchStatus.returned,
    })

    return {
        "linked_retailers": linked_retailers,
        "total_at_risk_batches": total_at_risk,
        "batches": batch_list,
        "return_requests_pending": return_requests_pending,
    }
