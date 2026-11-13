const mongoose = require("mongoose");
const Hospital = require("../models/Hospital");
const Patient = require("../models/Patient");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const { getNextSequence } = require("../models/Counter");
const generateToken = require("../utils/generateToken");
const { runWithTenantContext } = require("../utils/tenantContext");
const { sendEmail } = require("../utils/mailer");
const { escapeHtml, generateNumericCode, hashToken, safeCompare } = require("../utils/security");
const { buildMrnPrefix } = require("../utils/mrn");
const { hospitalNow } = require("../utils/scheduleSlots");
const { compareWaitingOrder } = require("../utils/queueOrder");
const doctorName = require("../utils/doctorName");

const MIN_PASSWORD_LENGTH = 8;
const CLAIM_CODE_TTL_MS = 15 * 60 * 1000;

/** Public: list of hospitals a patient can sign up under (active, or on a trial that hasn't ended). */
async function listSignupHospitals(req, res) {
  try {
    const hospitals = await Hospital.find({
      $or: [{ status: "active" }, { status: "trial", trialEndDate: { $gt: new Date() } }],
    })
      .select("name")
      .sort({ name: 1 });
    res.json(hospitals);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing hospitals." });
  }
}

/**
 * Matches a stored phone number or CNIC regardless of how staff typed it
 * ("0300-1234567", "0300 1234567", "+92 300 1234567", "35201-1234567-1").
 * Compares only the digits, ignoring every separator, so normalising BEFORE
 * matching doesn't require rewriting existing records.
 */
function flexibleDigitsRegex(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 7) return null;

  // Drop the country code / trunk prefix; the regex makes them optional anyway.
  const significant = digits.replace(/^92(?=\d{10}$)/, "").replace(/^0/, "");
  if (significant.length < 7) return null;

  const body = significant.split("").join("\\D?");
  return new RegExp(`^(?:\\+?92|0)?${body}$`);
}

/**
 * Public patient self-signup. Runs inside a manually-established tenant
 * context (runWithTenantContext) since there's no logged-in user yet to
 * derive it from a JWT - this is the same pattern used when the Super
 * Admin creates a hospital's first admin account.
 *
 * A matching existing Patient record is NEVER linked automatically: knowing
 * someone's CNIC or phone number is not proof of owning their medical record.
 *   - No matching record: a brand new Patient is created and linked.
 *   - Matching record, no email on file: account is created unlinked; front
 *     desk verifies identity and links it (POST /api/patients/:id/link-account).
 *   - Matching record with an email: a one-time code is emailed to the address
 *     already on that record; the patient links the record by entering it
 *     (POST /api/patients/me/claim). No access before that.
 */
