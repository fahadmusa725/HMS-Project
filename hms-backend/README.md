# HMS Backend

Multi-tenant Hospital Management System API. Every tenant-scoped model is automatically isolated
by `hospitalId` via a Mongoose plugin (`src/utils/tenantPlugin.js`) and Node's AsyncLocalStorage
(`src/utils/tenantContext.js`), so there's no per-query tenant filter for a developer to forget.

## Local setup

```bash
npm install
cp .env.example .env
# fill in .env with your own values (see "Environment variables" below)

npm run seed:superadmin   # creates your one Platform Super Admin account
npm run seed:demo -- <hospitalAdminEmail> <hospitalAdminPassword>   # optional: fills a hospital with sample data
npm run dev                # starts local server on http://localhost:5000
```

## Environment variables

All of these are read via `process.env` somewhere in `src/` - set every one of them (except where
noted "Vercel only" or "local only") in Vercel's dashboard under Project Settings → Environment
Variables before deploying.

| Variable | Required | Used for |
| --- | --- | --- |
| `MONGO_URI` | Yes | MongoDB Atlas connection string (free M0 tier is enough). |
| `JWT_SECRET` | Yes | Signs and verifies login tokens. Use a long random string. |
| `JWT_EXPIRES_IN` | Yes | Token lifetime, e.g. `7d`. |
| `CLIENT_URL` | Yes | Comma-separated list of allowed frontend origins for CORS (e.g. your Vercel frontend URL, plus `http://localhost:5173` for local dev). |
| `SUPER_ADMIN_NAME` | Yes (once) | Used only by `npm run seed:superadmin` to create the one Platform Super Admin account. |
| `SUPER_ADMIN_EMAIL` | Yes (once) | Same as above. |
| `SUPER_ADMIN_PASSWORD` | Yes (once) | Same as above. |
| `CLOUDINARY_CLOUD_NAME` | Yes | Free-tier Cloudinary account, used for any uploaded files/images. |
| `CLOUDINARY_API_KEY` | Yes | Same Cloudinary account. |
| `CLOUDINARY_API_SECRET` | Yes | Same Cloudinary account. |
| `EMAIL_HOST` | Yes | SMTP host for `src/utils/mailer.js` (e.g. Gmail SMTP). |
| `EMAIL_PORT` | Yes | SMTP port (e.g. `587`). |
| `EMAIL_USER` | Yes | SMTP username/login email. |
| `EMAIL_PASS` | Yes | SMTP password or app password. |
| `EMAIL_FROM_NAME` | Yes | Display name used as the "from" on outgoing emails. |
| `LEAD_NOTIFICATION_EMAIL` | Yes | Where "Request a Demo" submissions from the public landing page get emailed. Can be any inbox you check, e.g. your own. |
| `CRON_SECRET` | Yes (on Vercel) | Vercel automatically sends this as a Bearer token to the two cron endpoints below; without it set, both cron jobs are permanently rejected as unauthorized. Not needed locally since cron doesn't run on `npm run dev`. |
| `APP_TIMEZONE` | No | IANA timezone for "today"/working-hours logic, e.g. `Asia/Karachi`. Defaults to `Asia/Karachi` if unset. |
| `PORT` | Local only | Port for `npm run dev` / `node server.js`. Not used on Vercel (serverless, no listening port). |
| `NODE_ENV` | No | Not read anywhere in this codebase; Vercel sets it automatically in production. |

If anything in `src/` starts reading a new `process.env.X`, add it to this table and to
`.env.example` in the same commit, so the two don't drift apart.

## What's implemented

- Multi-tenancy: `Hospital` model (tenant registry, Platform Super Admin only), `User` model
  (tenant-scoped, all roles), JWT auth.
- Core hospital modules: patients, appointments, admissions/wards, lab, pharmacy (batch/FEFO
  tracking), billing (JazzCash/Easypaisa/bank transfer and multi-sponsor billing), reports, audit
  logs, a patient portal, and a hospital-admin data export endpoint.
- Two Vercel Cron jobs (`vercel.json`): a daily trial-ending check and a daily appointment
  reminder email, both well within the Hobby plan's cron limits (see the deployment notes below).
  Anything else that needs to run periodically (appointment no-show sweeps, pharmacy near-expiry
  alerts) is done as a lazy check on read instead of a third cron job, since Hobby cron jobs can
  only run once a day - no good for anything needing finer timing anyway.

## Deploying to Vercel

1. Import the HMS-Project repo into Vercel and set Root Directory to `hms-backend`.
2. Add every variable from the table above in the Vercel dashboard (Project Settings →
   Environment Variables), since the deploy will run, but logins, emails, cron jobs, or uploads
   will fail at runtime for any you miss.
3. Deploy. `vercel.json` already routes everything through `api/index.js` and defines the two
   cron jobs.

### Hobby plan notes

- **Cron jobs**: capped at once a day each (not a job-count limit); both jobs here are daily.
- **Function duration**: capped at 300 seconds; nothing here runs anywhere close to that.
- **Response size**: capped at 4.5MB; the data export endpoint caps record counts per request and
  flags truncation so it stays under that.
