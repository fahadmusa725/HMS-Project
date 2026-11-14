const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");
const { describeAction, ACTION_LABELS } = require("../utils/auditActions");

const MAX_PAGE_SIZE = 100;

/** "YYYY-MM-DD" -> the UTC instant the hospital's day starts, or null if unparseable. */
function startOfDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "YYYY-MM-DD" -> the instant the hospital's day ends (exclusive upper bound). */
function endOfDay(value) {
  const start = startOfDay(value);
  if (!start) return null;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

async function listAuditLogs(req, res) {
  try {
    const { page = 1, limit = 50, userId, action, from, to } = req.query;

    const pageNumber = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(Math.max(1, Number(limit) || 50), MAX_PAGE_SIZE);
    const filter = {};

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: "Invalid user filter." });
      }
      filter.userId = userId;
    }
    if (action) filter.action = String(action).slice(0, 120);

    // Either bound may be sent on its own. Bounds are optional, so a filter is applied
    // only when the date parses.
    const range = {};
    const fromDate = startOfDay(from);
    const toDate = endOfDay(to);
    if (fromDate) range.$gte = fromDate;
    if (toDate) range.$lt = toDate;
    if (Object.keys(range).length) filter.createdAt = range;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .populate("userId", "name role")
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    const withLabels = logs.map((log) => ({
      id: log._id,
      // Snapshots first: they still name the person after a rename or deletion.
      user: {
        name: log.userName || log.userId?.name || null,
        role: log.userRole || log.userId?.role || null,
      },
      action: log.action || describeAction(log.method, log.path),
      details: log.details || null,
      resourceId: log.resourceId || null,
      patientId: log.patientId || null,
      method: log.method,
      path: log.path,
      statusCode: log.statusCode,
      createdAt: log.createdAt,
    }));

    res.json({ logs: withLabels, total, page: pageNumber, limit: pageSize });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching audit logs." });
  }
}

/**
 * The actions available for the viewer's filter: everything already recorded in this
 * hospital plus the labels the current rules can produce (so a filter exists before the
 * first action of that type has happened).
 */
async function listAuditActions(req, res) {
  try {
    const recorded = await AuditLog.distinct("action");
    const actions = [...new Set([...ACTION_LABELS, ...recorded.filter(Boolean)])].sort((a, b) => a.localeCompare(b));
    res.json(actions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching audit actions." });
  }
}

module.exports = { listAuditLogs, listAuditActions, describeAction };
