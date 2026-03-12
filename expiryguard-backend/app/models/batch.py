from datetime import date, datetime
from enum import Enum
from pydantic import BaseModel, Field, ConfigDict, computed_field


class BatchStatus(str, Enum):
    active = "active"
    expiring_soon = "expiring_soon"
    expired = "expired"
    returned = "returned"
    donated = "donated"
    discounted = "discounted"
    pickup_scheduled = "pickup_scheduled"


class BatchBase(BaseModel):
    product_id: str
    product_name: str
    batch_number: str | None = None
    expiry_date: date
    quantity: int
    purchase_date: date
    purchase_price: float
    supplier_id: str | None = None
    supplier_name: str | None = None


class BatchCreate(BatchBase):
    pass


class BatchOut(BatchBase):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    user_id: str
    status: BatchStatus = BatchStatus.active
    alert_stages_sent: list[int] = Field(default_factory=list)
    created_at: datetime

    @computed_field  # type: ignore[misc]
    @property
    def days_to_expiry(self) -> int:
        return (self.expiry_date - date.today()).days

    @classmethod
    def from_mongo(cls, data: dict) -> "BatchOut":
        if data and "_id" in data:
            data["id"] = str(data["_id"])
        return cls(**data)


class BatchStatusUpdate(BaseModel):
    status: BatchStatus
