from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class SupplierBase(BaseModel):
    name: str
    phone: str
    whatsapp_number: str | None = None
    email: EmailStr | None = None
    return_window_days: int = 30


class SupplierCreate(SupplierBase):
    pass


class SupplierOut(SupplierBase):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    user_id: str
    created_at: datetime

    @classmethod
    def from_mongo(cls, data: dict) -> "SupplierOut":
        if data and "_id" in data:
            data["id"] = str(data["_id"])
        return cls(**data)
