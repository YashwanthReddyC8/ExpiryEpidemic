from datetime import datetime
from typing import Literal
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from bson import ObjectId


class UserBase(BaseModel):
    name: str
    email: EmailStr
    phone: str
    shop_name: str
    shop_type: Literal["kirana", "medical", "fmcg"]
    whatsapp_number: str | None = None
    role: Literal["shop_owner", "distributor"] = "shop_owner"
    alert_prefs: dict | None = None
    distributor_network: list[str] = Field(default_factory=list)

class UserUpdate(BaseModel):
    name: str | None = None
    shop_name: str | None = None
    phone: str | None = None
    whatsapp_number: str | None = None
    alert_prefs: dict | None = None


class UserCreate(UserBase):
    password: str


class UserInDB(UserBase):
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)

    id: str = Field(alias="_id")
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @classmethod
    def from_mongo(cls, data: dict) -> "UserInDB":
        if data and "_id" in data:
            data["_id"] = str(data["_id"])
        return cls(**data)


class UserOut(UserBase):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    created_at: datetime

    @classmethod
    def from_mongo(cls, data: dict) -> "UserOut":
        if data and "_id" in data:
            data["id"] = str(data["_id"])
        return cls(**data)
