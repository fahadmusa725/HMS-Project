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


const EXPORT_TYPES = ["patients", "bills", "medicines", "appointments", "all"];

// Vercel Functions cap a response body at 4.5MB regardless of plan - a hospital with years of
// history could otherwise generate an export that blows through that and fails with a 413. This
// caps each collection well under that ceiling; narrowing by date (below) is the way to get the
// rest. Bills/appointments carry more text per row (populated names, flattened line items) than
// patients/medicines, hence the lower cap.
const EXPORT_LIMITS = { patients: 8000, medicines: 8000, bills: 4000, appointments: 4000 };

const isoDate = (d) => (d ? new Date(d).toISOString() : "");
const shortDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

function createdAtRange(startDate, endDate) {
  if (!startDate && !endDate) return {};
  const range = {};
  if (startDate) range.$gte = new Date(startDate);
  if (endDate) range.$lte = new Date(`${endDate}T23:59:59.999Z`);
  return { createdAt: range };
}

/** Plain finds here are auto-scoped to the caller's hospitalId by tenantPlugin. */
async function fetchPatients(dateFilter) {
  return Patient.find(dateFilter).sort({ createdAt: -1 }).limit(EXPORT_LIMITS.patients).lean();
}

async function fetchBills(dateFilter) {
  return Bill.find(dateFilter).sort({ createdAt: -1 }).limit(EXPORT_LIMITS.bills).populate("patientId", "name mrn").lean();
}

async function fetchMedicines(dateFilter) {
  return Medicine.find(dateFilter).sort({ name: 1 }).limit(EXPORT_LIMITS.medicines).lean();
}

async function fetchAppointments(dateFilter) {
  return Appointment.find(dateFilter)
    .sort({ date: -1, tokenNumber: 1 })
    .limit(EXPORT_LIMITS.appointments)
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
    const { type, format = "json", startDate, endDate } = req.query;

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
    const dateFilter = createdAtRange(startDate, endDate);
    // Lets the admin know a cap kicked in, so "my export looks incomplete" has an obvious answer:
    // narrow it with startDate/endDate instead of silently handing back a partial file.
    const truncatedNote = (type) =>
      `Showing the most recent ${EXPORT_LIMITS[type].toLocaleString()} records to keep the file a reasonable size. Pass startDate/endDate to narrow the range and get the rest.`;

    if (type === "all") {
      const [patients, bills, medicines, appointments] = await Promise.all([
        fetchPatients(dateFilter),
        fetchBills(dateFilter),
        fetchMedicines(dateFilter),
        fetchAppointments(dateFilter),
      ]);

      const truncated = {
        patients: patients.length >= EXPORT_LIMITS.patients,
        bills: bills.length >= EXPORT_LIMITS.bills,
        medicines: medicines.length >= EXPORT_LIMITS.medicines,
        appointments: appointments.length >= EXPORT_LIMITS.appointments,
      };

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
        truncated: Object.values(truncated).some(Boolean) ? truncated : undefined,
        patients,
        bills,
        medicines,
        appointments,
      });
    }

    const { fetch, toRow } = EXPORTERS[type];
    const records = await fetch(dateFilter);
    const truncated = records.length >= EXPORT_LIMITS[type];

    if (format === "csv") {
      const csv = toCsv(records.map(toRow));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${type}-export-${today}.csv"`);
      if (truncated) res.setHeader("X-Export-Truncated", "true");
      return res.send(csv);
    }

    res.setHeader("Content-Disposition", `attachment; filename="${type}-export-${today}.json"`);
    res.json({
      type,
      format: "json",
      exportedAt: new Date().toISOString(),
      count: records.length,
      truncated: truncated || undefined,
      note: truncated ? truncatedNote(type) : undefined,
      data: records,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while exporting data." });
  }
}

module.exports = { createStaff, listStaff, exportData };
