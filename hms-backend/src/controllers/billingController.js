const Bill = require("../models/Bill");
const Patient = require("../models/Patient");

async function createBill(req, res) {
  try {
    const { patientId, items, paymentMethod, amountPaid, labOrderId, pharmacySaleId, admissionId } = req.body;

    if (!patientId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "patientId and a non-empty items array are required." });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ message: "Patient not found." });

    const totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const paid = Number(amountPaid || 0);

    let paymentStatus = "unpaid";
    if (paid >= totalAmount && totalAmount > 0) paymentStatus = "paid";
    else if (paid > 0) paymentStatus = "partial";

    const bill = await Bill.create({
      patientId,
      items,
      totalAmount,
      amountPaid: paid,
      paymentStatus,
      paymentMethod,
      labOrderId,
      pharmacySaleId,
      admissionId,
      createdBy: req.user.userId,
    });

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

/** Record a payment (full or partial) against an existing bill. */
async function recordPayment(req, res) {
  try {
    const { amount, paymentMethod } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "amount must be a positive number." });
    }

    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: "Bill not found." });

    bill.amountPaid += Number(amount);
    if (paymentMethod) bill.paymentMethod = paymentMethod;

    if (bill.amountPaid >= bill.totalAmount) {
      bill.paymentStatus = "paid";
    } else if (bill.amountPaid > 0) {
      bill.paymentStatus = "partial";
    }

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