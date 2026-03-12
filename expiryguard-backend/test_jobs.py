import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.scheduler.jobs import run_expiry_alerts
from app.config import settings

async def test():
    db = AsyncIOMotorClient("mongodb://localhost:27017")["expiryguard"]
    try:
        res = await run_expiry_alerts(db)
        print("Success!", res)
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(test())
