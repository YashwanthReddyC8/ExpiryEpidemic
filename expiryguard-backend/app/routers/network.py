"""
Network connection system:
    Shopkeeper  →  searches distributor by email
                         →  sends connect request
    Distributor →  sees pending requests
                         →  accepts/rejects

On accept: both users are linked in users.distributor_network[] and
also mirrored in distributor_network collection for dashboard queries.
"""
from datetime import datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.database import get_collection
from app.models.user import UserOut

router = APIRouter(prefix="/network", tags=["network"])


# ── Search a registered user by email ─────────────────────────

@router.get("/search")
async def search_user(
    email: str,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Search for a registered ExpiryGuard user by email.
    Returns public profile info (no sensitive data).
    """
    users = get_collection("users")
    doc = await users.find_one(
        {"email": email.strip().lower()},
        {"password_hash": 0}   # never return the hash
    )
    if not doc:
        raise HTTPException(status_code=404, detail="No user found with that email")
    if str(doc["_id"]) == current_user.id:
        raise HTTPException(status_code=400, detail="That's your own account!")

    return {
        "id":        str(doc["_id"]),
        "name":      doc.get("name", ""),
        "email":     doc.get("email", ""),
        "shop_name": doc.get("shop_name", ""),
        "role":      doc.get("role", "shopkeeper"),
        "whatsapp":  doc.get("whatsapp_number", ""),
    }


# ── Send a connection request ──────────────────────────────────

class ConnectRequest(BaseModel):
    target_user_id: str
    message: str = ""


@router.post("/connect", status_code=201)
async def send_connect_request(
    payload: ConnectRequest,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Shopkeeper sends a connection request to a distributor.
    Creates a pending request document.
    """
    requests_col = get_collection("network_requests")
    users = get_collection("users")

    if current_user.role != "shopkeeper":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only shopkeepers can send distributor connection requests",
        )

    # Validate target exists
    try:
        target = await users.find_one({"_id": ObjectId(payload.target_user_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    if target.get("role") != "distributor":
        raise HTTPException(
            status_code=400,
            detail="You can only connect to distributor accounts",
        )

    # Prevent duplicate pending requests
    existing = await requests_col.find_one({
        "from_id":  current_user.id,
        "to_id":    payload.target_user_id,
        "status":   "pending"
    })
    if existing:
        raise HTTPException(status_code=409, detail="Connection request already sent")

    # Also check if already connected
    from_doc = await users.find_one({"_id": ObjectId(current_user.id)})
    network = from_doc.get("distributor_network", [])
    if payload.target_user_id in network:
        raise HTTPException(status_code=409, detail="Already connected")

    doc = {
        "from_id":   current_user.id,
        "from_name": current_user.name,
        "from_shop": current_user.shop_name or "",
        "from_email": current_user.email,
        "to_id":     payload.target_user_id,
        "to_name":   target.get("name", ""),
        "to_email":  target.get("email", ""),
        "to_shop":   target.get("shop_name", ""),
        "message":   payload.message,
        "status":    "pending",
        "created_at": datetime.utcnow(),
    }
    result = await requests_col.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return {"ok": True, "request_id": doc["id"], "to_name": target.get("name")}


# ── List requests (for current user as recipient) ──────────────

@router.get("/requests")
async def list_requests(
    current_user: UserOut = Depends(get_current_user),
):
    """
    Returns all pending connection requests sent TO the current user.
    (Distributors use this to see who wants to link.)
    """
    requests_col = get_collection("network_requests")
    cursor = requests_col.find({"to_id": current_user.id}).sort("created_at", -1)
    results = []
    async for doc in cursor:
        results.append({
            "id":         str(doc["_id"]),
            "from_id":    doc["from_id"],
            "from_name":  doc.get("from_name", ""),
            "from_shop":  doc.get("from_shop", ""),
            "from_email": doc.get("from_email", ""),
            "message":    doc.get("message", ""),
            "status":     doc["status"],
            "created_at": doc["created_at"].isoformat() if doc.get("created_at") else "",
        })
    return results


# ── List requests I SENT (for shopkeepers to see status) ───────

@router.get("/requests/sent")
async def list_sent_requests(
    current_user: UserOut = Depends(get_current_user),
):
    """Returns all requests the current user has sent."""
    requests_col = get_collection("network_requests")
    users = get_collection("users")
    cursor = requests_col.find({"from_id": current_user.id}).sort("created_at", -1)
    results = []
    async for doc in cursor:
        to_email = doc.get("to_email", "")
        to_shop = doc.get("to_shop", "")

        # Backward compatibility for older network_requests documents.
        if (not to_email or not to_shop) and doc.get("to_id"):
            try:
                target = await users.find_one({"_id": ObjectId(doc["to_id"])})
            except Exception:
                target = None
            if target:
                to_email = to_email or target.get("email", "")
                to_shop = to_shop or target.get("shop_name", "")

        results.append({
            "id":       str(doc["_id"]),
            "to_id":    doc["to_id"],
            "to_name":  doc.get("to_name", ""),
            "to_email": to_email,
            "to_shop":  to_shop,
            "message":  doc.get("message", ""),
            "status":   doc["status"],
            "created_at": doc["created_at"].isoformat() if doc.get("created_at") else "",
        })
    return results


# ── Accept / Reject ────────────────────────────────────────────

class RequestAction(BaseModel):
    action: str   # "accept" or "reject"


@router.post("/requests/{request_id}")
async def handle_request(
    request_id: str,
    payload: RequestAction,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Accept or reject a connection request.
    On accept: adds the sender's id into the current user's distributor_network[]
    AND adds current user's id into the sender's distributor_network[].
    """
    requests_col = get_collection("network_requests")
    users = get_collection("users")

    if current_user.role != "distributor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only distributors can accept or reject requests",
        )

    try:
        req = await requests_col.find_one({"_id": ObjectId(request_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request ID")

    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["to_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your request")
    if req["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Request already {req['status']}")

    if payload.action == "accept":
        # Add each other to their distributor_network
        await users.update_one(
            {"_id": ObjectId(req["to_id"])},
            {"$addToSet": {"distributor_network": req["from_id"]}}
        )
        await users.update_one(
            {"_id": ObjectId(req["from_id"])},
            {"$addToSet": {"distributor_network": req["to_id"]}}
        )
        # Keep the network collection in sync for distributor dashboard queries.
        network = get_collection("distributor_network")
        existing_link = await network.find_one(
            {"distributor_id": req["to_id"], "retailer_id": req["from_id"]}
        )
        if not existing_link:
            await network.insert_one(
                {
                    "distributor_id": req["to_id"],
                    "retailer_id": req["from_id"],
                    "linked_at": datetime.utcnow(),
                }
            )
        await requests_col.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": {"status": "accepted"}}
        )
        return {"ok": True, "status": "accepted"}

    elif payload.action == "reject":
        await requests_col.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": {"status": "rejected"}}
        )
        return {"ok": True, "status": "rejected"}

    raise HTTPException(status_code=400, detail="action must be 'accept' or 'reject'")
