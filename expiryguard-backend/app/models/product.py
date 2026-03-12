from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class ProductBase(BaseModel):
    name: str
    barcode: str | None = None
    category: str
    unit: str
    default_supplier_id: str | None = None


class ProductCreate(ProductBase):
    pass


class ProductOut(ProductBase):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    user_id: str
    created_at: datetime

    @classmethod
    def from_mongo(cls, data: dict) -> "ProductOut":
        if data and "_id" in data:
            data["id"] = str(data["_id"])
        return cls(**data)
