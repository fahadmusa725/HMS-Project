# HMS Project — Progress Tracker

**How to use this file:**
- Every task below is a checkbox. When a task is completed, change `[ ]` to `[x]` and add a short note (date + what was done, e.g. `[x] Setup MongoDB Atlas — done 04 Sep, free M0 cluster connected`).
- This file is the single source of truth for "what's done vs what's left" — whoever works on the project next (any AI tool, or you) should check this file first before starting new work, and update it after finishing a task.
- Reference doc: `HMS-Project-Plan.md` (full architecture, roles, schema, theme, tech stack).
- Planning/architecture refinement → Antigravity. Backend (Node/Express/MongoDB, tenant isolation, APIs) → Claude.

---

## Phase 0 — Multi-Tenancy Foundation ✅ COMPLETE
*(Must be solid before anything else is built on top)*

- [x] Setup MERN project structure (`/server` backend scaffolded) — done 04 Sep by Claude
- [x] Setup MongoDB Atlas free (M0) cluster + connect from backend — done, live connection verified 04 Sep
- [x] Create `Hospital` (tenant) model — name, status, trialStartDate, trialEndDate — done 04 Sep
- [x] Create `User` model — name, email, password, role, hospitalId (all 9 roles) — done 04 Sep
- [x] Build JWT auth (login) — hospitalId + role embedded in token — done 04 Sep (`/api/auth/login`)
- [x] Build tenant-scoping engine — AsyncLocalStorage + Mongoose plugin auto-injects `hospitalId` into every query — done 04 Sep
- [x] Test tenant isolation — **live end-to-end test PASSED** on real MongoDB Atlas: super admin login, hospital creation w/ 14-day trial, hospital admin login, and confirmed hospital admin is correctly BLOCKED from super-admin routes (403) — done 04 Sep, see `test-flow.js`
- [x] Build Platform Super Admin endpoints — create hospital w/ custom trial days, list hospitals, change status/trial — done 04 Sep, verified live
- [ ] Build Hospital Admin invite-more-staff flow (admin invites doctor/nurse/etc.) — next up in Phase 1
- [x] Real end-to-end test against a live MongoDB Atlas cluster — **DONE, all 5 checks passed** 04 Sep

## Phase 1 — Foundation

- [ ] Base UI layout & theme setup (teal/coral palette, dark mode toggle, Inter font)
- [ ] Role-based dashboard shell/routing (sidebar changes per role)
- [ ] Patient registration module (OPD, auto-generated MRN)
- [ ] Appointment booking module (doctor-wise slots)
- [ ] OPD queue/token system

## Phase 2 — Clinical Core

- [ ] Doctor consultation screen (vitals entry, diagnosis)
- [ ] E-prescription generator (PDF)
- [ ] Patient EMR timeline (consultation history view)
- [ ] Ward & Bed model + management UI (vacant/occupied/reserved)
- [ ] IPD admission & discharge workflow
- [ ] Nurse notes / rounds module

## Phase 3 — Support Services

- [ ] Lab test catalog (CRUD)
- [ ] Lab order creation + status tracking
- [ ] Lab result upload (Cloudinary) + downloadable report
- [ ] Pharmacy medicine inventory (CRUD, stock, expiry)
- [ ] Low-stock auto-alert
- [ ] Dispense medicine against prescription (auto stock deduction)
- [ ] Billing/invoice generation (OPD/IPD/lab/pharmacy)
- [ ] Payment status tracking (Paid/Partial/Due)

## Phase 4 — Admin & Insights

- [ ] Reports/analytics dashboard (revenue, patient footfall, bed occupancy)
- [ ] Audit log system (track critical actions)
- [ ] Email notification system (Nodemailer — appointment reminders, low-stock alerts)

## Phase 5 — Polish & Deploy

- [ ] Patient self-service portal (book appointment, view reports/bills)
- [ ] Dark mode final polish
- [ ] Full responsive pass (mobile/tablet)
- [ ] Deploy frontend to Vercel (`hms-frontend`)
- [ ] Deploy backend to Vercel as serverless function (`hms-backend`)
- [ ] Configure environment variables on Vercel (DB URI, JWT secret, Cloudinary keys, email creds)
- [ ] End-to-end test across all 9 roles on live deployment

## Phase 6 — Monetization (later, once ready to charge hospitals)

- [ ] Choose payment gateway (Stripe / JazzCash / Easypaisa)
- [ ] Build subscription plans & pricing tiers
- [ ] Build billing dashboard for Platform Super Admin
- [ ] Auto-suspend hospital on non-payment

---

## Notes / Decisions Log
*(Add anything decided mid-project here so it isn't lost)*

- 04 Sep 2026 — Confirmed: full multi-tenant SaaS, 9 roles, email-only notifications, no subdomains for now, flexible custom trial system, $0 budget stack (Vercel Hobby + MongoDB Atlas M0 + Cloudinary free tier).
- 04 Sep 2026 — Phase 0 backend delivered by Claude as `hms-backend.zip`. Core tenant-isolation engine built and sanity-tested. **Blocker to proceed further:** need a free MongoDB Atlas cluster URI from the user before real end-to-end testing and before Phase 1 backend work (Patients, Appointments) can be verified against a live DB.
- 04 Sep 2026 — Frontend: not started yet. First Antigravity prompt to be handed over next (project scaffold + theme + auth screens).
- 04 Sep 2026 — ✅ Phase 0 fully verified end-to-end on live MongoDB Atlas (`hms-cluster`). Backend foundation is solid and ready to build on. Next: hand off first Antigravity prompt for frontend, while backend Phase 1 (Patient Management, Appointments) starts in parallel.
- Note: a test hospital ("Test City Hospital") was created in the live DB by `test-flow.js` — harmless test data, safe to ignore or delete later once an admin UI exists.