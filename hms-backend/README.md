# HMS Backend

Multi-tenant Hospital Management System API. Every tenant-scoped model is automatically isolated
by `hospitalId` via a Mongoose plugin (`src/utils/tenantPlugin.js`) + Node's AsyncLocalStorage
(`src/utils/tenantContext.js`) — there's no per-query tenant filter for a developer to forget.

## Local setup

```bash
npm install
cp .env.example .env
# fill in .env with your own values (see "Environment variables" below)

npm run seed:superadmin   # creates your one Platform Super Admin account
npm run dev                # starts local server on http://localhost:5000
```

## Environment variables

All of these are read via `process.env` somewhere in `src/` — set every one of them (except where
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
`.env.example` in the same commit — don't let the two drift apart.

## What's implemented

- Multi-tenancy: `Hospital` model (tenant registry, Platform Super Admin only), `User` model
  (tenant-scoped, all roles), JWT auth.
- Core hospital modules: patients, appointments, admissions/wards, lab, pharmacy (batch/FEFO
  tracking), billing (JazzCash/Easypaisa/bank transfer + multi-sponsor billing), reports, audit
  logs, a patient portal, and a hospital-admin data export endpoint.
- Two Vercel Cron jobs (`vercel.json`): a daily trial-ending check and a daily appointment
  reminder email, both well within the Hobby plan's cron limits (see the deployment notes below).
  Anything else that needs to run periodically (appointment no-show sweeps, pharmacy near-expiry
  alerts) is done as a lazy check on read instead of a third cron job, since Hobby cron jobs can
  only run once a day - no good for anything needing finer timing anyway.

## Deploying to Vercel

1. Push this folder to its own GitHub repo (`hms-backend`).
2. Import it into Vercel as a new project.
3. Add every variable from the table above in the Vercel dashboard (Project Settings →
   Environment Variables) - the deploy will run, but logins, emails, cron jobs, or uploads will
   fail at runtime for any you miss.
4. Deploy — `vercel.json` already routes everything through `api/index.js` and defines the two
   cron jobs.

### Hobby plan notes

- **Cron jobs**: Vercel's Hobby plan allows up to 100 cron jobs per project, but each can run at
  most once a day (per Vercel's current docs). The two jobs here are both daily, so there's
  headroom if a third is ever genuinely needed - just remember "once a day" is the hard ceiling,
  not job count.
- **Function duration**: Hobby allows up to 300 seconds (5 minutes) per function invocation,
  default and max. Nothing in this codebase does unbounded synchronous work - report aggregations
  return grouped summaries (bounded by the number of distinct groups, not raw row count), and the
  pharmacy FEFO dispense logic retries at most 3 times per line item.
- **Response size**: Vercel Functions cap request/response bodies at 4.5MB regardless of plan.
  The `/api/hospital-admin/export` endpoint (added in Phase 3) could in principle generate a
  payload past that for a hospital with years of history, so each collection is capped at a fixed
  number of records per request (newest first), with a `truncated` flag/note telling the admin to
  narrow the export with `startDate`/`endDate` query params to get older records in a follow-up
  request. This keeps exports working within Hobby's hard limit without needing a paid plan.
