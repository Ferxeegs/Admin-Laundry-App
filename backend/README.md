# Laundry Pondok Backend API

Backend API untuk sistem manajemen laundry pondok menggunakan FastAPI, SQLAlchemy, dan PostgreSQL.

## 🚀 Fitur

- ✅ RESTful API dengan FastAPI
- ✅ Authentication & Authorization dengan JWT
- ✅ Role-Based Access Control (RBAC)
- ✅ Database migrations dengan Alembic
- ✅ Logging terstruktur
- ✅ Error handling yang komprehensif
- ✅ CORS configuration
- ✅ Docker & Docker Compose support
- ✅ Environment-based configuration
- ✅ Password hashing dengan bcrypt
- ✅ API documentation (Swagger/OpenAPI)

## 📋 Prerequisites

- Python 3.10+
- PostgreSQL 12+ (atau MySQL 8+)
- Docker & Docker Compose (opsional)

## 🛠️ Setup Development

### 1. Clone dan Install Dependencies

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Setup Environment Variables

```bash
# Copy file contoh
cp .env.example .env
```

**PENTING**: Edit file `.env` dan isi dengan nilai yang sesuai. Jangan commit file `.env` ke repository!

Konfigurasi penting yang harus diisi:
- `DATABASE_URL`: URL koneksi database (contoh: `postgresql://user:password@localhost:5432/laundry_pondok`)
- `SECRET_KEY`: Secret key untuk JWT (generate dengan: `python -c "import secrets; print(secrets.token_urlsafe(32))"`)
- `BACKEND_CORS_ORIGINS`: URL frontend yang diizinkan (format JSON array)
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: Jika menggunakan Docker Compose
- `INIT_ADMIN_*`: Credentials untuk admin user pertama (opsional, ada default)

### 3. Setup Database

#### Menggunakan Docker Compose (Recommended)

```bash
docker-compose up -d db
```

#### Manual Setup

Buat database PostgreSQL:
```sql
CREATE DATABASE laundry_pondok;
```

### 4. Run Database Migrations

```bash
# Buat migration pertama
alembic revision --autogenerate -m "Initial migration"

# Apply migrations
alembic upgrade head
```

### 5. Run Development Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Server akan berjalan di `http://localhost:8000`

## 📚 API Documentation

Setelah server berjalan, akses dokumentasi API di:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

## 🐳 Docker Setup

### Run dengan Docker Compose

```bash
# Build dan run semua services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

### Build Docker Image

```bash
docker build -t laundry-pondok-backend .
```

## 📁 Struktur Project

```
backend/
├── alembic/              # Database migrations
│   ├── versions/         # Migration files
│   ├── env.py           # Alembic environment
│   └── script.py.mako   # Migration template
├── app/
│   ├── api/             # API routes
│   │   ├── v1/          # API version 1
│   │   │   └── endpoints/
│   │   │       ├── auth.py
│   │   │       └── users.py
│   │   └── deps.py      # API dependencies
│   ├── core/            # Core configuration
│   │   ├── config.py    # Settings
│   │   ├── security.py  # Security utilities
│   │   ├── exceptions.py # Custom exceptions
│   │   ├── dependencies.py # FastAPI dependencies
│   │   └── logging_config.py # Logging setup
│   ├── db/              # Database
│   │   ├── base_class.py # SQLAlchemy Base
│   │   └── session.py   # Database session
│   ├── models/          # SQLAlchemy models
│   │   ├── auth.py      # User, Role, Permission models
│   │   ├── common.py    # Common models
│   │   └── base.py      # Base mixins
│   ├── schemas/         # Pydantic schemas
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── role.py
│   │   └── common.py
│   ├── middleware/      # Custom middleware
│   │   └── logging_middleware.py
│   └── main.py          # FastAPI application
├── logs/                # Application logs
├── .env.example         # Environment variables template
├── .gitignore
├── alembic.ini          # Alembic configuration
├── docker-compose.yml   # Docker Compose config
├── Dockerfile           # Docker image config
├── requirements.txt     # Python dependencies
└── README.md           # This file
```

## 🔐 Authentication

API menggunakan JWT (JSON Web Tokens) untuk authentication.

### Register User

```bash
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "admin",
  "email": "admin@example.com",
  "password": "password123",
  "firstname": "Admin",
  "lastname": "User"
}
```

### Login

```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "password123"
}
```

Response akan berisi `access_token` yang digunakan untuk authenticated requests.

### Authenticated Requests

```bash
GET /api/v1/users/me
Authorization: Bearer <access_token>
```

## 🗄️ Database Migrations

### Create Migration

```bash
alembic revision --autogenerate -m "Description of changes"
```

### Apply Migrations

```bash
alembic upgrade head
```

### Rollback Migration

```bash
alembic downgrade -1
```

### View Migration History

```bash
alembic history
```

## 🧪 Testing

```bash
# Run tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html
```

## 📝 Code Quality

```bash
# Format code
black app/

# Lint code
ruff check app/

# Type checking
mypy app/
```

## 🔧 Configuration

Semua konfigurasi dilakukan melalui environment variables di file `.env`. Lihat `.env.example` untuk daftar lengkap variabel yang tersedia.

## 📄 License

[Your License Here]

## 👥 Contributors

[Your Name/Team]

