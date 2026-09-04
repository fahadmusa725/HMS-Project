# HMS Backend — Phase 0 (Multi-Tenancy Foundation)

## What's implemented so far
- Multi-tenant architecture: `hospitalId`-based isolation, enforced automatically
  at the database query layer via a Mongoose plugin (`src/utils/tenantPlugin.js`)
  + Node's AsyncLocalStorage (`src/utils/tenantContext.js`) — not left to
  developers to remember per-query.
- `Hospital` model (the tenant registry — Platform Super Admin only)
- `User` model (tenant-scoped, all 9 roles)
- JWT auth (`/api/auth/login`)
- Platform Super Admin endpoints:
  - `POST /api/super-admin/hospitals` — onboard a new hospital + its admin, with a fully custom trial length in days
  - `GET /api/super-admin/hospitals` — list all hospitals
  - `PATCH /api/super-admin/hospitals/:hospitalId` — change status (trial/active/suspended), extend/change trial
- Vercel-ready: serverless entry at `api/index.js`, cached MongoDB connection safe for serverless cold starts.

## Local setup

```bash
npm install
cp .env.example .env
# then fill in .env with your real MongoDB Atlas URI, JWT secret, etc.

npm run seed:superadmin   # creates your one Platform Super Admin account
npm run dev                # starts local server on http://localhost:5000
```

## Quick test flow

1. `POST /api/auth/login` with your seeded super admin email/password → get a token.
2. `POST /api/super-admin/hospitals` (with `Authorization: Bearer <token>`) to create your first hospital:
   ```json
   {
     "hospitalName": "City Hospital",
     "adminName": "Dr. Ahmed",
     "adminEmail": "admin@cityhospital.com",
     "adminPassword": "somepassword",
     "trialDays": 14
   }
   ```
3. `POST /api/auth/login` as that hospital admin → their token now carries that hospital's `hospitalId`.
4. Any future tenant-scoped model (Patients, Appointments, etc. — Phase 1 onward) will automatically be invisible across hospitals, with zero extra code per query.

## Deploying to Vercel
1. Push this folder to its own GitHub repo (`hms-backend`).
2. Import it into Vercel as a new project.
3. Add all `.env` variables in the Vercel dashboard (Project Settings → Environment Variables).
4. Deploy — `vercel.json` already routes everything through `api/index.js`.
