# Hospital Management System (HMS) — Full Project Plan
### MERN Stack | Vercel Deployment | Full Multi-Department Hospital

---

## 1. Executive Summary

A full-scale, **multi-tenant SaaS Hospital Management System** — a single product you can sell and onboard to **100+ hospitals**, each with fully isolated data. Covers OPD, IPD, Laboratory, Pharmacy, Billing, and Administration — built on MERN (MongoDB, Express, React, Node) and deployed entirely on Vercel (frontend + backend).

This is not "one HMS per hospital" — it's **one platform, many hospitals**, each hospital operating inside its own secure, isolated tenant space, with you (the platform owner) managing subscriptions and onboarding from a central control panel.

---

## 2. User Roles & Permissions

| # | Role | Core Responsibility |
|---|------|---------------------|
| 1 | **Platform Super Admin (You)** | Owns the whole SaaS — onboards new hospitals, manages subscriptions/billing, can activate/suspend a hospital, sees platform-wide (aggregated) analytics |
| 2 | **Hospital Admin** | Manages staff, departments, wards, reports — but strictly scoped to **their own hospital only** |
| 3 | **Doctor** | Consultations, prescriptions, patient EMR, IPD rounds |
| 4 | **Receptionist / Front Desk** | Patient registration, appointment booking, OPD queue |
| 5 | **Nurse / Ward Staff** | Vitals recording, ward/bed updates, medication administration logs |
| 6 | **Lab Technician** | Receives test orders, uploads results/reports |
| 7 | **Pharmacist** | Manages drug inventory, dispenses medicine against prescriptions |
| 8 | **Accountant / Billing Staff** | Generates invoices, tracks payments, insurance claims |
| 9 | **Patient** | Self-service portal — book appointments, view reports/bills/prescriptions |

> Role-Based Access Control (RBAC) will gate every route and UI component — a receptionist won't even see billing screens, a nurse won't see admin settings, etc.
>
> **Critical rule:** every role from #2 downward is locked to a single hospital (tenant). Roles #3–9 at "Hospital A" can never see, query, or accidentally touch "Hospital B"'s data — this is enforced at the database query layer, not just hidden in the UI (see Section 3).

---

## 3. Multi-Tenant SaaS Architecture & Data Isolation

This is the most important architectural decision in the whole project, so it's worth explaining clearly.

### How "one hospital" = "one tenant" works
Every hospital that buys your product becomes a **tenant**, identified by a unique `hospitalId`. Every single piece of data in the system — patients, appointments, bills, staff, everything — is tagged with the `hospitalId` it belongs to.

### The isolation approach: Shared Database + Enforced Tenant Scoping
Instead of giving every hospital its own separate database (which becomes very expensive and painful to maintain once you have 100+ hospitals — 100+ databases to back up, migrate, and monitor), we use the **industry-standard SaaS approach**: one shared MongoDB database, where:

- Every collection (Patients, Appointments, Bills, etc.) has a `hospitalId` field.
- A backend middleware **automatically injects the logged-in user's `hospitalId`** into every single database query — nobody writes a query without it; it's baked into the query layer itself, not something a developer has to "remember" each time.
- The `hospitalId` comes from the user's **JWT token** (set once at login) — it can never be overridden or spoofed from the frontend.
- Database indexes are built on `hospitalId` so queries stay fast even with 100+ hospitals' data in one collection.

This is exactly how large SaaS products (Slack workspaces, Shopify stores, Notion workspaces) isolate customer data — proven, secure when implemented correctly, and far cheaper/easier to scale and maintain than separate databases per client.

> For a future "Enterprise" pricing tier, a hospital could optionally get a fully dedicated database for extra peace of mind — but that's a later add-on, not needed for launch.

