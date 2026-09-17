const Hospital = require("../models/Hospital");
const User = require("../models/User");
const Patient = require("../models/Patient");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const Ward = require("../models/Ward");
const Bed = require("../models/Bed");
const Admission = require("../models/Admission");
const NurseNote = require("../models/NurseNote");
const { Counter } = require("../models/Counter");
const { runWithTenantContext } = require("../utils/tenantContext");
const { checkTrialsEndingSoon } = require("../jobs/trialReminderJob");

/**
 * Create a new hospital (tenant) + its first Hospital Admin account.
 * trialDays is fully flexible - the Super Admin decides per hospital:
 * 7, 14, 30, or any custom number. Pass trialDays: 0 to skip trial
 * and activate immediately (e.g. for a hospital that already paid).
 */
async function createHospital(req, res) {
  try {
    const { hospitalName, adminName, adminEmail, adminPassword, trialDays } = req.body;

    if (!hospitalName || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({
        message: "hospitalName, adminName, adminEmail and adminPassword are required.",
      });
    }

    const days = Number.isFinite(trialDays) ? trialDays : 14; // sensible default, fully overridable
    const now = new Date();
    const trialEndDate = days > 0 ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000) : null;

    const hospital = await Hospital.create({
      name: hospitalName,
      status: days > 0 ? "trial" : "active",
      trialStartDate: days > 0 ? now : undefined,
      trialEndDate,
      createdBy: req.user.userId,
    });

    // Creating the Hospital Admin is itself a write to a tenant-scoped
    // model (User), so it must happen inside that hospital's tenant
    // context even though the Super Admin's own request has no
    // hospitalId of their own.
    const admin = await runWithTenantContext(
      { hospitalId: hospital._id.toString() },
      () =>
        User.create({
          name: adminName,
          email: adminEmail,
          password: adminPassword,
          role: "hospital_admin",
          status: "active",
          hospitalId: hospital._id,
        })
    );

    res.status(201).json({
      hospital,
      admin: { id: admin._id, name: admin.name, email: admin.email },
    });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ message: "That admin email is already in use." });
    }
    res.status(500).json({ message: "Server error while creating hospital." });
  }
}

/** List all hospitals - deliberately cross-tenant, Super-Admin-only endpoint. */
async function listHospitals(req, res) {
  try {
    const hospitals = await Hospital.find({}).sort({ createdAt: -1 });

    // Auto-flag expired trials on read (lightweight; a cron job can
    // do this proactively too, see Progress.md Phase 4).
    const withComputedStatus = hospitals.map((h) => {
      const obj = h.toObject();
      obj.trialExpired = h.isTrialExpired();
      return obj;
    });

    res.json(withComputedStatus);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing hospitals." });
  }
}

/** Activate, suspend, or extend/change a hospital's trial. */
async function updateHospitalStatus(req, res) {
  try {
    const { hospitalId } = req.params;
    const { status, trialDays } = req.body; // status: "trial" | "active" | "suspended"

    const update = {};
    if (status) update.status = status;

    if (status === "trial" && Number.isFinite(trialDays)) {
      const now = new Date();
      update.trialStartDate = now;
      update.trialEndDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    }

    const hospital = await Hospital.findByIdAndUpdate(hospitalId, update, { new: true });

    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found." });
    }

    res.json(hospital);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while updating hospital." });
  }
}

/**
 * Permanently deletes a hospital AND every piece of data belonging to it
 * (staff, patients, appointments, consultations, wards, beds, admissions,
 * nurse notes, counters). This is a genuine cross-tenant admin operation,
 * so tenant scoping is explicitly bypassed (skipTenantScope) and the
 * target hospitalId is supplied directly in each filter - nothing is left
 * orphaned behind after a delete.
 */
async function deleteHospital(req, res) {
  try {
    const { hospitalId } = req.params;

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found." });
    }

    const filter = { hospitalId };
    const opts = { skipTenantScope: true };

    await Promise.all([
      User.deleteMany(filter).setOptions(opts),
      Patient.deleteMany(filter).setOptions(opts),
      Appointment.deleteMany(filter).setOptions(opts),
      Consultation.deleteMany(filter).setOptions(opts),
      Ward.deleteMany(filter).setOptions(opts),
      Bed.deleteMany(filter).setOptions(opts),
      Admission.deleteMany(filter).setOptions(opts),
      NurseNote.deleteMany(filter).setOptions(opts),
      Counter.deleteMany({ hospitalId }), // not tenant-plugin-scoped, plain filter
    ]);

    await Hospital.findByIdAndDelete(hospitalId);

    res.json({ message: `"${hospital.name}" and all its data have been permanently deleted.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while deleting hospital." });
  }
}

/** Manually trigger the trial-ending check (normally runs on a daily cron) - useful for testing. */
async function triggerTrialCheck(req, res) {
  try {
    const result = await checkTrialsEndingSoon();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while checking trials." });
  }
}

module.exports = { createHospital, listHospitals, updateHospitalStatus, deleteHospital, triggerTrialCheck };