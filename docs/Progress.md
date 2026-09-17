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

## Phase 1 — Foundation ✅ COMPLETE (backend + frontend)

- [x] Base UI layout & theme setup — final palette locked 05 Sep, verified via independent code review 14 Sep
- [x] Role-based dashboard shell/routing — sidebar navigation (not tabs, per user preference), all hospital roles covered except lab_technician/pharmacist/accountant (those get their real UI in Phase 3 frontend)
- [x] Patient registration module (OPD, auto-generated MRN) — backend + frontend done, live-tested
- [x] Appointment booking module (doctor-wise slots) — backend + frontend done, live-tested
- [x] OPD queue/token system — backend + frontend done, live-tested
- [x] Hospital Admin staff-invite endpoint (doctor/nurse/etc.) — backend + frontend done
- [x] Phase 1 live end-to-end test passed (`test-phase1.js`)

## Phase 2 — Clinical Core ✅ COMPLETE (backend + frontend)

- [x] Doctor consultation screen (vitals, diagnosis, dynamic prescription builder) — backend + frontend done, verified via independent code review 14 Sep
- [x] E-prescription — structured data stored (PDF generation deferred to Phase 5 polish)
- [x] Patient EMR timeline — backend + frontend done ("Medical History" tab in Patient Directory), role-gating verified to exactly match backend
- [x] Ward & Bed model + management UI — backend + frontend done, color-coded live bed status board
- [x] IPD admission & discharge workflow — backend + frontend done, 409 bed-conflict handling verified
- [x] Nurse notes / rounds module — backend + frontend done
- [x] Phase 2 live end-to-end test passed (`test-phase2.js`)
- [x] Frontend UI for all of the above — done via Antigravity Prompts 9 & 10, independently code-reviewed by Claude 14 Sep

## Phase 3 — Support Services ✅ COMPLETE (backend + frontend)

- [x] Lab test catalog (CRUD) — backend done 14 Sep, `POST/GET /api/lab/tests`
- [x] Lab order creation + status tracking — backend done, `POST/GET /api/lab/orders`, `PATCH /api/lab/orders/:id/status`
- [x] Lab result entry — backend done, `PATCH /api/lab/orders/:id/result` (file upload via Cloudinary deferred - text notes work now)
- [x] Pharmacy medicine inventory (CRUD, stock, expiry) — backend done, `/api/pharmacy/medicines`
- [ ] Low-stock auto-alert — model has `lowStockThreshold` field and a `?lowStock=true` filter, but no active notification yet (belongs with Phase 4 notifications)
- [x] Dispense medicine against prescription (atomic stock deduction + rollback on failure) — backend done, live-tested including the over-dispense rejection case
- [x] Billing/invoice generation (OPD/IPD/lab/pharmacy) — backend done, `/api/billing`
- [x] Payment status tracking (unpaid/partial/paid) — backend done, `PATCH /api/billing/:id/payment`
- [x] Phase 3 live end-to-end test passed (`test-phase3.js`)
- [x] Frontend UI for Lab, Pharmacy, Billing — done via Antigravity Prompt 11, confirmed visible 15 Sep after a dev-server restart (see notes below)

## Phase 4 — Admin & Insights ✅ COMPLETE

- [x] Reports/analytics dashboard (revenue, patient footfall, bed occupancy) — backend done + live-tested (`test-reports.js`) 16 Sep, frontend done via Antigravity Prompt 12
- [x] Audit log system (track critical actions) — done 16 Sep, automatic middleware-based logging across all 9 hospital-scoped route files, human-readable action labels, live-tested with tenant isolation check
- [x] Email notification system (Nodemailer) — done 16 Sep: low-stock alerts (pharmacist/admin) and trial-ending reminders (Super Admin, daily cron + manual trigger) both live-tested. Appointment reminders to patients deliberately deferred to Phase 5 (Patient model has no email field yet — tied to building real patient accounts)

## Phase 5 — Polish & Deploy

