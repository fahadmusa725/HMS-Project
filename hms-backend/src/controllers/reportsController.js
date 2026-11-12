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
const { hospitalDate, APP_TIMEZONE } = require("../utils/scheduleSlots");

/**
 * tenantPlugin cannot inject a filter into an aggregation pipeline - it can only
 * refuse a pipeline whose first stage is not a $match on the current hospitalId.
 * Every pipeline in this file therefore starts with an EXPLICIT $match on
 * hospitalId, built from the current tenant context, so a report can never leak
 * another hospital's data. Never remove this $match stage from any pipeline below.
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

/** Day bucket in the hospital timezone, so a late-night bill lands on the same day the staff saw. */
function hospitalDay(field) {
  return { $dateToString: { format: "%Y-%m-%d", date: field, timezone: APP_TIMEZONE } };
}

/**
 * One round trip for the admin dashboard: current totals, 2x-window daily series for
 * trends/sparklines, and the department split for the donut. Every pipeline starts with
 * the tenant $match so nothing can cross hospitals, and each one is served by an
 * existing (hospitalId, date/createdAt) index.
 */
async function getDashboard(req, res) {
  try {
    const match = tenantMatch();
    const windowDays = Math.min(90, Math.max(7, Number(req.query.days) || 30));
    const seriesDays = windowDays * 2;
    const today = hospitalDate(0);
    const seriesStartDate = hospitalDate(-(seriesDays - 1));
    const seriesStart = new Date(`${seriesStartDate}T00:00:00Z`);
    const departmentStartDate = hospitalDate(-(windowDays - 1));

    const [
      totalPatients,
      patientsOverTime,
      appointmentsToday,
      appointmentsOverTime,
      departments,
      currentAdmissions,
      admissionsOverTime,
      billTotals,
      revenueOverTime,
      beds,
    ] = await Promise.all([
      Patient.countDocuments(match),
      Patient.aggregate([
        { $match: { ...match, createdAt: { $gte: seriesStart } } },
        { $group: { _id: hospitalDay("$createdAt"), count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Appointment.countDocuments({ ...match, date: today }),
      Appointment.aggregate([
        { $match: { ...match, date: { $gte: seriesStartDate, $lte: today } } },
        { $group: { _id: "$date", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Appointment.aggregate([
        {
          $match: {
            ...match,
            date: { $gte: departmentStartDate, $lte: today },
            status: { $nin: ["cancelled", "no_show"] },
          },
        },
        { $group: { _id: "$doctorId", count: { $sum: 1 } } },
        { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "doctor" } },
        { $unwind: { path: "$doctor", preserveNullAndEmptyArrays: true } },
        { $group: { _id: { $ifNull: ["$doctor.department", "Unassigned"] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Admission.countDocuments({ ...match, status: "admitted" }),
      Admission.aggregate([
        { $match: { ...match, admitDate: { $gte: seriesStart } } },
        { $group: { _id: hospitalDay("$admitDate"), count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Bill.aggregate([
        { $match: match },
        { $group: { _id: null, invoiced: { $sum: "$totalAmount" }, collected: { $sum: "$amountPaid" } } },
      ]),
      Bill.aggregate([
        { $match: { ...match, createdAt: { $gte: seriesStart } } },
        {
          $group: {
            _id: hospitalDay("$createdAt"),
            invoiced: { $sum: "$totalAmount" },
            collected: { $sum: "$amountPaid" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Bed.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    const totalBeds = beds.reduce((sum, bed) => sum + bed.count, 0);
    const occupiedBeds = beds.find((bed) => bed._id === "occupied")?.count || 0;
    const invoiced = billTotals[0]?.invoiced || 0;
    const collected = billTotals[0]?.collected || 0;

    res.json({
      windowDays,
      today,
      totals: {
        patients: totalPatients,
        appointmentsToday,
        admissions: currentAdmissions,
        invoiced,
        collected,
        outstanding: Math.max(0, invoiced - collected),
        totalBeds,
        occupiedBeds,
        bedOccupancyPercent: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
      },
      departments: departments.map((row) => ({ name: row._id, count: row.count })),
      series: {
        patients: patientsOverTime,
        appointments: appointmentsOverTime,
        admissions: admissionsOverTime,
        revenue: revenueOverTime,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while generating the dashboard summary." });
  }
}


async function getOverview(req, res) {
  try {
    const match = tenantMatch();

    const [revenueAgg, totalPatients, appointmentsToday, beds] = await Promise.all([
      Bill.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
      Patient.countDocuments(match),
      Appointment.countDocuments({ ...match, date: hospitalDate(0) }),
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


async function getFinancialReport(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const match = { ...tenantMatch(), ...dateRangeMatch(startDate, endDate) };

    const [revenueOverTime, revenueByCategory, paymentStatusBreakdown, totals, collectionsByMethod, collectionsBySponsorType] =
      await Promise.all([
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
        Bill.aggregate([
          { $match: match },
          { $unwind: "$payments" },
          { $group: { _id: "$payments.method", total: { $sum: "$payments.amount" }, count: { $sum: 1 } } },
          { $sort: { total: -1 } },
        ]),
        Bill.aggregate([
          { $match: match },
          { $unwind: "$sponsors" },
          {
            $group: {
              _id: "$sponsors.payerType",
              amountOwed: { $sum: "$sponsors.amountOwed" },
              amountPaid: { $sum: "$sponsors.amountPaid" },
            },
          },
          { $sort: { amountOwed: -1 } },
        ]),
      ]);

    const totalInvoiced = totals[0]?.totalInvoiced || 0;
    const totalCollected = totals[0]?.totalCollected || 0;

    res.json({
      revenueOverTime,
      revenueByCategory,
      paymentStatusBreakdown,
      collectionsByMethod,
      collectionsBySponsorType,
      totalInvoiced,
      totalCollected,
      totalOutstanding: Math.max(0, totalInvoiced - totalCollected),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while generating financial report." });
  }
}


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

    const [appointmentsOverTime, appointmentsByStatus, topDoctors, topDiagnoses, newPatientsOverTime, referralSources] =
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
        // Where patients say they heard about the hospital - blank/missing values bucket together
        // as "Not specified" rather than each showing up as their own empty-string group.
        Patient.aggregate([
          { $match: patientMatch },
          {
            $group: {
              _id: {
                $cond: [
                  { $eq: [{ $ifNull: ["$referredBy", ""] }, ""] },
                  "Not specified",
                  "$referredBy",
                ],
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ]),
      ]);

    res.json({ appointmentsOverTime, appointmentsByStatus, topDoctors, topDiagnoses, newPatientsOverTime, referralSources });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while generating clinical report." });
  }
}


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

module.exports = { getOverview, getDashboard, getFinancialReport, getClinicalReport, getOperationsReport };