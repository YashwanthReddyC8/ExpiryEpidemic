# ExpiryEpidemic 🛒💊

**Smart inventory expiry management system for Indian retailers** — Automated batch tracking, WhatsApp alerts, and distributor networks.

> Helping small shops, medical stores, and FMCG retailers minimize waste and manage product returns efficiently.

---

## 🚀 Features

✅ **Inventory Batch Tracking** — Register products with MFG/EXP dates  
✅ **Automated Expiry Alerts** — WhatsApp notifications 60/30/15/7 days before expiry  
✅ **Barcode & OCR Scanning** — Auto-fill product details from invoices  
✅ **Distributor Networks** — Link shop owners to distributors for centralized tracking  
✅ **Return Memos** — Manage product returns with credits  
✅ **Multi-user Roles** — Shop owners, distributors, suppliers  
✅ **Real-time Dashboard** — Analytics, expiry status, inventory KPIs  
✅ **Offline-friendly** — Works on low-bandwidth connections

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Frontend (React 19 + Vite)                 │
│         Axios + React Query + Zustand Auth              │
│                  localhost:5173                         │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP (CORS enabled)
┌────────────────────▼────────────────────────────────────┐
│           Backend (FastAPI + Python 3.9+)               │
│  JWT Auth | APScheduler | Twilio | Tesseract OCR        │
│                  localhost:8000                         │
└────────────────────┬────────────────────────────────────┘
                     │ Async Motor
┌────────────────────▼────────────────────────────────────┐
│    MongoDB (expiryguard database)                        │
│  Users | Products | Batches | Suppliers | Alerts        │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Tech Stack

### Frontend
- **React 19** — UI framework
- **Vite** — Build tool & dev server
- **React Router v7** — SPA navigation
- **React Query** — Server state management & caching
- **Zustand** — Auth store (lightweight state)
- **Axios** — HTTP client with interceptors
- **Tailwind CSS** — Styling
- **Recharts** — Dashboard visualizations
- **Lucide React** — Icons
- **React Hot Toast** — Notifications

### Backend
- **FastAPI** — Async web framework
- **Python 3.9+** — Language
- **Motor** — Async MongoDB driver
- **Pydantic** — Data validation
- **Passlib + Argon2** — Secure password hashing
- **PyJWT** — JWT token generation
- **APScheduler** — Background jobs
- **Pytesseract** — OCR (requires Tesseract binary)
- **Pillow** — Image processing
- **Twilio** — WhatsApp API

### Database
- **MongoDB** — NoSQL document store
- Collections: `users`, `products`, `batches`, `suppliers`, `alerts`

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** (for frontend)
- **Python 3.9+** (for backend)
- **MongoDB 5.0+** (local or Atlas)
- **Tesseract-OCR** binary (for barcode scanning)
- **Twilio Account** (for WhatsApp alerts — optional)

### Installation

#### 1. Clone & Setup Backend

```bash
cd expiryguard-backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Edit .env with your MongoDB & Twilio settings
```

**`.env` Example:**
```env
MONGODB_URL=mongodb://localhost:27017
DB_NAME=expiryguard
JWT_SECRET=your-super-secret-key-here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

#### 2. Setup Frontend

```bash
cd expiryguard-frontend

# Install dependencies
npm install

# Create .env.local if needed (optional)
# VITE_API_URL=http://localhost:8000
```

#### 3. Start Servers

**Backend:**
```bash
cd expiryguard-backend
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd expiryguard-frontend
npm run dev
# Runs on http://localhost:5173
```

---

## 🌱 Database Seeding

Populate with sample data (optional):

```bash
cd expiryguard-backend
python seed.py
```

Creates:
- 3 test users (2 shop owners, 1 distributor)
- Suppliers, products, and batches
- Sample alert preferences

---

## 📚 API Endpoints Overview

### Authentication
- `POST /auth/register` — Register new user
- `POST /auth/login` — Login with email/password
- `POST /auth/refresh` — Refresh access token

### Products & Batches
- `GET /products` — List user's products
- `POST /products` — Create product
- `GET /batches` — List user's batches
- `POST /batches` — Register new batch
- `PATCH /batches/{batch_id}` — Update batch (discount, mark used)

### Alerts
- `GET /alerts` — List all alerts for user
- `PATCH /alerts/{alert_id}` — Mark alert as read

### Suppliers
- `GET /suppliers` — List suppliers
- `POST /suppliers` — Add supplier
- `DELETE /suppliers/{supplier_id}` — Remove supplier

### Dashboard
- `GET /dashboard` — User dashboard stats
- `GET /dashboard/distributor` — Distributor network view

### OCR & Barcodes
- `POST /ocr/extract` — Extract text from invoice image (form: `file`)
- `POST /barcode/decode` — Decode barcode image

### Returns
- `POST /returns/memo` — Create return memo
- `PATCH /returns/memo/{memo_id}` — Update return status

[Full API docs available at `http://localhost:8000/docs`]

