const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;


// ======================
// Middleware
// ======================

app.use(helmet());

// origin ที่อนุญาตมาจาก environment ไม่ใช่ค่าคงที่ในโค้ด — คั่นหลายค่าด้วย comma ได้
// เดิม hardcode เป็น localhost:5173 ทำให้ deploy จริงแล้วเว็บเรียก API ไม่ได้
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: ALLOWED_ORIGINS,
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

// อ่าน cookie ที่เก็บ token ของ session (ดู src/auth/session-cookie.js)
app.use(cookieParser());

app.use(express.json());



// ======================
// Routes
// ======================

const masterDataRoutes =
  require("./src/master-data/routes");

const devicesRoutes =
  require("./src/devices/routes");

const contractsRoutes =
  require("./src/contracts/routes");

const printTransactionsRoutes =
  require("./src/print-usage/routes");

const dashboardRoutes =
  require("./src/dashboard/routes");

const authRoutes =
  require("./src/auth/routes");

const importRoutes =
  require("./src/import/routes");

const usersRoutes =
  require("./src/users/routes");


// ⭐ เพิ่มบรรทัดนี้
const expenseRoutes =
  require("./src/expense/routes");




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