### Onboarding flow for a new hospital (your sales flow)
1. You (Platform Super Admin) create a new **Hospital** record — name, status.
2. **Trial system:** when a hospital wants to "try before buying," you set a trial period from the Super Admin panel — **7 days, 14 days, or any custom number of days you choose**, decided case-by-case per hospital. The system auto-tracks the trial end date and can auto-flag/expire it when the time is up.
3. A **Hospital Admin** account is auto-created for that hospital and invited via email.
4. The Hospital Admin logs in and invites their own staff (Doctors, Nurses, Receptionists, etc.) — every invited user is automatically locked to that hospital's `hospitalId`.
5. No subdomain for now — every hospital logs in through the same shared URL, just with their own account. (Branded subdomains like `cityhospital.yourapp.com` can be added later without any rework — see Section 10.)

### Subscription & Billing (deferred — not needed right now)
Eventually, once you're ready to actually charge hospitals, you'll want plans, trial periods, and payment gateway integration. **This is intentionally left out of the initial build** — no point adding payment infrastructure (and its own costs/complexity) before there's revenue to justify it. The `Hospitals` collection (Section 7) already has a `status` field (active/trial/suspended) so you can manually mark a hospital active or not — full self-serve billing comes later as its own phase.

### Security guarantee in plain terms
A doctor logging into Hospital A's account **physically cannot** query Hospital B's patients — not because the UI hides the button, but because the database layer itself refuses to return data outside their `hospitalId`, even if someone tried to manipulate an API request directly.

---

## 4. Core Feature Modules

### A. Authentication & Access Control
- JWT-based login, role-based dashboards
- Forgot/reset password, account activation via email
- Session/token expiry handling

### B. Patient Management (EMR)
- OPD registration with auto-generated MRN (Medical Record Number)
- Complete medical history: allergies, chronic conditions, past visits
- Searchable patient directory

### C. Appointment & OPD Queue
- Doctor-wise appointment slots
- Live queue/token system for OPD
- Reschedule/cancel with notifications

### D. Doctor Consultation & E-Prescription
- Vitals entry (BP, temp, weight, etc.)
- Diagnosis + digital prescription generator (PDF)
- Consultation history timeline per patient

### E. IPD / Ward & Bed Management
- Ward & bed availability tracker (real-time status: Vacant / Occupied / Reserved)
- Admission & discharge workflow
- Doctor rounds & nursing notes

### F. Laboratory Management
- Test catalog with pricing
- Order tests → sample tracking → result upload
- Downloadable lab reports (PDF)

### G. Pharmacy Management
- Medicine inventory with stock levels & expiry tracking
- Low-stock auto-alerts
- Dispense against e-prescription, auto stock deduction

### H. Billing & Invoicing
- OPD bill, IPD bill, lab bill, pharmacy bill — consolidated or separate
- Payment status tracking (Paid/Partial/Due)
- Insurance/discount fields

### I. Inventory / Stock Management
- General medical supplies & equipment tracking (separate from pharmacy drugs)

### J. Reports & Analytics Dashboard
- Revenue charts, patient footfall, bed occupancy %, top diagnoses
- Role-specific dashboards (Admin sees hospital-wide, Doctor sees personal stats)

### K. Notifications
- Email only for now (appointment reminders, low stock alerts) — free via Nodemailer/Gmail/Brevo
- SMS intentionally left out — can be added later as a simple add-on if the need comes up

### L. Patient Self-Service Portal
- Book/cancel appointments
- View/download prescriptions, lab reports, bills
- Medical history timeline

### M. Audit Logs
- Every critical action (who did what, when) — important for hospital compliance

### N. Tenant Management (Platform-level — your control panel)
- Onboard/create new hospital accounts
- Manually mark a hospital active / trial / suspended
- Platform-wide analytics: total hospitals, active users, growth
- Subscription/payment billing is a **later add-on** (Section 9) — not part of the initial build

---

## 5. Tech Stack

### Frontend
- **React 18 + Vite**
- **Tailwind CSS** + **shadcn/ui** components
- **React Router v6**
- **TanStack Query (React Query)** — server state/data fetching
- **Zustand** — lightweight global state (auth, UI state)
- **React Hook Form + Zod** — forms & validation
- **Recharts** — analytics charts
- **Axios** — API calls

