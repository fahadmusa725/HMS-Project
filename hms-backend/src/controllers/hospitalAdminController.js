const User = require("../models/User");
const { ROLES } = require("../models/User");
const Patient = require("../models/Patient");
const Bill = require("../models/Bill");
const Medicine = require("../models/Medicine");
const Appointment = require("../models/Appointment");

const STAFF_ROLES = ROLES.filter(
  (r) => !["platform_super_admin", "hospital_admin", "patient"].includes(r)
);

/**
 * Hospital Admin invites a staff member. Because this route runs inside the
 * admin's own tenant context (set by protect() from their JWT), User.create()
 * automatically stamps the new user with the admin's hospitalId - there's no
 * way for an admin to accidentally (or deliberately) create a user under a
 * different hospital.
 */
async function createStaff(req, res) {
  try {
    const { name, email, password, role, department } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "name, email, password and role are required." });
    }

    if (!STAFF_ROLES.includes(role)) {
      return res.status(400).json({
        message: `role must be one of: ${STAFF_ROLES.join(", ")}`,
      });
    }

    const staff = await User.create({
      name,
      email,
      password,
      role,
      department,
      status: "active",
    });

    res.status(201).json({
      id: staff._id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      department: staff.department,
    });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ message: "That email is already in use." });
    }
    res.status(500).json({ message: "Server error while creating staff." });
  }
}

/** List all staff in the admin's own hospital. */
async function listStaff(req, res) {
  try {
    const staff = await User.find({ role: { $ne: "patient" } }).select("-password");
    res.json(staff);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing staff." });
  }
}

// --- Data export (no vendor lock-in) ---

const EXPORT_TYPES = ["patients", "bills", "medicines", "appointments", "all"];

const isoDate = (d) => (d ? new Date(d).toISOString() : "");
const shortDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/** Plain finds here are auto-scoped to the caller's hospitalId by tenantPlugin. */
async function fetchPatients() {
  return Patient.find({}).sort({ createdAt: -1 }).lean();
}

async function fetchBills() {
  return Bill.find({}).sort({ createdAt: -1 }).populate("patientId", "name mrn").lean();
}

async function fetchMedicines() {
  return Medicine.find({}).sort({ name: 1 }).lean();
}

async function fetchAppointments() {
  return Appointment.find({})
    .sort({ date: -1, tokenNumber: 1 })
    .populate("patientId", "name mrn")
    .populate("doctorId", "name")
    .lean();
}

/** Row shapes below are used for CSV only - JSON export keeps the full populated/nested documents. */
function patientToRow(p) {
  return {
    mrn: p.mrn || "",
    name: p.name || "",
    dob: shortDate(p.dob),
    gender: p.gender || "",
    phone: p.phone || "",
    email: p.email || "",
    cnic: p.cnic || "",
    address: p.address || "",
    allergies: (p.allergies || []).join("; "),
    chronicConditions: (p.chronicConditions || []).join("; "),
    registeredAt: isoDate(p.createdAt),
  };
}

function billToRow(b) {
  const items = (b.items || [])
    .map((i) => `${i.category}: ${i.description} (${i.amount})`)
    .join(" | ");
  const payments = (b.payments || [])
    .map((p) => `${p.method} ${p.amount}${p.referenceNumber ? ` ref:${p.referenceNumber}` : ""} on ${shortDate(p.date)}`)
    .join(" | ");
  const sponsors = (b.sponsors || [])
    .map((s) => `${s.payerType}${s.payerName ? ` (${s.payerName})` : ""} owed:${s.amountOwed || 0} paid:${s.amountPaid || 0}`)
    .join(" | ");

  return {
    billId: String(b._id),
    patientName: b.patientId?.name || "",
    patientMrn: b.patientId?.mrn || "",
    totalAmount: b.totalAmount ?? 0,
    amountPaid: b.amountPaid ?? 0,
    paymentStatus: b.paymentStatus || "",
    paymentMethod: b.paymentMethod || "",
    items,
    payments,
    sponsors,
    createdAt: isoDate(b.createdAt),
  };
}

function medicineToRow(m) {
  const batches = (m.batches || [])
    .map((b) => `${b.batchNumber || "unlabeled"} qty:${b.quantity} exp:${shortDate(b.expiryDate)}${b.purchasePrice != null ? ` price:${b.purchasePrice}` : ""}`)
    .join(" | ");

  return {
    name: m.name || "",
    category: m.category || "",
    unit: m.unit || "",
    stock: m.stock ?? 0,
    price: m.price ?? 0,
    supplier: m.supplier || "",
    lowStockThreshold: m.lowStockThreshold ?? "",
    batches,
    createdAt: isoDate(m.createdAt),
  };
}

function appointmentToRow(a) {
  return {
    patientName: a.patientId?.name || "",
    patientMrn: a.patientId?.mrn || "",
    doctorName: a.doctorId?.name || "",
    type: a.type || "",
    date: a.date || "",
    time: a.time || "",
    tokenNumber: a.tokenNumber ?? "",
    status: a.status || "",
    reason: a.reason || "",
    createdAt: isoDate(a.createdAt),
  };
}

/** Minimal hand-rolled CSV writer - quotes a field only when it needs it, doubling embedded quotes. */
function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (val) => {
    const str = val === null || val === undefined ? "" : String(val);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\r\n");
}

const EXPORTERS = {
  patients: { fetch: fetchPatients, toRow: patientToRow },
  bills: { fetch: fetchBills, toRow: billToRow },
  medicines: { fetch: fetchMedicines, toRow: medicineToRow },
  appointments: { fetch: fetchAppointments, toRow: appointmentToRow },
};

/**
 * Lets a hospital admin pull their own hospital's data out at any time, in a plain portable
 * format (JSON or CSV) - no dependency on staying a CareFlow customer to get their records back.
 */
async function exportData(req, res) {
  try {
    const { type, format = "json" } = req.query;

    if (!type || !EXPORT_TYPES.includes(type)) {
      return res.status(400).json({ message: `type must be one of: ${EXPORT_TYPES.join(", ")}` });
    }
    if (!["json", "csv"].includes(format)) {
      return res.status(400).json({ message: "format must be either json or csv." });
    }
    if (format === "csv" && type === "all") {
      return res.status(400).json({
        message: "CSV export only supports one data type at a time (each has different columns). Use format=json to export everything at once.",
      });
    }

    const today = shortDate(new Date());

    if (type === "all") {
      const [patients, bills, medicines, appointments] = await Promise.all([
        fetchPatients(),
        fetchBills(),
        fetchMedicines(),
        fetchAppointments(),
      ]);

      res.setHeader("Content-Disposition", `attachment; filename="hospital-export-all-${today}.json"`);
      return res.json({
        type: "all",
        format: "json",
        exportedAt: new Date().toISOString(),
        counts: {
          patients: patients.length,
          bills: bills.length,
          medicines: medicines.length,
          appointments: appointments.length,
        },
        patients,
        bills,
        medicines,
        appointments,
      });
    }

    const { fetch, toRow } = EXPORTERS[type];
    const records = await fetch();

    if (format === "csv") {
      const csv = toCsv(records.map(toRow));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${type}-export-${today}.csv"`);
      return res.send(csv);
    }

    res.setHeader("Content-Disposition", `attachment; filename="${type}-export-${today}.json"`);
    res.json({
      type,
      format: "json",
      exportedAt: new Date().toISOString(),
      count: records.length,
      data: records,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while exporting data." });
  }
}

module.exports = { createStaff, listStaff, exportData };
