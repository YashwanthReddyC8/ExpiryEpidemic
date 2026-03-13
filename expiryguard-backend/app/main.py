import logging
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.database import close_connection, create_indexes
from app.routers.alerts import router as alerts_router
from app.routers.barcode import router as barcode_router
from app.routers.batches import router as batches_router
from app.routers.billing import router as billing_router
from app.routers.dashboard import router as dashboard_router
from app.routers.ocr import router as ocr_router
from app.routers.products import router as products_router
from app.routers.returns import router as returns_router
from app.routers.suppliers import router as suppliers_router
from app.routers.stock_requests import router as stock_requests_router
from app.routers.users import router as users_router
from app.routers.network import router as network_router
from app.scheduler.jobs import run_expiry_alerts, start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Starting ExpiryGuard API…")
    await create_indexes()
    logger.info("MongoDB indexes ensured")
    start_scheduler()
    yield
    stop_scheduler()
    await close_connection()
    logger.info("ExpiryGuard API shutdown complete")


app = FastAPI(
    title="ExpiryGuard API",
    description="Inventory expiry management for Indian retailers",
    version="1.0.0",
    lifespan=lifespan,
)


def _get_cors_origins() -> list[str]:
    """Return explicit CORS origins from env with sensible local defaults."""
    raw = os.getenv("CORS_ORIGINS", "")
    env_origins = [item.strip() for item in raw.split(",") if item.strip()]
    if env_origins:
        return env_origins
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_cors_origins(),
    allow_origin_regex=r"https://[a-z0-9-]+-(5173|3000)\.inc1\.devtunnels\.ms",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(products_router)
app.include_router(batches_router)
app.include_router(suppliers_router)
app.include_router(alerts_router)
app.include_router(dashboard_router)
app.include_router(ocr_router)
app.include_router(barcode_router)
app.include_router(returns_router)
app.include_router(users_router)
app.include_router(billing_router)
app.include_router(network_router)
app.include_router(stock_requests_router)


# ── Health ─────────────────────────────────────────────────────
@app.get("/", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "ExpiryGuard API"}


# ── Dev-only admin trigger ─────────────────────────────────────
@app.post("/admin/trigger-alerts", tags=["admin"])
async def trigger_alerts() -> dict[str, Any]:
    """
    Manually trigger the expiry alert job.
    DEV ONLY — no authentication required.
    Remove or protect this endpoint in production.
    """
    result = await run_expiry_alerts()
    return {"triggered": True, **result}