### Backend
- **Node.js + Express.js**
- **MongoDB Atlas + Mongoose**
- **JWT + bcrypt** — auth & password hashing
- **RBAC middleware** — role-gated routes
- **Multer + Cloudinary** — file uploads (lab reports, profile pics, documents) — *not local storage, since Vercel's filesystem is ephemeral*
- **Zod / express-validator** — backend validation
- **Nodemailer** — email notifications (via free Gmail SMTP or a free-tier transactional email provider like Brevo/Resend — no cost)
- **node-cron / Vercel Cron Jobs** — scheduled tasks (e.g., appointment reminders) — free within Vercel's Hobby plan limits
- **Tenant-scoping middleware** — custom Express/Mongoose middleware that auto-injects `hospitalId` into every query

> **Payment gateway (Stripe/JazzCash/etc.) is intentionally NOT part of the stack right now.** No point adding a paid, subscription-based, or foreign-currency-dependent service before you have actual revenue. This gets added later as its own phase, once you're ready to start charging hospitals — see Section 9.

### Database
- **MongoDB Atlas — Free M0 tier.** This comfortably handles development and even your first several real hospitals. No cost until you outgrow it.

---

## 6. Deployment Strategy (Vercel) — Important Notes

Since you want **everything on Vercel**, here's the real architecture (so there are no surprises mid-project):

1. **Two separate Vercel projects:**
   - `hms-frontend` → React/Vite static build
   - `hms-backend` → Express app wrapped as a serverless function (single entry `api/index.js`, all routes behind it via `vercel.json` rewrites)

2. **MongoDB connections must be cached** (not reopened per request) — serverless functions spin up/down constantly, so we use a cached-connection pattern in Mongoose to avoid exhausting Atlas connections.

3. **No native WebSockets on Vercel serverless.** If you want a "live" OPD queue or real-time bed status updates later, we'll use polling (React Query refetch interval) instead of Socket.io — or integrate a third-party real-time service (Pusher/Ably) if truly needed. Good to decide this now rather than discover it later.

4. **File uploads → Cloudinary**, not local disk (Vercel has no persistent file storage).

5. **Environment variables** (DB URI, JWT secret, Cloudinary keys, email creds) — set directly in Vercel dashboard, never committed to code.

6. **Cron jobs** (reminders, stock alerts) via Vercel's built-in Cron feature — free within Hobby plan limits.

7. **Everything above is 100% free to start:** Vercel Hobby plan (frontend + backend), MongoDB Atlas M0 (free), Cloudinary free tier (image/file storage), free email sending. You can build and even onboard your first handful of hospitals without spending anything.

8. **Paid upgrades only become relevant later**, once you have real hospitals actively using the system and it's funded by their subscription revenue — e.g., MongoDB Atlas paid tier (more connections/storage), Vercel Pro (higher traffic limits), Cloudinary paid tier (more storage). None of this is needed on day one.

This setup keeps 100% of the app on Vercel as you wanted, with zero external hosting, and zero cost until you're actually generating revenue.

---

## 7. Database Schema (Core Collections)

| Collection | Key Fields |
|---|---|
| **Users** | name, email, password, role, department, status, hospitalId |
| **Patients** | MRN, name, DOB, gender, contact, allergies, history[] |
| **Appointments** | patientId, doctorId, date, time, status, type (OPD/IPD) |
| **Consultations** | patientId, doctorId, vitals, diagnosis, prescription[], date |
| **Admissions (IPD)** | patientId, wardId, bedId, admitDate, dischargeDate, doctorId |
| **Wards / Beds** | wardName, bedNumber, status, department |
| **LabTests** (catalog) | name, price, department |
| **LabOrders** | patientId, tests[], status, resultFileUrl |
| **Medicines** | name, category, stock, price, expiryDate, supplier |
| **PharmacySales** | prescriptionId, medicines[], quantity, amount |
| **Bills** | patientId, items[], totalAmount, paymentStatus, method |
| **Departments** | name, headDoctorId, description |
| **Notifications** | type, recipientId, message, status |
| **AuditLogs** | userId, action, targetCollection, timestamp |

