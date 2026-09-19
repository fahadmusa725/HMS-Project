# CareFlow HMS

**A multi-tenant Hospital Management System (SaaS)** — built on the MERN stack to onboard and serve multiple hospitals from a single platform, with strict per-hospital data isolation enforced at the database layer.

## Overview

CareFlow HMS is designed for hospitals of any size to manage their day-to-day clinical and administrative operations — from OPD registration and appointment scheduling to IPD admissions, lab diagnostics, pharmacy dispensing, billing, and reporting — all within one system, while allowing the platform owner to onboard and manage 100+ hospitals as independent, fully isolated tenants.

## Key Features

- **Multi-Tenant Architecture** — each hospital's data (patients, staff, appointments, records) is completely isolated at the database query layer, not just hidden in the UI
- **Role-Based Access Control** — 9 distinct roles (Platform Super Admin, Hospital Admin, Doctor, Receptionist, Nurse, Lab Technician, Pharmacist, Accountant, Patient), each with a tailored workspace
- **OPD & Appointments** — patient registration with auto-generated MRNs, doctor-wise scheduling, and a live token-based queue
- **Clinical Records** — doctor consultations with vitals, diagnosis, and e-prescriptions; a full patient EMR timeline
- **IPD / Ward Management** — ward and bed setup, live occupancy tracking, admission/discharge workflow, nursing rounds notes
- **Laboratory** — test catalog, order tracking through to results
- **Pharmacy** — inventory management with low-stock alerts and atomic stock deduction on dispense
- **Billing & Invoicing** — itemized bills across OPD/IPD/Lab/Pharmacy with payment tracking
- **Reports & Analytics** — financial, clinical, and operational dashboards with charts
- **Audit Logging** — a complete record of every action taken across the system
- **Email Notifications** — low-stock and subscription-trial alerts
- **Patient Self-Service Portal** — patients can sign up, book their own appointments, and view their medical history and bills

## Tech Stack

**Frontend:** React, Vite, Tailwind CSS, TanStack Query, Zustand, React Hook Form, Zod, Recharts
**Backend:** Node.js, Express, MongoDB (Mongoose)
**Deployment:** Vercel (serverless)

## Architecture Highlights

- Tenant isolation is enforced automatically at the database layer using an AsyncLocalStorage-based request context combined with a Mongoose plugin, so every query is scoped to the logged-in user's hospital by construction — not something a developer has to remember to add per-query.
- JWT-based authentication with role and tenant information embedded in the token.
- A hybrid patient-account model: hospital staff can enable portal access for an existing patient record, or a patient can self-register (matched against existing records by CNIC/phone to prevent duplicates).

## Getting Started

### Backend

```bash
cd hms-backend
npm install
cp .env.example .env   # fill in your MongoDB URI, JWT secret, etc.
npm run seed:superadmin
npm run dev
```

### Frontend

```bash
cd hms-frontend
npm install
npm run dev
```

## License

Proprietary — all rights reserved.