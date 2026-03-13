from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict, field_validator


class ProductBase(BaseModel):
    name: str
    sku: str | None = None
    barcode: str | None = None
    category: str
    unit: str
    default_supplier_id: str | None = None

    @field_validator("sku", mode="before")
    @classmethod
    def normalize_sku(cls, value: str | None) -> str | None:
        if value is None:
            return None
        sku = value.strip().upper()
        return sku or None

    @field_validator("barcode", mode="before")
    @classmethod
    def normalize_barcode(cls, value: str | None) -> str | None:
        if value is None:
            return None
        barcode = "".join(str(value).strip().split()).upper()
        return barcode or None


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
