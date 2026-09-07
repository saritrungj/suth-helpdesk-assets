// apps/api/index.js
//
// จุดเริ่มของ API — ประกอบชิ้นส่วนเข้าด้วยกันและเปิดรับคำขอ ไม่มีตรรกะธุรกิจในไฟล์นี้
//
// ลำดับของ middleware สำคัญมากและไม่ใช่เรื่องของรสนิยม แต่ละชั้นพึ่งพาผลของชั้น
// ก่อนหน้า — คอมเมนต์กำกับไว้ตรงจุดที่ลำดับมีผลจริง
//
// สิ่งที่เพิ่มจากเดิมและเหตุผล
//
//   - **trust proxy** เมื่อรันหลัง nginx/IIS ทุกคำขอจะมาจาก IP ของ proxy เหมือนกันหมด
//     ทำให้ตัวจำกัดจำนวนครั้งล็อกอิน (rate limit) นับรวมทุกคนเป็นคนเดียว — ผู้ใช้
//     คนหนึ่งพิมพ์รหัสผิดสิบครั้งแล้วทั้งโรงพยาบาลล็อกอินไม่ได้
//   - **บีบอัดคำตอบ** รายงานบางหน้าส่ง JSON หลายร้อยกิโลไบต์ การบีบอัดลดลงเหลือ
//     ประมาณหนึ่งในสิบ ซึ่งเห็นผลชัดบนเครือข่ายภายในโรงพยาบาล
//   - **health check ที่ตรวจฐานข้อมูลจริง** ของเดิมตอบ 200 พร้อมข้อความคงที่เสมอ
//     แม้ฐานข้อมูลจะล่มไปแล้ว — เท่ากับไม่มี health check
//   - **ปิดอย่างสุภาพ (graceful shutdown)** ตอนรีสตาร์ตหรือ deploy คำขอที่กำลัง
//     ทำงานอยู่จะได้ทำจนจบ ไม่ถูกตัดกลางคัน (สำคัญกับการบันทึกยอดพิมพ์แบบ bulk)
//   - **error handler เดียว** ที่แปลงทุก error เป็นรูปแบบเดียวกัน (RFC 9457)
//     และไม่ส่งข้อความของ MySQL ออกไปข้างนอกใน production

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const db = require("./src/shared/db");
const { logger, requestLogger } = require("./src/shared/logger");
const { ApiError, PROBLEM_JSON, notFound, fromDatabaseError } = require("./src/shared/http-error");
const { noStore } = require("./src/shared/cache");

const app = express();
const PORT = Number(process.env.PORT || 3000);

// ============================================================
// ชั้นเครือข่ายและความปลอดภัยพื้นฐาน
// ============================================================

// จำนวนชั้นของ proxy ที่อยู่หน้าเรา — ตั้งผ่าน environment เพราะขึ้นกับวิธี deploy
// ค่า 0 (ค่าเริ่มต้น) = รันตรงๆ ไม่มี proxy ห้ามตั้งเป็น true แบบเหมารวม เพราะจะเชื่อ
// header X-Forwarded-For ที่ใครก็ปลอมได้ แล้วตัวจำกัดจำนวนครั้งจะถูกหลบได้ทันที
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 0));

// ไม่ประกาศว่าเป็น Express — ข้อมูลนี้มีประโยชน์กับคนสแกนหาช่องโหว่เท่านั้น
app.disable("x-powered-by");

app.use(helmet());

// บีบอัดคำตอบที่ใหญ่พอจะคุ้ม — ต่ำกว่านี้ต้นทุนการบีบอัดแพงกว่าที่ประหยัดได้
app.use(compression({ threshold: 1024 }));

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "If-None-Match", "X-Request-Id"],
    // ให้เบราว์เซอร์อ่าน header เหล่านี้จากคำตอบข้ามโดเมนได้ — ปกติ CORS ซ่อนไว้
    // ทั้งหมด ทำให้ฝั่งเว็บอ่านจำนวนรายการทั้งหมด (สำหรับแบ่งหน้า) และ id ของคำขอ
    // (สำหรับแจ้งปัญหา) ไม่ได้เลย
    exposedHeaders: ["X-Total-Count", "X-Request-Id"],
    credentials: true,
    maxAge: 86400,
  })
);

