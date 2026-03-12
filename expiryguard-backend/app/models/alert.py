from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field, ConfigDict


class AlertType(str, Enum):
    d60 = "d60"
    d30 = "d30"
    d15 = "d15"
    d7 = "d7"
    expired = "expired"


class AlertOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    user_id: str
    batch_id: str
    product_name: str
    alert_type: AlertType
    message: str
    sent_via: str  # e.g. "whatsapp", "in-app"
    sent_at: datetime
    read: bool = False

    @classmethod
    def from_mongo(cls, data: dict) -> "AlertOut":
        if data and "_id" in data:
            data["id"] = str(data["_id"])
        return cls(**data)
