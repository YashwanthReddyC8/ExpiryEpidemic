import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.scheduler.jobs import run_expiry_alerts

async def test():
    db = AsyncIOMotorClient("mongodb://localhost:27017")["expiryguard"]
    
    # Enable WA for user
    user = await db.users.find_one({"email": "demo@shop.com"})
    if user:
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"alert_prefs.whatsapp_alerts": True}}
        )
        print("Enabled WA for demo user")

    # Clear alert_stages_sent for just one batch that expires in < 7 days
    batch = await db.batches.find_one({"product_name": "ORS Electral Powder"})
    if batch:
        await db.batches.update_one(
            {"_id": batch["_id"]},
            {"$set": {"alert_stages_sent": []}}
        )
        print(f"Cleared alerts for batch {batch['batch_number']}")
        
    res = await run_expiry_alerts(db)
    print("Job ran! Result:", res)

asyncio.run(test())
