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

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    credentials: true,
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