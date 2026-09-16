const mongoose = require("mongoose");
const Bill = require("../models/Bill");
const Patient = require("../models/Patient");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const LabOrder = require("../models/LabOrder");
const PharmacySale = require("../models/PharmacySale");
const Medicine = require("../models/Medicine");
const Bed = require("../models/Bed");
const Admission = require("../models/Admission");
const User = require("../models/User");
const { getCurrentHospitalId } = require("../utils/tenantContext");

/**
 * CRITICAL: Mongoose's tenantPlugin hooks into Query middleware (find,
 * findOne, etc.) - it does NOT hook into .aggregate(), which uses a
 * completely different code path. Every aggregation pipeline in this file
 * therefore starts with an EXPLICIT $match on hospitalId, built from the
 * current tenant context, so a report can never silently leak another
 * hospital's data. Never remove this $match stage from any pipeline below.
 */
function tenantMatch() {
  const hospitalId = getCurrentHospitalId();
  if (!hospitalId) {
    throw new Error("Tenant context missing - refusing to run an unscoped report aggregation.");
  }
  return { hospitalId: new mongoose.Types.ObjectId(hospitalId) };
}

function dateRangeMatch(startDate, endDate, field = "createdAt") {
  const match = {};
  if (startDate || endDate) {
    match[field] = {};
    if (startDate) match[field].$gte = new Date(startDate);
    if (endDate) match[field].$lte = new Date(`${endDate}T23:59:59.999Z`);
  }
  return match;
}

// ---------------- OVERVIEW ----------------

