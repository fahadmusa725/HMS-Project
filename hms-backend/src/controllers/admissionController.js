const Admission = require("../models/Admission");
const Bed = require("../models/Bed");
const Patient = require("../models/Patient");
const User = require("../models/User");
const LabOrder = require("../models/LabOrder");
const PharmacySale = require("../models/PharmacySale");
const Bill = require("../models/Bill");

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hospitals charge per day/night - any partial day counts as a full day, minimum one day. */
function daysStayed(admitDate, endDate = new Date()) {
  return Math.max(1, Math.ceil((endDate - new Date(admitDate)) / DAY_MS));
}

function sumAdvance(admission) {
  return (admission.advancePayments || []).reduce((s, p) => s + p.amount, 0);
}

/**
 * Everything charged to this admission so far: bed charges (days x ward
 * daily rate), plus any lab orders and pharmacy dispenses for this patient
 * during the stay that haven't been billed elsewhere. Works the same
 * whether the patient is still admitted (running total) or being
 * discharged right now (final bill).
 */
async function computeRunningBill(admission) {
  const end = admission.status === "discharged" && admission.dischargeDate ? admission.dischargeDate : new Date();
  const days = daysStayed(admission.admitDate, end);
  const dailyRate = (admission.wardId && admission.wardId.dailyRate) || 0;
  const roomAmount = days * dailyRate;

  const window = { $gte: admission.admitDate, $lte: end };
  const patientId = admission.patientId._id || admission.patientId;

  // `$ne: true` rather than `false` so records created before the `billed` field existed are still picked up.
  const [labOrders, pharmacySales] = await Promise.all([
    LabOrder.find({ patientId, billed: { $ne: true }, status: { $ne: "cancelled" }, createdAt: window }),
    PharmacySale.find({ patientId, billed: { $ne: true }, createdAt: window }),
  ]);

  const labCharges = labOrders.map((o) => ({
    orderId: o._id,
    date: o.createdAt,
    tests: o.tests.map((t) => ({ testName: t.testName, price: t.price })),
    amount: o.tests.reduce((s, t) => s + t.price, 0),
  }));

  const pharmacyCharges = pharmacySales.map((s) => ({
    saleId: s._id,
    date: s.createdAt,
    items: s.items.map((i) => ({ medicineName: i.medicineName, quantity: i.quantity, subtotal: i.subtotal })),
    amount: s.totalAmount,
  }));

  const labTotal = labCharges.reduce((s, c) => s + c.amount, 0);
  const pharmacyTotal = pharmacyCharges.reduce((s, c) => s + c.amount, 0);
  const grandTotal = roomAmount + labTotal + pharmacyTotal;
  const advancePaid = sumAdvance(admission);

  return {
    daysAdmitted: days,
    room: { days, dailyRate, amount: roomAmount },
    labCharges,
    pharmacyCharges,
    totals: { room: roomAmount, lab: labTotal, pharmacy: pharmacyTotal, grandTotal },
    advancePaid,
    // Negative means the patient has overpaid via advance and is owed a refund.
    balanceDue: grandTotal - advancePaid,
    _labOrders: labOrders,
    _pharmacySales: pharmacySales,
  };
}

function stripInternal(bill) {
  const { _labOrders, _pharmacySales, ...clean } = bill;
  return clean;
}

const populateAdmission = (q) =>
  q
    .populate("patientId", "name mrn phone")
    .populate("wardId", "name department dailyRate")
    .populate("bedId", "bedNumber")
    .populate("doctorId", "name");

