/**
 * Seeds a standalone demo tenant, "CareFlow Demo Hospital", with 12 months of realistic
 * activity for screenshots and sales demos: patients and portal accounts, doctor schedules,
 * per-doctor OPD tokens, queue priorities, walk-in tokens, digital pre-checks, consultations,
 * IPD stays, lab orders, pharmacy stock and sales, bills, and an audit trail with readable
 * actions and PHI reads. No other hospital is read, modified, or deleted - every write is
 * scoped to this tenant's own hospitalId.
 *
 * Idempotent: a run wipes this hospital's documents and reinserts a freshly generated set, so
 * repeating it always converges on the same dataset (same logins, same relative dates, same
 * queue). If a demo email is already owned by a different hospital the script aborts instead
 * of hijacking that account.
 *
 * Usage:
 *   npm run seed:demo              rebuild the demo hospital
 *   npm run seed:demo -- --dry-run generate and validate in memory, write nothing
 *   npm run seed:demo -- --force   allow NODE_ENV=production
 * Every demo account shares the password CareFlow@123 (printed at the end of the run).
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const connectDB = require("../config/db");
const Hospital = require("../models/Hospital");
const User = require("../models/User");
const Patient = require("../models/Patient");
const DoctorSchedule = require("../models/DoctorSchedule");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const Ward = require("../models/Ward");
const Bed = require("../models/Bed");
const Admission = require("../models/Admission");
const NurseNote = require("../models/NurseNote");
const LabTest = require("../models/LabTest");
const LabOrder = require("../models/LabOrder");
const Medicine = require("../models/Medicine");
const PharmacySale = require("../models/PharmacySale");
const Bill = require("../models/Bill");
const AuditLog = require("../models/AuditLog");
const PreCheck = require("../models/PreCheck");
const { Counter } = require("../models/Counter");
const { describeAction, extractResourceId } = require("../utils/auditActions");
const { APP_TIMEZONE, hospitalNow, hospitalDate, slotsForDate, toMinutes, toHHMM } = require("../utils/scheduleSlots");

const DEMO_HOSPITAL_NAME = "CareFlow Demo Hospital";
const DEMO_PASSWORD = "CareFlow@123";
const DAY_MS = 24 * 60 * 60 * 1000;
const FORCE = process.argv.includes("--force");
const DRY_RUN = process.argv.includes("--dry-run");

const PATIENT_COUNT = 250;
const HISTORICAL_APPOINTMENTS = 836;
const TODAY_APPOINTMENTS_PER_DOCTOR = 8;
const LAB_ORDER_COUNT = 120;
const PHARMACY_SALE_COUNT = 150;
const PAST_ADMISSION_COUNT = 40;

const NOW = new Date();
const TODAY = hospitalNow(NOW).date;
const NOW_TIME = hospitalNow(NOW).time;

const MRN_PREFIX = DEMO_HOSPITAL_NAME.split(" ")
  .map((word) => word[0])
  .join("")
  .toUpperCase()
  .slice(0, 4);

let rngState = 0x5eed1234;
function random() {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (list) => list[Math.floor(random() * list.length)];
const chance = (p) => random() < p;

function pickWeighted(entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

const pad2 = (n) => String(n).padStart(2, "0");

function timezoneOffsetMinutes(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TIMEZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (asUtc - date.getTime()) / 60000;
}

/** UTC instant for a hospital-local "YYYY-MM-DD" + "HH:MM" wall time. */
function zoned(dateStr, timeStr = "00:00") {
  const base = Date.parse(`${dateStr}T${timeStr}:00Z`);
  return new Date(base - timezoneOffsetMinutes(new Date(base)) * 60000);
}

