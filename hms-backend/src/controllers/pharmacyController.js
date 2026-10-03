const Medicine = require("../models/Medicine");
const PharmacySale = require("../models/PharmacySale");
const User = require("../models/User");
const { sendEmail } = require("../utils/mailer");

// How many times deductFefo() will re-read and re-plan a dispense if a concurrent request
// touched the exact same batch(es) between the read and the atomic write.
const MAX_FEFO_RETRIES = 3;

// Batches expiring within this many days trigger the near-expiry email, same idea as
// lowStockThreshold but as a fixed constant rather than a per-medicine setting, to keep it simple.
const NEAR_EXPIRY_DAYS = 30;
// Don't re-email about the same medicine more than once a day even if the queue is hit constantly.
const NEAR_EXPIRY_ALERT_COOLDOWN_HOURS = 24;


async function createMedicine(req, res) {
  try {
    const { name, category, unit, price, supplier, lowStockThreshold, batch } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ message: "name and price are required." });
    }

    const batches = [];
    if (batch && Number(batch.quantity) > 0) {
      if (!batch.expiryDate) {
        return res.status(400).json({ message: "An initial batch needs an expiryDate." });
      }
      batches.push({
        batchNumber: batch.batchNumber,
        quantity: Number(batch.quantity),
        expiryDate: batch.expiryDate,
        purchasePrice: batch.purchasePrice,
        supplier: batch.supplier,
        receivedDate: batch.receivedDate || new Date(),
      });
    }
    const stock = batches.reduce((sum, b) => sum + b.quantity, 0);

    const medicine = await Medicine.create({
      name,
      category,
      unit,
      batches,
      stock,
      price,
      supplier,
      lowStockThreshold,
    });

    res.status(201).json(medicine);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while creating medicine." });
  }
}

/** Emails pharmacists + hospital_admin about any medicine with batches expiring soon. Lazy -
 *  runs whenever the medicine list is fetched instead of on a cron job, with a cooldown per
 *  medicine so it doesn't re-send on every single page load. */
async function checkNearExpiryAlerts() {
  try {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + NEAR_EXPIRY_DAYS);
    const cooldownCutoff = new Date(now.getTime() - NEAR_EXPIRY_ALERT_COOLDOWN_HOURS * 60 * 60 * 1000);

    const candidates = await Medicine.find({
      batches: { $elemMatch: { expiryDate: { $gte: now, $lte: cutoff }, quantity: { $gt: 0 } } },
      $or: [{ nearExpiryAlertedAt: { $exists: false } }, { nearExpiryAlertedAt: { $lt: cooldownCutoff } }],
    });
    if (candidates.length === 0) return;

    const recipients = await User.find({ role: { $in: ["pharmacist", "hospital_admin"] }, status: "active" });
    if (recipients.length === 0) return;

    for (const medicine of candidates) {
      const expiringBatches = medicine.batches.filter(
        (b) => b.quantity > 0 && b.expiryDate >= now && b.expiryDate <= cutoff
      );
      if (expiringBatches.length === 0) continue;

      const rows = expiringBatches
        .map((b) => `<li>${b.batchNumber || "Unlabeled batch"} - ${b.quantity} units, expires ${b.expiryDate.toDateString()}</li>`)
        .join("");
      const subject = `Near-Expiry Alert: ${medicine.name}`;
      const html = `
        <p><strong>${medicine.name}</strong> has batches expiring within ${NEAR_EXPIRY_DAYS} days:</p>
        <ul>${rows}</ul>
        <p>Please prioritize dispensing these batches or arrange a return.</p>
      `;

      await Promise.all(recipients.map((u) => sendEmail({ to: u.email, subject, html })));
      medicine.nearExpiryAlertedAt = now;
      await medicine.save();
    }
  } catch (err) {
    // Never let a notification failure break the actual request that triggered this check.
    console.error("[NearExpiryAlert] failed:", err.message);
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

    // Fire-and-forget: don't make the list view wait on the expiry sweep or its emails.
    checkNearExpiryAlerts();

    res.json(medicines);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing medicines." });
  }
}

async function updateMedicine(req, res) {
  try {
    const updates = (({ name, category, unit, price, supplier, lowStockThreshold }) => ({
      name,
      category,
      unit,
      price,
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

/** Adds a new batch (a fresh consignment) rather than just bumping a flat stock number. */
async function restockMedicine(req, res) {
  try {
    const { batchNumber, quantity, expiryDate, purchasePrice, supplier, receivedDate } = req.body;
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ message: "quantity must be a positive number." });
    }
    if (!expiryDate) {
      return res.status(400).json({ message: "expiryDate is required for a new batch." });
    }

    const medicine = await Medicine.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          batches: {
            batchNumber,
            quantity: Number(quantity),
            expiryDate,
            purchasePrice,
            supplier,
            receivedDate: receivedDate || new Date(),
          },
        },
        $inc: { stock: Number(quantity) },
      },
      { new: true }
    );
    if (!medicine) return res.status(404).json({ message: "Medicine not found." });
    res.json(medicine);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while adding batch." });
  }
}


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