async function admitPatient(req, res) {
  try {
    const { patientId, wardId, bedId, doctorId, reason } = req.body;

    if (!patientId || !wardId || !bedId || !doctorId) {
      return res.status(400).json({ message: "patientId, wardId, bedId and doctorId are required." });
    }

    const [patient, bed, doctor, existing] = await Promise.all([
      Patient.findById(patientId),
      Bed.findById(bedId),
      User.findOne({ _id: doctorId, role: "doctor" }),
      Admission.findOne({ patientId, status: "admitted" }),
    ]);

    if (!patient) return res.status(404).json({ message: "Patient not found." });
    if (!bed) return res.status(404).json({ message: "Bed not found." });
    if (!doctor) return res.status(404).json({ message: "Doctor not found." });
    if (existing) {
      return res.status(409).json({ message: "This patient is already admitted. Discharge them first." });
    }
    // The bed decides the ward - a mismatched pair would make billing use the wrong ward's rate.
    if (String(bed.wardId) !== String(wardId)) {
      return res.status(400).json({ message: "That bed does not belong to the selected ward." });
    }

    // Claim the bed atomically so two people can never admit different patients into the same bed.
    const claimed = await Bed.findOneAndUpdate({ _id: bedId, status: "vacant" }, { status: "occupied" }, { new: true });
    if (!claimed) {
      return res.status(409).json({ message: `Bed is currently ${bed.status}, not vacant.` });
    }

    let admission;
    try {
      admission = await Admission.create({
        patientId,
        wardId,
        bedId,
        doctorId,
        reason,
        admittedBy: req.user.userId,
      });
    } catch (err) {
      await Bed.findByIdAndUpdate(bedId, { status: "vacant" }); // release the bed if admission failed
      throw err;
    }

    res.status(201).json(admission);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while admitting patient." });
  }
}

/** Collect an advance deposit against an admission (standard at Pakistani hospitals). */
async function addAdvancePayment(req, res) {
  try {
    const { amount, method } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "amount must be a positive number." });
    }

    const admission = await Admission.findById(req.params.id);
    if (!admission) return res.status(404).json({ message: "Admission not found." });
    if (admission.status === "discharged") {
      return res.status(409).json({ message: "This admission is already discharged." });
    }

    admission.advancePayments.push({ amount: Number(amount), method: method || "cash", receivedBy: req.user.userId });
    await admission.save();

    res.status(201).json({ advancePaid: sumAdvance(admission), advancePayments: admission.advancePayments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while recording advance payment." });
  }
}

function admissionSummary(admission) {
  return {
    id: admission._id,
    patient: admission.patientId,
    ward: admission.wardId,
    bed: admission.bedId,
    doctor: admission.doctorId,
    admitDate: admission.admitDate,
    dischargeDate: admission.dischargeDate,
    status: admission.status,
  };
}

/**
 * Live "bill so far" for an admitted patient - viewable any time before
 * discharge. Once discharged, the charges have been marked billed and
 * rolled into the saved final bill, so that bill is returned instead of
 * recomputing (which would no longer see them).
 */
async function getRunningBill(req, res) {
  try {
    const admission = await populateAdmission(Admission.findById(req.params.id));
    if (!admission) return res.status(404).json({ message: "Admission not found." });

    if (admission.status === "discharged") {
      const finalBill = await Bill.findOne({ admissionId: admission._id });
      const advancePaid = sumAdvance(admission);
      const total = finalBill ? finalBill.totalAmount : 0;
      return res.json({
        admission: admissionSummary(admission),
        daysAdmitted: daysStayed(admission.admitDate, admission.dischargeDate || new Date()),
        finalBill,
        advancePaid,
        balanceDue: finalBill ? finalBill.totalAmount - finalBill.amountPaid : 0,
        refundDue: Math.max(0, advancePaid - total),
      });
    }

    const bill = stripInternal(await computeRunningBill(admission));
    res.json({ admission: admissionSummary(admission), ...bill });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while computing the running bill." });
  }
}