function addMinutes(timeStr, minutes) {
  return toHHMM(Math.min(23 * 60 + 59, toMinutes(timeStr) + minutes));
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function minutesAgo(minutes) {
  return new Date(NOW.getTime() - minutes * 60000);
}

/** A past timestamp (never in the future), minDaysAgo/maxDaysAgo days back, clinic hours. */
function historicMoment(maxDaysAgo, minDaysAgo = 0) {
  const offset = randInt(minDaysAgo, maxDaysAgo);
  const date = hospitalDate(-offset);
  const time = `${pad2(randInt(8, 20))}:${pad2(randInt(0, 59))}`;
  const instant = zoned(date, time);
  if (instant.getTime() > NOW.getTime() - 5 * 60000) return new Date(instant.getTime() - DAY_MS);
  return instant;
}

const MALE_FIRST = [
  "Ahmed", "Muhammad", "Ali", "Hassan", "Hussain", "Usman", "Bilal", "Imran", "Kamran", "Faisal",
  "Adnan", "Tariq", "Salman", "Farhan", "Rizwan", "Hamza", "Shahid", "Nadeem", "Asif", "Waqar",
  "Zeeshan", "Arif", "Junaid", "Kashif", "Noman", "Rashid", "Saeed", "Tanveer", "Umar", "Yasir",
  "Zubair", "Danish", "Ehsan", "Haris", "Ibrahim", "Jibran", "Mudassir", "Owais", "Qasim", "Sohail",
];
const FEMALE_FIRST = [
  "Ayesha", "Fatima", "Sana", "Hina", "Rabia", "Sadia", "Maryam", "Zainab", "Nadia", "Farah",
  "Amna", "Iqra", "Komal", "Mehwish", "Nida", "Rida", "Saima", "Shazia", "Uzma", "Yasmeen",
  "Areeba", "Bushra", "Dania", "Eman", "Fariha", "Hafsa", "Irum", "Kiran", "Lubna", "Madiha",
  "Naila", "Rukhsana", "Samina", "Tehmina", "Warda", "Zara", "Zoya", "Noreen", "Momina", "Anum",
];
const LAST_NAMES = [
  "Khan", "Ahmed", "Ali", "Hussain", "Raza", "Malik", "Sheikh", "Qureshi", "Siddiqui", "Abbasi",
  "Baig", "Chaudhry", "Farooqi", "Hashmi", "Iqbal", "Javed", "Kazmi", "Lodhi", "Mirza", "Nawaz",
  "Pervez", "Rehman", "Shah", "Tariq", "Yousuf", "Zafar", "Bhatti", "Butt", "Dar", "Gilani",
  "Hameed", "Jafri", "Khattak", "Latif", "Memon", "Niazi", "Pirzada", "Rana", "Sattar", "Warsi",
];

const LOCATIONS = [
  { city: "Karachi", areas: ["DHA Phase 2", "Gulshan-e-Iqbal Block 6", "Nazimabad No 3", "PECHS Block 2", "North Nazimabad"] },
  { city: "Lahore", areas: ["Model Town", "Johar Town", "Gulberg III", "DHA Phase 5", "Iqbal Town"] },
  { city: "Islamabad", areas: ["F-10/2", "G-11/3", "E-11/4", "Blue Area", "I-8 Markaz"] },
  { city: "Rawalpindi", areas: ["Satellite Town", "Bahria Town Phase 4", "Saddar", "Chaklala Scheme 3"] },
  { city: "Faisalabad", areas: ["D Ground", "Peoples Colony", "Madina Town", "Canal Road"] },
  { city: "Multan", areas: ["Cantt", "Shah Rukn-e-Alam Colony", "Gulgasht Colony", "Bosan Road"] },
  { city: "Peshawar", areas: ["Hayatabad Phase 2", "University Town", "Saddar", "Gulbahar"] },
  { city: "Hyderabad", areas: ["Latifabad Unit 7", "Qasimabad", "Saddar", "Citizen Colony"] },
];

const PHONE_CODES = ["300", "301", "302", "303", "310", "311", "312", "313", "321", "322", "333", "334", "335", "345", "346"];

function makeName(gender) {
  const first = gender === "female" ? pick(FEMALE_FIRST) : pick(MALE_FIRST);
  return `${first} ${pick(LAST_NAMES)}`;
}

function makeAddress() {
  const location = pick(LOCATIONS);
  return `House ${randInt(1, 480)}, ${pick(["Street", "Block", "Sector"])} ${randInt(1, 40)}, ${pick(location.areas)}, ${location.city}`;
}

const DOCTORS = [
  { name: "Dr. Kamran Ahmed", email: "kamran.ahmed@careflowdemo.pk", department: "Cardiology", fee: 3500, slot: 20, weekdays: ["09:00", "14:00"], sunday: ["10:00", "13:00"] },
  { name: "Dr. Sana Yousuf", email: "sana.yousuf@careflowdemo.pk", department: "General Medicine", fee: 2000, slot: 15, weekdays: ["14:00", "20:00"], sunday: ["12:00", "15:00"] },
  { name: "Dr. Imran Qureshi", email: "imran.qureshi@careflowdemo.pk", department: "Pediatrics", fee: 1800, slot: 15, weekdays: ["16:00", "21:00"], sunday: ["11:00", "14:00"] },
  { name: "Dr. Ayesha Siddiqui", email: "ayesha.siddiqui@careflowdemo.pk", department: "Gynecology & Obstetrics", fee: 3000, slot: 20, weekdays: ["09:00", "13:00"], sunday: ["10:00", "12:00"] },
  { name: "Dr. Bilal Hussain", email: "bilal.hussain@careflowdemo.pk", department: "Orthopedics", fee: 3000, slot: 20, weekdays: ["15:00", "20:00"], sunday: ["12:00", "15:00"] },
  { name: "Dr. Hina Raza", email: "hina.raza@careflowdemo.pk", department: "Dermatology", fee: 2500, slot: 15, weekdays: ["10:00", "15:00"], sunday: ["11:00", "13:00"] },
  { name: "Dr. Tariq Mahmood", email: "tariq.mahmood@careflowdemo.pk", department: "General Medicine", fee: 2000, slot: 15, weekdays: ["11:00", "16:00"], sunday: ["13:00", "16:00"] },
  { name: "Dr. Farah Naz", email: "farah.naz@careflowdemo.pk", department: "Pediatrics", fee: 1800, slot: 15, weekdays: ["17:00", "21:00"], sunday: ["10:00", "12:00"] },
];

const STAFF = [
  { name: "Rizwan Sami", email: "admin@careflowdemo.pk", role: "hospital_admin", department: "Administration" },
  { name: "Sadia Imtiaz", email: "sadia.imtiaz@careflowdemo.pk", role: "receptionist", department: "Front Desk" },
  { name: "Hamza Shafiq", email: "hamza.shafiq@careflowdemo.pk", role: "receptionist", department: "Front Desk" },
  { name: "Rabia Aslam", email: "rabia.aslam@careflowdemo.pk", role: "nurse", department: "Nursing" },
  { name: "Nadia Karim", email: "nadia.karim@careflowdemo.pk", role: "nurse", department: "Nursing" },
  { name: "Farhan Ali", email: "farhan.ali@careflowdemo.pk", role: "lab_technician", department: "Pathology" },
  { name: "Mariam Zafar", email: "mariam.zafar@careflowdemo.pk", role: "pharmacist", department: "Pharmacy" },
];

const PORTAL_PATIENTS = [
  {
    name: "Ahmed Hassan",
    gender: "male",
    dob: "1985-03-15",
    phone: "0300-1234567",
    cnic: "42101-1234567-1",
    email: "ahmed.hassan@careflowdemo.pk",
    address: "House 12, Street 5, DHA Phase 2, Karachi",
    referredBy: "Walk-in",
    allergies: ["Penicillin"],
    chronicConditions: ["Hypertension"],
    registeredDaysAgo: 335,
  },
  {
    name: "Fatima Sheikh",
    gender: "female",
    dob: "1955-07-22",
    phone: "0321-9876543",
    cnic: "35202-7654321-2",
    email: "fatima.sheikh@careflowdemo.pk",
    address: "Flat 4B, Gulshan-e-Iqbal Block 6, Karachi",
    referredBy: "Patient referral",
    allergies: [],
    chronicConditions: ["Type 2 Diabetes", "Hypertension"],
    registeredDaysAgo: 300,
  },
  {
    name: "Ayesha Malik",
    gender: "female",
    dob: "1998-02-14",
    phone: "0345-1122334",
    cnic: "61101-9988776-5",
    email: "ayesha.malik@careflowdemo.pk",
    address: "Street 9, F-10/2, Islamabad",
    referredBy: "Facebook ad",
    allergies: [],
    chronicConditions: [],
    registeredDaysAgo: 250,
  },
];

const WARDS = [
  { name: "General Ward", department: "Internal Medicine", dailyRate: 3500, prefix: "G", bedCount: 12 },
  { name: "Private Rooms", department: "Internal Medicine", dailyRate: 12000, prefix: "P", bedCount: 8 },
  { name: "Intensive Care Unit", department: "Critical Care", dailyRate: 25000, prefix: "ICU", bedCount: 6 },
  { name: "Maternity Ward", department: "Gynecology & Obstetrics", dailyRate: 6000, prefix: "M", bedCount: 8 },
  { name: "Pediatric Ward", department: "Pediatrics", dailyRate: 4500, prefix: "PD", bedCount: 8 },
  { name: "Surgical Ward", department: "Orthopedics", dailyRate: 5500, prefix: "S", bedCount: 8 },
];

const CURRENT_ADMISSION_PLAN = [
  { wardIndex: 0, count: 4 },
  { wardIndex: 1, count: 2 },
  { wardIndex: 2, count: 2 },
  { wardIndex: 3, count: 2 },
  { wardIndex: 4, count: 1 },
  { wardIndex: 5, count: 1 },
];

const ADMIT_REASONS = [
  "Chest pain - rule out acute coronary syndrome",
  "Uncontrolled diabetes with hyperglycaemia",
  "Acute gastroenteritis with dehydration",
  "Pneumonia - intravenous antibiotics",
  "Post-operative observation after appendectomy",
  "Labour and delivery - antenatal admission",
  "Acute asthma exacerbation",
  "Dengue fever with thrombocytopenia",
  "Hypertensive emergency - observation",
  "Closed fracture femur - pre-operative workup",
  "Febrile seizures in a child",
  "Severe anaemia - transfusion required",
];

const DISCHARGE_NOTES = [
  "Improved clinically, afebrile for 48 hours. Advised follow-up in OPD after one week.",
  "Symptoms resolved with IV antibiotics. Discharged on oral medication.",
  "Vitals stable, wound healing well. Suture removal scheduled in OPD.",
  "Blood sugar stabilised on insulin sliding scale. Diabetes education given.",
  "Discharged in stable condition with follow-up in cardiology clinic.",
  "Patient and attendants counselled on medication compliance and warning signs.",
];

const NURSE_NOTE_TEXTS = [
  "Patient comfortable, afebrile overnight. Oral intake adequate.",
  "Pain score 3/10 after analgesia. Reviewing doctor informed.",
  "IV line site inspected, no redness or swelling. Dressing intact.",
  "Ambulated with assistance. Advised slow position changes.",
  "Complained of mild nausea after breakfast. Anti-emetic given as advised.",
  "Vitals recorded hourly after medication change, remain stable.",
  "Attendants educated on fall precautions and call-bell use.",
  "Wound dressing changed under aseptic technique. No discharge noted.",
];

const CLINICAL = {
  Cardiology: [
    {
      symptoms: "Chest tightness on exertion, occasional palpitations for two weeks",
      diagnosis: "Stable Angina Pectoris",
      notes: "ECG shows minor ST depression. Advised stress test and strict lipid control.",
      rx: [
        { medicineName: "Concor 5mg", dosage: "5mg", frequency: "Once daily", duration: "30 days", instructions: "Take in the morning" },
        { medicineName: "Lipitor 10mg", dosage: "10mg", frequency: "Once at night", duration: "30 days", instructions: "After dinner" },
      ],
    },
    {
      symptoms: "Known hypertension, reports headaches and morning dizziness",
      diagnosis: "Essential Hypertension",
      notes: "Home BP log reviewed. Salt restriction reinforced, continue current therapy.",
      rx: [
        { medicineName: "Co-Diovan 80/12.5mg", dosage: "1 tablet", frequency: "Once daily", duration: "45 days", instructions: "Take in the morning" },
        { medicineName: "Disprin 300mg", dosage: "75mg", frequency: "Once daily", duration: "45 days", instructions: "After lunch" },
      ],
    },
    {
      symptoms: "Breathlessness on climbing stairs, ankle swelling in the evening",
      diagnosis: "Congestive Cardiac Failure - NYHA Class II",
      notes: "Fluid restriction and daily weight monitoring advised. Echo scheduled.",
      rx: [
        { medicineName: "Lasix 40mg", dosage: "40mg", frequency: "Once daily", duration: "15 days", instructions: "Take in the morning" },
        { medicineName: "Concor 5mg", dosage: "2.5mg", frequency: "Once daily", duration: "30 days", instructions: "Take in the morning" },
      ],
    },
  ],
  "General Medicine": [
    {
      symptoms: "Fever, body aches and sore throat for four days",
      diagnosis: "Upper Respiratory Tract Infection",
      notes: "Advised rest, fluids and steam inhalation. No red flags on examination.",
      rx: [
        { medicineName: "Panadol 500mg", dosage: "500mg", frequency: "3 times daily", duration: "5 days", instructions: "After meals" },
        { medicineName: "Risek 20mg", dosage: "20mg", frequency: "Once daily", duration: "5 days", instructions: "Before breakfast" },
      ],
    },
    {
      symptoms: "Increased thirst, fatigue and frequent urination",
      diagnosis: "Type 2 Diabetes Mellitus",
      notes: "HbA1c 8.1%. Metformin continued, dietitian referral made.",
      rx: [
        { medicineName: "Glucophage 500mg", dosage: "500mg", frequency: "Twice daily", duration: "60 days", instructions: "After meals" },
      ],
    },
    {
      symptoms: "Loose stools, abdominal cramps and vomiting since yesterday",
      diagnosis: "Acute Gastroenteritis",
      notes: "Mild dehydration. ORS and zinc advised, review if symptoms persist beyond 48 hours.",
      rx: [
        { medicineName: "Flagyl 400mg", dosage: "400mg", frequency: "3 times daily", duration: "5 days", instructions: "After meals" },
        { medicineName: "Entamizole 500mg", dosage: "500mg", frequency: "Twice daily", duration: "5 days", instructions: "After meals" },
      ],
    },
  ],
  Pediatrics: [
    {
      symptoms: "Fever and cough for three days, poor oral intake",
      diagnosis: "Acute Bronchiolitis",
      notes: "Mild subcostal retractions. Nebulisation given in clinic, parents counselled on danger signs.",
      rx: [
        { medicineName: "Calpol 120mg/5ml", dosage: "5ml", frequency: "3 times daily", duration: "5 days", instructions: "After feed" },
        { medicineName: "Ventolin Inhaler", dosage: "2 puffs", frequency: "As needed", duration: "15 days", instructions: "Use spacer" },
      ],
    },
    {
      symptoms: "Sore throat, difficulty swallowing and high grade fever",
      diagnosis: "Acute Tonsillitis",
      notes: "Tonsils enlarged with exudates. Advised warm fluids and antibiotic course.",
      rx: [
        { medicineName: "Augmentin Suspension", dosage: "5ml", frequency: "Twice daily", duration: "7 days", instructions: "After feed" },
        { medicineName: "Calpol 250mg/5ml", dosage: "7.5ml", frequency: "As needed for fever", duration: "5 days", instructions: "After feed" },
      ],
    },
    {
      symptoms: "Routine vaccination visit, no active complaints",
      diagnosis: "Healthy Child - Immunisation",
      notes: "Growth chart reviewed, development appropriate for age. Next visit in six weeks.",
      rx: [
        { medicineName: "Calpol 120mg/5ml", dosage: "5ml", frequency: "As needed for fever", duration: "2 days", instructions: "After feed" },
      ],
    },
  ],
  "Gynecology & Obstetrics": [
    {
      symptoms: "Second trimester antenatal visit, mild backache",
      diagnosis: "Normal Antenatal Care - 24 Weeks",
      notes: "Fundal height corresponds to dates. Fetal heart sounds present. Anomaly scan reviewed.",
      rx: [
        { medicineName: "Cal-D 500mg", dosage: "1 tablet", frequency: "Once daily", duration: "60 days", instructions: "After meals" },
        { medicineName: "Surbex Z", dosage: "1 tablet", frequency: "Once daily", duration: "60 days", instructions: "After breakfast" },
      ],
    },
    {
      symptoms: "Irregular periods and weight gain over six months",
      diagnosis: "Polycystic Ovarian Syndrome",
      notes: "Ultrasound and hormonal profile reviewed. Lifestyle modification and weight loss advised.",
      rx: [
        { medicineName: "Glucophage 500mg", dosage: "500mg", frequency: "Twice daily", duration: "60 days", instructions: "After meals" },
      ],
    },
    {
      symptoms: "Lower abdominal pain with white discharge",
      diagnosis: "Pelvic Inflammatory Disease",
      notes: "Advised hygiene measures and partner treatment. Review after one week.",
      rx: [
        { medicineName: "Ciproxin 500mg", dosage: "500mg", frequency: "Twice daily", duration: "7 days", instructions: "After meals" },
        { medicineName: "Flagyl 400mg", dosage: "400mg", frequency: "3 times daily", duration: "7 days", instructions: "After meals" },
      ],
    },
  ],
  Orthopedics: [
    {
      symptoms: "Lower back pain radiating to the right leg for three weeks",
      diagnosis: "Lumbar Disc Herniation",
      notes: "Straight leg raise positive on the right. MRI advised, physiotherapy started.",
      rx: [
        { medicineName: "Caflam 50mg", dosage: "50mg", frequency: "Twice daily", duration: "10 days", instructions: "After meals" },
        { medicineName: "Neurobion", dosage: "1 tablet", frequency: "Once daily", duration: "30 days", instructions: "After breakfast" },
      ],
    },
    {
      symptoms: "Right knee pain and stiffness, worse on climbing stairs",
      diagnosis: "Osteoarthritis - Right Knee",
      notes: "Weight reduction and quadriceps strengthening exercises advised. X-ray shows grade II changes.",
      rx: [
        { medicineName: "Brufen 400mg", dosage: "400mg", frequency: "Twice daily", duration: "10 days", instructions: "After meals" },
        { medicineName: "Cal-D 500mg", dosage: "1 tablet", frequency: "Once daily", duration: "60 days", instructions: "After meals" },
      ],
    },
    {
      symptoms: "Follow-up after plaster cast for distal radius fracture",
      diagnosis: "Distal Radius Fracture - Healing",
      notes: "Cast removed today, wrist movements improving. Physiotherapy continued.",
      rx: [
        { medicineName: "Ponstan 500mg", dosage: "500mg", frequency: "As needed for pain", duration: "7 days", instructions: "After meals" },
      ],
    },
  ],
  Dermatology: [
    {
      symptoms: "Itchy red rash over both arms for two weeks",
      diagnosis: "Atopic Dermatitis",
      notes: "Emollient use demonstrated. Advised avoidance of fragranced soaps.",
      rx: [
        { medicineName: "Cetaderm Cream", dosage: "Apply thin layer", frequency: "Twice daily", duration: "14 days", instructions: "On affected areas" },
        { medicineName: "Zyrtec 10mg", dosage: "10mg", frequency: "Once at night", duration: "14 days", instructions: "After dinner" },
      ],
    },
    {
      symptoms: "Facial acne with post-inflammatory marks",
      diagnosis: "Acne Vulgaris - Moderate",
      notes: "Skincare routine simplified. Review in six weeks for response.",
      rx: [
        { medicineName: "Roaccutane 20mg", dosage: "20mg", frequency: "Once daily", duration: "30 days", instructions: "After dinner" },
        { medicineName: "Betnovate Cream", dosage: "Apply sparingly", frequency: "At night", duration: "10 days", instructions: "On affected areas" },
      ],
    },
    {
      symptoms: "Scaly plaques over elbows and scalp",
      diagnosis: "Psoriasis Vulgaris",
      notes: "Topical therapy restarted. Advised phototherapy assessment if no improvement.",
      rx: [
        { medicineName: "Betnovate Cream", dosage: "Apply thin layer", frequency: "Once at night", duration: "21 days", instructions: "On affected areas" },
        { medicineName: "Softin Lotion", dosage: "Apply to scalp", frequency: "At night", duration: "21 days", instructions: "Rinse in the morning" },
      ],
    },
  ],
};

const APPOINTMENT_REASONS = {
  Cardiology: ["Chest pain evaluation", "Blood pressure follow-up", "Palpitations", "Shortness of breath"],
  "General Medicine": ["Fever and body aches", "Diabetes follow-up", "Routine checkup", "Persistent cough", "Stomach pain"],
  Pediatrics: ["Fever in child", "Routine vaccination", "Cough and cold", "Poor feeding"],
  "Gynecology & Obstetrics": ["Antenatal checkup", "Irregular periods", "Pelvic pain", "Family planning counselling"],
  Orthopedics: ["Knee pain", "Lower back pain", "Fracture follow-up", "Shoulder stiffness"],
  Dermatology: ["Skin rash", "Acne treatment", "Hair fall", "Itching and allergies"],
};

const LAB_TEST_CATALOG = [
  { name: "Complete Blood Count", department: "Hematology", price: 1200, turnaroundTime: "24 hours" },
  { name: "Blood Sugar Fasting", department: "Chemistry", price: 350, turnaroundTime: "4 hours" },
  { name: "HbA1c", department: "Chemistry", price: 1800, turnaroundTime: "24 hours" },
  { name: "Lipid Profile", department: "Chemistry", price: 2000, turnaroundTime: "24 hours" },
  { name: "Liver Function Test", department: "Chemistry", price: 2400, turnaroundTime: "24 hours" },
  { name: "Renal Function Test", department: "Chemistry", price: 2200, turnaroundTime: "24 hours" },
  { name: "Thyroid Profile (TSH)", department: "Endocrinology", price: 2800, turnaroundTime: "48 hours" },
  { name: "Urine Complete Examination", department: "Clinical Pathology", price: 500, turnaroundTime: "4 hours" },
  { name: "Chest X-Ray", department: "Radiology", price: 1500, turnaroundTime: "Same day" },
  { name: "Ultrasound Abdomen", department: "Radiology", price: 3500, turnaroundTime: "Same day" },
  { name: "ECG", department: "Cardiology", price: 1000, turnaroundTime: "Same day" },
  { name: "Dengue NS1 Antigen", department: "Serology", price: 1600, turnaroundTime: "24 hours" },
];

const LAB_RESULTS = {
  "Complete Blood Count": "Hb 13.4 g/dL, WBC 7,800/uL, Platelets 245,000/uL - within normal limits.",
  "Blood Sugar Fasting": "Fasting glucose 126 mg/dL - mildly elevated, consistent with known diabetes.",
  HbA1c: "HbA1c 8.1% - above target, treatment intensification advised.",
  "Lipid Profile": "Total cholesterol 232 mg/dL, LDL 148 mg/dL, HDL 41 mg/dL - dyslipidaemia.",
  "Liver Function Test": "ALT 34 U/L, AST 29 U/L, bilirubin 0.8 mg/dL - normal study.",
  "Renal Function Test": "Creatinine 1.0 mg/dL, urea 28 mg/dL, eGFR 92 - normal renal function.",
  "Thyroid Profile (TSH)": "TSH 3.2 mIU/L, free T4 1.2 ng/dL - euthyroid.",
  "Urine Complete Examination": "Protein trace, 4-6 pus cells/hpf, no casts - mild urinary infection.",
  "Chest X-Ray": "Bilateral lung fields clear, no focal consolidation or effusion.",
  "Ultrasound Abdomen": "Liver and kidneys normal in size and echotexture. No gallstones.",
  ECG: "Sinus rhythm at 78 bpm, no acute ischaemic changes.",
  "Dengue NS1 Antigen": "Dengue NS1 antigen positive - correlate with platelet count and clinical status.",
};

const MEDICINES = [
  ["Panadol 500mg", "Analgesic", "tablet", 6],
  ["Panadol Extra", "Analgesic", "tablet", 12],
  ["Brufen 400mg", "NSAID", "tablet", 9],
  ["Ponstan 500mg", "NSAID", "tablet", 14],
  ["Caflam 50mg", "NSAID", "tablet", 11],
  ["Dicloran 50mg", "NSAID", "tablet", 8],
  ["Disprin 300mg", "Analgesic", "tablet", 5],
  ["Augmentin 625mg", "Antibiotic", "tablet", 58],
  ["Augmentin Suspension", "Antibiotic", "suspension", 285],
  ["Amoxil 500mg", "Antibiotic", "capsule", 22],
  ["Flagyl 400mg", "Antibiotic", "tablet", 12],
  ["Ciproxin 500mg", "Antibiotic", "tablet", 34],
  ["Rulide 150mg", "Antibiotic", "tablet", 26],
  ["Velosef 500mg", "Antibiotic", "capsule", 30],
  ["Zithromax 500mg", "Antibiotic", "tablet", 65],
  ["Fasigyn 500mg", "Antibiotic", "tablet", 42],
  ["Entamizole 500mg", "Antiprotozoal", "tablet", 16],
  ["Risek 20mg", "Antacid", "capsule", 18],
  ["Nexum 40mg", "Antacid", "capsule", 24],
  ["Motilium 10mg", "Antiemetic", "tablet", 15],
  ["Gravinate 50mg", "Antiemetic", "tablet", 7],
  ["Motilium Suspension", "Antiemetic", "suspension", 165],
  ["Concor 5mg", "Antihypertensive", "tablet", 16],
  ["Tenormin 50mg", "Antihypertensive", "tablet", 12],
  ["Zestril 10mg", "Antihypertensive", "tablet", 13],
  ["Amlopin 5mg", "Antihypertensive", "tablet", 9],
  ["Co-Diovan 80/12.5mg", "Antihypertensive", "tablet", 28],
  ["Telmikind 40mg", "Antihypertensive", "tablet", 20],
  ["Lasix 40mg", "Diuretic", "tablet", 8],
  ["Glucophage 500mg", "Antidiabetic", "tablet", 11],
  ["Glucophage 850mg", "Antidiabetic", "tablet", 15],
  ["Galvus 50mg", "Antidiabetic", "tablet", 68],
  ["Januvia 100mg", "Antidiabetic", "tablet", 145],
  ["Lantus Insulin", "Antidiabetic", "injection", 1450],
  ["Lipitor 10mg", "Lipid-lowering", "tablet", 32],
  ["Zocor 20mg", "Lipid-lowering", "tablet", 28],
  ["Crestor 10mg", "Lipid-lowering", "tablet", 45],
  ["Ventolin Inhaler", "Respiratory", "inhaler", 550],
  ["Seretide 250 Inhaler", "Respiratory", "inhaler", 1850],
  ["Aerius 5mg", "Antihistamine", "tablet", 22],
  ["Zyrtec 10mg", "Antihistamine", "tablet", 15],
  ["Claritin 10mg", "Antihistamine", "tablet", 18],
  ["Calpol 120mg/5ml", "Pediatric", "syrup", 120],
  ["Calpol 250mg/5ml", "Pediatric", "suspension", 150],
  ["Nurofen Syrup", "Pediatric", "syrup", 180],
  ["Hydryllin Syrup", "Pediatric", "syrup", 110],
  ["Betnovate Cream", "Dermatology", "cream", 95],
  ["Daktarin Cream", "Dermatology", "cream", 140],
  ["Fucidin Cream", "Dermatology", "cream", 260],
  ["Cetaderm Cream", "Dermatology", "cream", 120],
  ["Roaccutane 20mg", "Dermatology", "capsule", 480],
  ["Buscopan 10mg", "Antispasmodic", "tablet", 14],
  ["Cal-D 500mg", "Supplement", "tablet", 18],
  ["Surbex Z", "Supplement", "tablet", 24],
  ["Neurobion", "Supplement", "tablet", 30],
  ["Proteinex Syrup", "Supplement", "syrup", 420],
  ["Otrivin Nasal Drops", "ENT", "drops", 240],
  ["Softin Lotion", "Dermatology", "lotion", 210],
  ["Polyfax Ointment", "Dermatology", "ointment", 165],
  ["Citanest Injection", "Anesthetic", "injection", 380],
];

const SUPPLIERS = [
  "Getz Pharma", "GSK Pakistan", "Abbott Pakistan", "Searle Pakistan", "Hilton Pharma",
  "Martin Dow", "Highnoon Laboratories", "Sanofi Pakistan", "Atco Laboratories", "Platinum Pharma",
];

const LOW_STOCK_INDEXES = new Set([2, 7, 21, 28, 33, 40, 46, 55]);
const NEAR_EXPIRY_INDEXES = new Set([4, 11, 18, 25, 35, 44, 52, 57]);

const id = () => new mongoose.Types.ObjectId();

function makeUser({ hospitalId, passwordHash, name, email, role, department, createdAt }) {
  return {
    _id: id(),
    hospitalId,
    name,
    email,
    password: passwordHash,
    role,
    department,
    status: "active",
    mustChangePassword: false,
    failedLoginAttempts: 0,
    createdAt,
    updatedAt: createdAt,
  };
}

function buildStaff(hospitalId, passwordHash) {
  const created = zoned(hospitalDate(-420), "09:30");
  const admin = makeUser({
    hospitalId,
    passwordHash,
    name: "Rizwan Sami",
    email: "admin@careflowdemo.pk",
    role: "hospital_admin",
    department: "Administration",
    createdAt: created,
  });
  const users = [admin];

  const doctors = DOCTORS.map((doctor, index) =>
    makeUser({
      hospitalId,
      passwordHash,
      name: doctor.name,
      email: doctor.email,
      role: "doctor",
      department: doctor.department,
      createdAt: zoned(hospitalDate(-412 + index * 8), `${pad2(randInt(9, 15))}:${pad2(randInt(0, 59))}`),
    })
  );
  users.push(...doctors);

  const extras = STAFF.filter((member) => member.role !== "hospital_admin");
  const extrasUsers = extras.map((member, index) =>
    makeUser({
      hospitalId,
      passwordHash,
      name: member.name,
      email: member.email,
      role: member.role,
      department: member.department,
      createdAt: zoned(hospitalDate(-390 + index * 17), `${pad2(randInt(9, 17))}:${pad2(randInt(0, 59))}`),
    })
  );
  users.push(...extrasUsers);

  const byRole = (role) => extrasUsers.filter((user) => user.role === role);
  return {
    users,
    admin,
    doctors,
    receptionists: byRole("receptionist"),
    nurses: byRole("nurse"),
    labTech: byRole("lab_technician")[0],
    pharmacist: byRole("pharmacist")[0],
  };
}

function buildSchedules(hospitalId, doctors) {
  const createdAt = zoned(hospitalDate(-400), "08:00");
  return doctors.map((doctor) => {
    const spec = DOCTORS.find((entry) => entry.email === doctor.email);
    const weeklyAvailability = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => {
      const [startTime, endTime] = dayOfWeek === 0 ? spec.sunday : spec.weekdays;
      return { dayOfWeek, startTime, endTime };
    });
    return {
      _id: id(),
      hospitalId,
      doctorId: doctor._id,
      consultationFee: spec.fee,
      slotDurationMinutes: spec.slot,
      weeklyAvailability,
      createdAt,
      updatedAt: createdAt,
      _slots: { weeklyAvailability, slotDurationMinutes: spec.slot },
    };
  });
}

