const AuditLog = require("../models/AuditLog");

/** Turns "POST /api/patients" into "Registered a patient", etc. Falls back to raw method+path. */
function describeAction(method, path) {
  const rules = [
    [/^POST \/api\/patients$/, "Registered a patient"],
    [/^PATCH \/api\/patients\/[^/]+$/, "Updated a patient record"],
    [/^POST \/api\/appointments$/, "Booked an appointment"],
    [/^PATCH \/api\/appointments\/[^/]+\/status$/, "Updated appointment status"],
    [/^POST \/api\/consultations$/, "Recorded a consultation"],
    [/^POST \/api\/admissions$/, "Admitted a patient"],
    [/^PATCH \/api\/admissions\/[^/]+\/discharge$/, "Discharged a patient"],
    [/^POST \/api\/admissions\/[^/]+\/notes$/, "Added a nursing note"],
    [/^POST \/api\/wards$/, "Created a ward"],
    [/^POST \/api\/wards\/[^/]+\/beds$/, "Added beds to a ward"],
    [/^POST \/api\/lab\/tests$/, "Added a lab test to the catalog"],
    [/^POST \/api\/lab\/orders$/, "Ordered a lab test"],
    [/^PATCH \/api\/lab\/orders\/[^/]+\/status$/, "Updated a lab order status"],
    [/^PATCH \/api\/lab\/orders\/[^/]+\/result$/, "Added a lab result"],
    [/^POST \/api\/pharmacy\/medicines$/, "Added medicine to inventory"],
    [/^PATCH \/api\/pharmacy\/medicines\/[^/]+\/restock$/, "Restocked a medicine"],
    [/^PATCH \/api\/pharmacy\/medicines\/[^/]+$/, "Updated a medicine"],
    [/^POST \/api\/pharmacy\/dispense$/, "Dispensed medicine"],
    [/^POST \/api\/billing$/, "Created a bill"],
    [/^PATCH \/api\/billing\/[^/]+\/payment$/, "Recorded a payment"],
    [/^POST \/api\/hospital-admin\/staff$/, "Invited a staff member"],
  ];

  const key = `${method} ${path}`;
  const match = rules.find(([pattern]) => pattern.test(key));
  return match ? match[1] : key;
}

async function listAuditLogs(req, res) {
  try {
    const { page = 1, limit = 50, userId } = req.query;
    const filter = {};
    if (userId) filter.userId = userId;

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .populate("userId", "name role");

    const total = await AuditLog.countDocuments(filter);

    const withLabels = logs.map((log) => ({
      id: log._id,
      user: log.userId ? { name: log.userId.name, role: log.userId.role } : null,
      action: describeAction(log.method, log.path),
      method: log.method,
      path: log.path,
      statusCode: log.statusCode,
      createdAt: log.createdAt,
    }));

    res.json({ logs: withLabels, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching audit logs." });
  }
}

module.exports = { listAuditLogs };