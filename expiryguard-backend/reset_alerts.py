import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def reset():
    db = AsyncIOMotorClient("mongodb://localhost:27017")["expiryguard"]
    # Clear alert history for one of the expiring batches so the job picks it up again
    res = await db.batches.update_one(
        {"product_name": "ORS Electral Powder"},
        {"$set": {"alert_stages_sent": []}}
    )
    # Ensure whatsapp_alerts is true
    await db.users.update_one(
        {"email": "demo@shop.com"},
        {"$set": {"alert_prefs.whatsapp_alerts": True}}
    )
    print("Reset 1 batch and enabled WA for demo user. You can run the trigger curl now.")

asyncio.run(reset())
