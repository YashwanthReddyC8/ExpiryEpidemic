from datetime import datetime
import json
import logging
import os
import re
import tempfile
from typing import Any, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user, get_distributor_user
from app.database import get_collection
from app.models.batch import BatchStatus
from app.models.user import UserOut

router = APIRouter(prefix="/stock-requests", tags=["stock-requests"])
logger = logging.getLogger(__name__)

_PDF_DIR = os.path.join(tempfile.gettempdir(), "expiryguard_direct_invoices")
os.makedirs(_PDF_DIR, exist_ok=True)


def _build_direct_invoice_pdf(invoice: dict[str, Any], pdf_path: str) -> None:
    from reportlab.graphics.barcode import code128
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet

    doc = SimpleDocTemplate(pdf_path, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"<b>Distributor Invoice</b> - {invoice.get('invoice_no', '')}", styles["Title"]))
    elements.append(Spacer(1, 0.2 * cm))
    elements.append(Paragraph(f"Generated: {invoice.get('generated_at', '')}", styles["Normal"]))
    elements.append(Paragraph(
        f"Distributor: {invoice.get('distributor', {}).get('shop_name') or invoice.get('distributor', {}).get('name', '')}",
        styles["Normal"],
    ))
    elements.append(Paragraph(
        f"Shop: {invoice.get('shopkeeper', {}).get('shop_name') or invoice.get('shopkeeper', {}).get('name', '')}",
        styles["Normal"],
    ))
    elements.append(Spacer(1, 0.4 * cm))

    table_data = [["Product", "SKU", "Barcode", "Qty", "Unit Price", "Line Total"]]
    for line in invoice.get("lines", []):
        table_data.append([
            line.get("product_name", ""),
            line.get("supplier_sku", ""),
            line.get("barcode", "") or "-",
            str(line.get("allocated_quantity", 0)),
            f"Rs {line.get('unit_price', 0)}",
            f"Rs {line.get('line_total', 0)}",
        ])

    table_data.append(["", "", "", "", "Grand Total", f"Rs {invoice.get('grand_total', 0)}"])

    table = Table(table_data, colWidths=[5.2 * cm, 2.5 * cm, 3.5 * cm, 1.7 * cm, 2.7 * cm, 2.7 * cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f3f4f6")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 0.6 * cm))

    invoice_no = invoice.get("invoice_no", "")
    barcode = code128.Code128(invoice_no, barHeight=1.2 * cm, barWidth=0.55)
    elements.append(Paragraph("Invoice Barcode", styles["Heading4"]))
    elements.append(barcode)
    elements.append(Spacer(1, 0.2 * cm))
    elements.append(Paragraph(invoice_no, styles["Normal"]))

    doc.build(elements)


class StockRequestCreate(BaseModel):
    distributor_id: str
    supplier_sku: str
    quantity: int = Field(gt=0)


class ApproveStockRequestBody(BaseModel):
    approve_quantity: int | None = Field(default=None, gt=0)


class RejectStockRequestBody(BaseModel):
    reason: str | None = None


class DirectInvoiceItem(BaseModel):
    supplier_sku: str
    quantity: int = Field(gt=0)


class DirectInvoiceCreate(BaseModel):
    shopkeeper_id: str
    items: list[DirectInvoiceItem]


class DirectInvoiceImportBody(BaseModel):
    invoice_no: str


_DIRECT_INVOICE_RE = re.compile(r"^EG-DIR-[A-Z0-9]+$")


def _normalize_direct_invoice_code(raw_code: str) -> str | None:
    """Normalize scanner variants to canonical EG-DIR-XXXXXXXX format."""
    code = "".join((raw_code or "").strip().split()).upper()
    code = code.replace("_", "-")
    code = re.sub(r"-+", "-", code)

    if code.startswith("EGDIR-"):
        code = "EG-DIR-" + code[len("EGDIR-"):]
    elif code.startswith("EGDIR"):
        code = "EG-DIR-" + code[len("EGDIR"):]
    elif code.startswith("DIR-"):
        code = "EG-" + code
    elif code.startswith("DIR"):
        code = "EG-DIR-" + code[len("DIR"):]

    if _DIRECT_INVOICE_RE.fullmatch(code):
        return code

    # Be tolerant of noisy scanner payloads that contain the invoice code as a substring.
    match = re.search(r"(?:EG[-_]?DIR[-_]?|DIR[-_]?)([A-Z0-9]{6,})", "".join((raw_code or "").strip().split()).upper())
    if match:
        candidate = f"EG-DIR-{match.group(1)}"
        if _DIRECT_INVOICE_RE.fullmatch(candidate):
            return candidate

    return None


async def _import_direct_invoice_document(
    invoice_doc: dict[str, Any],
    current_user: UserOut,
) -> dict[str, Any]:
    if invoice_doc.get("shopkeeper_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Invoice does not belong to this shop")
    if invoice_doc.get("imported_at"):
        raise HTTPException(status_code=409, detail="Invoice already imported")

    products = get_collection("products")
    batches = get_collection("batches")
    direct_invoices = get_collection("direct_invoices")
    now = datetime.utcnow()

    invoice_oid = invoice_doc.get("_id")
    invoice_id = str(invoice_oid)
    suffix = invoice_id[-6:]
    lines = invoice_doc.get("lines", [])
    inserted = 0

    for line_idx, line in enumerate(lines, start=1):
        sku = str(line.get("supplier_sku", "")).strip().upper()
        product_name = line.get("product_name", "")
        barcode = line.get("barcode")

        shop_product = await products.find_one(
            {"user_id": current_user.id, "sku": {"$regex": f"^{sku}$", "$options": "i"}}
        )
        if not shop_product:
            result = await products.insert_one(
                {
                    "user_id": current_user.id,
                    "name": product_name,
                    "sku": sku,
                    "barcode": barcode,
                    "category": "General",
                    "unit": "pcs",
                    "default_supplier_id": invoice_doc.get("distributor_id"),
                    "created_at": now,
                }
            )
            product_id = str(result.inserted_id)
        else:
            product_id = str(shop_product.get("_id"))

        allocations = line.get("allocations", [])
        for idx, alloc in enumerate(allocations, start=1):
            qty = int(alloc.get("allocated_quantity", 0))
            if qty <= 0:
                continue

            expiry_val = alloc.get("expiry_date")
            expiry_dt = datetime.fromisoformat(expiry_val) if isinstance(expiry_val, str) else now
            if expiry_dt.tzinfo is not None:
                expiry_dt = expiry_dt.replace(tzinfo=None)

            src_batch = alloc.get("source_batch_number") or f"DIR-{suffix}-{line_idx}-{idx}"
            await batches.insert_one(
                {
                    "user_id": current_user.id,
                    "product_id": product_id,
                    "product_name": product_name,
                    "batch_number": f"{src_batch}-INV-{suffix}-{line_idx}-{idx}",
                    "expiry_date": expiry_dt,
                    "quantity": qty,
                    "purchase_date": now,
                    "purchase_price": float(alloc.get("purchase_price", line.get("unit_price", 0))),
                    "supplier_id": invoice_doc.get("distributor_id"),
                    "supplier_name": invoice_doc.get("distributor_shop_name") or invoice_doc.get("distributor_name"),
                    "status": BatchStatus.active,
                    "alert_stages_sent": [],
                    "created_at": now,
                    "updated_at": now,
                }
            )
            inserted += 1

    await direct_invoices.update_one(
        {"_id": invoice_oid},
        {"$set": {"status": "imported", "imported_at": now, "updated_at": now}},
    )

    return {"ok": True, "inserted_batches": inserted, "invoice_id": invoice_id}


@router.get("/quote")
async def quote_stock_request(
    distributor_id: str,
    supplier_sku: str,
    current_user: UserOut = Depends(get_current_user),
) -> dict[str, Any]:
    if current_user.role != "shopkeeper":
        raise HTTPException(status_code=403, detail="Only shopkeepers can request stock quotes")

    distributor_id = distributor_id.strip()
    sku = supplier_sku.strip().upper()
    if not distributor_id or not sku:
        raise HTTPException(status_code=400, detail="distributor_id and supplier_sku are required")

    products = get_collection("products")
    batches = get_collection("batches")

    source_product = await products.find_one(
        {"user_id": distributor_id, "sku": {"$regex": f"^{sku}$", "$options": "i"}}
    )
    if not source_product:
        raise HTTPException(status_code=404, detail="SKU not found in distributor catalog")

    source_batches = (
        await batches.find(
            {
                "user_id": distributor_id,
                "product_id": str(source_product.get("_id")),
                "status": {"$in": [BatchStatus.active, BatchStatus.expiring_soon]},
                "quantity": {"$gt": 0},
            }
        )
        .sort("expiry_date", 1)
        .to_list(length=None)
    )

    available_quantity = sum(int(b.get("quantity", 0)) for b in source_batches)
    quoted_unit_price = float(source_batches[0].get("purchase_price", 0)) if source_batches else 0.0

    return {
        "supplier_sku": sku,
        "product_name": source_product.get("name", ""),
        "quoted_unit_price": quoted_unit_price,
        "available_quantity": available_quantity,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_stock_request(
    payload: StockRequestCreate,
    current_user: UserOut = Depends(get_current_user),
) -> dict[str, Any]:
    if current_user.role != "shopkeeper":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only shopkeepers can create stock requests",
        )

    distributor_id = payload.distributor_id.strip()
    supplier_sku = payload.supplier_sku.strip().upper()

    try:
        distributor_oid = ObjectId(distributor_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid distributor ID")

    users = get_collection("users")
    network = get_collection("distributor_network")
    products = get_collection("products")
    requests_col = get_collection("stock_requests")

    distributor = await users.find_one({"_id": distributor_oid, "role": "distributor"})
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")

    connected = await network.find_one(
        {"distributor_id": distributor_id, "retailer_id": current_user.id}
    )
    if not connected and distributor_id not in current_user.distributor_network:
        raise HTTPException(
            status_code=403,
            detail="You can request stock only from connected distributors",
        )

    source_product = await products.find_one(
        {"user_id": distributor_id, "sku": {"$regex": f"^{supplier_sku}$", "$options": "i"}}
    )

    if not source_product:
        raise HTTPException(
            status_code=404,
            detail="SKU not found in selected distributor catalog",
        )

    source_batches = (
        await get_collection("batches")
        .find(
            {
                "user_id": distributor_id,
                "product_id": str(source_product.get("_id")),
                "status": {"$in": [BatchStatus.active, BatchStatus.expiring_soon]},
                "quantity": {"$gt": 0},
            }
        )
        .sort("expiry_date", 1)
        .to_list(length=None)
    )
    available_quantity_snapshot = sum(int(b.get("quantity", 0)) for b in source_batches)
    quoted_unit_price = float(source_batches[0].get("purchase_price", 0)) if source_batches else 0.0

    duplicate_pending = await requests_col.find_one(
        {
            "shopkeeper_id": current_user.id,
            "distributor_id": distributor_id,
            "supplier_sku": supplier_sku,
            "status": "pending",
        }
    )
    if duplicate_pending:
        raise HTTPException(
            status_code=409,
            detail="A pending request already exists for this SKU and distributor",
        )

    doc = {
        "shopkeeper_id": current_user.id,
        "shopkeeper_name": current_user.name,
        "shop_name": current_user.shop_name,
        "distributor_id": distributor_id,
        "distributor_name": distributor.get("name", ""),
        "supplier_sku": supplier_sku,
        "product_name": source_product.get("name", ""),
        "requested_quantity": payload.quantity,
        "quoted_unit_price": quoted_unit_price,
        "available_quantity_snapshot": available_quantity_snapshot,
        "allocated_quantity": 0,
        "status": "pending",  # pending | approved | partially_approved | rejected
        "allocations": [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await requests_col.insert_one(doc)

    return {
        "id": str(result.inserted_id),
        "status": doc["status"],
        "supplier_sku": doc["supplier_sku"],
        "requested_quantity": doc["requested_quantity"],
        "quoted_unit_price": doc["quoted_unit_price"],
        "available_quantity_snapshot": doc["available_quantity_snapshot"],
    }


@router.get("/mine")
async def list_my_requests(
    current_user: UserOut = Depends(get_current_user),
) -> list[dict[str, Any]]:
    requests_col = get_collection("stock_requests")

    cursor = requests_col.find({"shopkeeper_id": current_user.id}).sort("created_at", -1)
    rows: list[dict[str, Any]] = []
    async for doc in cursor:
        rows.append(
            {
                "id": str(doc["_id"]),
                "product_name": doc.get("product_name", ""),
                "supplier_sku": doc.get("supplier_sku", ""),
                "requested_quantity": doc.get("requested_quantity", 0),
                "allocated_quantity": doc.get("allocated_quantity", 0),
                "quoted_unit_price": doc.get("quoted_unit_price", 0),
                "approved_unit_price": doc.get("approved_unit_price", 0),
                "approved_total_value": doc.get("approved_total_value", 0),
                "status": doc.get("status", "pending"),
                "distributor_name": doc.get("distributor_name", ""),
                "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else "",
            }
        )
    return rows


@router.get("/incoming")
async def list_incoming_requests(
    distributor: UserOut = Depends(get_distributor_user),
) -> list[dict[str, Any]]:
    requests_col = get_collection("stock_requests")
    batches = get_collection("batches")
    products = get_collection("products")

    cursor = requests_col.find({"distributor_id": distributor.id}).sort("created_at", -1)
    rows: list[dict[str, Any]] = []
    async for doc in cursor:
        distributor_product = await products.find_one(
            {
                "user_id": distributor.id,
                "sku": {"$regex": f"^{doc.get('supplier_sku', '')}$", "$options": "i"},
            },
            {"_id": 1},
        )

        batch_query = {
            "user_id": distributor.id,
            "status": {"$in": [BatchStatus.active, BatchStatus.expiring_soon]},
            "quantity": {"$gt": 0},
        }
        if distributor_product:
            batch_query["product_id"] = str(distributor_product["_id"])

        available_cursor = batches.find(batch_query)
        available = 0
        async for b in available_cursor:
            available += int(b.get("quantity", 0))

        rows.append(
            {
                "id": str(doc["_id"]),
                "shopkeeper_name": doc.get("shopkeeper_name", ""),
                "shop_name": doc.get("shop_name", ""),
                "product_name": doc.get("product_name", ""),
                "supplier_sku": doc.get("supplier_sku", ""),
                "requested_quantity": doc.get("requested_quantity", 0),
                "allocated_quantity": doc.get("allocated_quantity", 0),
                "available_quantity": available,
                "quoted_unit_price": doc.get("quoted_unit_price", 0),
                "status": doc.get("status", "pending"),
                "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else "",
            }
        )

    return rows


@router.post("/{request_id}/approve")
async def approve_request(
    request_id: str,
    payload: ApproveStockRequestBody,
    distributor: UserOut = Depends(get_distributor_user),
) -> dict[str, Any]:
    requests_col = get_collection("stock_requests")
    products = get_collection("products")
    batches = get_collection("batches")

    try:
        req_oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request ID")

    req = await requests_col.find_one({"_id": req_oid, "distributor_id": distributor.id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.get("status") != "pending":
        raise HTTPException(status_code=409, detail="Request is already processed")

    requested_qty = int(req.get("requested_quantity", 0))
    target_qty = payload.approve_quantity or requested_qty
    if target_qty > requested_qty:
        raise HTTPException(status_code=400, detail="approve_quantity cannot exceed requested quantity")

    supplier_sku = req.get("supplier_sku", "")
    source_product = await products.find_one(
        {
            "user_id": distributor.id,
            "sku": {"$regex": f"^{supplier_sku}$", "$options": "i"},
        }
    )
    if not source_product:
        raise HTTPException(status_code=404, detail="Distributor product for SKU not found")

    # FEFO: earliest expiry first.
    source_batches = (
        await batches.find(
            {
                "user_id": distributor.id,
                "product_id": str(source_product.get("_id")),
                "status": {"$in": [BatchStatus.active, BatchStatus.expiring_soon]},
                "quantity": {"$gt": 0},
            }
        )
        .sort("expiry_date", 1)
        .to_list(length=None)
    )

    remaining = target_qty
    allocations: list[dict[str, Any]] = []

    for src in source_batches:
        if remaining <= 0:
            break

        src_qty = int(src.get("quantity", 0))
        if src_qty <= 0:
            continue

        take = min(src_qty, remaining)
        remaining -= take

        await batches.update_one(
            {"_id": src["_id"]},
            {"$set": {"quantity": src_qty - take, "updated_at": datetime.utcnow()}},
        )

        allocations.append(
            {
                "source_batch_id": str(src["_id"]),
                "source_batch_number": src.get("batch_number"),
                "allocated_quantity": take,
                "expiry_date": src.get("expiry_date"),
                "purchase_price": src.get("purchase_price", 0),
            }
        )

    allocated_total = target_qty - remaining
    if allocated_total <= 0:
        raise HTTPException(
            status_code=400,
            detail="Insufficient available quantity to approve this request",
        )

    now = datetime.utcnow()
    approved_total_value = sum(
        float(a.get("purchase_price", 0)) * int(a.get("allocated_quantity", 0)) for a in allocations
    )
    approved_unit_price = round(approved_total_value / allocated_total, 2) if allocated_total > 0 else 0.0

    new_status: Literal["approved", "partially_approved"] = (
        "approved" if allocated_total >= requested_qty else "partially_approved"
    )

    await requests_col.update_one(
        {"_id": req_oid},
        {
            "$set": {
                "status": new_status,
                "allocated_quantity": allocated_total,
                "approved_unit_price": approved_unit_price,
                "approved_total_value": round(approved_total_value, 2),
                "allocations": [
                    {
                        **a,
                        "expiry_date": a["expiry_date"].isoformat() if isinstance(a.get("expiry_date"), datetime) else str(a.get("expiry_date")),
                    }
                    for a in allocations
                ],
                "updated_at": now,
                "ready_for_invoice": True,
                "invoice_generated_at": None,
                "invoice_imported_at": None,
            }
        },
    )

    return {
        "ok": True,
        "status": new_status,
        "allocated_quantity": allocated_total,
        "requested_quantity": requested_qty,
        "approved_unit_price": approved_unit_price,
        "approved_total_value": round(approved_total_value, 2),
        "allocations_count": len(allocations),
    }


@router.get("/{request_id}/invoice")
async def generate_request_invoice(
    request_id: str,
    distributor: UserOut = Depends(get_distributor_user),
) -> dict[str, Any]:
    requests_col = get_collection("stock_requests")

    try:
        req_oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request ID")

    req = await requests_col.find_one({"_id": req_oid, "distributor_id": distributor.id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.get("status") not in {"approved", "partially_approved"}:
        raise HTTPException(status_code=409, detail="Only approved requests can generate invoice")

    now = datetime.utcnow()
    invoice_no = f"EG-REQ-{str(req_oid)[-8:].upper()}"
    invoice = {
        "invoice_no": invoice_no,
        "request_id": str(req_oid),
        "generated_at": now.isoformat(),
        "distributor": {
            "id": distributor.id,
            "name": distributor.name,
            "shop_name": distributor.shop_name,
        },
        "shopkeeper": {
            "id": req.get("shopkeeper_id"),
            "name": req.get("shopkeeper_name"),
            "shop_name": req.get("shop_name"),
        },
        "product": {
            "name": req.get("product_name", ""),
            "sku": req.get("supplier_sku", ""),
        },
        "requested_quantity": req.get("requested_quantity", 0),
        "allocated_quantity": req.get("allocated_quantity", 0),
        "approved_unit_price": req.get("approved_unit_price", 0),
        "approved_total_value": req.get("approved_total_value", 0),
        "allocations": req.get("allocations", []),
    }

    await requests_col.update_one(
        {"_id": req_oid},
        {"$set": {"invoice_generated_at": now, "updated_at": now}},
    )

    return {"invoice": invoice}


@router.get("/{request_id}/invoice/pdf")
async def generate_request_invoice_pdf(
    request_id: str,
    distributor: UserOut = Depends(get_distributor_user),
) -> FileResponse:
    from reportlab.graphics.barcode import code128
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet

    requests_col = get_collection("stock_requests")
    try:
        req_oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request ID")

    req = await requests_col.find_one({"_id": req_oid, "distributor_id": distributor.id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.get("status") not in {"approved", "partially_approved"}:
        raise HTTPException(status_code=409, detail="Only approved requests can generate invoice")

    now = datetime.utcnow()
    invoice_no = f"EG-REQ-{str(req_oid)[-8:].upper()}"
    distributor_label = distributor.shop_name or distributor.name or ""
    shop_label = req.get("shop_name") or req.get("shopkeeper_name") or ""
    product_name = req.get("product_name", "")
    supplier_sku = req.get("supplier_sku", "")
    allocated_qty = req.get("allocated_quantity", 0)
    unit_price = req.get("approved_unit_price", req.get("quoted_unit_price", 0)) or 0
    total_value = req.get("approved_total_value", round(float(allocated_qty) * float(unit_price), 2))

    os.makedirs(_PDF_DIR, exist_ok=True)
    pdf_path = os.path.join(_PDF_DIR, f"{invoice_no}.pdf")

    doc = SimpleDocTemplate(pdf_path, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"<b>Stock Request Invoice</b> - {invoice_no}", styles["Title"]))
    elements.append(Spacer(1, 0.2 * cm))
    elements.append(Paragraph(f"Generated: {now.strftime('%d %b %Y %H:%M UTC')}", styles["Normal"]))
    elements.append(Paragraph(f"Distributor: {distributor_label}", styles["Normal"]))
    elements.append(Paragraph(f"Shop: {shop_label}", styles["Normal"]))
    elements.append(Spacer(1, 0.4 * cm))

    table_data = [["Product", "SKU", "Quantity", "Unit Price", "Total"]]
    table_data.append([product_name, supplier_sku, str(allocated_qty), f"Rs {unit_price}", f"Rs {total_value}"])
    table_data.append(["", "", "", "Grand Total", f"Rs {total_value}"])

    table = Table(table_data, colWidths=[6 * cm, 3 * cm, 2.5 * cm, 3 * cm, 3 * cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f3f4f6")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 0.6 * cm))

    barcode_widget = code128.Code128(invoice_no, barHeight=1.2 * cm, barWidth=0.55)
    elements.append(Paragraph("Invoice Barcode", styles["Heading4"]))
    elements.append(barcode_widget)
    elements.append(Spacer(1, 0.2 * cm))
    elements.append(Paragraph(invoice_no, styles["Normal"]))

    doc.build(elements)

    await requests_col.update_one(
        {"_id": req_oid},
        {"$set": {"invoice_generated_at": now, "updated_at": now}},
    )

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"{invoice_no}.pdf",
    )


@router.post("/import-invoice")
async def import_invoice_to_shop(
    file: UploadFile = File(...),
    current_user: UserOut = Depends(get_current_user),
) -> dict[str, Any]:
    if current_user.role != "shopkeeper":
        raise HTTPException(status_code=403, detail="Only shopkeepers can import invoices")

    if not file.filename.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="Only JSON invoice files are supported")

    raw = await file.read()
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid invoice JSON")

    requests_col = get_collection("stock_requests")
    direct_invoices = get_collection("direct_invoices")
    products = get_collection("products")
    batches = get_collection("batches")
    now = datetime.utcnow()

    if payload.get("invoice_type") == "direct_transfer":
        invoice_id = payload.get("invoice_id")
        if not invoice_id:
            raise HTTPException(status_code=400, detail="Invoice missing invoice_id")

        try:
            invoice_oid = ObjectId(invoice_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid invoice_id in invoice")

        invoice_doc = await direct_invoices.find_one({"_id": invoice_oid})
        if not invoice_doc:
            raise HTTPException(status_code=404, detail="Direct invoice not found")
        return await _import_direct_invoice_document(invoice_doc, current_user)

    request_id = payload.get("request_id")
    if not request_id:
        raise HTTPException(status_code=400, detail="Invoice missing request_id")

    try:
        req_oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request_id in invoice")

    req = await requests_col.find_one({"_id": req_oid, "shopkeeper_id": current_user.id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found for this shop")
    if req.get("invoice_imported_at"):
        raise HTTPException(status_code=409, detail="Invoice already imported")

    sku = req.get("supplier_sku", "")
    product_name = req.get("product_name", "")

    shop_product = await products.find_one(
        {"user_id": current_user.id, "sku": {"$regex": f"^{sku}$", "$options": "i"}}
    )
    if not shop_product:
        result = await products.insert_one(
            {
                "user_id": current_user.id,
                "name": product_name,
                "sku": sku,
                "barcode": None,
                "category": "General",
                "unit": "pcs",
                "default_supplier_id": req.get("distributor_id"),
                "created_at": now,
            }
        )
        product_id = str(result.inserted_id)
    else:
        product_id = str(shop_product.get("_id"))

    allocations = payload.get("allocations", [])
    inserted = 0
    suffix = str(req_oid)[-6:]
    for idx, line in enumerate(allocations, start=1):
        qty = int(line.get("allocated_quantity", 0))
        if qty <= 0:
            continue

        src_batch = line.get("source_batch_number") or f"IMP-{suffix}-{idx}"
        expiry_val = line.get("expiry_date")
        expiry_dt = datetime.fromisoformat(expiry_val) if isinstance(expiry_val, str) else now
        if expiry_dt.tzinfo is not None:
            expiry_dt = expiry_dt.replace(tzinfo=None)

        await batches.insert_one(
            {
                "user_id": current_user.id,
                "product_id": product_id,
                "product_name": product_name,
                "batch_number": f"{src_batch}-INV-{suffix}-{idx}",
                "expiry_date": expiry_dt,
                "quantity": qty,
                "purchase_date": now,
                "purchase_price": float(line.get("purchase_price", 0)),
                "supplier_id": req.get("distributor_id"),
                "supplier_name": req.get("distributor_name"),
                "status": BatchStatus.active,
                "alert_stages_sent": [],
                "created_at": now,
                "updated_at": now,
            }
        )
        inserted += 1

    await requests_col.update_one(
        {"_id": req_oid},
        {
            "$set": {
                "invoice_imported_at": now,
                "ready_for_invoice": False,
                "status": "fulfilled",
                "updated_at": now,
            }
        },
    )

    return {"ok": True, "inserted_batches": inserted, "request_id": request_id}


@router.post("/import-direct-invoice")
async def import_direct_invoice_by_code(
    payload: DirectInvoiceImportBody,
    current_user: UserOut = Depends(get_current_user),
) -> dict[str, Any]:
    logger.info(
        "import-direct-invoice request received: raw=%s user_id=%s role=%s",
        payload.invoice_no,
        current_user.id,
        current_user.role,
    )
    if current_user.role != "shopkeeper":
        raise HTTPException(status_code=403, detail="Only shopkeepers can import invoices")

    invoice_no = _normalize_direct_invoice_code(payload.invoice_no)
    if not invoice_no:
        logger.warning(
            "import-direct-invoice invalid code: raw=%s normalized=None user_id=%s",
            payload.invoice_no,
            current_user.id,
        )
        raise HTTPException(status_code=400, detail="Invalid direct invoice code")

    logger.info(
        "import-direct-invoice normalized code: invoice_no=%s user_id=%s",
        invoice_no,
        current_user.id,
    )

    direct_invoices = get_collection("direct_invoices")
    invoice_doc = await direct_invoices.find_one({"invoice_no": invoice_no})
    if invoice_doc and invoice_doc.get("shopkeeper_id") != current_user.id:
        logger.warning(
            "import-direct-invoice ownership mismatch by invoice_no: invoice_no=%s owner_shopkeeper_id=%s user_id=%s",
            invoice_no,
            invoice_doc.get("shopkeeper_id"),
            current_user.id,
        )
        raise HTTPException(status_code=403, detail="Invoice does not belong to this shop")

    if not invoice_doc:
        # Backward compatibility: older records may not persist invoice_no.
        suffix = invoice_no.split("EG-DIR-")[-1].upper()
        cursor = direct_invoices.find({})
        async for doc in cursor:
            if str(doc.get("_id", ""))[-8:].upper() == suffix:
                invoice_doc = doc
                break

    if invoice_doc and invoice_doc.get("shopkeeper_id") != current_user.id:
        logger.warning(
            "import-direct-invoice ownership mismatch by suffix: invoice_no=%s owner_shopkeeper_id=%s user_id=%s",
            invoice_no,
            invoice_doc.get("shopkeeper_id"),
            current_user.id,
        )
        raise HTTPException(status_code=403, detail="Invoice does not belong to this shop")

    if not invoice_doc:
        logger.warning(
            "import-direct-invoice not found: invoice_no=%s user_id=%s",
            invoice_no,
            current_user.id,
        )
        raise HTTPException(status_code=404, detail="Direct invoice not found")

    logger.info(
        "import-direct-invoice match found: invoice_no=%s invoice_id=%s shopkeeper_id=%s user_id=%s",
        invoice_no,
        str(invoice_doc.get("_id")),
        invoice_doc.get("shopkeeper_id"),
        current_user.id,
    )

    return await _import_direct_invoice_document(invoice_doc, current_user)


@router.post("/{request_id}/reject")
async def reject_request(
    request_id: str,
    payload: RejectStockRequestBody,
    distributor: UserOut = Depends(get_distributor_user),
) -> dict[str, Any]:
    requests_col = get_collection("stock_requests")

    try:
        req_oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request ID")

    req = await requests_col.find_one({"_id": req_oid, "distributor_id": distributor.id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.get("status") != "pending":
        raise HTTPException(status_code=409, detail="Request is already processed")

    await requests_col.update_one(
        {"_id": req_oid},
        {
            "$set": {
                "status": "rejected",
                "rejection_reason": payload.reason or "Rejected by distributor",
                "updated_at": datetime.utcnow(),
            }
        },
    )

    return {"ok": True, "status": "rejected"}


@router.post("/direct-invoice/generate")
async def generate_direct_invoice(
    payload: DirectInvoiceCreate,
    distributor: UserOut = Depends(get_distributor_user),
) -> dict[str, Any]:
    if not payload.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    users = get_collection("users")
    network = get_collection("distributor_network")
    products = get_collection("products")
    batches = get_collection("batches")
    invoices = get_collection("direct_invoices")

    try:
        shopkeeper_oid = ObjectId(payload.shopkeeper_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid shopkeeper ID")

    shopkeeper = await users.find_one({
        "_id": shopkeeper_oid,
        "role": {"$in": ["shopkeeper", "shop_owner"]},
    })
    if not shopkeeper:
        raise HTTPException(status_code=404, detail="Shopkeeper not found")

    connected = await network.find_one(
        {"distributor_id": distributor.id, "retailer_id": payload.shopkeeper_id}
    )
    if not connected and payload.shopkeeper_id not in distributor.distributor_network:
        raise HTTPException(status_code=403, detail="Shopkeeper is not connected to your network")

    now = datetime.utcnow()
    lines: list[dict[str, Any]] = []

    for item in payload.items:
        sku = item.supplier_sku.strip().upper()
        source_product = await products.find_one(
            {"user_id": distributor.id, "sku": {"$regex": f"^{sku}$", "$options": "i"}}
        )
        if not source_product:
            raise HTTPException(status_code=404, detail=f"SKU '{sku}' not found in distributor catalog")

        source_batches = (
            await batches.find(
                {
                    "user_id": distributor.id,
                    "product_id": str(source_product.get("_id")),
                    "status": {"$in": [BatchStatus.active, BatchStatus.expiring_soon]},
                    "quantity": {"$gt": 0},
                }
            )
            .sort("expiry_date", 1)
            .to_list(length=None)
        )

        remaining = int(item.quantity)
        allocations: list[dict[str, Any]] = []

        for src in source_batches:
            if remaining <= 0:
                break
            src_qty = int(src.get("quantity", 0))
            if src_qty <= 0:
                continue

            take = min(src_qty, remaining)
            remaining -= take

            await batches.update_one(
                {"_id": src["_id"]},
                {"$set": {"quantity": src_qty - take, "updated_at": now}},
            )

            expiry = src.get("expiry_date")
            if isinstance(expiry, datetime):
                expiry = expiry.isoformat()

            allocations.append(
                {
                    "source_batch_id": str(src["_id"]),
                    "source_batch_number": src.get("batch_number"),
                    "allocated_quantity": take,
                    "expiry_date": expiry,
                    "purchase_price": float(src.get("purchase_price", 0)),
                }
            )

        allocated_qty = int(item.quantity) - remaining
        if allocated_qty <= 0:
            raise HTTPException(status_code=400, detail=f"Insufficient quantity for SKU '{sku}'")

        total_value = sum(a["allocated_quantity"] * a["purchase_price"] for a in allocations)
        unit_price = round(total_value / allocated_qty, 2) if allocated_qty else 0.0

        lines.append(
            {
                "product_name": source_product.get("name", ""),
                "supplier_sku": sku,
                "barcode": source_product.get("barcode"),
                "requested_quantity": int(item.quantity),
                "allocated_quantity": allocated_qty,
                "unit_price": unit_price,
                "line_total": round(total_value, 2),
                "allocations": allocations,
            }
        )

    grand_total = round(sum(line["line_total"] for line in lines), 2)
    invoice_doc = {
        "invoice_type": "direct_transfer",
        "distributor_id": distributor.id,
        "distributor_name": distributor.name,
        "distributor_shop_name": distributor.shop_name,
        "shopkeeper_id": payload.shopkeeper_id,
        "shopkeeper_name": shopkeeper.get("name", ""),
        "shopkeeper_shop_name": shopkeeper.get("shop_name", ""),
        "lines": lines,
        "grand_total": grand_total,
        "status": "generated",
        "created_at": now,
        "updated_at": now,
        "imported_at": None,
    }
    result = await invoices.insert_one(invoice_doc)
    invoice_id = str(result.inserted_id)
    invoice_no = f"EG-DIR-{invoice_id[-8:].upper()}"

    # Persist invoice_no so barcode lookup can find it directly
    await invoices.update_one(
        {"_id": result.inserted_id},
        {"$set": {"invoice_no": invoice_no}},
    )

    invoice = {
        "invoice_type": "direct_transfer",
        "invoice_id": invoice_id,
        "invoice_no": invoice_no,
        "generated_at": now.isoformat(),
        "distributor": {
            "id": distributor.id,
            "name": distributor.name,
            "shop_name": distributor.shop_name,
        },
        "shopkeeper": {
            "id": payload.shopkeeper_id,
            "name": shopkeeper.get("name", ""),
            "shop_name": shopkeeper.get("shop_name", ""),
        },
        "lines": lines,
        "grand_total": grand_total,
    }

    return {"invoice": invoice}


@router.get("/direct-invoice/{invoice_id}/pdf")
async def download_direct_invoice_pdf(
    invoice_id: str,
    distributor: UserOut = Depends(get_distributor_user),
) -> FileResponse:
    direct_invoices = get_collection("direct_invoices")

    try:
        invoice_oid = ObjectId(invoice_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid invoice ID")

    doc = await direct_invoices.find_one({"_id": invoice_oid, "distributor_id": distributor.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Direct invoice not found")

    invoice_no = f"EG-DIR-{invoice_id[-8:].upper()}"
    invoice = {
        "invoice_no": invoice_no,
        "generated_at": (doc.get("created_at") or datetime.utcnow()).isoformat(),
        "distributor": {
            "id": distributor.id,
            "name": doc.get("distributor_name", distributor.name),
            "shop_name": doc.get("distributor_shop_name", distributor.shop_name),
        },
        "shopkeeper": {
            "id": doc.get("shopkeeper_id", ""),
            "name": doc.get("shopkeeper_name", ""),
            "shop_name": doc.get("shopkeeper_shop_name", ""),
        },
        "lines": doc.get("lines", []),
        "grand_total": doc.get("grand_total", 0),
    }

    pdf_filename = f"{invoice_no}.pdf"
    pdf_path = os.path.join(_PDF_DIR, pdf_filename)
    _build_direct_invoice_pdf(invoice, pdf_path)

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=pdf_filename,
    )
