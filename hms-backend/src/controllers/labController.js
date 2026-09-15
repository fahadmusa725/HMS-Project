const LabTest = require("../models/LabTest");
const LabOrder = require("../models/LabOrder");
const Patient = require("../models/Patient");

// --- Catalog management (hospital_admin) ---

async function createLabTest(req, res) {
  try {
    const { name, department, price, turnaroundTime } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ message: "name and price are required." });
    }
    const test = await LabTest.create({ name, department, price, turnaroundTime });
    res.status(201).json(test);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while creating lab test." });
  }
}

async function listLabTests(req, res) {
  try {
    const tests = await LabTest.find({}).sort({ name: 1 });
    res.json(tests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing lab tests." });
  }
}

// --- Orders ---

async function createLabOrder(req, res) {
  try {
    const { patientId, testIds, consultationId } = req.body;

    if (!patientId || !Array.isArray(testIds) || testIds.length === 0) {
      return res.status(400).json({ message: "patientId and a non-empty testIds array are required." });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ message: "Patient not found." });

    const testDocs = await LabTest.find({ _id: { $in: testIds } });
    if (testDocs.length !== testIds.length) {
      return res.status(400).json({ message: "One or more selected tests were not found." });
    }

    const tests = testDocs.map((t) => ({ testId: t._id, testName: t.name, price: t.price }));

    const order = await LabOrder.create({
      patientId,
      doctorId: req.user.userId,
      consultationId,
      tests,
      orderedBy: req.user.userId,
    });

    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while creating lab order." });
  }
}

/** Live lab worklist - filterable by status, e.g. ?status=ordered */
async function listLabOrders(req, res) {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const orders = await LabOrder.find(filter)
      .sort({ createdAt: -1 })
      .populate("patientId", "name mrn phone")
      .populate("doctorId", "name");

    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing lab orders." });
  }
}

async function updateLabOrderStatus(req, res) {
  try {
    const { status } = req.body;
    const allowed = ["ordered", "sample_collected", "in_progress", "completed", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${allowed.join(", ")}` });
    }

    const update = { status };
    if (status === "completed") {
      update.completedBy = req.user.userId;
      update.completedAt = new Date();
    }

    const order = await LabOrder.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!order) return res.status(404).json({ message: "Lab order not found." });
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while updating lab order." });
  }
}

/** Attach results (notes and/or a report file URL) to an order. */
async function addLabResult(req, res) {
  try {
    const { resultNotes, resultFileUrl } = req.body;

    const order = await LabOrder.findByIdAndUpdate(
      req.params.id,
      {
        resultNotes,
        resultFileUrl,
        status: "completed",
        completedBy: req.user.userId,
        completedAt: new Date(),
      },
      { new: true }
    );

    if (!order) return res.status(404).json({ message: "Lab order not found." });
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while adding lab result." });
  }
}

async function getPatientLabOrders(req, res) {
  try {
    const orders = await LabOrder.find({ patientId: req.params.patientId })
      .sort({ createdAt: -1 })
      .populate("doctorId", "name");
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching patient lab orders." });
  }
}

module.exports = {
  createLabTest,
  listLabTests,
  createLabOrder,
  listLabOrders,
  updateLabOrderStatus,
  addLabResult,
  getPatientLabOrders,
};