/** Greedily allocates `quantity` across batches ordered by nearest expiry first (FEFO). Returns
 *  the allocation plan and whether the batches on hand could actually cover the full amount. */
function planFefoAllocation(batches, quantity) {
  const sorted = batches
    .filter((b) => b.quantity > 0)
    .slice()
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

  const plan = [];
  let remaining = quantity;
  for (const b of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, b.quantity);
    plan.push({ batchId: b._id, batchNumber: b.batchNumber, quantity: take });
    remaining -= take;
  }
  return { plan, fulfilled: remaining <= 0 };
}

/**
 * Deducts `quantity` of one medicine using FEFO, atomically. A batch's own quantity is only
 * decremented via a conditional $inc guarded by that batch's _id AND its current quantity
 * (arrayFilters), alongside the same top-level `stock >= quantity` guard the old single-field
 * version used - so two simultaneous dispenses can never oversell a batch or the medicine
 * overall. If a concurrent request touched one of the planned batches in between our read and
 * this write, the conditional update simply won't match and we re-read + re-plan + retry.
 */
async function deductFefo(medicineId, quantity) {
  for (let attempt = 0; attempt < MAX_FEFO_RETRIES; attempt++) {
    const snapshot = await Medicine.findById(medicineId).select("name price lowStockThreshold stock batches");
    if (!snapshot) return { medicine: null, plan: [], insufficient: false };
    if (snapshot.stock < quantity) return { medicine: null, plan: [], insufficient: true };

    const { plan, fulfilled } = planFefoAllocation(snapshot.batches, quantity);
    if (!fulfilled || plan.length === 0) return { medicine: null, plan: [], insufficient: true };

    const arrayFilters = [];
    const inc = { stock: -quantity };
    plan.forEach((p, i) => {
      arrayFilters.push({ [`b${i}._id`]: p.batchId, [`b${i}.quantity`]: { $gte: p.quantity } });
      inc[`batches.$[b${i}].quantity`] = -p.quantity;
    });

    const updated = await Medicine.findOneAndUpdate(
      { _id: medicineId, stock: { $gte: quantity } },
      { $inc: inc },
      { new: true, arrayFilters }
    );

    if (updated) return { medicine: updated, plan, insufficient: false };
    // One of the planned batches changed underneath us - loop around and replan from fresh data.
  }
  return { medicine: null, plan: [], insufficient: true };
}

/** Reverses a deductFefo() allocation - used to roll back already-dispensed items in this same
 *  request when a later line item in the same dispense can't be fulfilled. */
async function rollbackFefo(medicineId, plan, quantity) {
  if (plan.length === 0) return;
  const arrayFilters = plan.map((p, i) => ({ [`b${i}._id`]: p.batchId }));
  const inc = { stock: quantity };
  plan.forEach((p, i) => {
    inc[`batches.$[b${i}].quantity`] = p.quantity;
  });
  await Medicine.findByIdAndUpdate(medicineId, { $inc: inc }, { arrayFilters }).catch(() => {});
}

/**
 * Dispenses one or more medicines against inventory, deducting from the nearest-to-expire batch
 * first (splitting across batches when needed). Each item's deduction is atomic per the
 * deductFefo() guarantee above. If any item can't be fulfilled, everything already deducted in
 * this request is rolled back before responding with an error.
 */
async function dispenseMedicine(req, res) {
  const deductedSoFar = []; // [{ medicineId, quantity, plan }] for manual rollback if a later item fails
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

      const { medicine, plan, insufficient } = await deductFefo(medicineId, quantity);
      if (!medicine) {
        if (insufficient) {
          throw { status: 409, message: `Insufficient stock for the requested medicine (id: ${medicineId}).` };
        }
        throw { status: 404, message: `Medicine not found (id: ${medicineId}).` };
      }

      deductedSoFar.push({ medicineId, quantity, plan });
      const subtotal = medicine.price * quantity;
      totalAmount += subtotal;
      saleItems.push({
        medicineId,
        medicineName: medicine.name,
        quantity,
        unitPrice: medicine.price,
        subtotal,
        batchesUsed: plan.map((p) => ({ batchNumber: p.batchNumber, quantity: p.quantity })),
      });

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
    for (const { medicineId, quantity, plan } of deductedSoFar) {
      await rollbackFefo(medicineId, plan, quantity);
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