async function patientSignup(req, res) {
  try {
    const { hospitalId, name, phone, cnic, email, password, dob, gender, address } = req.body;

    if (!hospitalId || !name || !email || !password) {
      return res.status(400).json({ message: "hospitalId, name, email and password are required." });
    }
    if (!mongoose.Types.ObjectId.isValid(hospitalId)) {
      return res.status(400).json({ message: "Please select a valid hospital." });
    }
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) return res.status(404).json({ message: "Selected hospital not found." });
    if (hospital.status === "suspended") {
      return res.status(403).json({
        code: "HOSPITAL_SUSPENDED",
        message: "This hospital's account is suspended. Contact the platform administrator.",
      });
    }
    if (hospital.status === "trial" && hospital.trialEndDate && new Date() > hospital.trialEndDate) {
      return res.status(403).json({
        code: "TRIAL_EXPIRED",
        message: "This hospital's free trial has expired. Contact the platform administrator.",
      });
    }

    const result = await runWithTenantContext({ hospitalId }, async () => {
      let patient = null;

      const cnicRegex = flexibleDigitsRegex(cnic);
      if (cnicRegex) {
        patient = await Patient.findOne({ cnic: cnicRegex }).sort({ createdAt: 1 });
      }
      if (!patient) {
        const phoneRegex = flexibleDigitsRegex(phone);
        if (phoneRegex) {
          patient = await Patient.findOne({ phone: phoneRegex }).sort({ createdAt: 1 });
        }
      }

      if (patient && patient.userId) {
        return { conflict: true };
      }

      const user = await User.create({ name, email, password, role: "patient", status: "active" });

      try {
        if (!patient) {
          const seq = await getNextSequence(hospitalId, "patient_mrn");
          const mrn = `${buildMrnPrefix(hospital.name)}-${String(seq).padStart(6, "0")}`;
          patient = await Patient.create({
            mrn,
            name,
            phone,
            cnic,
            email,
            dob,
            gender,
            address,
            userId: user._id,
          });
          return { user, patient, linked: true };
        }

        // Existing clinical record: verify ownership before linking anything.
        if (patient.email) {
          const claimCode = generateNumericCode();
          await User.updateOne(
            { _id: user._id },
            {
              $set: {
                pendingPatientId: patient._id,
                claimCodeHash: hashToken(claimCode),
                claimCodeExpiresAt: new Date(Date.now() + CLAIM_CODE_TTL_MS),
                claimCodeAttempts: 0,
              },
            },
            { skipTenantScope: true }
          );
          return { user, patient, linked: false, verificationRequired: true, claimCode };
        }

        // Record has no email on file - never guess ownership; front desk links it.
        return { user, patient, linked: false, verificationRequired: false };
      } catch (err) {
        // Never leave a login account behind when the Patient write failed.
        await User.deleteOne({ _id: user._id }, { skipTenantScope: true }).catch(() => {});
        throw err;
      }
    });

    if (result.conflict) {
      return res.status(409).json({
        message: "An account already exists for this patient. Please log in instead, or use 'forgot password'.",
      });
    }

    if (result.verificationRequired) {
      await sendEmail({
        to: result.patient.email,
        subject: "Verify your patient record on CareFlow HMS",
        html: `
          <p>Someone signed up for portal access using details that match the patient record held by ${escapeHtml(hospital.name)}.</p>
          <p>If that was you, enter this code in the patient portal to link the record to your new account:</p>
          <p style="font-size: 22px; font-weight: bold; letter-spacing: 4px;">${escapeHtml(result.claimCode)}</p>
          <p>The code expires in 15 minutes. If this wasn't you, ignore this email - nobody gets access to this record without the code.</p>
        `,
      });
    }

    const token = generateToken(result.user);
    res.status(201).json({
      token,
      user: {
        id: result.user._id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        hospitalId,
        hospitalName: hospital.name,
        mustChangePassword: false,
      },
      recordLinked: result.linked,
      verificationRequired: Boolean(result.verificationRequired),
      message: result.verificationRequired
        ? "Account created. Enter the verification code emailed to the address on your hospital record to link it."
        : result.linked
          ? "Account created."
          : "Account created. Your front desk will link your existing hospital record after verifying your identity.",
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }
    console.error(err);
    res.status(500).json({ message: "Server error during signup." });
  }
}

/**
 * Public landing-page lead capture. No paid CRM/form service - this just emails the request to
 * whoever LEAD_NOTIFICATION_EMAIL is set to, using the same mailer every other notification in
 * this app goes through. If that address isn't configured, sendEmail() safely no-ops (logs
 * instead of throwing), so a request is never lost silently without at least appearing in logs.
 */