function buildPatients(hospitalId, passwordHash, adminId, receptionists) {
  const patients = [];
  const portalUsers = [];
  const registeredBy = [...receptionists.map((user) => user._id), adminId];

  PORTAL_PATIENTS.forEach((entry, index) => {
    const createdAt = zoned(hospitalDate(-entry.registeredDaysAgo), `${pad2(randInt(10, 13))}:${pad2(randInt(0, 59))}`);
    const user = makeUser({
      hospitalId,
      passwordHash,
      name: entry.name,
      email: entry.email,
      role: "patient",
      department: undefined,
      createdAt: new Date(createdAt.getTime() + 2 * DAY_MS),
    });
    portalUsers.push(user);
    patients.push({
      _id: id(),
      hospitalId,
      mrn: "",
      name: entry.name,
      dob: zoned(entry.dob, "00:00"),
      gender: entry.gender,
      phone: entry.phone,
      email: entry.email,
      cnic: entry.cnic,
      address: entry.address,
      referredBy: entry.referredBy,
      allergies: entry.allergies,
      chronicConditions: entry.chronicConditions,
      registeredBy: pick(registeredBy),
      userId: user._id,
      createdAt,
      updatedAt: createdAt,
      _index: index,
    });
  });

  for (let index = PORTAL_PATIENTS.length; index < PATIENT_COUNT; index++) {
    const gender = pickWeighted([["male", 48], ["female", 51], ["other", 1]]);
    const age = pickWeighted([[randInt(0, 12), 15], [randInt(13, 19), 10], [randInt(20, 39), 30], [randInt(40, 59), 25], [randInt(60, 84), 20]]);
    // Counted back from today, so even a newborn's date of birth can never land in the future.
    const dob = zoned(addDays(TODAY, -(Math.round(age * 365.25) + randInt(0, 364))), "00:00");
    const createdAt = historicMoment(364, 0);
    const firstName = gender === "female" ? pick(FEMALE_FIRST) : pick(MALE_FIRST);
    const lastName = pick(LAST_NAMES);
    const hasEmail = chance(0.35);
    const district = pick(["42101", "35202", "61101", "42201", "37405", "38403", "17201", "31202", "41301", "33100"]);

    patients.push({
      _id: id(),
      hospitalId,
      mrn: "",
      name: `${firstName} ${lastName}`,
      dob,
      gender,
      phone: `0${pick(PHONE_CODES)}-${String(1000000 + index)}`,
      email: hasEmail ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randInt(1, 999)}@gmail.com` : undefined,
      cnic: age >= 18 || chance(0.5) ? `${district}-${String(1000000 + index * 7).padStart(7, "0")}-${randInt(0, 9)}` : undefined,
      address: makeAddress(),
      referredBy: pickWeighted([
        ["Walk-in", 38],
        ["Patient referral", 20],
        ["Facebook ad", 12],
        ["Google search", 10],
        ["Consultant referral", 9],
        ["Insurance panel", 5],
        ["", 6],
      ]),
      allergies: chance(0.18) ? [pick(["Penicillin", "Sulfa drugs", "Aspirin", "Latex", "Dust", "Seafood"])] : [],
      chronicConditions: chance(0.22)
        ? [pick(["Hypertension", "Type 2 Diabetes", "Asthma", "Ischemic Heart Disease", "Hypothyroidism"])]
        : [],
      registeredBy: pick(registeredBy),
      createdAt,
      updatedAt: createdAt,
      _index: index,
    });
  }

  const chronological = [...patients].sort((a, b) => a.createdAt - b.createdAt);
  chronological.forEach((patient, index) => {
    patient.mrn = `${MRN_PREFIX}-${String(index + 1).padStart(6, "0")}`;
  });

  return { patients, portalUsers };
}

function buildWardsAndBeds(hospitalId, adminId) {
  const createdAt = zoned(hospitalDate(-395), "08:30");
  const wards = WARDS.map((ward) => ({
    _id: id(),
    hospitalId,
    name: ward.name,
    department: ward.department,
    dailyRate: ward.dailyRate,
    createdBy: adminId,
    createdAt,
    updatedAt: createdAt,
    _prefix: ward.prefix,
    _bedCount: ward.bedCount,
  }));

  const beds = [];
  wards.forEach((ward) => {
    for (let i = 1; i <= ward._bedCount; i++) {
      beds.push({
        _id: id(),
        hospitalId,
        wardId: ward._id,
        bedNumber: `${ward._prefix}-${pad2(i)}`,
        status: "vacant",
        createdAt,
        updatedAt: createdAt,
      });
    }
  });

  return { wards, beds };
}

function buildAppointments(patients, doctors, schedules, adminId, receptionists) {
  const scheduleByDoctor = new Map(schedules.map((schedule) => [String(schedule.doctorId), schedule._slots]));
  const feeByDoctor = new Map(schedules.map((schedule) => [String(schedule.doctorId), schedule.consultationFee]));
  const slotCache = new Map();
  const slotsFor = (doctorId, date) => {
    const key = `${doctorId}|${date}`;
    if (!slotCache.has(key)) slotCache.set(key, slotsForDate(scheduleByDoctor.get(String(doctorId)), date));
    return slotCache.get(key);
  };

  const appointments = [];
  const usedSlots = new Set();
  const usedPatientDoctorDay = new Set();
  const bookers = [...receptionists.map((user) => user._id), adminId];
  const portalPatients = patients.slice(0, PORTAL_PATIENTS.length);

  const book = ({
    patient,
    doctor,
    date,
    time,
    status,
    reason,
    priority,
    priorityReason,
    checkedInAt,
    createdAt,
    updatedAt,
  }) => {
    if (time) usedSlots.add(`${doctor._id}|${date}|${time}`);
    usedPatientDoctorDay.add(`${patient._id}|${doctor._id}|${date}`);
    const doc = {
      _id: id(),
      hospitalId: patients[0].hospitalId,
      patientId: patient._id,
      doctorId: doctor._id,
      type: "OPD",
      date,
      tokenNumber: 0,
      priority: priority || "normal",
      reason,
      status,
      bookedBy: pick(bookers),
      createdAt,
      updatedAt: updatedAt || createdAt,
    };
    // A walk-in has no slot: the partial slot index only covers documents that have `time`.
    if (time) doc.time = time;
    if (priority && priority !== "normal") doc.priorityReason = priorityReason;
    if (checkedInAt) doc.checkedInAt = checkedInAt;
    appointments.push(doc);
    return doc;
  };

  // Each visit must fall after the portal patient registered (see registeredDaysAgo above).
  const portalPlan = [
    { patient: portalPatients[0], doctorIndex: 0, daysAgo: [33, 118, 205, 292] },
    { patient: portalPatients[1], doctorIndex: 1, daysAgo: [21, 96, 174, 251, 288] },
    { patient: portalPatients[2], doctorIndex: 5, daysAgo: [62, 141, 198, 238] },
  ];

  portalPlan.forEach(({ patient, doctorIndex, daysAgo }) => {
    const doctor = doctors[doctorIndex];
    daysAgo.forEach((offset, index) => {
      const date = hospitalDate(-offset);
      const slots = slotsFor(doctor._id, date);
      if (!slots.length) return;
      const available = slots.filter((time) => !usedSlots.has(`${doctor._id}|${date}|${time}`));
      if (!available.length) return;
      const time = available[randInt(0, available.length - 1)];
      const instant = zoned(date, time);
      const bookedAt = new Date(Math.max(patient.createdAt.getTime() + 3600000, instant.getTime() - randInt(0, 3) * DAY_MS));
      book({
        patient,
        doctor,
        date,
        time,
        status: index === daysAgo.length - 1 && chance(0.25) ? "no_show" : "completed",
        reason: pick(APPOINTMENT_REASONS[doctor.department] || ["Consultation"]),
        createdAt: new Date(Math.min(bookedAt.getTime(), instant.getTime())),
      });
    });
  });

  let guard = 0;
  while (appointments.length < HISTORICAL_APPOINTMENTS && guard < HISTORICAL_APPOINTMENTS * 20) {
    guard++;
    const doctor = pick(doctors);
    const date = hospitalDate(-randInt(1, 364));
    const slots = slotsFor(doctor._id, date);
    if (!slots.length) continue;
    const available = slots.filter((time) => !usedSlots.has(`${doctor._id}|${date}|${time}`));
    if (!available.length) continue;
    const time = available[randInt(0, available.length - 1)];
    const instant = zoned(date, time);
    // A visit can only belong to a patient who had already registered by that day.
    const candidates = patients.filter((entry) => entry.createdAt.getTime() + 3600000 <= instant.getTime());
    if (!candidates.length) continue;
    let patient = null;
    for (let tries = 0; tries < 25 && !patient; tries++) {
      const candidate = pick(candidates);
      if (!usedPatientDoctorDay.has(`${candidate._id}|${doctor._id}|${date}`)) patient = candidate;
    }
    if (!patient) continue;
    const roll = random();
    const status = roll < 0.85 ? "completed" : roll < 0.93 ? "no_show" : "cancelled";
    const bookedAt = new Date(
      Math.max(
        patient.createdAt.getTime() + 3600000,
        instant.getTime() - randInt(0, 3) * DAY_MS - randInt(0, 9) * 3600000
      )
    );
    book({
      patient,
      doctor,
      date,
      time,
      status,
      reason: pick(APPOINTMENT_REASONS[doctor.department] || ["Consultation"]),
      createdAt: bookedAt,
      updatedAt: new Date(Math.min(NOW.getTime() - 60000, instant.getTime() + randInt(10, 90) * 60000)),
    });
  }

  const todayOverrides = new Map([
    ["0|0", portalPatients[0]],
    ["1|4", portalPatients[1]],
    ["5|0", portalPatients[2]],
  ]);

  doctors.forEach((doctor, doctorIndex) => {
    const slots = slotsFor(doctor._id, TODAY);
    if (!slots.length) return;
    const nowMinutes = toMinutes(NOW_TIME);
    const currentIndex = slots.findIndex((time) => toMinutes(time) >= nowMinutes);
    // The queue is always shown mid-flow: seeded before opening (or after closing) the day still
    // looks like six slots have already gone by, otherwise every patient would read as "waiting".
    const liveIndex = Math.max(currentIndex, 6);
    const start = Math.max(0, Math.min(liveIndex - 5, slots.length - TODAY_APPOINTMENTS_PER_DOCTOR));
    const window = slots.slice(start, start + TODAY_APPOINTMENTS_PER_DOCTOR);
    // Status follows where the slot sits relative to "now": finished visits, the one the doctor
    // is in right now, one no-show from earlier, and the rest still waiting.
    const statuses = window.map((_, position) => {
      const slotIndex = start + position;
      if (slotIndex === liveIndex - 1) return "in_consultation";
      if (slotIndex < liveIndex - 1) return position === 1 ? "no_show" : "completed";
      return "checked_in";
    });
    const usedPatients = new Set();

    window.forEach((time, position) => {
      let patient = todayOverrides.get(`${doctorIndex}|${position}`);
      if (!patient) {
        patient = pick(patients);
        let tries = 0;
        while (
          (usedPatients.has(String(patient._id)) || usedPatientDoctorDay.has(`${patient._id}|${doctor._id}|${TODAY}`)) &&
          tries++ < 80
        ) {
          patient = pick(patients);
        }
      }
      if (usedPatients.has(String(patient._id)) || usedPatientDoctorDay.has(`${patient._id}|${doctor._id}|${TODAY}`)) return;
      usedPatients.add(String(patient._id));
      const instant = zoned(TODAY, time);
      const status = statuses[position] || "checked_in";
      const createdAt = new Date(
        Math.max(
          patient.createdAt.getTime() + 3600000,
          Math.min(NOW.getTime(), instant.getTime() - randInt(30, 300) * 60000)
        )
      );
      // Arrival time is the queue's tie-breaker. A no-show never checked in, so it has none.
      const checkedInAt =
        status === "no_show" || status === "scheduled"
          ? undefined
          : new Date(Math.min(NOW.getTime() - 60000, instant.getTime() - randInt(4, 18) * 60000));
      book({
        patient,
        doctor,
        date: TODAY,
        time,
        status,
        reason: pick(APPOINTMENT_REASONS[doctor.department] || ["Consultation"]),
        checkedInAt,
        createdAt: new Date(Math.min(createdAt.getTime(), instant.getTime())),
      });
    });
  });

  // One booked patient is flagged senior by the desk, so the queue shows a mix of booked and
  // walk-in priorities rather than priorities only on walk-ins.
  const flagged = appointments.find(
    (appointment) =>
      appointment.date === TODAY &&
      appointment.status === "checked_in" &&
      String(appointment.doctorId) === String(doctors[4]._id)
  );
  if (flagged) {
    flagged.priority = "senior";
    flagged.priorityReason = "Senior citizen, 82 years, knee pain - cannot stand for long";
  }

  // Walk-ins: no slot, token only, checked in the moment the desk registers them. This is the
  // path the queue's emergency/senior-first ordering exists for, so the demo covers both.
  const walkInPlan = [
    {
      doctor: doctors[2],
      priority: "emergency",
      priorityReason: "Child with 104 F fever and vomiting, lethargic - emergency",
      reason: "High fever and vomiting since last night",
      arrivedMinutesAgo: 9,
    },
    {
      doctor: doctors[6],
      priority: "senior",
      priorityReason: "79-year-old, dizzy and unable to stand in line",
      reason: "Blood pressure not controlled, dizziness",
      arrivedMinutesAgo: 24,
    },
    { doctor: doctors[5], priority: "normal", reason: "Itching and rash on both arms", arrivedMinutesAgo: 41 },
    { doctor: doctors[4], priority: "normal", reason: "Twisted ankle, mild swelling", arrivedMinutesAgo: 63 },
  ];

  walkInPlan.forEach((entry) => {
    const eligible = patients.filter(
      (patient) =>
        !usedPatientDoctorDay.has(`${patient._id}|${entry.doctor._id}|${TODAY}`) &&
        patient.createdAt.getTime() < NOW.getTime() - DAY_MS
    );
    if (!eligible.length) return;
    const arrivedAt = minutesAgo(entry.arrivedMinutesAgo);
    book({
      patient: pick(eligible),
      doctor: entry.doctor,
      date: TODAY,
      status: "checked_in",
      reason: entry.reason,
      priority: entry.priority,
      priorityReason: entry.priorityReason,
      checkedInAt: arrivedAt,
      createdAt: arrivedAt,
    });
  });

  // Tokens are per doctor per day (opd_token_<doctorId>_<date>) - each room has its own
  // sequence - numbered in the order the desk would issue them: by slot time, and by arrival
  // for walk-ins, which have no time.
  const byDoctorDay = new Map();
  appointments.forEach((appointment) => {
    const key = `${appointment.doctorId}|${appointment.date}`;
    if (!byDoctorDay.has(key)) byDoctorDay.set(key, []);
    byDoctorDay.get(key).push(appointment);
  });
  const tokenCounters = [];
  byDoctorDay.forEach((group) => {
    group.sort(
      (a, b) =>
        (a.time ? toMinutes(a.time) : toMinutes(NOW_TIME)) - (b.time ? toMinutes(b.time) : toMinutes(NOW_TIME)) ||
        a.createdAt - b.createdAt
    );
    group.forEach((appointment, index) => {
      appointment.tokenNumber = index + 1;
    });
    // Only today's counters are needed - token allocation always starts from the booking date.
    if (group[0].date === TODAY) tokenCounters.push({ doctorId: group[0].doctorId, seq: group.length });
  });

  return { appointments, tokenCounters, feeByDoctor };
}

function makeVitals() {
  return {
    bloodPressure: `${randInt(100, 165)}/${randInt(60, 100)}`,
    temperature: `${(97 + random() * 5).toFixed(1)} F`,
    pulse: `${randInt(58, 108)} bpm`,
    weight: `${randInt(45, 98)} kg`,
    height: `${randInt(142, 185)} cm`,
  };
}

function buildConsultations(appointments, doctors) {
  const doctorById = new Map(doctors.map((doctor) => [String(doctor._id), doctor]));
  const consultations = [];

  appointments.forEach((appointment) => {
    if (appointment.status !== "completed") return;
    const doctor = doctorById.get(String(appointment.doctorId));
    const templates = CLINICAL[doctor.department] || CLINICAL["General Medicine"];
    const template = pick(templates);
    const instant = zoned(appointment.date, addMinutes(appointment.time, randInt(10, 35)));
    const createdAt = new Date(Math.min(instant.getTime(), NOW.getTime() - 60000));
    consultations.push({
      _id: id(),
      hospitalId: appointment.hospitalId,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      appointmentId: appointment._id,
      vitals: makeVitals(),
      symptoms: template.symptoms,
      diagnosis: template.diagnosis,
      notes: template.notes,
      prescriptions: template.rx,
      followUpDate: chance(0.4) ? addDays(appointment.date, randInt(7, 45)) : undefined,
      createdAt,
      updatedAt: createdAt,
    });
  });

  return consultations;
}

// What the three portal patients typed in at home, in the order of PORTAL_PATIENTS.
const PRE_CHECK_DRAFTS = [
  {
    symptoms:
      "Chest tightness when walking uphill since four days, spreads slightly to the left arm. No sweating, no breathlessness at rest.",
    duration: "4 days",
    vitals: { temperature: "98.4 F", bloodPressure: "146/92", pulse: "88 bpm", weight: "86 kg" },
  },
  {
    symptoms:
      "Fasting sugar readings between 180 and 220 for the last week, feeling thirsty and tired in the afternoons. Medicines taken regularly.",
    duration: "1 week",
    vitals: { temperature: "98.6 F", bloodPressure: "152/94", pulse: "80 bpm", weight: "74 kg" },
  },
  {
    symptoms:
      "Itchy red rash on both forearms after applying henna, spreading slowly since two days. No fever.",
    duration: "2 days",
    vitals: { temperature: "98.2 F", bloodPressure: "118/76", pulse: "72 bpm", weight: "58 kg" },
  },
];

function buildPreChecks(appointments, patients, staff) {
  const preChecks = [];
  const portalPatients = patients.slice(0, PORTAL_PATIENTS.length);

  portalPatients.forEach((patient, index) => {
    const appointment = appointments.find(
      (entry) => entry.date === TODAY && String(entry.patientId) === String(patient._id)
    );
    if (!appointment) return;
    const draft = PRE_CHECK_DRAFTS[index] || PRE_CHECK_DRAFTS[0];
    // Submitted at home before the visit: close to the slot time, never in the future.
    const submittedAt = new Date(
      Math.min(NOW.getTime() - 90 * 60000, zoned(appointment.date, appointment.time).getTime() - randInt(20, 55) * 60000)
    );
    preChecks.push({
      _id: id(),
      hospitalId: appointment.hospitalId,
      appointmentId: appointment._id,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      symptoms: draft.symptoms,
      duration: draft.duration,
      patientVitals: draft.vitals,
      attachments: [],
      consentAccepted: true,
      consentAcceptedAt: submittedAt,
      submittedAt,
      lastEditedByRole: "patient",
      createdAt: submittedAt,
      updatedAt: submittedAt,
    });
  });

  // A walk-in arrives without a pre-check, so the desk records the vitals instead.
  const walkIn = appointments.find(
    (entry) => entry.date === TODAY && !entry.time && entry.priority === "senior"
  );
  if (walkIn) {
    const staffVitalsAt = minutesAgo(20);
    preChecks.push({
      _id: id(),
      hospitalId: walkIn.hospitalId,
      appointmentId: walkIn._id,
      patientId: walkIn.patientId,
      doctorId: walkIn.doctorId,
      staffVitals: { temperature: "98.6 F", bloodPressure: "158/96", pulse: "88 bpm", weight: "71 kg" },
      staffVitalsBy: staff.receptionists[0]._id,
      staffVitalsAt,
      attachments: [],
      consentAccepted: false,
      lastEditedByRole: "receptionist",
      createdAt: staffVitalsAt,
      updatedAt: staffVitalsAt,
    });
  }

  return preChecks;
}

function buildAdmissions(patients, doctors, wards, beds, receptionists) {
  const admissions = [];
  const stays = [];
  const bookers = receptionists.map((user) => user._id);
  const bedsByWard = new Map(wards.map((ward) => [String(ward._id), beds.filter((bed) => String(bed.wardId) === String(ward._id))]));
  const patientPool = patients.slice(0, PORTAL_PATIENTS.length).concat(patients.slice(10));
  let patientCursor = 0;
  const nextPatient = () => patientPool[patientCursor++ % patientPool.length];

  const admissionDaysAgo = [1, 2, 3, 4, 5, 6, 7, 8, 2, 4, 6, 3];
  let dayCursor = 0;

  CURRENT_ADMISSION_PLAN.forEach(({ wardIndex, count }) => {
    const ward = wards[wardIndex];
    const wardBeds = bedsByWard.get(String(ward._id));
    for (let i = 0; i < count; i++) {
      const patient = nextPatient();
      const doctor = pick(doctors);
      const bed = wardBeds.find((candidate) => candidate.status === "vacant");
      if (!bed) break;
      bed.status = "occupied";
      const daysAgo = admissionDaysAgo[dayCursor++ % admissionDaysAgo.length];
      let admitDate = zoned(hospitalDate(-daysAgo), `${pad2(randInt(9, 20))}:${pad2(randInt(0, 59))}`);
      if (admitDate.getTime() > NOW.getTime() - 3600000) admitDate = new Date(admitDate.getTime() - DAY_MS);

      const advancePayments = [];
      if (chance(0.8)) {
        advancePayments.push({
          amount: pick([10000, 15000, 20000, 25000, 30000, 40000, 50000]),
          method: pickWeighted([["cash", 60], ["card", 25], ["other", 15]]),
          receivedBy: pick(bookers),
          receivedAt: new Date(admitDate.getTime() + randInt(2, 30) * 3600000),
        });
      }

      const admission = {
        _id: id(),
        hospitalId: ward.hospitalId,
        patientId: patient._id,
        wardId: ward._id,
        bedId: bed._id,
        doctorId: doctor._id,
        reason: pick(ADMIT_REASONS),
        admitDate,
        status: "admitted",
        admittedBy: pick(bookers),
        advancePayments,
        createdAt: admitDate,
        updatedAt: admitDate,
        _bedNumber: bed.bedNumber,
      };
      admissions.push(admission);
      stays.push({
        admissionId: admission._id,
        patientId: admission.patientId,
        start: admitDate,
        end: new Date(NOW.getTime() + DAY_MS),
        current: true,
      });
    }
  });

  for (let i = 0; i < PAST_ADMISSION_COUNT; i++) {
    const ward = pick(wards);
    const wardBeds = bedsByWard.get(String(ward._id));
    const patient = pick(patients);
    const doctor = pick(doctors);
    const bed = pick(wardBeds);
    const daysAgo = randInt(20, 340);
    const admitDate = zoned(hospitalDate(-daysAgo), `${pad2(randInt(8, 19))}:${pad2(randInt(0, 59))}`);
    const stayDays = randInt(2, 10);
    const dischargeDate = new Date(admitDate.getTime() + stayDays * DAY_MS + randInt(0, 10) * 3600000);

    const advancePayments = [];
    if (chance(0.5)) {
      advancePayments.push({
        amount: pick([10000, 15000, 20000, 25000, 35000, 50000]),
        method: pickWeighted([["cash", 65], ["card", 25], ["other", 10]]),
        receivedBy: pick(bookers),
        receivedAt: new Date(admitDate.getTime() + randInt(2, 20) * 3600000),
      });
    }

    const admission = {
      _id: id(),
      hospitalId: ward.hospitalId,
      patientId: patient._id,
      wardId: ward._id,
      bedId: bed._id,
      doctorId: doctor._id,
      reason: pick(ADMIT_REASONS),
      admitDate,
      dischargeDate,
      dischargeNotes: pick(DISCHARGE_NOTES),
      status: "discharged",
      admittedBy: pick(bookers),
      advancePayments,
      createdAt: admitDate,
      updatedAt: dischargeDate,
      _bedNumber: bed.bedNumber,
    };
    admissions.push(admission);
    stays.push({
      admissionId: admission._id,
      patientId: admission.patientId,
      start: admitDate,
      end: dischargeDate,
      current: false,
    });
  }

  return { admissions, stays };
}

function findStay(stays, patientId, at) {
  const target = String(patientId);
  for (const stay of stays) {
    if (String(stay.patientId) !== target) continue;
    if (at >= stay.start && at <= stay.end) return stay;
  }
  return null;
}

function buildLabOrders(patients, doctors, labTests, labTechId, stays) {
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push("ordered");
  for (let i = 0; i < 12; i++) statuses.push("sample_collected");
  for (let i = 0; i < 14; i++) statuses.push("in_progress");
  for (let i = 0; i < 77; i++) statuses.push("completed");
  for (let i = 0; i < 5; i++) statuses.push("cancelled");
  statuses.sort(() => random() - 0.5);

  const orders = [];
  const stayByOrder = new Map();

  for (let i = 0; i < LAB_ORDER_COUNT; i++) {
    const status = statuses[i];
    const patient = pick(patients);
    const doctor = pick(doctors);
    const createdAt = i % 12 === 0 ? minutesAgo(randInt(20, 300)) : historicMoment(360, 0);
    const pool = [...labTests];
    const count = randInt(1, 3);
    const chosen = [];
    while (chosen.length < count && pool.length) chosen.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
    const tests = chosen.map((test) => ({ testId: test._id, testName: test.name, price: test.price }));
    const completed = status === "completed";
    const completedAt = completed
      ? new Date(Math.min(NOW.getTime() - 60000, createdAt.getTime() + randInt(3, 30) * 3600000))
      : undefined;

    const order = {
      _id: id(),
      hospitalId: patient.hospitalId,
      patientId: patient._id,
      doctorId: doctor._id,
      tests,
      status,
      resultNotes: completed ? tests.map((test) => LAB_RESULTS[test.testName] || "Within normal limits.").join(" " ) : undefined,
      billed: false,
      orderedBy: doctor._id,
      completedBy: completed ? labTechId : undefined,
      completedAt,
      createdAt,
      updatedAt: completedAt || createdAt,
    };
    const stay = findStay(stays, order.patientId, createdAt);
    if (stay) stayByOrder.set(String(order._id), stay);
    // Cancelled work is never charged; a completed stay already had it rolled into the discharge
    // bill, while a running stay keeps it unbilled so it shows on the live IPD bill.
    order.billed = status === "cancelled" ? false : stay ? !stay.current : true;
    orders.push(order);
  }

  return { labOrders: orders, stayByOrder };
}

function buildMedicines(hospitalId) {
  return MEDICINES.map(([name, category, unit, price], index) => {
    const batchCount = randInt(1, 3);
    const batches = [];
    for (let b = 0; b < batchCount; b++) {
      const nearExpiry = NEAR_EXPIRY_INDEXES.has(index) && b === 0;
      const expiryDate = nearExpiry
        ? new Date(NOW.getTime() + randInt(6, 27) * DAY_MS)
        : new Date(NOW.getTime() + randInt(4, 26) * 30 * DAY_MS + randInt(0, 29) * DAY_MS);
      const quantity = nearExpiry ? randInt(15, 90) : randInt(40, 420);
      batches.push({
        batchNumber: `${pick(["GT", "SK", "AB", "SL", "HL", "MD"])}-${randInt(1000, 9999)}`,
        quantity,
        expiryDate,
        purchasePrice: Math.max(2, Math.round(price * 0.55)),
        supplier: pick(SUPPLIERS),
        receivedDate: new Date(expiryDate.getTime() - randInt(5, 18) * 30 * DAY_MS),
      });
    }
    const stock = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    return {
      _id: id(),
      hospitalId,
      name,
      category,
      unit,
      batches,
      stock,
      price,
      supplier: batches[0].supplier,
      lowStockThreshold: LOW_STOCK_INDEXES.has(index) ? stock + randInt(5, 25) : Math.max(10, Math.ceil(stock * 0.35)),
      createdAt: zoned(hospitalDate(-380 + (index % 30)), `${pad2(randInt(9, 17))}:${pad2(randInt(0, 59))}`),
      updatedAt: NOW,
    };
  });
}

const PACK_UNITS = new Set(["injection", "inhaler", "syrup", "suspension", "cream", "lotion", "ointment", "drops"]);

function quantityFor(unit) {
  return PACK_UNITS.has(unit) ? randInt(1, 3) : randInt(10, 60);
}

function buildSales(patients, medicines, pharmacistId, stays) {
  const sales = [];
  const stayBySale = new Map();

  for (let i = 0; i < PHARMACY_SALE_COUNT; i++) {
    const patient = pick(patients);
    const createdAt = i % 10 === 0 ? minutesAgo(randInt(30, 420)) : historicMoment(360, 0);
    const itemCount = randInt(1, 3);
    const pool = [...medicines];
    const items = [];
    for (let k = 0; k < itemCount; k++) {
      const medicine = pool.splice(randInt(0, pool.length - 1), 1)[0];
      const quantity = quantityFor(medicine.unit);
      const batchesUsed = [{ batchNumber: medicine.batches[0].batchNumber, quantity }];
      items.push({
        medicineId: medicine._id,
        medicineName: medicine.name,
        quantity,
        unitPrice: medicine.price,
        subtotal: medicine.price * quantity,
        batchesUsed,
      });
    }
    const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
    const sale = {
      _id: id(),
      hospitalId: patient.hospitalId,
      patientId: patient._id,
      items,
      totalAmount,
      dispensedBy: pharmacistId,
      billed: false,
      createdAt,
      updatedAt: createdAt,
    };
    const stay = findStay(stays, sale.patientId, createdAt);
    if (stay) stayBySale.set(String(sale._id), stay);
    sale.billed = stay ? !stay.current : true;
    sales.push(sale);
  }

  return { sales, stayBySale };
}

const REFERENCE_METHODS = new Set(["jazzcash", "easypaisa", "bank_transfer"]);

function randomMethod() {
  return pickWeighted([
    ["cash", 58],
    ["card", 18],
    ["jazzcash", 8],
    ["easypaisa", 6],
    ["bank_transfer", 6],
    ["insurance", 4],
  ]);
}

function clampFuture(date) {
  return date.getTime() > NOW.getTime() - 60000 ? new Date(NOW.getTime() - 60000) : date;
}

function paymentRecord(method, amount, at, paidBy) {
  const payment = { method, amount, paidBy, date: clampFuture(at) };
  if (REFERENCE_METHODS.has(method)) payment.referenceNumber = `${method.slice(0, 2).toUpperCase()}${randInt(10000000, 99999999)}`;
  return payment;
}

function buildBills({ hospitalId, appointments, doctors, admissions, wards, labOrders, sales, stayByOrder, stayBySale, feeByDoctor, staffIds }) {
  const bills = [];
  const wardById = new Map(wards.map((ward) => [String(ward._id), ward]));
  const doctorNameById = new Map(doctors.map((doctor) => [String(doctor._id), doctor.name]));
  const doctorFee = feeByDoctor;

  const makeBill = ({ patientId, items, at, mode, createdBy, extra = {} }) => {
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    let payments = [];
    if (mode === "paid") payments = [paymentRecord(randomMethod(), totalAmount, at, createdBy)];
    if (mode === "partial") {
      const amount = Math.max(1, Math.round(totalAmount * (0.3 + random() * 0.4)));
      payments = [paymentRecord(randomMethod(), amount, at, createdBy)];
    }
    const amountPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const paymentStatus = totalAmount > 0 && amountPaid >= totalAmount ? "paid" : amountPaid > 0 ? "partial" : "unpaid";
    const bill = {
      _id: id(),
      hospitalId,
      patientId,
      items,
      totalAmount,
      amountPaid,
      payments,
      sponsors: [],
      paymentStatus,
      paymentMethod: payments.length ? payments[0].method : undefined,
      createdBy,
      createdAt: at,
      updatedAt: at,
      ...extra,
    };
    bills.push(bill);
    return bill;
  };

  appointments.forEach((appointment) => {
    if (!["completed", "in_consultation", "checked_in"].includes(appointment.status)) return;
    const fee = doctorFee.get(String(appointment.doctorId)) || 2000;
    let mode;
    if (appointment.date === TODAY) {
      mode =
        appointment.status === "checked_in"
          ? pickWeighted([["unpaid", 55], ["partial", 20], ["paid", 25]])
          : pickWeighted([["paid", 65], ["partial", 20], ["unpaid", 15]]);
    } else {
      mode = pickWeighted([["paid", 58], ["partial", 14], ["unpaid", 28]]);
    }
    const doctorName = doctorNameById.get(String(appointment.doctorId)) || "Doctor";
    makeBill({
      patientId: appointment.patientId,
      items: [
        {
          description: `OPD Consultation Fee - ${doctorName}`,
          category: "OPD",
          amount: fee,
        },
      ],
      at: appointment.createdAt,
      mode,
      createdBy: pick(staffIds),
      extra: { appointmentId: appointment._id },
    });
  });

  labOrders.forEach((order) => {
    if (stayByOrder.has(String(order._id)) || order.status === "cancelled") return;
    const at = clampFuture(new Date(order.createdAt.getTime() + randInt(30, 120) * 60000));
    makeBill({
      patientId: order.patientId,
      items: order.tests.map((test) => ({ description: `Lab: ${test.testName}`, category: "Lab", amount: test.price })),
      at,
      mode: pickWeighted([["paid", 62], ["partial", 12], ["unpaid", 26]]),
      createdBy: pick(staffIds),
      extra: { labOrderId: order._id },
    });
  });

  sales.forEach((sale) => {
    if (stayBySale.has(String(sale._id))) return;
    const at = clampFuture(new Date(sale.createdAt.getTime() + randInt(10, 90) * 60000));
    makeBill({
      patientId: sale.patientId,
      items: sale.items.map((item) => ({
        description: `Medicine: ${item.medicineName} x ${item.quantity}`,
        category: "Pharmacy",
        amount: item.subtotal,
      })),
      at,
      mode: pickWeighted([["paid", 62], ["partial", 12], ["unpaid", 26]]),
      createdBy: pick(staffIds),
      extra: { pharmacySaleId: sale._id },
    });
  });

  const ordersByAdmission = new Map();
  labOrders.forEach((order) => {
    const stay = stayByOrder.get(String(order._id));
    if (!stay || stay.current || order.status === "cancelled") return;
    if (!ordersByAdmission.has(String(stay.admissionId))) ordersByAdmission.set(String(stay.admissionId), []);
    ordersByAdmission.get(String(stay.admissionId)).push(order);
  });
  const salesByAdmission = new Map();
  sales.forEach((sale) => {
    const stay = stayBySale.get(String(sale._id));
    if (!stay || stay.current) return;
    if (!salesByAdmission.has(String(stay.admissionId))) salesByAdmission.set(String(stay.admissionId), []);
    salesByAdmission.get(String(stay.admissionId)).push(sale);
  });

  admissions.forEach((admission) => {
    if (admission.status !== "discharged" || !admission.dischargeDate) return;
    const ward = wardById.get(String(admission.wardId));
    const rate = ward ? ward.dailyRate : 0;
    const days = Math.max(1, Math.ceil((admission.dischargeDate.getTime() - admission.admitDate.getTime()) / DAY_MS));
    const items = [
      {
        description: `Bed charges - ${ward ? ward.name : "Ward"}, Bed ${(admission._bedNumber || "-")} (${days} day${days === 1 ? "" : "s"} x Rs. ${rate.toLocaleString("en-US")}/day)`,
        category: "IPD",
        amount: days * rate,
      },
    ];
    (ordersByAdmission.get(String(admission._id)) || []).forEach((order) => {
      order.tests.forEach((test) => items.push({ description: `Lab: ${test.testName}`, category: "Lab", amount: test.price }));
    });
    (salesByAdmission.get(String(admission._id)) || []).forEach((sale) => {
      sale.items.forEach((item) =>
        items.push({ description: `Medicine: ${item.medicineName} x ${item.quantity}`, category: "Pharmacy", amount: item.subtotal })
      );
    });

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const advance = (admission.advancePayments || []).reduce((sum, payment) => sum + payment.amount, 0);
    const lastAdvanceMethod = admission.advancePayments.length
      ? admission.advancePayments[admission.advancePayments.length - 1].method
      : null;
    const mode = pickWeighted([["paid", 50], ["partial", 25], ["unpaid", 25]]);
    let amount = 0;
    if (mode === "paid") amount = totalAmount;
    if (mode === "partial") amount = Math.max(1, Math.min(totalAmount - 1, Math.max(advance, Math.round(totalAmount * 0.45))));
    const method = lastAdvanceMethod || randomMethod();
    const payments = amount > 0 ? [paymentRecord(method, amount, admission.dischargeDate, pick(staffIds))] : [];
    const amountPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);

    bills.push({
      _id: id(),
      hospitalId,
      patientId: admission.patientId,
      admissionId: admission._id,
      items,
      totalAmount,
      amountPaid,
      payments,
      sponsors: [],
      paymentStatus: amountPaid >= totalAmount ? "paid" : amountPaid > 0 ? "partial" : "unpaid",
      paymentMethod: payments.length ? payments[0].method : undefined,
      createdBy: pick(staffIds),
      createdAt: admission.dischargeDate,
      updatedAt: admission.dischargeDate,
    });
  });

  return bills;
}

function buildNurseNotes(currentAdmissions, nurses) {
  const notes = [];
  currentAdmissions.forEach((admission) => {
    const count = randInt(2, 4);
    const span = NOW.getTime() - admission.admitDate.getTime();
    for (let i = 0; i < count; i++) {
      const createdAt = new Date(admission.admitDate.getTime() + Math.floor((span * (i + 1)) / (count + 1)));
      notes.push({
        _id: id(),
        hospitalId: admission.hospitalId,
        admissionId: admission._id,
        patientId: admission.patientId,
        nurseId: pick(nurses)._id,
        note: pick(NURSE_NOTE_TEXTS),
        vitals: {
          bloodPressure: `${randInt(105, 150)}/${randInt(65, 95)}`,
          temperature: `${(97.5 + random() * 3).toFixed(1)} F`,
          pulse: `${randInt(62, 100)} bpm`,
        },
        createdAt,
        updatedAt: createdAt,
      });
    }
  });
  return notes;
}

function buildAuditLogs({
  hospitalId,
  staff,
  doctors,
  patients,
  consultations,
  preChecks,
  appointments,
  admissions,
  bills,
  labOrders,
  medicines,
  wards,
}) {
  const appointmentIds = appointments.map((appointment) => String(appointment._id));
  const dischargedIds = admissions.filter((admission) => admission.status === "discharged").map((admission) => String(admission._id));
  const currentIds = admissions.filter((admission) => admission.status === "admitted").map((admission) => String(admission._id));
  const billIds = bills.map((bill) => String(bill._id));
  const labOrderIds = labOrders.map((order) => String(order._id));
  const medicineIds = medicines.map((medicine) => String(medicine._id));
  const wardIds = wards.map((ward) => String(ward._id));
  const doctorIds = doctors.map((doctor) => String(doctor._id));
  const patientIds = patients.map((patient) => String(patient._id));

  // Snapshots are taken from the seeded users, exactly like the middleware does at runtime.
  const userById = new Map(staff.users.map((user) => [String(user._id), user]));
  const roleUsers = {
    hospital_admin: [staff.admin._id],
    doctor: doctors.map((doctor) => doctor._id),
    receptionist: staff.receptionists.map((user) => user._id),
    nurse: staff.nurses.map((user) => user._id),
    lab_technician: [staff.labTech._id],
    pharmacist: [staff.pharmacist._id],
  };

  // PHI reads carry the patient they exposed - the audit viewer answers "who opened whose chart".
  const patientRecordRead = (role) => {
    const patientId = pick(patientIds);
    return { method: "GET", path: `/api/patients/${patientId}`, role, patientId };
  };
  const consultationRead = () => {
    const consultation = pick(consultations);
    return {
      method: "GET",
      path: `/api/consultations/${consultation._id}`,
      role: "doctor",
      patientId: consultation.patientId,
    };
  };
  const historyRead = () => {
    const consultation = pick(consultations);
    return {
      method: "GET",
      path: `/api/consultations/patient/${consultation.patientId}`,
      role: "doctor",
      patientId: consultation.patientId,
    };
  };
  const prescriptionDownload = () => {
    const consultation = pick(consultations);
    return {
      method: "GET",
      path: `/api/consultations/${consultation._id}/prescription-pdf`,
      role: "doctor",
      patientId: consultation.patientId,
    };
  };
  const labHistoryRead = () => {
    const patientId = pick(patientIds);
    return { method: "GET", path: `/api/lab/orders/patient/${patientId}`, role: "doctor", patientId };
  };
  const preCheckRead = () => {
    const preCheck = pick(preChecks);
    return {
      method: "GET",
      path: `/api/pre-checks/${preCheck._id}`,
      role: "doctor",
      patientId: preCheck.patientId,
    };
  };
  const priorityChange = () => {
    const appointment = pick(appointments);
    return {
      method: "PATCH",
      path: `/api/appointments/${appointment._id}/priority`,
      role: "receptionist",
      patientId: appointment.patientId,
      details: "Priority normal -> senior (Senior citizen, age 74)",
    };
  };

  const actions = [
    () => ({ method: "POST", path: "/api/patients", role: "receptionist" }),
    () => ({ method: "POST", path: "/api/appointments", role: "receptionist" }),
    () => ({ method: "POST", path: "/api/appointments/walk-in", role: "receptionist" }),
    () => ({ method: "POST", path: "/api/appointments/call-next", role: "doctor" }),
    () => ({ method: "PATCH", path: `/api/appointments/${pick(appointmentIds)}/status`, role: "receptionist" }),
    () => ({ method: "PATCH", path: `/api/appointments/${pick(appointmentIds)}/status`, role: "doctor" }),
    priorityChange,
    () => ({ method: "POST", path: "/api/consultations", role: "doctor" }),
    () => ({ method: "POST", path: "/api/billing", role: "receptionist" }),
    () => ({ method: "PATCH", path: `/api/billing/${pick(billIds)}/payment`, role: "receptionist" }),
    () => ({ method: "POST", path: "/api/pharmacy/dispense", role: "pharmacist" }),
    () => ({ method: "PATCH", path: `/api/lab/orders/${pick(labOrderIds)}/result`, role: "lab_technician" }),
    () => ({ method: "PATCH", path: `/api/lab/orders/${pick(labOrderIds)}/status`, role: "lab_technician" }),
    () => ({ method: "POST", path: "/api/admissions", role: "receptionist" }),
    () => ({ method: "PATCH", path: `/api/admissions/${pick(dischargedIds)}/discharge`, role: "receptionist" }),
    () => ({ method: "POST", path: `/api/admissions/${pick(currentIds)}/advance-payment`, role: "receptionist" }),
    () => ({ method: "POST", path: `/api/admissions/${pick(currentIds)}/notes`, role: "nurse" }),
    () => ({ method: "POST", path: "/api/wards", role: "hospital_admin" }),
    () => ({ method: "POST", path: `/api/wards/${pick(wardIds)}/beds`, role: "hospital_admin" }),
    () => ({ method: "PUT", path: `/api/doctor-schedules/${pick(doctorIds)}`, role: "hospital_admin" }),
    () => ({ method: "POST", path: "/api/lab/tests", role: "hospital_admin" }),
    () => ({ method: "POST", path: "/api/pharmacy/medicines", role: "hospital_admin" }),
    () => ({ method: "PATCH", path: `/api/pharmacy/medicines/${pick(medicineIds)}/restock`, role: "pharmacist" }),
    () => ({ method: "POST", path: "/api/hospital-admin/staff", role: "hospital_admin" }),
    () => patientRecordRead("doctor"),
    () => patientRecordRead("receptionist"),
    consultationRead,
    historyRead,
    prescriptionDownload,
    labHistoryRead,
    preCheckRead,
  ];

  const makeLog = (action, at) => {
    const userId = pick(roleUsers[action.role]);
    const actor = userById.get(String(userId));
    return {
      _id: id(),
      hospitalId,
      userId,
      userName: actor ? actor.name : undefined,
      userRole: action.role,
      method: action.method,
      path: action.path,
      statusCode: action.method === "POST" ? 201 : 200,
      action: describeAction(action.method, action.path),
      resourceId: extractResourceId(action.path) || undefined,
      patientId: action.patientId,
      details: action.details,
      createdAt: at,
      updatedAt: at,
    };
  };

  const logs = [];
  const recentMinutes = [2, 5, 9, 14, 21, 29, 38, 50, 64, 82, 104, 130, 160, 195, 235, 285, 340, 410];
  // Shuffle once so the live feed shows a spread of actions instead of a repeating pattern.
  const shuffled = [...actions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  recentMinutes.forEach((minutes, index) => logs.push(makeLog(shuffled[index % shuffled.length](), minutesAgo(minutes))));
  for (let i = 0; i < 380; i++) logs.push(makeLog(pick(actions)(), historicMoment(362, 0)));
  return logs;
}

function validateData({ patients, appointments, preChecks, medicines, sales, labOrders, bills }) {
  const mrns = new Set();
  patients.forEach((patient) => {
    if (mrns.has(patient.mrn)) throw new Error(`Duplicate MRN generated: ${patient.mrn}`);
    mrns.add(patient.mrn);
  });

  const slots = new Set();
  const tokens = new Set();
  appointments.forEach((appointment) => {
    const tokenKey = `${appointment.doctorId}|${appointment.date}|${appointment.tokenNumber}`;
    if (tokens.has(tokenKey)) throw new Error(`Duplicate doctor token: ${tokenKey}`);
    tokens.add(tokenKey);
    if (!Number.isInteger(appointment.tokenNumber) || appointment.tokenNumber < 1) {
      throw new Error(`Invalid token number on appointment ${appointment._id}`);
    }
    if (appointment.priority !== "normal" && !appointment.priorityReason) {
      throw new Error(`Priority ${appointment.priority} without a reason: ${appointment._id}`);
    }
    if (!appointment.time) {
      // A walk-in: token only, already at the desk, so it must never sit on a slot.
      if (appointment.status !== "checked_in") throw new Error(`Walk-in not checked in: ${appointment._id}`);
      if (!appointment.checkedInAt) throw new Error(`Walk-in without checkedInAt: ${appointment._id}`);
      return;
    }
    if (["cancelled", "no_show"].includes(appointment.status)) return;
    const key = `${appointment.doctorId}|${appointment.date}|${appointment.time}`;
    if (slots.has(key)) throw new Error(`Duplicate active appointment slot: ${key}`);
    slots.add(key);
  });

  const appointmentById = new Map(appointments.map((appointment) => [String(appointment._id), appointment]));
  const preCheckAppointments = new Set();
  preChecks.forEach((preCheck) => {
    const key = String(preCheck.appointmentId);
    if (preCheckAppointments.has(key)) throw new Error(`Duplicate pre-check for appointment ${key}`);
    preCheckAppointments.add(key);
    const appointment = appointmentById.get(key);
    if (!appointment) throw new Error(`Pre-check points at a missing appointment: ${key}`);
    if (String(appointment.patientId) !== String(preCheck.patientId)) {
      throw new Error(`Pre-check patient does not match its appointment: ${preCheck._id}`);
    }
    if (!preCheck.submittedAt && !preCheck.staffVitalsAt) {
      throw new Error(`Pre-check has neither a patient submission nor desk vitals: ${preCheck._id}`);
    }
  });

  medicines.forEach((medicine) => {
    const sum = medicine.batches.reduce((total, batch) => total + batch.quantity, 0);
    if (sum !== medicine.stock) throw new Error(`Stock does not match batches for ${medicine.name}`);
  });

  sales.forEach((sale) => {
    const sum = sale.items.reduce((total, item) => total + item.subtotal, 0);
    if (sum !== sale.totalAmount) throw new Error(`Pharmacy sale total mismatch: ${sale._id}`);
  });

  labOrders.forEach((order) => {
    if (order.status === "cancelled" && order.billed) throw new Error(`Cancelled lab order marked billed: ${order._id}`);
  });

  bills.forEach((bill) => {
    const total = bill.items.reduce((sum, item) => sum + item.amount, 0);
    const paid = bill.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (total !== bill.totalAmount || paid !== bill.amountPaid) throw new Error(`Bill totals mismatch: ${bill._id}`);
    const expected = paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
    if (bill.paymentStatus !== expected) throw new Error(`Bill payment status mismatch: ${bill._id}`);
  });
}

const TENANT_MODELS = [
  User, Patient, DoctorSchedule, Appointment, PreCheck, Consultation, Ward, Bed, Admission, NurseNote,
  LabTest, LabOrder, Medicine, PharmacySale, Bill, AuditLog,
];

async function wipeTenant(hospitalId) {
  for (const model of TENANT_MODELS) await model.collection.deleteMany({ hospitalId });
  await Counter.deleteMany({ hospitalId });
}

async function insertDocs(model, docs) {
  if (!docs.length) return 0;
  const clean = docs.map((doc) => {
    const out = {};
    for (const [key, value] of Object.entries(doc)) {
      if (key.startsWith("_") && key !== "_id") continue;
      out[key] = value;
    }
    return out;
  });
  for (let i = 0; i < clean.length; i += 500) await model.collection.insertMany(clean.slice(i, i + 500));
  return clean.length;
}

/**
 * Builds every document for one hospital in memory. Nothing here touches the database, which is
 * what lets --dry-run exercise the whole generator (and its consistency checks) offline.
 */
async function generateDemoData(hospitalId) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const staff = buildStaff(hospitalId, passwordHash);
  const { patients, portalUsers } = buildPatients(hospitalId, passwordHash, staff.admin._id, staff.receptionists);
  const { wards, beds } = buildWardsAndBeds(hospitalId, staff.admin._id);
  const schedules = buildSchedules(hospitalId, staff.doctors);
  const { appointments, tokenCounters, feeByDoctor } = buildAppointments(
    patients,
    staff.doctors,
    schedules,
    staff.admin._id,
    staff.receptionists
  );
  const consultations = buildConsultations(appointments, staff.doctors);
  const preChecks = buildPreChecks(appointments, patients, staff);
  const { admissions, stays } = buildAdmissions(patients, staff.doctors, wards, beds, staff.receptionists);

  const labTestCreatedAt = zoned(hospitalDate(-390), "09:00");
  const labTests = LAB_TEST_CATALOG.map((test) => ({
    _id: id(),
    hospitalId,
    ...test,
    createdAt: labTestCreatedAt,
    updatedAt: labTestCreatedAt,
  }));

  const { labOrders, stayByOrder } = buildLabOrders(patients, staff.doctors, labTests, staff.labTech._id, stays);
  const medicines = buildMedicines(hospitalId);
  const { sales, stayBySale } = buildSales(patients, medicines, staff.pharmacist._id, stays);
  const staffIds = [staff.admin._id, ...staff.receptionists.map((user) => user._id)];
  const bills = buildBills({
    hospitalId,
    appointments,
    doctors: staff.doctors,
    admissions,
    wards,
    labOrders,
    sales,
    stayByOrder,
    stayBySale,
    feeByDoctor,
    staffIds,
  });

  const currentAdmissions = admissions.filter((admission) => admission.status === "admitted");
  const nurseNotes = buildNurseNotes(currentAdmissions, staff.nurses);
  const auditLogs = buildAuditLogs({
    hospitalId,
    staff,
    doctors: staff.doctors,
    patients,
    consultations,
    preChecks,
    appointments,
    admissions,
    bills,
    labOrders,
    medicines,
    wards,
  });
  const counters = [
    { _id: id(), hospitalId, name: "patient_mrn", seq: patients.length },
    ...tokenCounters.map((entry) => ({
      _id: id(),
      hospitalId,
      name: `opd_token_${entry.doctorId}_${TODAY}`,
      seq: entry.seq,
    })),
  ];

  validateData({ patients, appointments, preChecks, medicines, sales, labOrders, bills });

  return {
    staff,
    portalUsers,
    patients,
    schedules,
    wards,
    beds,
    appointments,
    consultations,
    preChecks,
    admissions,
    currentAdmissions,
    labTests,
    labOrders,
    medicines,
    sales,
    bills,
    nurseNotes,
    auditLogs,
    counters,
  };
}

async function insertAll(data) {
  await insertDocs(User, data.staff.users);
  await insertDocs(User, data.portalUsers);
  await insertDocs(Patient, data.patients);
  await insertDocs(DoctorSchedule, data.schedules);
  await insertDocs(Ward, data.wards);
  await insertDocs(Bed, data.beds);
  await insertDocs(Appointment, data.appointments);
  await insertDocs(PreCheck, data.preChecks);
  await insertDocs(Consultation, data.consultations);
  await insertDocs(Admission, data.admissions);
  await insertDocs(LabTest, data.labTests);
  await insertDocs(LabOrder, data.labOrders);
  await insertDocs(Medicine, data.medicines);
  await insertDocs(PharmacySale, data.sales);
  await insertDocs(Bill, data.bills);
  await insertDocs(NurseNote, data.nurseNotes);
  await insertDocs(AuditLog, data.auditLogs);
  await insertDocs(Counter, data.counters);
}

function printSummary(data) {
  const {
    staff,
    portalUsers,
    patients,
    schedules,
    wards,
    beds,
    appointments,
    consultations,
    preChecks,
    admissions,
    currentAdmissions,
    labTests,
    labOrders,
    medicines,
    sales,
    bills,
    nurseNotes,
    auditLogs,
  } = data;
  const todays = appointments.filter((appointment) => appointment.date === TODAY);
  const countToday = (status) => todays.filter((appointment) => appointment.status === status).length;
  const walkIns = todays.filter((appointment) => !appointment.time);
  const flaggedToday = todays.filter((appointment) => appointment.priority !== "normal");
  const invoiced = bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
  const collected = bills.reduce((sum, bill) => sum + bill.amountPaid, 0);
  const withBalance = bills.filter((bill) => bill.paymentStatus !== "paid").length;
  const lowStock = medicines.filter((medicine) => medicine.stock <= medicine.lowStockThreshold).length;
  const statusMix = ["completed", "checked_in", "in_consultation", "no_show", "cancelled"]
    .map((status) => `${status} ${appointments.filter((appointment) => appointment.status === status).length}`)
    .join(", ");

  console.log("\nDemo dataset (this hospital only):");
  const rows = [
    ["Hospital admin", 1],
    ["Staff accounts (all roles)", staff.users.length],
    ["Patients", patients.length],
    ["Portal patient accounts", portalUsers.length],
    ["Doctors with schedules", schedules.length],
    ["Appointments (today / total)", `${todays.length} / ${appointments.length}`],
    ["Walk-in tokens (today)", walkIns.length],
    ["Priority flagged (today)", `${flaggedToday.length} (${flaggedToday.map((a) => a.priority).join(", ")})`],
    ["Doctor token counters", todays.length ? new Set(todays.map((a) => String(a.doctorId))).size : 0],
    ["Consultations", consultations.length],
    ["Pre-checks", preChecks.length],
    ["Wards / beds", `${wards.length} / ${beds.length}`],
    ["Admissions (current + past)", `${currentAdmissions.length} + ${admissions.length - currentAdmissions.length}`],
    ["Lab tests in catalogue", labTests.length],
    ["Lab orders", labOrders.length],
    ["Medicines (low stock)", `${medicines.length} (${lowStock})`],
    ["Pharmacy sales", sales.length],
    ["Bills", bills.length],
    ["Nurse notes", nurseNotes.length],
    ["Audit log entries", auditLogs.length],
  ];
  rows.forEach(([label, value]) => console.log(`  ${String(label).padEnd(30)} ${value}`));
  console.log(`\n  Appointment status mix: ${statusMix}`);
  console.log(
    `\n  Today's queue: ${countToday("checked_in")} waiting, ${countToday("in_consultation")} in consultation, ` +
      `${countToday("completed")} completed, ${countToday("no_show")} no-show`
  );
  console.log(
    `  Billed PKR ${invoiced.toLocaleString("en-US")} | Collected PKR ${collected.toLocaleString("en-US")} | ` +
      `${withBalance} bills with a balance`
  );
  console.log(`\nDemo logins (password for every account: ${DEMO_PASSWORD})`);
  console.log("  Hospital admin       admin@careflowdemo.pk");
  console.log(`  Doctor               ${staff.doctors[0].email}`);
  console.log(`  Receptionist         ${staff.receptionists[0].email}`);
  console.log(`  Nurse                ${staff.nurses[0].email}`);
  console.log(`  Lab technician       ${staff.labTech.email}`);
  console.log(`  Pharmacist           ${staff.pharmacist.email}`);
  portalUsers.forEach((user) => console.log(`  Patient portal       ${user.email}`));
  console.log("\nRe-run any time: existing demo data is replaced, other hospitals are never touched.");
}

async function main() {
  // --dry-run only builds the dataset in memory, so it is safe anywhere - including production.
  if (DRY_RUN) {
    const hospitalId = id();
    const data = await generateDemoData(hospitalId);
    console.log(`Dry run for "${DEMO_HOSPITAL_NAME}" (in-memory hospitalId ${hospitalId}). Nothing was written.`);
    printSummary(data);
    return;
  }

  if (process.env.NODE_ENV === "production" && !FORCE) {
    console.error("Refusing to seed demo data with NODE_ENV=production. Re-run with --force to override.");
    process.exitCode = 1;
    return;
  }
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set in the environment. Add it to hms-backend/.env first.");
    process.exitCode = 1;
    return;
  }

  await connectDB();

  let hospital = await Hospital.findOne({ name: DEMO_HOSPITAL_NAME });
  if (!hospital) {
    hospital = await Hospital.create({ name: DEMO_HOSPITAL_NAME, status: "active" });
  } else if (hospital.status !== "active" || hospital.trialEndDate) {
    await Hospital.updateOne(
      { _id: hospital._id },
      { $set: { status: "active" }, $unset: { trialStartDate: "", trialEndDate: "" } }
    );
    hospital.status = "active";
  }
  const hospitalId = hospital._id;

  const demoEmails = [...STAFF, ...DOCTORS, ...PORTAL_PATIENTS].map((entry) => entry.email);
  const existingAccounts = await User.find({ email: { $in: demoEmails } })
    .setOptions({ skipTenantScope: true })
    .select("email hospitalId")
    .lean();
  const foreignAccounts = existingAccounts.filter((user) => String(user.hospitalId) !== String(hospitalId));
  if (foreignAccounts.length) {
    console.error("Aborting: these demo emails already belong to another hospital and were left untouched:");
    foreignAccounts.forEach((user) => console.error(`  - ${user.email}`));
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }

  console.log(`Seeding "${DEMO_HOSPITAL_NAME}" (${hospitalId})`);
  // Built and validated before the wipe, so a generation failure cannot leave the demo hospital empty.
  const data = await generateDemoData(hospitalId);
  await wipeTenant(hospitalId);
  console.log("  Previous demo data cleared. Other hospitals were not touched.");

  await insertAll(data);

  printSummary(data);

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error("Demo seed failed:", err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

// Exported so the generator can be exercised without writing anything (see --dry-run).
module.exports = { main, generateDemoData, DEMO_HOSPITAL_NAME, DEMO_PASSWORD };
