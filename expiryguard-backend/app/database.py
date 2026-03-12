from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorCollection
from pymongo import ASCENDING, DESCENDING, IndexModel
from app.config import settings

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.MONGODB_URL)
    return _client


def get_database() -> AsyncIOMotorDatabase:
    return get_client()[settings.DB_NAME]


def get_collection(name: str) -> AsyncIOMotorCollection:
    return get_database()[name]


async def create_indexes() -> None:
    db = get_database()

    # ── batches ──────────────────────────────────────────────────
    batches = db["batches"]
    await batches.create_indexes([
        IndexModel(
            [("user_id", ASCENDING), ("expiry_date", ASCENDING), ("status", ASCENDING)],
            name="batches_user_expiry_status",
        ),
        IndexModel(
            [("user_id", ASCENDING), ("batch_number", ASCENDING)],
            name="batches_user_batch_number_unique",
            unique=True,
            sparse=True,
        ),
    ])

    # ── users ─────────────────────────────────────────────────────
    users = db["users"]
    await users.create_indexes([
        IndexModel(
            [("email", ASCENDING)],
            name="users_email_unique",
            unique=True,
        ),
    ])

    # ── alerts ────────────────────────────────────────────────────
    alerts = db["alerts"]
    await alerts.create_indexes([
        IndexModel(
            [("user_id", ASCENDING), ("sent_at", DESCENDING)],
            name="alerts_user_sent_at",
        ),
    ])


async def close_connection() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
