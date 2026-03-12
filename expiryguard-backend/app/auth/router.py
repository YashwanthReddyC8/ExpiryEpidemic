from datetime import datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.auth.dependencies import get_current_user
from app.auth.utils import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.database import get_collection
from app.models.user import UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Response schemas ──────────────────────────────────────────
class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


# ── Helpers ───────────────────────────────────────────────────
def _make_tokens(user_id: str) -> tuple[str, str]:
    data = {"sub": user_id}
    return create_access_token(data), create_refresh_token(data)


# ── Endpoints ─────────────────────────────────────────────────
@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate) -> AuthResponse:
    users = get_collection("users")

    if await users.find_one({"email": payload.email}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    doc: dict[str, Any] = payload.model_dump(exclude={"password"})
    doc["hashed_password"] = hash_password(payload.password)
    doc["created_at"] = datetime.utcnow()

    result = await users.insert_one(doc)
    created = await users.find_one({"_id": result.inserted_id})
    user = UserOut.from_mongo(created)
    access_token, refresh_token = _make_tokens(user.id)

    return AuthResponse(access_token=access_token, refresh_token=refresh_token, user=user)


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest) -> AuthResponse:
    users = get_collection("users")
    doc = await users.find_one({"email": payload.email})

    if not doc or not verify_password(payload.password, doc["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = UserOut.from_mongo(doc)
    access_token, refresh_token = _make_tokens(user.id)

    return AuthResponse(access_token=access_token, refresh_token=refresh_token, user=user)


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_tokens(body: RefreshRequest) -> RefreshResponse:
    payload = decode_token(body.refresh_token)  # raises 401 if invalid

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not a refresh token",
        )

    user_id: str = payload["sub"]

    # Verify user still exists
    users = get_collection("users")
    if not await users.find_one({"_id": ObjectId(user_id)}):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    access_token, refresh_token = _make_tokens(user_id)
    return RefreshResponse(access_token=access_token, refresh_token=refresh_token)


@router.get("/me", response_model=UserOut)
async def me(current_user: UserOut = Depends(get_current_user)) -> UserOut:
    return current_user
