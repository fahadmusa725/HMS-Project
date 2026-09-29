const Ward = require("../models/Ward");
const Bed = require("../models/Bed");
const { getCurrentHospitalId } = require("../utils/tenantContext");

async function createWard(req, res) {
  try {
    const { name, department, dailyRate } = req.body;
    if (!name) return res.status(400).json({ message: "Ward name is required." });
    if (dailyRate !== undefined && !(Number(dailyRate) >= 0)) {
      return res.status(400).json({ message: "dailyRate must be zero or a positive number." });
    }

    const ward = await Ward.create({ name, department, dailyRate: Number(dailyRate) || 0, createdBy: req.user.userId });
    res.status(201).json(ward);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while creating ward." });
  }
}

/** Rename a ward, change its department, or change its per-day bed charge. */
async function updateWard(req, res) {
  try {
    const { wardId } = req.params;
    const updates = {};
    if (req.body.name !== undefined) {
      if (!String(req.body.name).trim()) return res.status(400).json({ message: "Ward name cannot be empty." });
      updates.name = req.body.name;
    }
    if (req.body.department !== undefined) updates.department = req.body.department;
    if (req.body.dailyRate !== undefined) {
      if (!(Number(req.body.dailyRate) >= 0)) {
        return res.status(400).json({ message: "dailyRate must be zero or a positive number." });
      }
      updates.dailyRate = Number(req.body.dailyRate);
    }

    const ward = await Ward.findByIdAndUpdate(wardId, updates, { new: true, runValidators: true });
    if (!ward) return res.status(404).json({ message: "Ward not found." });
    res.json(ward);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while updating ward." });
  }
}

async function listWards(req, res) {
  try {
    const wards = await Ward.find({}).sort({ name: 1 });
    res.json(wards);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing wards." });
  }
}

/** Add one or more beds to a ward in one call, e.g. { bedNumbers: ["101","102","103"] } */
async function addBeds(req, res) {
  try {
    const { wardId } = req.params;
    const { bedNumbers } = req.body;

    if (!Array.isArray(bedNumbers) || bedNumbers.length === 0) {
      return res.status(400).json({ message: "bedNumbers must be a non-empty array." });
    }

    const ward = await Ward.findById(wardId);
    if (!ward) return res.status(404).json({ message: "Ward not found." });

    const beds = await Bed.insertMany(
      bedNumbers.map((bedNumber) => ({
        wardId,
        bedNumber: String(bedNumber),
        hospitalId: getCurrentHospitalId(), // explicit, since insertMany's hook behavior is less predictable than save()
      }))
    );

    res.status(201).json(beds);
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ message: "One or more bed numbers already exist in this ward." });
    }
    res.status(500).json({ message: "Server error while adding beds." });
  }
}

/** Live bed status across the hospital, optionally filtered by ward. */
async function listBeds(req, res) {
  try {
    const { wardId, status } = req.query;
    const filter = {};
    if (wardId) filter.wardId = wardId;
    if (status) filter.status = status;

    const beds = await Bed.find(filter).populate("wardId", "name department").sort({ bedNumber: 1 });
    res.json(beds);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing beds." });
  }
}

module.exports = { createWard, updateWard, listWards, addBeds, listBeds };