// ล็อกต้องมาก่อน route ทั้งหมด เพื่อให้ทุกคำขอมี id ติดตัวตั้งแต่ต้นทาง
app.use(requestLogger());

app.use(cookieParser());

// จำกัดขนาด body — ค่าเริ่มต้นของ Express คือ 100kb อยู่แล้ว แต่ประกาศไว้ชัดเจน
// เพราะการบันทึกยอดพิมพ์ทีละหลายร้อยเครื่อง (POST /bulk) ส่ง array ที่ใหญ่กว่านั้นได้
app.use(express.json({ limit: "1mb" }));

// ตัวจำกัดจำนวนคำขอระดับทั้งระบบ — กันสคริปต์ที่หลุดวนยิงไม่หยุดจนฐานข้อมูลล้ม
// ตั้งไว้หลวมพอที่ผู้ใช้จริงจะไม่มีทางชน (หน้าเดียวยิงประมาณสิบคำขอ)
app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    max: Number(process.env.RATE_LIMIT_PER_MINUTE || 600),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res
        .status(429)
        .type(PROBLEM_JSON)
        .json({
          type: "about:blank",
          title: "มีคำขอเข้ามาถี่เกินไป",
          status: 429,
          code: "rate_limited",
          detail: "กรุณารอสักครู่แล้วลองใหม่",
        });
    },
  })
);

// ============================================================
// เส้นทาง
//
// ⚠️ auth ต้อง mount ก่อน route กว้างๆ อย่าง master-data/import เสมอ เพราะสอง
// ตัวนั้นมี router.use(requireAuth) แบบไม่ระบุ path — ถ้า mount ก่อน มันจะดัก
// ทุกคำขอที่ขึ้นต้นด้วย /api (รวม /api/auth/login) แล้วเตะกลับด้วย 401 ก่อนจะ
// ไปถึงเส้นทางล็อกอินจริง
// ============================================================

app.use("/api/auth", require("./src/auth/routes"));
app.use("/api/health", require("./src/health/routes"));

app.use("/api", require("./src/master-data/routes"));
app.use("/api", require("./src/import/routes"));

app.use("/api/devices", require("./src/devices/routes"));
app.use("/api/contracts", require("./src/contracts/routes"));
app.use("/api/print-transactions", require("./src/print-usage/routes"));
app.use("/api/dashboard", require("./src/dashboard/routes"));
app.use("/api/users", require("./src/users/routes"));
app.use("/api/expense", require("./src/expense/routes"));

// หน้าแรกของ API — บอกว่าใครพูดอยู่และจะไปดูอะไรต่อได้ที่ไหน
// ไม่ใช่ health check (ของจริงอยู่ที่ /api/health) เพราะไม่ได้ตรวจอะไรเลย
app.get("/", (req, res) => {
  noStore(res);
  res.json({
    name: "SUTH Helpdesk Assets API",
    health: "/api/health",
    docs: "https://github.com/ — ดู docs/reference/api.md ใน repository",
  });
});

// ============================================================
// ไม่พบเส้นทาง
// ============================================================

app.use((req, res, next) => {
  next(notFound("ไม่พบเส้นทางที่เรียก", { detail: `${req.method} ${req.originalUrl}` }));
});