---

## 📂 Project Structure

```
ExpiryEpidemic/
├── expiryguard-backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app setup
│   │   ├── config.py            # Settings from .env
│   │   ├── database.py          # MongoDB connection
│   │   ├── auth/                # JWT & password utils
│   │   ├── models/              # Pydantic schemas
│   │   ├── routers/             # API route handlers
│   │   └── scheduler/           # APScheduler jobs
│   ├── seed.py                  # Sample data
│   ├── requirements.txt         # Python dependencies
│   └── .env.example             # Template env file
│
├── expiryguard-frontend/
│   ├── src/
│   │   ├── main.jsx             # Entry point
│   │   ├── App.jsx              # Router setup
│   │   ├── api/                 # API client modules
│   │   ├── pages/               # Route components
│   │   ├── components/          # Reusable UI components
│   │   ├── store/               # Zustand auth store
│   │   └── utils/               # Helper functions
│   ├── package.json             # Node dependencies
│   ├── vite.config.js           # Vite configuration
│   ├── tailwind.config.js       # Tailwind CSS config
│   └── index.html               # HTML template
│
└── README.md                    # This file
```

---

## 🔐 Security

- **Passwords**: Hashed with Argon2 (no 72-byte limit)
- **Auth**: JWT tokens with access/refresh flow
- **CORS**: Restricted to `http://localhost:5173` (configurable in `app/main.py`)
- **Request Validation**: Pydantic ensures type safety
- **Sensitive Env Vars**: `.env` excluded from Git

⚠️ **Development Only**: JWT_SECRET is dummy. Use strong secret in production.

---

## 🔄 Data Flow

1. **Registration** → Password hashed (Argon2) → User stored in MongoDB
2. **Login** → Credentials verified → JWT tokens issued → Stored in browser
3. **Batch Creation** → Product + expiry dates stored
4. **Scheduled Job** (nightly) → APScheduler checks batches → Creates alerts
5. **Alert Triggered** → WhatsApp sent via Twilio → Alert visible in UI
6. **Distributor View** → Network shops' batches aggregated in dashboard

---

## 🐛 Troubleshooting

### "ModuleNotFoundError: No module named 'app'"
```bash
cd expiryguard-backend
python -m uvicorn app.main:app --reload
```

### "Connection refused: MongoDB"
- Ensure MongoDB is running: `mongod`
- Check `MONGODB_URL` in `.env`

### "Tesseract not found"
- Install Tesseract: https://github.com/UB-Mannheim/tesseract/wiki
- Update path in code if needed

### CORS errors on frontend
- Ensure backend is running on `:8000`
- Check `allow_origins` in [app/main.py](expiryguard-backend/app/main.py#L46)

---

## 📝 Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MONGODB_URL` | `mongodb://localhost:27017` | Database URI |
| `DB_NAME` | `expiryguard` | Database name |
| `JWT_SECRET` | `changeme-use-a-strong-secret` | Token signing key ⚠️ |
| `JWT_ALGORITHM` | `HS256` | Token algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Token TTL |
| `TWILIO_ACCOUNT_SID` | `` | Twilio API key |
| `TWILIO_AUTH_TOKEN` | `` | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` | WhatsApp sender number |

---

## 🧪 Testing

### Backend Tests
```bash
# Run pytest (if test suite exists)
pytest expiryguard-backend/
```

### Manual API Testing
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Frontend Testing
```bash
npm run lint  # ESLint
```

---

## 🚀 Deployment

### Backend (FastAPI)
- Deploy with **Gunicorn**: `gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app`
- Or **Uvicorn**: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Cloud: Render, Railway, AWS Lambda, GCP Cloud Run

### Frontend (React)
```bash
npm run build  # Creates dist/
# Deploy dist/ to Vercel, Netlify, or static hosting
```

### Database
- Use **MongoDB Atlas** (managed cloud) for production
- Enable authentication & IP whitelisting

---

## 📖 Documentation

- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [React Docs](https://react.dev/)
- [MongoDB Docs](https://docs.mongodb.com/)
- [Twilio Docs](https://www.twilio.com/docs/sms/whatsapp)

---

## 🤝 Contributing

1. Fork & clone repo
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push & create Pull Request

---

## 📄 License

This project is open-source under the **MIT License** — see [LICENSE](LICENSE) file for details.

---

## 💬 Support

- **Issues**: File a GitHub issue
- **Email**: [Add contact email]
- **Community**: [Discord/Slack link if applicable]

---

## 🎯 Roadmap

- [ ] Mobile app (React Native)
- [ ] Multi-language support (Hindi, Tamil, etc.)
- [ ] Advanced analytics & forecasting
- [ ] Supplier marketplace integration
- [ ] Offline mode with sync
- [ ] SMS alerts (not just WhatsApp)
- [ ] Batch printing & labeling

---

**Made for Indian retailers 🇮🇳 | Reduce waste. Grow business.**

Last updated: **March 13, 2026**