> **Every collection above also carries a `hospitalId` field** — this is what makes tenant isolation work (see Section 3).

### Platform-level collections (new, for the SaaS/multi-tenant layer)

| Collection | Key Fields |
|---|---|
| **Hospitals** (tenants) | name, status (active/trial/suspended), trialStartDate, trialEndDate (Super Admin sets any custom number of days), createdAt |

> A `Subscriptions/Plans` collection will be added later once billing is actually introduced — not needed for the initial free build.

---

## 8. Theme & Design Direction (Proposed)

Since you wanted something people will genuinely find beautiful — steering **away** from the generic flat blue/white "government hospital software" look, toward a **premium healthcare-SaaS aesthetic** (think Linear/Notion/modern fintech, but healthcare-flavored):

- **Primary color:** Deep Teal/Emerald (`#0F766E` – `#14B8A6`) — feels clinical yet calming, not sterile
- **Accent color:** Warm Coral/Amber (`#F97316` or `#FB923C`) — for CTAs, alerts, highlights (creates contrast & warmth against the cool teal)
- **Backgrounds:** Soft off-white (`#FAFAF9`) in light mode, deep slate (`#0F172A`) in dark mode — **dark mode toggle included**
- **Cards:** Rounded corners (12–16px), soft layered shadows, subtle glassmorphism on dashboard widgets
- **Typography:** **Inter** or **Plus Jakarta Sans** — clean, modern, highly legible
- **Micro-interactions:** Smooth hover states, subtle transitions on cards/buttons, skeleton loaders instead of spinners
- **Iconography:** Lucide icons (consistent, modern, matches shadcn/ui)
- **Data viz:** Recharts styled with the teal/coral palette for a cohesive dashboard feel

This gives every role a dashboard that feels premium and trustworthy rather than clinical/cold — while still being highly functional and information-dense where needed (billing, lab, pharmacy screens).

---

## 9. Suggested Development Phases

| Phase | Scope |
|---|---|
| **Phase 0 — Multi-Tenancy Foundation** | Hospital (tenant) model, `hospitalId` scoping middleware, Platform Super Admin panel, hospital onboarding flow — this must be solid *before* any clinical features are built on top |
| **Phase 1 — Foundation** | Auth, RBAC, Patient registration, Appointment booking, base UI theme/layout |
| **Phase 2 — Clinical Core** | Doctor consultation, E-prescription, EMR timeline, IPD admission/ward-bed system |
| **Phase 3 — Support Services** | Lab module, Pharmacy module, Billing/Invoicing |
| **Phase 4 — Admin & Insights** | Reports/analytics dashboards, Audit logs, Notifications |
| **Phase 5 — Polish & Deploy** | Patient self-portal, dark mode, responsiveness pass, Vercel deployment (frontend + backend), env setup |
| **Phase 6 — Monetization (later, once ready)** | Payment gateway integration, subscription plans, billing dashboard — only when you're ready to actually start charging hospitals |

---

## 10. Open Decisions — Status

**✅ Decided:**
- Notifications: **Email only** (SMS skipped for now, can add later if needed)
- Subdomains: **Skipped for now** — shared login URL, all hospitals use the same app
- Trial system: **Fully flexible** — Super Admin sets any custom trial length (7 days, 14 days, or any number) per hospital when onboarding them
- Budget: **$0 — fully free-tier stack**, no paid services until revenue starts (Phase 6)

**Still open (not blockers, can decide as we go):**
- [ ] Insurance/claims handling needed in billing, or simple cash/card only?
- [ ] Any specific compliance requirement (local hospital regulations)?

Everything else is locked in — ready to start building.

---
