from fastapi import APIRouter, Depends, HTTPException
from typing import Any, List
from pydantic import BaseModel
from datetime import datetime, timezone

from app.auth.dependencies import get_current_user
from app.models.user import UserOut

router = APIRouter(prefix="/billing", tags=["billing"])

class SessionItem(BaseModel):
    id: str
    title: str
    barcode: str
    price: float
    quantity: int
    image_url: str | None = None

class SessionRow(BaseModel):
    id: str
    session_code: str
    state: str
    total_amount: float
    cart_hash: str | None = None
    payment_method: str | None = None
    customer_name: str
    created_at: str

# In-memory mock data for the Queue-less mart presentation
MOCK_SESSIONS = [
    {
        "id": "sess_1",
        "session_code": "QL-9A2X",
        "state": "LOCKED",
        "total_amount": 345.50,
        "cart_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "payment_method": "upi_app",
        "customer_name": "Aditi Sharma",
        "created_at": datetime.now(timezone.utc).isoformat()
    },
    {
        "id": "sess_2",
        "session_code": "QL-8B1Y",
        "state": "VERIFIED",
        "total_amount": 120.00,
        "cart_hash": "f2a1b44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b123",
        "payment_method": "cash",
        "customer_name": "Rahul Verma",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
]

MOCK_ITEMS = {
    "sess_1": [
        {"id": "item_1", "title": "Paracetamol 500mg", "barcode": "890123456", "price": 45.50, "quantity": 1, "image_url": None},
        {"id": "item_2", "title": "Dettol Antiseptic", "barcode": "890123457", "price": 150.00, "quantity": 2, "image_url": None}
    ],
    "sess_2": [
        {"id": "item_3", "title": "Amul Butter 100g", "barcode": "890123458", "price": 60.00, "quantity": 2, "image_url": None}
    ]
}

@router.get("/sessions", response_model=List[SessionRow])
async def get_sessions(current_user: UserOut = Depends(get_current_user)):
    return MOCK_SESSIONS

@router.get("/sessions/{session_id}/items", response_model=List[SessionItem])
async def get_session_items(session_id: str, current_user: UserOut = Depends(get_current_user)):
    return MOCK_ITEMS.get(session_id, [])

@router.post("/sessions/{session_id}/verify")
async def verify_session(session_id: str, current_user: UserOut = Depends(get_current_user)):
    for s in MOCK_SESSIONS:
        if s["id"] == session_id:
            s["state"] = "VERIFIED"
            return s
    raise HTTPException(status_code=404, detail="Session not found")

@router.post("/sessions/{session_id}/pay")
async def pay_session(session_id: str, current_user: UserOut = Depends(get_current_user)):
    for s in MOCK_SESSIONS:
        if s["id"] == session_id:
            s["state"] = "PAID"
            return s
    raise HTTPException(status_code=404, detail="Session not found")

@router.post("/sessions/{session_id}/reject")
async def reject_session(session_id: str, current_user: UserOut = Depends(get_current_user)):
    # Simulating returning to customer bag
    for s in MOCK_SESSIONS:
        if s["id"] == session_id:
            s["state"] = "ACTIVE"
            s["cart_hash"] = None
            return s
    raise HTTPException(status_code=404, detail="Session not found")

@router.post("/sessions/{session_id}/payment-method")
async def update_payment_method(session_id: str, payload: dict, current_user: UserOut = Depends(get_current_user)):
    method = payload.get("method")
    for s in MOCK_SESSIONS:
        if s["id"] == session_id:
            s["payment_method"] = method
            return s
    raise HTTPException(status_code=404, detail="Session not found")
