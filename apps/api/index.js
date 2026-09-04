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
  methods: [
    "GET",
    "POST",
    "PUT",
    "DELETE",
    "OPTIONS"
  ],
  allowedHeaders: [
    "Content-Type",
    "Authorization"
  ],
  credentials: true
}));

app.use(express.json());



// ======================
// Routes
// ======================

const masterDataRoutes =
  require("./routes/master-data");

const devicesRoutes =
  require("./routes/devices");

const contractsRoutes =
  require("./routes/contracts");

const printTransactionsRoutes =
  require("./routes/print-transactions");

const dashboardRoutes =
  require("./routes/dashboard");

const authRoutes =
  require("./routes/auth");

const importRoutes =
  require("./routes/importRoutes");

const usersRoutes =
  require("./routes/users");


// ⭐ เพิ่มบรรทัดนี้
const expenseRoutes =
  require("./routes/expense");




// ======================
// Health Check
// ======================

app.get("/", (req,res)=>{

  res.json({

    message:
      "Hospital IT Asset Management API 🚀",

    version:
      "1.0.0"

  });

});




// ======================
// API Routes
// ======================

// ⚠️ auth ต้อง mount ก่อน route กว้างๆ อย่าง masterDataRoutes/importRoutes เสมอ
// เพราะ masterDataRoutes มี router.use(authMiddleware) แบบไม่ระบุ path
// ถ้า mount ก่อน มันจะดักทุก request ที่ขึ้นต้นด้วย /api (รวมถึง /api/auth/login)
// แล้วเตะกลับด้วย 401 "No token provided" ก่อนจะไปถึง authRoutes จริงๆ
app.use(
  "/api/auth",
  authRoutes
);


app.use(
  "/api",
  masterDataRoutes
);


app.use(
  "/api",
  importRoutes
);


app.use(
  "/api/devices",
  devicesRoutes
);


app.use(
  "/api/contracts",
  contractsRoutes
);


app.use(
  "/api/print-transactions",
  printTransactionsRoutes
);


app.use(
  "/api/dashboard",
  dashboardRoutes
);


// การป้องกันสิทธิ์ (auth + admin) ทำอยู่ในตัว routes/users.js เองแล้ว (router.use)
app.use(
  "/api/users",
  usersRoutes
);


// ⭐ เพิ่ม Expense Route
app.use(
  "/api/expense",
  expenseRoutes
);




// ======================
// 404
// ======================

app.use((req,res)=>{

  res.status(404).json({

    error:
      `Route ${req.method} ${req.url} not found`

  });

});



// ======================
// Error Handler
// ======================

app.use((err,req,res,next)=>{

  console.error(err);

  res.status(500).json({

    error:
      err.message ||
      "Internal Server Error"

  });

});




// ======================
// Start Server
// ======================

app.listen(PORT,()=>{

  console.log(
    `✅ Server running on http://localhost:${PORT}`
  );

});