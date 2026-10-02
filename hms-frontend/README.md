# HMS Frontend

React + Vite frontend for CareFlow HMS - a multi-tenant hospital management SaaS. Covers the
public landing page, the hospital staff dashboard (role-gated: hospital admin, doctor, nurse,
receptionist, pharmacist, lab technician, accountant), and the patient portal.

## Local setup

```bash
npm install
cp .env.example .env
# point VITE_API_URL at your local or deployed hms-backend

npm run dev     # starts Vite dev server, default http://localhost:5173
npm run build   # production build
```

## Environment variables

| Variable | Required | Used for |
| --- | --- | --- |
| `VITE_API_URL` | Yes | Base URL of the hms-backend API (e.g. `http://localhost:5000` locally, your deployed backend's URL in production). Read in `src/lib/api.js`. |

Vite only exposes env vars prefixed `VITE_` to client code (`import.meta.env.VITE_*`) - anything
else added to `.env` here is silently invisible to the app, so new env vars for this project must
use that prefix.

## Deploying to Vercel

1. Import the HMS-Project repo into Vercel and set Root Directory to `hms-frontend` (framework
   preset: Vite).
2. Add `VITE_API_URL` in the Vercel dashboard (Project Settings → Environment Variables), pointing
   at your deployed `hms-backend` URL.
3. Deploy. `vercel.json` already rewrites all routes to `index.html` for client-side routing.

No Hobby-plan concerns on this side: it's a static Vite build with no serverless functions, so the
function duration/size/response limits that apply to `hms-backend` don't apply here.