async function dischargePatient(req, res) {
  try {
    const { id } = req.params; // admission id
    const { dischargeNotes } = req.body;

    // Flip the status atomically so two simultaneous discharge clicks can never raise two final bills.
    const admission = await populateAdmission(
      Admission.findOneAndUpdate(
        { _id: id, status: "admitted" },
        { $set: { status: "discharged", dischargeDate: new Date(), dischargeNotes } },
        { new: true }
      )
    );
    if (!admission) {
      const exists = await Admission.exists({ _id: id });
      return exists
        ? res.status(409).json({ message: "Patient is already discharged." })
        : res.status(404).json({ message: "Admission not found." });
    }

    // Compute the final charges using the discharge time as the end of the stay.
    const running = await computeRunningBill(admission);

    // Build the final bill's line items.
    const items = [];
    if (running.room.amount > 0) {
      items.push({
        description: `Bed charges - ${admission.wardId.name}, Bed ${admission.bedId.bedNumber} (${running.room.days} day${running.room.days === 1 ? "" : "s"} x Rs. ${running.room.dailyRate.toLocaleString("en-US")}/day)`,
        category: "IPD",
        amount: running.room.amount,
      });
    }
    running.labCharges.forEach((c) =>
      c.tests.forEach((t) => items.push({ description: `Lab: ${t.testName}`, category: "Lab", amount: t.price }))
    );
    running.pharmacyCharges.forEach((c) =>
      c.items.forEach((i) =>
        items.push({ description: `Medicine: ${i.medicineName} x ${i.quantity}`, category: "Pharmacy", amount: i.subtotal })
      )
    );

    await Bed.findByIdAndUpdate(admission.bedId._id || admission.bedId, { status: "vacant" });

    let bill = null;
    let refundDue = 0;
    if (items.length > 0) {
      const total = items.reduce((s, i) => s + i.amount, 0);
      const advance = running.advancePaid;
      const amountPaid = Math.min(advance, total);
      refundDue = Math.max(0, advance - total);
      const lastAdvance = admission.advancePayments[admission.advancePayments.length - 1];

      bill = await Bill.create({
        patientId: admission.patientId._id || admission.patientId,
        admissionId: admission._id,
        items,
        totalAmount: total,
        amountPaid,
        paymentStatus: amountPaid >= total ? "paid" : amountPaid > 0 ? "partial" : "unpaid",
        paymentMethod: lastAdvance ? lastAdvance.method : undefined,
        createdBy: req.user.userId,
      });

      // Mark what we just billed so it can never be charged twice.
      await Promise.all([
        ...running._labOrders.map((o) => LabOrder.findByIdAndUpdate(o._id, { billed: true })),
        ...running._pharmacySales.map((s) => PharmacySale.findByIdAndUpdate(s._id, { billed: true })),
      ]);
    } else {
      refundDue = running.advancePaid;
    }

    // `summary` is the itemized breakdown (room / lab / pharmacy) the UI shows as the final bill.
    res.json({ admission, bill, refundDue, summary: stripInternal(running) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while discharging patient." });
  }
}

/**
 * Admissions list. Default: everyone currently admitted, each with how many
 * days they've been in and the bed charges so far - so "since when" and
 * "how much so far" are visible at a glance. Use ?status=discharged (or
 * all) and/or ?patientId= to look at history.
 */
async function listAdmissions(req, res) {
  try {
    const { status = "admitted", patientId } = req.query;
    const filter = {};
    if (status !== "all") filter.status = status;
    if (patientId) filter.patientId = patientId;

    const admissions = await populateAdmission(Admission.find(filter)).sort({ admitDate: -1 });

    const enriched = admissions.map((a) => {
      const obj = a.toObject();
      const end = a.status === "discharged" && a.dischargeDate ? a.dischargeDate : new Date();
      const days = daysStayed(a.admitDate, end);
      const rate = (a.wardId && a.wardId.dailyRate) || 0;
      obj.daysAdmitted = days;
      obj.roomChargesSoFar = days * rate;
      obj.advancePaid = sumAdvance(a);
      return obj;
    });

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing admissions." });
  }
}

async function getAdmissionById(req, res) {
  try {
    const admission = await populateAdmission(Admission.findById(req.params.id));
    if (!admission) return res.status(404).json({ message: "Admission not found." });

    const obj = admission.toObject();
    const end = admission.status === "discharged" && admission.dischargeDate ? admission.dischargeDate : new Date();
    obj.daysAdmitted = daysStayed(admission.admitDate, end);
    obj.advancePaid = sumAdvance(admission);
    res.json(obj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching admission." });
  }
}

module.exports = {
  admitPatient,
  dischargePatient,
  listAdmissions,
  getAdmissionById,
  getRunningBill,
  addAdvancePayment,
};