// ============================================================
// ตัวจัดการข้อผิดพลาด — ทางออกทางเดียวของทุก error ในระบบ
//
// สี่บรรทัดของ signature (err, req, res, next) จำเป็นครบทั้งสี่ตัว Express ใช้
// จำนวนพารามิเตอร์ในการแยกว่าอันไหนเป็น error handler — ตัด next ออกแล้วมันจะ
// กลายเป็น middleware ธรรมดาที่ไม่มีวันถูกเรียกตอนเกิด error
// ============================================================

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // error ของ MySQL ที่รู้จัก (ชื่อซ้ำ ลบไม่ได้เพราะมีคนอ้างถึง) แปลงเป็นข้อความ
  // ที่ผู้ใช้อ่านรู้เรื่องที่นี่ที่เดียว แทนที่จะให้ทุก route เขียน if ซ้ำกันเอง
  const problem = err instanceof ApiError ? err : fromDatabaseError(err);

  if (problem) {
    // 4xx ที่คาดไว้แล้วไม่ต้องบันทึก stack — บรรทัดล็อกของคำขอ (requestLogger)
    // บันทึกสถานะและเส้นทางให้แล้ว การเพิ่ม stack ของ "กรอกชื่อซ้ำ" มีแต่ทำให้
    // ล็อกจริงที่ต้องอ่านจมหาย
    if (problem.status >= 500) {
      logger.error(problem.title, { request_id: req.id, code: problem.code, stack: err.stack });
    }

    noStore(res);
    return res.status(problem.status).type(PROBLEM_JSON).json(problem.toProblem());
  }

  // มาถึงตรงนี้ = บั๊กของเรา ไม่ใช่ความผิดของผู้ใช้
  logger.error("ข้อผิดพลาดที่ไม่ได้คาดไว้", {
    request_id: req.id,
    error: err?.message,
    stack: err?.stack,
  });

  noStore(res);
  res
    .status(500)
    .type(PROBLEM_JSON)
    .json({
      type: "about:blank",
      title: "เกิดข้อผิดพลาดในระบบ",
      status: 500,
      code: "internal_error",
      // ข้อความจริงส่งออกไปเฉพาะตอนพัฒนา — ใน production มันบอกชื่อตาราง ชื่อคอลัมน์
      // และโครงสร้างฐานข้อมูลให้คนนอกฟรีๆ id ของคำขอพอให้ผู้ใช้แจ้งแล้วเราไล่ล็อกเจอ
      detail:
        process.env.NODE_ENV === "production"
          ? `กรุณาแจ้งผู้ดูแลระบบพร้อมรหัสอ้างอิง ${req.id}`
          : err?.message,
      request_id: req.id,
    });
});

// ============================================================
// เปิดเซิร์ฟเวอร์
// ============================================================

/**
 * ตรวจว่าต่อฐานข้อมูลได้ก่อนเปิดรับคำขอ
 *
 * ของเดิมเปิดเซิร์ฟเวอร์ทันทีแล้วปล่อยให้การเชื่อมต่อฐานข้อมูลพังเงียบๆ ผลคือ
 * process ขึ้นเป็น "ทำงานอยู่" ในสายตาของระบบ service ทั้งที่ทุกคำขอตอบ 500
 * — ล้มแบบดังๆ ตั้งแต่ตอนบูตชัดเจนกว่าและซ่อมได้เร็วกว่า
 */
async function start() {
  try {
    await db.verifyConnection();
  } catch (err) {
    logger.error("เชื่อมต่อฐานข้อมูลไม่ได้ ไม่เปิดเซิร์ฟเวอร์", { error: err.message });
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`API พร้อมใช้งานที่ http://localhost:${PORT}`, {
      env: process.env.NODE_ENV || "development",
      cors: ALLOWED_ORIGINS.join(","),
    });
  });

  // ปิดอย่างสุภาพ: หยุดรับคำขอใหม่ รอคำขอที่ค้างอยู่จนจบ แล้วค่อยปิด pool
  // ถ้าเกินเวลาที่รอไหวก็ปิดทิ้ง ดีกว่าค้างจนระบบ service ต้อง kill ทิ้งเอง
  const shutdown = (signal) => {
    logger.info(`ได้รับสัญญาณ ${signal} กำลังปิดเซิร์ฟเวอร์`);

    const force = setTimeout(() => {
      logger.warn("คำขอที่ค้างอยู่ใช้เวลานานเกินไป ปิดทันที");
      process.exit(1);
    }, 10_000);
    force.unref();

    server.close(async () => {
      await db.closePool().catch(() => {});
      logger.info("ปิดเรียบร้อย");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // promise ที่ reject โดยไม่มีใครดัก และ exception ที่หลุดออกมาถึงระดับ process
  // แปลว่าสถานะภายในไม่น่าเชื่อถือแล้ว — บันทึกไว้แล้วออก ดีกว่าทำงานต่อแบบครึ่งๆ
  process.on("unhandledRejection", (reason) => {
    logger.error("promise ที่ไม่มีใครดัก", { error: String(reason) });
  });

  process.on("uncaughtException", (err) => {
    logger.error("ข้อผิดพลาดที่หลุดถึงระดับ process", { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

// เปิดเซิร์ฟเวอร์เฉพาะตอนถูกเรียกใช้เป็นโปรแกรมหลัก — ตอนที่ไฟล์ทดสอบ require
// เข้ามาเพื่อทดสอบ app ต้องไม่มีการเปิดพอร์ตจริง
if (require.main === module) {
  start();
}

module.exports = app;
