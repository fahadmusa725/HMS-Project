const Medicine = require("../models/Medicine");
const PharmacySale = require("../models/PharmacySale");
const User = require("../models/User");
const { sendEmail } = require("../utils/mailer");

// --- Inventory management (pharmacist, hospital_admin) ---

async function createMedicine(req, res) {
  try {
    const { name, category, unit, stock, price, expiryDate, supplier, lowStockThreshold } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ message: "name and price are required." });
    }

    const medicine = await Medicine.create({
      name,
      category,
      unit,
      stock: stock || 0,
      price,
      expiryDate,
      supplier,
      lowStockThreshold,
    });

    res.status(201).json(medicine);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while creating medicine." });
  }
}

async function listMedicines(req, res) {
  try {
    const { search, lowStock } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [{ name: { $regex: search, $options: "i" } }, { category: { $regex: search, $options: "i" } }];
    }

    let medicines = await Medicine.find(filter).sort({ name: 1 });

    if (lowStock === "true") {
      medicines = medicines.filter((m) => m.stock <= m.lowStockThreshold);
    }

    res.json(medicines);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing medicines." });
  }
}

async function updateMedicine(req, res) {
  try {
    const updates = (({ name, category, unit, price, expiryDate, supplier, lowStockThreshold }) => ({
      name,
      category,
      unit,
      price,
      expiryDate,
      supplier,
      lowStockThreshold,
    }))(req.body);
    Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);

    const medicine = await Medicine.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!medicine) return res.status(404).json({ message: "Medicine not found." });
    res.json(medicine);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while updating medicine." });
  }
}

/** Restock - adds to existing stock (separate from the general update, since it's a common quick action). */
async function restockMedicine(req, res) {
  try {
    const { quantity } = req.body;
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ message: "quantity must be a positive number." });
    }

    const medicine = await Medicine.findByIdAndUpdate(
      req.params.id,
      { $inc: { stock: quantity } },
      { new: true }
    );
    if (!medicine) return res.status(404).json({ message: "Medicine not found." });
    res.json(medicine);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while restocking medicine." });
  }
}

// --- Dispensing ---

/** Emails every pharmacist + hospital_admin in this hospital about a medicine that just crossed into low stock. */
async function sendLowStockAlert(medicine) {
  try {
    const recipients = await User.find({ role: { $in: ["pharmacist", "hospital_admin"] }, status: "active" });
    if (recipients.length === 0) return;

    const subject = `Low Stock Alert: ${medicine.name}`;
    const html = `
      <p><strong>${medicine.name}</strong> has dropped to <strong>${medicine.stock}</strong> units,
      at or below its threshold of ${medicine.lowStockThreshold}.</p>
      <p>Please restock soon to avoid running out.</p>
    `;

    await Promise.all(recipients.map((u) => sendEmail({ to: u.email, subject, html })));
  } catch (err) {
    // Never let a notification failure break the actual dispense operation.
    console.error("[LowStockAlert] failed:", err.message);
  }
}

/**
 * Dispenses one or more medicines against inventory. Stock deduction is
 * done atomically PER ITEM using a conditional update (stock >= quantity),
 * so two simultaneous dispenses can never oversell the same medicine.
 * If any item can't be fulfilled, everything already deducted in this
 * request is rolled back before responding with an error.
 */
async function dispenseMedicine(req, res) {
  const deductedSoFar = []; // for manual rollback if a later item fails
  const lowStockCrossed = []; // medicines that just crossed into low-stock, to alert about after success

  try {
    const { patientId, consultationId, items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items must be a non-empty array." });
    }

    const saleItems = [];
    let totalAmount = 0;

    for (const { medicineId, quantity } of items) {
      if (!medicineId || !quantity || quantity <= 0) {
        throw { status: 400, message: "Each item needs a valid medicineId and positive quantity." };
      }

      // Atomic conditional decrement: only succeeds if enough stock exists.
      const medicine = await Medicine.findOneAndUpdate(
        { _id: medicineId, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { new: true }
      );

      if (!medicine) {
        throw { status: 409, message: `Insufficient stock for the requested medicine (id: ${medicineId}).` };
      }

      deductedSoFar.push({ medicineId, quantity });
      const subtotal = medicine.price * quantity;
      totalAmount += subtotal;
      saleItems.push({ medicineId, medicineName: medicine.name, quantity, unitPrice: medicine.price, subtotal });

      // preStock = current (post-decrement) stock + the quantity we just removed.
      const preStock = medicine.stock + quantity;
      const justCrossed = preStock > medicine.lowStockThreshold && medicine.stock <= medicine.lowStockThreshold;
      if (justCrossed) lowStockCrossed.push(medicine);
    }

    const sale = await PharmacySale.create({
      patientId,
      consultationId,
      items: saleItems,
      totalAmount,
      dispensedBy: req.user.userId,
    });

    // Fire-and-forget: don't make the dispense wait on email sending.
    lowStockCrossed.forEach((m) => sendLowStockAlert(m));

    res.status(201).json(sale);
  } catch (err) {
    // Roll back any stock already deducted in this request before failing.
    for (const { medicineId, quantity } of deductedSoFar) {
      await Medicine.findByIdAndUpdate(medicineId, { $inc: { stock: quantity } }).catch(() => {});
    }

    if (err && err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error(err);
    res.status(500).json({ message: "Server error while dispensing medicine." });
  }
}

async function listSales(req, res) {
  try {
    const sales = await PharmacySale.find({})
      .sort({ createdAt: -1 })
      .populate("patientId", "name mrn")
      .populate("dispensedBy", "name");
    res.json(sales);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing sales." });
  }
}

module.exports = {
  createMedicine,
  listMedicines,
  updateMedicine,
  restockMedicine,
  dispenseMedicine,
  listSales,
};