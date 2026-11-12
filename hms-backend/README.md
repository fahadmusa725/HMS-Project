# HMS Backend

Multi-tenant Hospital Management System API. Every tenant-scoped model carries a `hospitalId`,
and reads/writes through Mongoose queries (`find`, `findOne`, `countDocuments`, `distinct`,
`findOneAndUpdate`, `replaceOne`, `deleteMany`, ...) are automatically filtered by
`src/utils/tenantPlugin.js` using Node's AsyncLocalStorage request context
(`src/utils/tenantContext.js`), so there's no per-query tenant filter for a developer to forget.

The guarantee stops at aggregations: Mongoose can't inject a filter into an `aggregate()`
pipeline, so the plugin instead refuses any aggregate on a tenant-owned model whose first stage is
not `{ $match: { hospitalId } }` for the current hospital. Intentional cross-tenant work (platform
super admin tools, background cron jobs) must opt out explicitly with
`.setOptions({ skipTenantScope: true })` on queries or `.option({ skipTenantScope: true })` on
aggregates - grep for `skipTenantScope` to audit every such place.

## Local setup

```bash
npm install
cp .env.example .env
# fill in .env with your own values (see "Environment variables" below)

npm run seed:superadmin   # creates your one Platform Super Admin account
npm run seed:demo         # optional: builds the "CareFlow Demo Hospital" tenant with 12 months of sample data
npm run dev                # starts local server on http://localhost:5000
```

## Demo data

`npm run seed:demo` builds one standalone tenant, **CareFlow Demo Hospital**, with 12 months of
activity for screenshots and sales demos: staff and doctor schedules, 250 patients, ~900
appointments (including today's live OPD queue and the consultations behind it), wards and beds
with current and past admissions, bills with paid/partial/unpaid balances, lab orders, pharmacy
stock and dispensing, and the audit trail behind the dashboard's recent-activity feed.

Every write is scoped to that hospital's own `hospitalId` - no other hospital is read, modified or
deleted, and the script aborts rather than reusing an email that already belongs to another tenant.
It is idempotent: re-running it wipes and rebuilds only the demo hospital's data. Every date is
generated relative to "now", so the data always looks current whenever it is run.

```bash
npm run seed:demo                # build / rebuild the demo hospital
npm run seed:demo -- --dry-run   # build the dataset in memory and print counts, write nothing
npm run seed:demo -- --force     # allow the run when NODE_ENV=production
```

The script refuses to run with `NODE_ENV=production` unless `--force` is passed. At the end it
prints the counts it created (plus billed/collected/outstanding totals and today's queue) and a
login for every role. All demo accounts use the password `CareFlow@123`:

| Role | Email |
| --- | --- |
| Hospital admin | `admin@careflowdemo.pk` |
| Doctor | `kamran.ahmed@careflowdemo.pk` |
| Receptionist | `sadia.imtiaz@careflowdemo.pk` |
| Nurse | `rabia.aslam@careflowdemo.pk` |
| Lab technician | `farhan.ali@careflowdemo.pk` |
| Pharmacist | `mariam.zafar@careflowdemo.pk` |
| Patient portal | `ahmed.hassan@careflowdemo.pk`, `fatima.sheikh@careflowdemo.pk`, `ayesha.malik@careflowdemo.pk` |

The other doctors and staff accounts follow the same `firstname.lastname@careflowdemo.pk` pattern
and are printed at the end of the run.

## Environment variables

All of these are read via `process.env` somewhere in `src/` - set every one of them (except where
noted "Vercel only" or "local only") in Vercel's dashboard under Project Settings → Environment
Variables before deploying.

| Variable | Required | Used for |
| --- | --- | --- |
| `MONGO_URI` | Yes | MongoDB Atlas connection string (free M0 tier is enough). |
| `JWT_SECRET` | Yes | Signs and verifies login tokens. Must be at least 32 characters, or the app refuses to start. |
| `JWT_EXPIRES_IN` | Yes | Token lifetime, e.g. `1d`. There is no refresh token: the token is the session, so keep it short. |
| `CLIENT_URL` | Yes | Comma-separated list of allowed frontend origins for CORS (e.g. your Vercel frontend URL, plus `http://localhost:5173` for local dev). Required: there is no `*` fallback, and the app refuses to start without it. |
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
| `NODE_ENV` | No | Set automatically by Vercel to `production`. The global error handler only hides internal `err.message` text from 5xx responses when this is `production`. |

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
   Environment Variables). `MONGO_URI`, `JWT_SECRET` (32+ chars) and `CLIENT_URL` are validated at
   startup, so a missing one fails the deployment immediately instead of half-working at runtime.
3. Deploy. `vercel.json` already routes everything through `api/index.js` and defines the two
   cron jobs.

### Hobby plan notes

- **Cron jobs**: capped at once a day each (not a job-count limit); both jobs here are daily.
- **Function duration**: capped at 300 seconds; nothing here runs anywhere close to that.
- **Response size**: capped at 4.5MB; the data export endpoint caps record counts per request and
  flags truncation so it stays under that.
