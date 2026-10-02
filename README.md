# CareFlow HMS

**A multi-tenant Hospital Management System (SaaS)**: built on the MERN stack to onboard and serve multiple hospitals from a single platform, with strict per-hospital data isolation enforced at the database layer.

🔗 **Live:** [hms-project-hhtz.vercel.app](https://hms-project-hhtz.vercel.app)

## Overview

CareFlow HMS is designed for hospitals of any size to manage their day-to-day clinical and administrative operations, from OPD registration and appointment scheduling to IPD admissions, lab diagnostics, pharmacy dispensing, billing, and reporting, all within one system, while allowing the platform owner to onboard and manage 100+ hospitals as independent, fully isolated tenants. A public landing page handles demo requests from prospective hospitals, and each hospital's data (and payments) stay fully isolated from every other tenant.

## Key Features

- **Multi-Tenant Architecture:** each hospital's data (patients, staff, appointments, records) is completely isolated at the database query layer, not just hidden in the UI
- **Role-Based Access Control:** 9 distinct roles (Platform Super Admin, Hospital Admin, Doctor, Receptionist, Nurse, Lab Technician, Pharmacist, Accountant, Patient), each with a tailored workspace
- **Public Landing Page & Demo Requests:** a marketing front door where prospective hospitals can request a demo
- **OPD & Appointments:** patient registration with auto-generated MRNs, doctor-wise scheduling, a live token-based queue, patient self check-in from the portal, double-booking prevention enforced at the database level, and automatic no-show detection that frees the slot for rebooking
- **Clinical Records:** doctor consultations with vitals, diagnosis, and e-prescriptions; a full patient EMR timeline, including allergies and chronic conditions
- **IPD / Ward Management:** ward and bed setup, live occupancy tracking, admission/discharge workflow, nursing rounds notes
- **Laboratory:** test catalog, order tracking through to results
- **Pharmacy:** batch-level inventory tracking with FEFO (first-expiry-first-out) dispensing, low-stock alerts, and atomic stock deduction
- **Billing & Invoicing:** itemized bills across OPD/IPD/Lab/Pharmacy with payment tracking, insurance/panel/TPA coverage splits, and Pakistan-friendly payment methods (cash, card, JazzCash, EasyPaisa, bank transfer)
- **Reports & Analytics:** financial, clinical, and operational dashboards with charts
- **Data Export:** hospital admins can export their own patients, bills, medicines, or appointments as JSON or CSV at any time, with no lock-in
- **Audit Logging:** a complete record of every action taken across the system
- **Email Notifications:** low-stock, subscription-trial, and appointment reminder alerts
- **Patient Self-Service Portal:** patients can sign up, book their own appointments, check themselves in, and view their medical history and bills

## Tech Stack

**Frontend:** React, Vite, Tailwind CSS, TanStack Query, Zustand, React Hook Form, Zod, Recharts
**Backend:** Node.js, Express, MongoDB (Mongoose)
**Deployment:** Vercel (serverless, separate frontend and backend projects)

## Architecture Highlights

- Tenant isolation is enforced automatically at the database layer using an AsyncLocalStorage-based request context combined with a Mongoose plugin, so every query is scoped to the logged-in user's hospital by construction, not something a developer has to remember to add per-query.
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

Proprietary, all rights reserved.
