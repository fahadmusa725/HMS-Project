const Consultation = require("../models/Consultation");
const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const Hospital = require("../models/Hospital");
const PDFDocument = require("pdfkit");
const { getCurrentHospitalId } = require("../utils/tenantContext");

async function createConsultation(req, res) {
  try {
    const {
      patientId,
      appointmentId,
      vitals,
      symptoms,
      diagnosis,
      notes,
      prescriptions,
      followUpDate,
    } = req.body;

    if (!patientId) {
      return res.status(400).json({ message: "patientId is required." });
    }

    // Confirm the patient exists in this hospital (tenantPlugin makes this automatic).
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found." });
    }

    const consultation = await Consultation.create({
      patientId,
      doctorId: req.user.userId,
      appointmentId,
      vitals,
      symptoms,
      diagnosis,
      notes,
      prescriptions: prescriptions || [],
      followUpDate,
    });

    // If this consultation is tied to an appointment, mark it completed.
    if (appointmentId) {
      await Appointment.findByIdAndUpdate(appointmentId, { status: "completed" });
    }

    res.status(201).json(consultation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while creating consultation." });
  }
}

/** The patient's EMR timeline - every consultation they've ever had, newest first. */
async function getPatientEMR(req, res) {
  try {
    const consultations = await Consultation.find({ patientId: req.params.patientId })
      .sort({ createdAt: -1 })
      .populate("doctorId", "name department");

    res.json(consultations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching EMR." });
  }
}

async function getConsultationById(req, res) {
  try {
    const consultation = await Consultation.findById(req.params.id)
      .populate("doctorId", "name department")
      .populate("patientId", "name mrn");

    if (!consultation) return res.status(404).json({ message: "Consultation not found." });
    res.json(consultation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching consultation." });
  }
}

/** Patient self-service: their own EMR timeline, derived from their linked patient record. */
async function getMyEMR(req, res) {
  try {
    const patient = await Patient.findOne({ userId: req.user.userId });
    if (!patient) return res.status(404).json({ message: "No patient record linked to this account." });

    const consultations = await Consultation.find({ patientId: patient._id })
      .sort({ createdAt: -1 })
      .populate("doctorId", "name department");
    res.json(consultations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching your medical history." });
  }
}

/**
 * Generates a downloadable prescription PDF for a consultation.
 * Staff roles (doctor/nurse/hospital_admin) rely on the normal tenant
 * scoping (they can only ever fetch consultations from their own
 * hospital). For the "patient" role specifically, we ALSO verify the
 * consultation actually belongs to THEIR OWN linked patient record -
 * without this check, a patient could otherwise guess another patient's
 * consultation ID and download their prescription.
 */
async function getPrescriptionPdf(req, res) {
  try {
    const consultation = await Consultation.findById(req.params.id)
      .populate("doctorId", "name department")
      .populate("patientId", "name mrn dob gender phone");

    if (!consultation) return res.status(404).json({ message: "Consultation not found." });

    if (req.user.role === "patient") {
      const myPatient = await Patient.findOne({ userId: req.user.userId });
      if (!myPatient || String(consultation.patientId._id) !== String(myPatient._id)) {
        return res.status(403).json({ message: "You don't have permission to view this prescription." });
      }
    }

    const hospital = await Hospital.findById(getCurrentHospitalId());

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="prescription-${consultation.patientId.mrn}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(18).font("Helvetica-Bold").text(hospital ? hospital.name : "Hospital", { align: "center" });
    doc.fontSize(10).font("Helvetica").fillColor("#555").text("Prescription", { align: "center" });
    doc.moveDown(1.5);
    doc.strokeColor("#0F766E").lineWidth(1.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    // Patient & doctor info
    doc.fillColor("#000").fontSize(11).font("Helvetica-Bold").text("Patient: ", { continued: true });
    doc.font("Helvetica").text(`${consultation.patientId.name} (MRN: ${consultation.patientId.mrn})`);
    if (consultation.patientId.gender || consultation.patientId.dob) {
      doc.font("Helvetica").fontSize(10).fillColor("#555").text(
        [
          consultation.patientId.gender,
          consultation.patientId.dob ? `DOB: ${new Date(consultation.patientId.dob).toDateString()}` : null,
        ].filter(Boolean).join("  ·  ")
      );
    }
    doc.fillColor("#000").fontSize(11).font("Helvetica-Bold").text("Doctor: ", { continued: true });
    doc.font("Helvetica").text(`Dr. ${consultation.doctorId.name}${consultation.doctorId.department ? " — " + consultation.doctorId.department : ""}`);
    doc.font("Helvetica-Bold").text("Date: ", { continued: true });
    doc.font("Helvetica").text(new Date(consultation.createdAt).toDateString());
    doc.moveDown();

    if (consultation.diagnosis) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0F766E").text("Diagnosis");
      doc.fillColor("#000").font("Helvetica").fontSize(11).text(consultation.diagnosis);
      doc.moveDown(0.5);
    }

    if (consultation.symptoms) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0F766E").text("Symptoms");
      doc.fillColor("#000").font("Helvetica").fontSize(11).text(consultation.symptoms);
      doc.moveDown(0.5);
    }

    const v = consultation.vitals || {};
    const vitalsLine = [
      v.bloodPressure && `BP: ${v.bloodPressure}`,
      v.temperature && `Temp: ${v.temperature}`,
      v.pulse && `Pulse: ${v.pulse}`,
      v.weight && `Weight: ${v.weight}`,
      v.height && `Height: ${v.height}`,
    ].filter(Boolean).join("   ");
    if (vitalsLine) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0F766E").text("Vitals");
      doc.fillColor("#000").font("Helvetica").fontSize(11).text(vitalsLine);
      doc.moveDown(0.5);
    }

    if (consultation.prescriptions && consultation.prescriptions.length > 0) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#0F766E").text("Rx — Prescribed Medicines");
      doc.moveDown(0.3);
      consultation.prescriptions.forEach((p, i) => {
        doc.fillColor("#000").font("Helvetica-Bold").fontSize(11).text(`${i + 1}. ${p.medicineName}`);
        const details = [p.dosage, p.frequency, p.duration].filter(Boolean).join("  ·  ");
        if (details) doc.font("Helvetica").fontSize(10).fillColor("#333").text("    " + details);
        if (p.instructions) doc.font("Helvetica-Oblique").fontSize(10).fillColor("#666").text("    " + p.instructions);
        doc.moveDown(0.3);
      });
    }

    if (consultation.notes) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0F766E").text("Clinical Notes");
      doc.fillColor("#000").font("Helvetica").fontSize(11).text(consultation.notes);
    }

    if (consultation.followUpDate) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#B45309").text(`Follow-up: ${consultation.followUpDate}`);
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor("#888").text("This is a computer-generated prescription.", { align: "center" });

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error while generating prescription PDF." });
    }
  }
}

module.exports = { createConsultation, getPatientEMR, getConsultationById, getMyEMR, getPrescriptionPdf };