- [x] Patient self-service portal — backend done + live-tested (`test-patient-portal.js`) 17 Sep: hybrid account model (staff-assisted "Enable Portal Access" + public self-signup with CNIC-then-phone matching to prevent duplicate records), self-service endpoints for own record/appointments/EMR/bills, self-booking. Frontend Prompt 14 sent to Antigravity.
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
- 05 Sep 2026 — Phase 1 backend delivered by Claude (`hms-backend-phase1.zip`): Patient registration w/ auto-MRN, Appointment booking w/ auto OPD token numbers, live queue endpoint, Hospital Admin staff-invite endpoint, and a new `test-phase1.js` that verifies the full flow PLUS a hard tenant-isolation check across two separate hospitals (including direct cross-tenant object access, which correctly 404s). **Awaiting user to run `node test-phase1.js` locally** (against their live Atlas DB) to confirm before moving further.
- New API endpoints this phase: `POST/GET /api/patients`, `GET/PATCH /api/patients/:id`, `POST /api/appointments`, `GET /api/appointments/queue`, `PATCH /api/appointments/:id/status`, `GET /api/appointments/patient/:patientId`, `POST/GET /api/hospital-admin/staff`.
- 05 Sep 2026 — Bug found & fixed: `hospitalId` was being auto-stamped in a `pre('save')` hook, but Mongoose runs validation BEFORE `pre('save')` fires, so required-field validation rejected it first. Fixed by moving the stamping logic to `pre('validate')` instead. Single file `tenantPlugin.js` given to user to replace directly (not a full folder).
- 05 Sep 2026 — ✅ Phase 1 (`test-phase1.js`) PASSED on live database after the fix — patients, appointments, OPD tokens, and cross-hospital isolation all confirmed working.
- 05 Sep 2026 — **Workflow change, confirmed with user:** going forward, Claude gives individual updated/new files (not zipped whole folders) so the user can see and understand exactly what changed. User manages their own folder via Git (commit after each phase) instead of keeping manual "old copy" folders.

> ⚠️ **STANDING REMINDER — do not forget this:** Once this project is complete (or at any major milestone the user asks about), Claude must give the user a full, clear walkthrough explaining the entire project in simple terms — architecture, what each part does, how it all fits together — so the user can confidently explain it to friends, classmates, or a teacher/instructor if asked. This is a personal requirement the user stated explicitly and it must not be skipped.

> ⚠️ **STANDING REMINDER #2 — do not forget this either:** After every piece of work is tested and confirmed working (backend or frontend), Claude must proactively remind the user to `git add . / commit / push` from the HMS-Project root — don't wait for the user to ask. Claude forgot this once (14 Sep) and the user had to point it out. Build this into the natural end of a "tested successfully" response going forward.

