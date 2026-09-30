const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");
const patientRoutes = require("./routes/patientRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const hospitalAdminRoutes = require("./routes/hospitalAdminRoutes");
const consultationRoutes = require("./routes/consultationRoutes");
const wardRoutes = require("./routes/wardRoutes");
const admissionRoutes = require("./routes/admissionRoutes");
const labRoutes = require("./routes/labRoutes");
const pharmacyRoutes = require("./routes/pharmacyRoutes");
const billingRoutes = require("./routes/billingRoutes");
const reportsRoutes = require("./routes/reportsRoutes");
const auditRoutes = require("./routes/auditRoutes");
const publicRoutes = require("./routes/publicRoutes");
const doctorScheduleRoutes = require("./routes/doctorScheduleRoutes");
const cronRoutes = require("./routes/cronRoutes");

const app = express();

// CLIENT_URL may list several origins separated by commas (e.g. local dev + the Vercel URL).
// Trailing slashes are ignored so "https://x.vercel.app/" and "https://x.vercel.app" both match.
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
    credentials: true,
    // Cross-origin JS can't read Content-Disposition unless it's explicitly exposed - needed so
    // file downloads (data export, token slips) can pick up the server's suggested filename.
    exposedHeaders: ["Content-Disposition"],
  })
);
app.use(express.json());
app.use(cookieParser());

// Ensure DB is connected before handling any request (serverless-safe).
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("[DB] Connection error:", err.message);
    res.status(500).json({ message: "Database connection error." });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/hospital-admin", hospitalAdminRoutes);
app.use("/api/consultations", consultationRoutes);
app.use("/api/wards", wardRoutes);
app.use("/api/admissions", admissionRoutes);
app.use("/api/lab", labRoutes);
app.use("/api/pharmacy", pharmacyRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/doctor-schedules", doctorScheduleRoutes);
app.use("/api/cron", cronRoutes);

// Fallback 404
app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

// Central error handler (catches anything thrown/next(err)'d above)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Server error." });
});

module.exports = app;