async function requestDemo(req, res) {
  try {
    const { name, hospitalName, email, phone, message } = req.body;

    if (!name || !hospitalName || !email) {
      return res.status(400).json({ message: "name, hospitalName and email are required." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    const recipient = process.env.LEAD_NOTIFICATION_EMAIL;
    if (!recipient) {
      console.error("[DemoRequest] LEAD_NOTIFICATION_EMAIL is not set - request logged here instead:", {
        name,
        hospitalName,
        email,
        phone,
        message,
      });
      return res.status(201).json({ message: "Request received." });
    }

    await sendEmail({
      to: recipient,
      subject: `New demo request: ${hospitalName}`,
      html: `
        <h2>New CareFlow HMS demo request</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Hospital:</strong> ${escapeHtml(hospitalName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone || "Not provided")}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message || "(none)").replace(/\n/g, "<br/>")}</p>
      `,
    });

    res.status(201).json({ message: "Request received. We'll be in touch soon." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while sending your request." });
  }
}

/** How many upcoming token numbers the waiting-room TV shows per doctor. */
const DISPLAY_NEXT_COUNT = 5;

/**
 * Public waiting-room TV feed - no login. The URL the hospital hands out on the TV
 * carries a per-hospital display key; it is compared in constant time against the
 * stored key (both are hashed first, so the comparison is always equal-length and
 * can't leak the key's length or prefix). The key is every bit as sensitive as a
 * password on a link, which is why rotating it instantly kills old screens.
 *
 * Returns only what a screen needs: the hospital's display name, and per doctor the
 * token currently being served plus the next few checked-in token numbers, in the
 * same call order used everywhere else (utils/queueOrder.js). Never patient names,
 * MRNs or priority labels. Read-only - the no-show sweep deliberately does not run
 * here, and a short cache header keeps a wall of screens from hammering the API.
 */
async function getDisplayQueue(req, res) {
  try {
    const { hospitalId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(hospitalId)) {
      return res.status(404).json({ message: "Display not found." });
    }

    const hospital = await Hospital.findById(hospitalId).select("name status settings").lean();
    if (!hospital) return res.status(404).json({ message: "Display not found." });
    if (hospital.status === "suspended") {
      return res.status(403).json({ message: "This hospital's display is unavailable." });
    }

    const storedKey = hospital.settings && hospital.settings.displayKey;
    const providedKey = String(req.query.key || "");
    if (!storedKey || !providedKey || !safeCompare(hashToken(providedKey), hashToken(storedKey))) {
      return res.status(403).json({
        message: "This display link is not valid. Ask the hospital administrator for a new link.",
      });
    }

    const date = hospitalNow().date;
    const rows = await runWithTenantContext({ hospitalId: hospital._id }, () =>
      Appointment.find({ date, status: { $in: ["scheduled", "checked_in", "in_consultation"] } })
        .select("doctorId tokenNumber status checkedInAt createdAt")
        .populate("doctorId", "name department")
        .lean()
    );

    // One column per doctor. Scheduled (not yet arrived) patients create the column but
    // are not part of the waiting list - only checked-in patients are actually queued.
    const byDoctor = new Map();
    for (const row of rows) {
      if (!row.doctorId) continue;
      const id = String(row.doctorId._id);
      if (!byDoctor.has(id)) {
        byDoctor.set(id, {
          id,
          name: doctorName(row.doctorId.name),
          department: row.doctorId.department || null,
          nowServing: null,
          waiting: [],
        });
      }

      const entry = byDoctor.get(id);
      if (row.status === "in_consultation") entry.nowServing = row.tokenNumber;
      else if (row.status === "checked_in") entry.waiting.push(row);
    }

    const doctors = [...byDoctor.values()]
      .map(({ waiting, ...entry }) => ({
        ...entry,
        nextTokens: waiting
          .sort(compareWaitingOrder)
          .slice(0, DISPLAY_NEXT_COUNT)
          .map((row) => row.tokenNumber),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Screens poll every 10s; a 5s shared cache keeps them fresh while absorbing the
    // burst when a whole waiting room refreshes at once.
    res.setHeader("Cache-Control", "public, max-age=5");
    res.json({
      hospital: {
        id: String(hospital._id),
        name: (hospital.settings && hospital.settings.displayName) || hospital.name,
      },
      date,
      updatedAt: new Date().toISOString(),
      doctors,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while loading the display." });
  }
}

module.exports = { listSignupHospitals, patientSignup, requestDemo, getDisplayQueue };
