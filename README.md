# BarberOS — Multi-Tenant Barbershop Management System

## Tech Stack
- **Frontend**: React 18 + Vite + TailwindCSS + Zustand + React Query
- **Backend**: Node.js + Express + Prisma + PostgreSQL
- **Auth**: JWT (15m access + 7d refresh token)
- **Deploy**: Docker + Docker Compose + Nginx

## Quick Start (Development)

### Prerequisites
- Node.js 20+
- PostgreSQL 14+ (or Docker)

### 1. Database
```bash
# With Docker:
docker run -d --name barberos-db \
  -e POSTGRES_USER=barberos \
  -e POSTGRES_PASSWORD=barberos123 \
  -e POSTGRES_DB=barberos \
  -p 5432:5432 postgres:16-alpine
```

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
npx prisma migrate dev --name init
npm run db:seed
npm run dev
# → Running at http://localhost:3001
```

### 3. Frontend
```bash
cd ..  # root of project
npm install
cp .env.example .env
# .env: VITE_API_URL=http://localhost:3001/api
npm run dev
# → Running at http://localhost:5173
```

### Default Credentials (after seed)
| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@barberos.com | Admin123! |
| Tenant Admin | admin@barberking.com | Admin123! |
| Kasir | kasir@barberking.com | Admin123! |
| Barber | barber1@barberking.com | Admin123! |

## Production Deployment (Docker)

```bash
# 1. Clone & configure
cp .env.production.example .env

# 2. Edit .env with real values
nano .env

# 3. Deploy
docker-compose up -d

# 4. Seed (first time only)
docker exec barberos-backend npm run db:seed

# Frontend: http://your-server:80
# Backend API: http://your-server:3001
```

## Architecture

```
                    ┌─────────────────────┐
                    │     Nginx (80)       │  ← Serves React SPA
                    │   React + Vite       │
                    └──────────┬──────────┘
                               │ /api/*
                    ┌──────────▼──────────┐
                    │  Express Backend     │  ← JWT Auth + Business Logic
                    │  Node.js (3001)      │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   PostgreSQL (5432)  │  ← Persistent Data
                    └─────────────────────┘
```

## Role Hierarchy
```
super_admin  → manages all tenants, packages, billing
  tenant_admin → manages own branches, staff, services
    kasir      → POS, queue, transactions
    barber     → own queue, schedule, commission
    customer   → booking, loyalty points
```

## API Endpoints
See `backend/src/routes/` for complete API documentation.
Base URL: `http://localhost:3001/api`

## Environment Variables

### Frontend (.env)
| Variable | Default | Description |
|----------|---------|-------------|
| VITE_API_URL | http://localhost:3001/api | Backend API URL |

### Backend (.env)
| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | ✅ | PostgreSQL connection string |
| JWT_SECRET | ✅ | Access token secret |
| JWT_REFRESH_SECRET | ✅ | Refresh token secret |
| PORT | 3001 | Server port |
| NODE_ENV | development | Environment |
| FRONTEND_URL | http://localhost:5173 | CORS allowed origin |
