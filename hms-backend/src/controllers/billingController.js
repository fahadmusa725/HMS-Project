const Bill = require("../models/Bill");
const Patient = require("../models/Patient");
const LabOrder = require("../models/LabOrder");
const PharmacySale = require("../models/PharmacySale");
const { REFERENCE_REQUIRED_METHODS, recalcBillTotals } = require("../utils/billTotals");

async function createBill(req, res) {
  try {
    const { patientId, items, paymentMethod, amountPaid, referenceNumber, sponsors, labOrderId, pharmacySaleId, admissionId } =
      req.body;

    if (!patientId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "patientId and a non-empty items array are required." });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ message: "Patient not found." });

    const totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const paid = Number(amountPaid || 0);

    if (paid > 0 && REFERENCE_REQUIRED_METHODS.includes(paymentMethod) && !referenceNumber) {
      return res.status(400).json({ message: "A reference/transaction number is required for this payment method." });
    }

    const payments = [];
    if (paid > 0) {
      payments.push({ method: paymentMethod || "cash", amount: paid, referenceNumber, paidBy: req.user.userId });
    }

    const bill = new Bill({
      patientId,
      items,
      totalAmount,
      payments,
      sponsors: Array.isArray(sponsors) ? sponsors : [],
      paymentMethod,
      labOrderId,
      pharmacySaleId,
      admissionId,
      createdBy: req.user.userId,
    });
    recalcBillTotals(bill);
    await bill.save();

    // Charged here, so an IPD discharge bill must not pick these up again.
    await Promise.all([
      labOrderId && LabOrder.findByIdAndUpdate(labOrderId, { billed: true }),
      pharmacySaleId && PharmacySale.findByIdAndUpdate(pharmacySaleId, { billed: true }),
    ]);

    res.status(201).json(bill);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while creating bill." });
  }
}

async function listBills(req, res) {
  try {
    const { paymentStatus } = req.query;
    const filter = {};
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    const bills = await Bill.find(filter).sort({ createdAt: -1 }).populate("patientId", "name mrn phone");
    res.json(bills);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing bills." });
  }
}

async function getPatientBills(req, res) {
  try {
    const bills = await Bill.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
    res.json(bills);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching patient bills." });
  }
}

/** Record a payment (full or partial, optionally against a specific sponsor) against an existing bill. */
async function recordPayment(req, res) {
  try {
    const { amount, paymentMethod, referenceNumber, sponsorIndex } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "amount must be a positive number." });
    }
    if (REFERENCE_REQUIRED_METHODS.includes(paymentMethod) && !referenceNumber) {
      return res.status(400).json({ message: "A reference/transaction number is required for this payment method." });
    }

    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: "Bill not found." });

    const remaining = bill.totalAmount - bill.amountPaid;
    if (Number(amount) > remaining) {
      return res.status(400).json({ message: `Amount exceeds the remaining balance of ${remaining}.` });
    }

    bill.payments.push({
      method: paymentMethod || "cash",
      amount: Number(amount),
      referenceNumber,
      paidBy: req.user.userId,
    });
    bill.paymentMethod = paymentMethod || bill.paymentMethod;

    if (sponsorIndex !== undefined && bill.sponsors[sponsorIndex]) {
      bill.sponsors[sponsorIndex].amountPaid += Number(amount);
    }

    recalcBillTotals(bill);

    await bill.save();
    res.json(bill);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while recording payment." });
  }
}

/** Patient self-service: their own billing history, derived from their linked patient record. */
async function getMyBills(req, res) {
  try {
    const patient = await Patient.findOne({ userId: req.user.userId });
    if (!patient) return res.status(404).json({ message: "No patient record linked to this account." });

    const bills = await Bill.find({ patientId: patient._id }).sort({ createdAt: -1 });
    res.json(bills);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching your bills." });
  }
}

module.exports = { createBill, listBills, getPatientBills, recordPayment, getMyBills };
