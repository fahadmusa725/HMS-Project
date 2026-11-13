const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");

const validateEnv = require("./config/env");
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
const preCheckRoutes = require("./routes/preCheckRoutes");
const publicRoutes = require("./routes/publicRoutes");
const doctorScheduleRoutes = require("./routes/doctorScheduleRoutes");
const cronRoutes = require("./routes/cronRoutes");

// Refuse to boot with a missing MONGO_URI/JWT_SECRET/CLIENT_URL or a weak
// JWT_SECRET, instead of failing confusingly on the first request.
validateEnv();

const app = express();

// The API only ever returns JSON/files, so helmet's default CSP is pointless
// here (and we don't want to advertise one); the remaining defaults - nosniff,
// HSTS, no-referrer, frameguard - are correct for this app and cost nothing.
app.use(helmet({ contentSecurityPolicy: false }));

// CLIENT_URL may list several origins separated by commas (e.g. local dev + the Vercel URL).
// Trailing slashes are ignored so "https://x.vercel.app/" and "https://x.vercel.app" both match.
// Required above, and there is deliberately NO "*" fallback - an unlisted origin simply gets
// no CORS headers and the browser blocks it.
const allowedOrigins = process.env.CLIENT_URL.split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
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
app.use("/api/pre-checks", preCheckRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/doctor-schedules", doctorScheduleRoutes);
app.use("/api/cron", cronRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  // Never hand out internal error text (stack-adjacent driver/mongoose messages)
  // for server errors in production - only 4xx messages are meant for clients.
  const message = status >= 500 && process.env.NODE_ENV === "production" ? "Server error." : err.message || "Server error.";
  res.status(status).json({ message });
});

module.exports = app;