async function getOverview(req, res) {
  try {
    const match = tenantMatch();

    const [revenueAgg, totalPatients, appointmentsToday, beds] = await Promise.all([
      Bill.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
      Patient.countDocuments(match),
      Appointment.countDocuments({ ...match, date: new Date().toISOString().slice(0, 10) }),
      Bed.find(match),
    ]);

    const totalRevenue = revenueAgg[0]?.total || 0;
    const totalBeds = beds.length;
    const occupiedBeds = beds.filter((b) => b.status === "occupied").length;
    const bedOccupancyPercent = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    res.json({ totalRevenue, totalPatients, appointmentsToday, bedOccupancyPercent, totalBeds, occupiedBeds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while generating overview report." });
  }
}

// ---------------- FINANCIAL ----------------

async function getFinancialReport(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const match = { ...tenantMatch(), ...dateRangeMatch(startDate, endDate) };

    const [revenueOverTime, revenueByCategory, paymentStatusBreakdown, totals] = await Promise.all([
      Bill.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            invoiced: { $sum: "$totalAmount" },
            collected: { $sum: "$amountPaid" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Bill.aggregate([
        { $match: match },
        { $unwind: "$items" },
        { $group: { _id: "$items.category", total: { $sum: "$items.amount" } } },
        { $sort: { total: -1 } },
      ]),
      Bill.aggregate([
        { $match: match },
        { $group: { _id: "$paymentStatus", count: { $sum: 1 }, total: { $sum: "$totalAmount" } } },
      ]),
      Bill.aggregate([
        {
          $match: match,
        },
        {
          $group: {
            _id: null,
            totalInvoiced: { $sum: "$totalAmount" },
            totalCollected: { $sum: "$amountPaid" },
          },
        },
      ]),
    ]);

    const totalInvoiced = totals[0]?.totalInvoiced || 0;
    const totalCollected = totals[0]?.totalCollected || 0;

    res.json({
      revenueOverTime,
      revenueByCategory,
      paymentStatusBreakdown,
      totalInvoiced,
      totalCollected,
      totalOutstanding: Math.max(0, totalInvoiced - totalCollected),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while generating financial report." });
  }
}

// ---------------- CLINICAL ----------------

async function getClinicalReport(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const match = tenantMatch();
    // Appointment.date is stored as a "YYYY-MM-DD" string, so range-filter it as strings.
    const apptDateMatch = {};
    if (startDate) apptDateMatch.$gte = startDate;
    if (endDate) apptDateMatch.$lte = endDate;
    const apptMatch = { ...match, ...(startDate || endDate ? { date: apptDateMatch } : {}) };

    const consultMatch = { ...match, ...dateRangeMatch(startDate, endDate) };
    const patientMatch = { ...match, ...dateRangeMatch(startDate, endDate) };

    const [appointmentsOverTime, appointmentsByStatus, topDoctors, topDiagnoses, newPatientsOverTime] =
      await Promise.all([
        Appointment.aggregate([
          { $match: apptMatch },
          { $group: { _id: "$date", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        Appointment.aggregate([{ $match: apptMatch }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
        Appointment.aggregate([
          { $match: apptMatch },
          { $group: { _id: "$doctorId", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
          { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "doctor" } },
          { $unwind: "$doctor" },
          { $project: { count: 1, name: "$doctor.name" } },
        ]),
        Consultation.aggregate([
          { $match: consultMatch },
          { $match: { diagnosis: { $ne: null, $ne: "" } } },
          { $group: { _id: { $toLower: "$diagnosis" }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        Patient.aggregate([
          { $match: patientMatch },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

    res.json({ appointmentsOverTime, appointmentsByStatus, topDoctors, topDiagnoses, newPatientsOverTime });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while generating clinical report." });
  }
}

// ---------------- OPERATIONS (Lab + Pharmacy + IPD + Staff) ----------------

async function getOperationsReport(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const match = tenantMatch();
    const rangedMatch = { ...match, ...dateRangeMatch(startDate, endDate) };

    const [
      labOrdersByStatus,
      topLabTests,
      labRevenueAgg,
      pharmacyRevenueOverTime,
      topMedicines,
      lowStockCount,
      bedsByWard,
      admissionsOverTime,
      lengthOfStayAgg,
      staffByRole,
    ] = await Promise.all([
      LabOrder.aggregate([{ $match: rangedMatch }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      LabOrder.aggregate([
        { $match: rangedMatch },
        { $unwind: "$tests" },
        { $group: { _id: "$tests.testName", count: { $sum: 1 }, revenue: { $sum: "$tests.price" } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      LabOrder.aggregate([
        { $match: rangedMatch },
        { $unwind: "$tests" },
        { $group: { _id: null, total: { $sum: "$tests.price" } } },
      ]),
      PharmacySale.aggregate([
        { $match: rangedMatch },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            total: { $sum: "$totalAmount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      PharmacySale.aggregate([
        { $match: rangedMatch },
        { $unwind: "$items" },
        { $group: { _id: "$items.medicineName", quantity: { $sum: "$items.quantity" } } },
        { $sort: { quantity: -1 } },
        { $limit: 5 },
      ]),
      Medicine.countDocuments({ ...match, $expr: { $lte: ["$stock", "$lowStockThreshold"] } }),
      Bed.aggregate([
        { $match: match },
        { $group: { _id: { wardId: "$wardId", status: "$status" }, count: { $sum: 1 } } },
        { $lookup: { from: "wards", localField: "_id.wardId", foreignField: "_id", as: "ward" } },
        { $unwind: "$ward" },
        { $project: { wardName: "$ward.name", status: "$_id.status", count: 1, _id: 0 } },
      ]),
      Admission.aggregate([
        { $match: { ...match, ...dateRangeMatch(startDate, endDate, "admitDate") } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$admitDate" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Admission.aggregate([
        { $match: { ...match, status: "discharged", dischargeDate: { $ne: null } } },
        {
          $project: {
            stayDays: {
              $divide: [{ $subtract: ["$dischargeDate", "$admitDate"] }, 1000 * 60 * 60 * 24],
            },
          },
        },
        { $group: { _id: null, avgStay: { $avg: "$stayDays" } } },
      ]),
      User.aggregate([
        { $match: { ...match, role: { $ne: "patient" } } },
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      lab: {
        ordersByStatus: labOrdersByStatus,
        topTests: topLabTests,
        totalRevenue: labRevenueAgg[0]?.total || 0,
      },
      pharmacy: {
        revenueOverTime: pharmacyRevenueOverTime,
        topMedicines,
        lowStockCount,
      },
      ipd: {
        bedsByWard,
        admissionsOverTime,
        avgLengthOfStayDays: Math.round((lengthOfStayAgg[0]?.avgStay || 0) * 10) / 10,
      },
      staff: {
        countByRole: staffByRole,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while generating operations report." });
  }
}

module.exports = { getOverview, getFinancialReport, getClinicalReport, getOperationsReport };