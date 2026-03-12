from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.auth.utils import decode_token
from app.database import get_collection
from app.models.user import UserOut

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserOut:
    """Validate Bearer token → return UserOut. Raises 401 on failure."""
    payload = decode_token(token)  # raises 401 if invalid

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not an access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    users = get_collection("users")
    doc = await users.find_one({"_id": ObjectId(user_id)})
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return UserOut.from_mongo(doc)


async def get_distributor_user(current_user: UserOut = Depends(get_current_user)) -> UserOut:
    """Like get_current_user but additionally enforces role == 'distributor'."""
    if current_user.role != "distributor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Distributor role required",
        )
    return current_user
