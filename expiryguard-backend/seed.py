import asyncio
import os
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from motor.motor_asyncio import AsyncIOMotorClient

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "expiryguard")

async def seed():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    
    # Drop existing data
    await db.users.drop()
    await db.products.drop()
    await db.suppliers.drop()
    await db.batches.drop()
    await db.alerts.drop()

    print("Cleared existing collections...")

    # --- Users ---
    shop_owner = {
        "email": "demo@shop.com",
        "hashed_password": hash_password("demo1234"),
        "name": "Ravi Sharma",
        "shop_name": "Sharma Medical Store",
        "shop_type": "medical",
        "role": "shop_owner",
        "phone": "7731861904",
        "whatsapp_number": "+917731861904",
        "alert_prefs": {"alert_60": True, "alert_30": True, "alert_15": True, "alert_7": True, "whatsapp_alerts": False},
        "created_at": datetime.now(timezone.utc)
    }
    owner_res = await db.users.insert_one(shop_owner)
    owner_id = str(owner_res.inserted_id)

    customer2 = {
        "email": "rajesh@kirana.com",
        "hashed_password": hash_password("rajesh1234"),
        "name": "Rajesh Kumar",
        "shop_name": "Rajesh Provision Store",
        "shop_type": "kirana",
        "role": "shop_owner",
        "phone": "9876543211",
        "whatsapp_number": "+919876543211",
        "alert_prefs": {"alert_60": True, "alert_30": True, "alert_15": True, "alert_7": True, "whatsapp_alerts": False},
        "created_at": datetime.now(timezone.utc)
    }
    c2_res = await db.users.insert_one(customer2)
    c2_id = str(c2_res.inserted_id)

    distributor = {
        "email": "dist@pharma.com",
        "hashed_password": hash_password("dist1234"),
        "name": "Priya Mehta",
        "shop_name": "Mehta Pharma Distributors",
        "shop_type": "fmcg",
        "role": "distributor",
        "phone": "9988776655",
        "whatsapp_number": "+919988776655",
        "alert_prefs": {"alert_60": True, "alert_30": True, "alert_15": True, "alert_7": True, "whatsapp_alerts": False},
        "distributor_network": [owner_id, c2_id],
        "created_at": datetime.now(timezone.utc)
    }
    dist_res = await db.users.insert_one(distributor)
    dist_id = str(dist_res.inserted_id)

    # --- Suppliers ---
    suppliers_data = [
        # For User 1
        {"owner_id": owner_id, "name": "Mehta Pharma Distributors", "contact_name": "Priya Mehta", "phone": "9988776655", "whatsapp_number": "+919988776655", "email": "dist@pharma.com", "address": "Mumbai Central", "return_window_days": 45, "distributor_id": dist_id},
        {"owner_id": owner_id, "name": "Sun Pharma Wholesale", "contact_name": "Rajiv Dev", "phone": "9123456789", "whatsapp_number": "+919123456789", "email": "sales@sunpharma.xyz", "address": "Andheri West", "return_window_days": 30},
        {"owner_id": owner_id, "name": "Reliance Retail Supply", "contact_name": "Vikram Singh", "phone": "9111222333", "whatsapp_number": "+919111222333", "email": "b2b@reliance.xyz", "address": "Navi Mumbai", "return_window_days": 60},
        # For User 2 (Customer 2)
        {"owner_id": c2_id, "name": "Mehta Pharma Distributors", "contact_name": "Priya Mehta", "phone": "9988776655", "whatsapp_number": "+919988776655", "email": "dist@pharma.com", "address": "Mumbai Central", "return_window_days": 45, "distributor_id": dist_id},
        {"owner_id": c2_id, "name": "Local FMCG Suppliers", "contact_name": "Amit Local", "phone": "9998887771", "whatsapp_number": "+919998887771", "email": "amit@local.com", "address": "Dharavi", "return_window_days": 15},
        # For Distributor
        {"owner_id": dist_id, "name": "GlaxoSmithKline", "contact_name": "GSK Rep", "phone": "1800112233", "whatsapp_number": "+911800112233", "email": "sales@gsk.com", "address": "Worli, Mumbai", "return_window_days": 90},
    ]
    sup_ids = []
    for s in suppliers_data:
        r = await db.suppliers.insert_one(s)
        sup_ids.append(str(r.inserted_id))
    
    owner_mehta_sup = sup_ids[0]
    owner_sun_sup = sup_ids[1]
    owner_rel_sup = sup_ids[2]
    c2_mehta_sup = sup_ids[3]
    c2_local_sup = sup_ids[4]
    dist_gsk_sup = sup_ids[5]

    # --- Products ---
    products_to_insert = [
        # User 1
        {"owner_id": owner_id, "name": "Paracetamol 500mg", "category": "medicine", "unit": "strip"},
        {"owner_id": owner_id, "name": "Dolo 650", "category": "medicine", "unit": "strip"},
        {"owner_id": owner_id, "name": "Dettol Antiseptic Liquid", "category": "healthcare", "unit": "bottle"},
        {"owner_id": owner_id, "name": "Amul Butter 100g", "category": "dairy", "unit": "piece"},
        {"owner_id": owner_id, "name": "Tata Salt 1kg", "category": "grocery", "unit": "packet"},
        {"owner_id": owner_id, "name": "Disprin 10s", "category": "medicine", "unit": "strip"},
        {"owner_id": owner_id, "name": "ORS Electral Powder", "category": "medicine", "unit": "packet"},
        # Customer 2
        {"owner_id": c2_id, "name": "Maggi 2-Min Noodles", "category": "grocery", "unit": "packet"},
        {"owner_id": c2_id, "name": "Aashirvaad Atta 5kg", "category": "grocery", "unit": "bag"},
        {"owner_id": c2_id, "name": "Parle-G 100g", "category": "grocery", "unit": "packet"},
        {"owner_id": c2_id, "name": "Horlicks 500g", "category": "fmcg", "unit": "jar"},
        # Distributor
        {"owner_id": dist_id, "name": "Horlicks 500g (Wholesale)", "category": "fmcg", "unit": "box"},
        {"owner_id": dist_id, "name": "Crocin Advance (Bulk)", "category": "medicine", "unit": "box"},
        {"owner_id": dist_id, "name": "Vicks Vaporub 50g", "category": "healthcare", "unit": "jar"},
    ]
    
    prod_ids = {} # owner_id_prod_name -> id
    for p in products_to_insert:
        r = await db.products.insert_one(p)
        key = f"{p['owner_id']}_{p['name']}"
        prod_ids[key] = str(r.inserted_id)

    # --- Batches ---
    def make_batch(o_id, prod_name, batch_no, qty, exp_days_from_now, status="active", alerts_sent=[], sup_id=None, price=50.0):
        p_date = (datetime.now(timezone.utc) - timedelta(days=120)).strftime("%Y-%m-%d")
        exp_date = (datetime.now(timezone.utc) + timedelta(days=exp_days_from_now)).strftime("%Y-%m-%d")
        key = f"{o_id}_{prod_name}"
        return {
            "owner_id": o_id,
            "product_id": prod_ids[key],
            "product_name": prod_name,
            "batch_number": batch_no,
            "quantity": qty,
            "expiry_date": exp_date,
            "purchase_price": price,
            "purchase_date": p_date,
            "supplier_id": sup_id,
            "status": status,
            "alert_stages_sent": alerts_sent,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }

    batches_to_insert = [
        # --- USER 1 BATCHES ---
        make_batch(owner_id, "Dolo 650", "DL24B092", 30, -5, status="expired", alerts_sent=[60,30,15,7], sup_id=owner_mehta_sup, price=30.0),
        make_batch(owner_id, "Disprin 10s", "DIS-2881", 15, -10, status="expired", alerts_sent=[60,30,15,7], sup_id=owner_sun_sup, price=15.0),
        make_batch(owner_id, "Paracetamol 500mg", "PT2024-3311", 50, 4, alerts_sent=[60,30,15], sup_id=owner_mehta_sup, price=12.5),
        make_batch(owner_id, "ORS Electral Powder", "ORS-99X", 120, 2, alerts_sent=[60,30,15,7], sup_id=owner_mehta_sup, price=20.0),
        make_batch(owner_id, "Dettol Antiseptic Liquid", "DET-441", 8, 6, alerts_sent=[60,30,15], sup_id=owner_sun_sup, price=95.0),
        make_batch(owner_id, "Amul Butter 100g", "AMB-24", 200, 12, alerts_sent=[60,30], sup_id=owner_rel_sup, price=54.0),
        make_batch(owner_id, "Tata Salt 1kg", "TS-001", 80, 22, alerts_sent=[60,30], sup_id=owner_rel_sup, price=24.0),
        make_batch(owner_id, "Paracetamol 500mg", "PT2024-4001", 150, 28, alerts_sent=[60,30], sup_id=owner_mehta_sup, price=12.5),
        make_batch(owner_id, "Dolo 650", "DL24C110", 60, 18, alerts_sent=[60,30], sup_id=owner_mehta_sup, price=30.0),
        make_batch(owner_id, "Dettol Antiseptic Liquid", "DET-442", 20, 45, alerts_sent=[60], sup_id=owner_sun_sup, price=95.0),
        make_batch(owner_id, "Disprin 10s", "DIS-2900", 100, 35, alerts_sent=[60], sup_id=owner_sun_sup, price=15.0),
        make_batch(owner_id, "Amul Butter 100g", "AMB-25", 300, 50, alerts_sent=[60], sup_id=owner_rel_sup, price=54.0),
        make_batch(owner_id, "ORS Electral Powder", "ORS-101", 80, 55, alerts_sent=[60], sup_id=owner_mehta_sup, price=20.0),
        make_batch(owner_id, "Tata Salt 1kg", "TS-002", 40, 40, alerts_sent=[60], sup_id=owner_rel_sup, price=24.0),
        make_batch(owner_id, "Paracetamol 500mg", "PT2024-5000", 200, 120, alerts_sent=[], sup_id=owner_mehta_sup, price=12.5),
        make_batch(owner_id, "Dolo 650", "DL24D001", 150, 90, alerts_sent=[], sup_id=owner_mehta_sup, price=30.0),
        make_batch(owner_id, "Dettol Antiseptic Liquid", "DET-450", 50, 150, alerts_sent=[], sup_id=owner_sun_sup, price=95.0),
        make_batch(owner_id, "Amul Butter 100g", "AMB-26", 150, 75, alerts_sent=[], sup_id=owner_rel_sup, price=54.0),
        make_batch(owner_id, "Disprin 10s", "DIS-2700", 25, -2, status="returned", alerts_sent=[60,30,15,7], sup_id=owner_sun_sup, price=15.0),
        make_batch(owner_id, "Tata Salt 1kg", "TS-999", 10, 5, status="discounted", alerts_sent=[60,30,15], sup_id=owner_rel_sup, price=24.0),

        # --- CUSTOMER 2 BATCHES ---
        make_batch(c2_id, "Maggi 2-Min Noodles", "MAG-001", 200, 15, alerts_sent=[60,30], sup_id=c2_local_sup, price=12.0),
        make_batch(c2_id, "Aashirvaad Atta 5kg", "ASH-24B", 40, 5, alerts_sent=[60,30,15], sup_id=c2_local_sup, price=210.0),
        make_batch(c2_id, "Horlicks 500g", "HOR-99", 60, 25, alerts_sent=[60,30], sup_id=c2_mehta_sup, price=245.0),
        make_batch(c2_id, "Horlicks 500g", "HOR-88", 20, -5, status="expired", alerts_sent=[60,30,15,7], sup_id=c2_mehta_sup, price=245.0),
        make_batch(c2_id, "Parle-G 100g", "PAR-11", 500, 120, alerts_sent=[], sup_id=c2_local_sup, price=4.0),

        # --- DISTRIBUTOR BATCHES ---
        make_batch(dist_id, "Horlicks 500g (Wholesale)", "HOR-W-1", 500, 18, alerts_sent=[60,30], sup_id=dist_gsk_sup, price=2000.0),
        make_batch(dist_id, "Crocin Advance (Bulk)", "CRO-B-9", 1000, 4, alerts_sent=[60,30,15], sup_id=dist_gsk_sup, price=500.0),
        make_batch(dist_id, "Vicks Vaporub 50g", "VIC-99", 300, 40, alerts_sent=[60], sup_id=dist_gsk_sup, price=110.0),
        make_batch(dist_id, "Vicks Vaporub 50g", "VIC-00", 150, -2, status="expired", alerts_sent=[60,30,15,7], sup_id=dist_gsk_sup, price=110.0),
    ]

    batch_res = await db.batches.insert_many(batches_to_insert)

    # --- Pre-generate Alerts ---
    alerts_to_insert = []
    
    def make_alert(o_id, batch_id, p_name, b_no, type_str, message, read=False):
        return {
            "owner_id": o_id,
            "batch_id": batch_id,
            "product_name": p_name,
            "batch_number": b_no,
            "alert_type": type_str,
            "message": message,
            "sent_via": "in_app",
            "read": read,
            "sent_at": datetime.now(timezone.utc)
        }

    db_batches = await db.batches.find().to_list(length=None)
    for b in db_batches:
        b_id = str(b["_id"])
        o_id = b["owner_id"]
        if b["status"] == "expired":
            alerts_to_insert.append(make_alert(o_id, b_id, b["product_name"], b["batch_number"], "expired", f"{b['product_name']} (Batch {b['batch_number']}) has expired today. Remove from shelves immediately.", read=False))
        elif 60 in b["alert_stages_sent"] and b["status"] == "active":
            if 7 in b["alert_stages_sent"]:
                alerts_to_insert.append(make_alert(o_id, b_id, b["product_name"], b["batch_number"], "d7", f"{b['product_name']} expires in 7 days. Plan immediate discount or write-off.", read=False))
            elif 15 in b["alert_stages_sent"]:
                alerts_to_insert.append(make_alert(o_id, b_id, b["product_name"], b["batch_number"], "d15", f"{b['product_name']} expires in 15 days. Final window to initiate supplier return.", read=False))
            elif 30 in b["alert_stages_sent"]:
                alerts_to_insert.append(make_alert(o_id, b_id, b["product_name"], b["batch_number"], "d30", f"{b['product_name']} expires in 30 days. Consider returning to supplier.", read=True))

    if alerts_to_insert:
        await db.alerts.insert_many(alerts_to_insert)

    print("\n✅ Seed complete!")
    print("--------------------------------------------------")
    print(f"Shop owner 1: {shop_owner['email']}  / demo1234")
    print(f"Shop owner 2: {customer2['email']}  / rajesh1234")
    print(f"Distributor:  {distributor['email']} / dist1234")
    print("--------------------------------------------------")
    print(f"Created: 3 users, {len(suppliers_data)} suppliers, {len(products_to_insert)} products, {len(batches_to_insert)} batches, {len(alerts_to_insert)} alerts")

if __name__ == "__main__":
    asyncio.run(seed())
