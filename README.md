# Backend

NestJS services — one folder per product.

```
backend/
├── identity/   # Nexa Identity (SSO) — port 3001
└── stays/      # Nexa Stays — port 3002
```

## Run

### 1. Stays database (Docker only)

```powershell
cd database\stays
.\migrate.ps1
```

### 2. Backends (local)

```powershell
copy backend\identity\.env.example backend\identity\.env
copy backend\stays\.env.example backend\stays\.env

cd backend\identity
npm install
npm run start:dev

# separate terminal
cd backend\stays
npm install
npm run start:dev
```

Use `DB_SYNCHRONIZE=false` in `backend/stays/.env` when using SQL migrations.

Database details: [`../database/stays/README.md`](../database/stays/README.md)  
**Documentation hub:** [`../docs/README.md`](../docs/README.md) — canonical specs (booking, payments, auth, architecture)  
Architecture: [`../docs/06-architecture/SYSTEM_ARCHITECTURE.md`](../docs/06-architecture/SYSTEM_ARCHITECTURE.md)  
Deployment: [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md)