- 05 Sep 2026 — Antigravity Prompt 1 delivered: React+Vite frontend scaffold, Zustand auth store, Axios client, Login page, protected routes, placeholder dashboards for all 3 dashboard groups (super admin / hospital roles / patient). Branded itself "CareFlow HMS".
- 05 Sep 2026 — Bug: frontend ran on port 3000 (not Vite's default 5173) → backend CORS (`CLIENT_URL` env var) rejected requests → "Network Error" on login. Fixed by updating `hms-backend/.env` `CLIENT_URL` to match the actual frontend port. **Reminder for later:** this must be updated again to the real Vercel frontend URL when deploying to production.
- 05 Sep 2026 — Design feedback: initial dashboard looked "generic AI-generated" — purple/indigo colors outside the spec, ALL-CAPS labels, identical boxed stat cards with icon badges, and literal placeholder text ("Ready for X in future prompts") visible in the UI. Antigravity Prompt 2 fixed the color/copy issues and built real Super Admin functionality (hospital list, add hospital, status/trial control, live stats) — good functional result. Prompt 3 sent to fix the remaining "SaaS-card kit" stat card pattern specifically (see Antigravity-Prompts.md for the exact design critique and fix instructions - useful reference for spotting this pattern again in future UI work).
- 05 Sep 2026 — **Theme finalized by user, locked in:** Primary `#0F766E`, Secondary `#14B8A6`, Background `#F0FDFA`, Cards `#FFFFFF`, Text `#134E4A`. This replaces the earlier teal+coral+dark-mode spec entirely — light-only now, no coral, no dark mode toggle. A muted amber is kept ONLY for functional warning states (e.g. trial-ending badges), not as a decorative accent. Antigravity Prompt 4 sent to apply this across all previously built screens. `HMS-Project-Plan.md` Section 8 updated to match.
- 05 Sep 2026 — Antigravity Prompt 4 executed well: CSS variables as single source of truth, dark mode + coral fully removed, warning color properly reserved for functional states only. `npm run build` passed with 0 errors.
- 05 Sep 2026 — ✅ Phase 2 backend delivered by Claude and PASSED live end-to-end test (`test-phase2.js`): Consultations, EMR timeline, Ward/Bed management (with bed-double-booking correctly rejected), IPD admit/discharge (bed status auto-syncs), and nurse rounds notes. Files delivered individually (not zipped) per established workflow.
- **Current gap:** backend is now significantly ahead of frontend. Only the Super Admin dashboard has real functional UI; Hospital Admin, Doctor, Nurse, Receptionist, and other role dashboards are still placeholders, even though their backend APIs (patients, appointments, consultations, wards, admissions) are fully built and tested. Next decision point: keep pushing backend (Phase 3: Lab/Pharmacy/Billing) or pause and catch frontend up first.
- 05 Sep 2026 — User chose to catch up frontend first. Antigravity Prompt 5 built: role-based sidebar-less top-tab nav (later corrected, see below), Staff Management, Patient Directory, Appointments/Live OPD Queue — all working against live backend, tested successfully by user across hospital_admin and doctor roles.
- 05 Sep 2026 — **Mistake caught by user, corrected:** when the user gave only light-mode hex values for the final theme, Claude assumed dark mode should be dropped entirely and told Antigravity to remove it (Prompt 4) — without clearly flagging this assumption to the user first. Dark mode was always meant to stay per the original plan. Fixed: dark palette now formally defined (see HMS-Project-Plan.md Section 8), Antigravity Prompt 6 sent to restore it. **Lesson: flag assumptions explicitly when a decision changes something established earlier, don't silently drop features.**
- 05 Sep 2026 — Additional user feedback on Prompt 5 output: remove "Quick fill demo role" buttons from login (not appropriate for a real product), switch from top-tab navigation to a proper left sidebar (user's explicit preference), and show the actual logged-in user's name (not just a role badge) somewhere visible. All three folded into Prompt 6 along with the dark mode fix.
- 05 Sep 2026 — Prompt 6 and Prompt 7 (sonner toasts, hover-to-pause built in) both delivered successfully by Antigravity.
- 05 Sep 2026 — Two gaps found by user: (1) Super Admin had no way to delete a hospital tenant, (2) hospital-scoped users had no way to see their own hospital's NAME anywhere (only a raw Mongo ID was visible). Backend fixed by Claude: `DELETE /api/super-admin/hospitals/:hospitalId` now cascade-deletes every piece of that tenant's data (staff, patients, appointments, consultations, wards, beds, admissions, nurse notes, counters) with zero orphaned data left behind; login response and new `GET /api/auth/me` endpoint now both return `hospitalName`. Live-tested (`test-delete-hospital.js`), all checks passed. Antigravity Prompt 8 sent for the frontend side (delete confirmation UI requiring the hospital name to be typed before enabling delete, and displaying the real hospital name in the dashboard header).
- 14 Sep 2026 — Backend Phase 3 (Lab, Pharmacy with atomic stock deduction + rollback, Billing) delivered by Claude and live-tested (`test-phase3.js`), all checks passed including the over-dispense rejection + stock-untouched-on-failure case.
- 14 Sep 2026 — Prompt 9 (Doctor Consultation form + Patient EMR timeline) and Prompt 10 (Wards & Beds + IPD admit/discharge + nurse notes, with the 3-point correction: doctor nav item, receptionist excluded from Add Note/Discharge, CSS-token colors instead of raw Tailwind) both implemented by Antigravity.
- 14 Sep 2026 — **User requested Claude independently verify the frontend code** (not just trust Antigravity's self-reported summary) — good practice, now established as standard workflow going forward for major frontend milestones. Claude extracted and reviewed `hms-frontend.zip` directly:
  - ✅ Verified correct: theme tokens (exact hex→HSL conversion, dark mode), auth store (persist + fetchMe + 401 auto-logout), Login page (demo buttons removed, dark toggle present), Delete Hospital (type-to-confirm exact-name pattern), Wards/Admissions RBAC (`canAdmit`/`canActOnIPD` exactly match backend role lists), bed status colors (CSS tokens, no raw `teal-*`), Doctor's Wards nav item present, EMR "Medical History" tab role-check exactly matches backend, hospitalName displayed in 3 places.
  - ✅ Independently re-ran `npm install` + `vite build` from scratch (the zip's `node_modules` was Windows-built, had to reinstall for Linux to test) — confirmed genuinely 0 build errors, matching Antigravity's claim.
  - ❌ **Found one real regression**: the Super Admin dashboard's stat cards reverted to the exact "SaaS-card kit" anti-pattern already fixed once in Prompt 3 (4 separate boxed cards, icon badges, ALL-CAPS labels) — likely lost when the sidebar layout was added in Prompt 6 and this section got rebuilt from scratch. Fix prompt sent, also asking Antigravity to sweep other pages for the same regression.
  - **Lesson: previously-fixed issues can silently regress when a later prompt touches/rebuilds the same file. Worth spot-checking earlier fixes are still intact after major structural changes (like adding a sidebar layout), not just checking the new feature being added.**
- 15 Sep 2026 — Antigravity implemented both the "Fixes" round (trial count bug, activate/suspend confirmation, extend-trial visibility, time validation) and Prompt 11 (Lab, Pharmacy, Billing frontend). Nav items initially appeared missing after both prompts, causing confusion - turned out to be a stale dev server (Vite HMR got stuck), not missing code. **Lesson: when a claimed change doesn't show up even after a hard browser refresh, restart the dev server itself before assuming the code wasn't written.**
- 15 Sep 2026 — Of the 5 "Fixes", 4 confirmed working; sidebar sticky positioning still not working (position:sticky approach unreliable). Sent a more prescriptive fix using a proper flex + h-screen + independently-scrolling-content-pane app-shell layout instead of sticky positioning.
- 15 Sep 2026 — ✅ Recurring "3rd stat blank" bug root-caused and fixed by Antigravity: `--warning-foreground` CSS variable was accidentally pure white, so amber-styled stat numbers were invisible (white-on-white), not actually miscomputed. Fixed with proper high-contrast amber tokens for both light/dark mode. Confirmed working across all 4 modules (Super Admin, Billing, Pharmacy, Lab) by user. **Good example of asking for root-cause investigation instead of four separate patches — paid off.**
- 15 Sep 2026 — Routing fix (real per-section URLs instead of single-page tab-state) still pending, prompt already written and waiting to be sent to Antigravity.
- 15 Sep 2026 — ✅ Routing fix confirmed working: URL changes per section, refresh preserves section, back/forward works, and role-based route guarding verified (tested with a pharmacist account - correctly redirected away from /dashboard/staff). **PHASE 3 NOW FULLY COMPLETE (backend + frontend, all bugs resolved).**
- 16 Sep 2026 — Reports backend delivered (4 endpoints: overview/financial/clinical/operations, all MongoDB aggregations manually tenant-scoped since aggregate() bypasses the automatic middleware). Live-tested with known data across all 4 endpoints + a tenant-isolation check specifically for aggregations (empty second hospital confirmed zero leakage). Antigravity Prompt 12 sent for the frontend (Recharts-based, real routes per section, matches the just-established routing pattern).
- 16 Sep 2026 — ✅ **PHASE 4 FULLY COMPLETE.** Audit logging implemented as automatic middleware (added to all 9 hospital-scoped route files) rather than manual per-controller calls — much more maintainable, catches every mutating action without needing to remember to add logging to future controllers too (just add `auditLogger` to a new route file's middleware chain). Low-stock and trial-reminder emails both live-tested (gracefully log to console since real email credentials aren't set up yet — will start actually sending the moment `.env` EMAIL_USER/EMAIL_PASS are filled in, no code changes needed).
- 17 Sep 2026 — Working sandbox was reset mid-session; successfully reconstructed the full backend from previously-delivered individual phase files (verified byte-identical to the user's actual working copy, confirmed via diff against a fresh zip the user sent — only line-ending differences, zero code discrepancies). Added `email`, `cnic`, and `userId` fields to Patient model; CNIC uniquely indexed per hospital (sparse) as the primary duplicate-prevention mechanism, matching by CNIC first then phone during self-signup.