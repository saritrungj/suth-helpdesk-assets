const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ======================
// Middleware
// ======================

app.use(helmet());

app.use(cors({
  origin: "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());

// ======================
// Routes
// ======================

const masterDataRoutes = require("./routes/master-data");
const devicesRoutes = require("./routes/devices");
const contractsRoutes = require("./routes/contracts");
const printTransactionsRoutes = require("./routes/print-transactions");
const dashboardRoutes = require("./routes/dashboard");
const expensesRoutes = require("./routes/expenses");
const authRoutes = require("./routes/auth");
const importRoutes = require("./routes/importRoutes");

// Health Check
app.get("/", (req, res) => {
  res.json({
    message: "Hospital IT Asset Management API 🚀",
    version: "1.0.0"
  });
});

// API Routes
app.use("/api", masterDataRoutes);
app.use("/api", importRoutes);
app.use("/api/devices", devicesRoutes);
app.use("/api/contracts", contractsRoutes);
app.use("/api/print-transactions", printTransactionsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/auth", authRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({
    error: `Route ${req.method} ${req.url} not found`
  });
});

// Error
app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    error: err.message || "Internal Server Error"
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});