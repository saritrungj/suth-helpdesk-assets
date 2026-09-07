// apps/api/src/shared/logger.js
//
// ล็อกแบบมีโครงสร้าง — หนึ่งเหตุการณ์ต่อหนึ่งบรรทัด JSON
//
// ปัญหาเดิม: ทั้งระบบใช้ console.error("Stats Error:", err.message) กระจายอยู่
// สามสิบกว่าที่ ผลคือเวลาเกิดปัญหาจริงบนเครื่องที่ติดตั้งใช้งาน เรามีแค่ข้อความ
// สั้นๆ ที่ไม่บอกว่า
//
//   - request ไหน (ไม่มี id ให้ไล่ตาม พอผู้ใช้แจ้งว่า "กดแล้วขึ้น error" เราหา
//     บรรทัดที่ตรงกับเหตุการณ์นั้นไม่เจอ เพราะมีล็อกจากคนอื่นปนอยู่)
//   - ใครเป็นคนเรียก
//   - ช้าแค่ไหน (ไม่มีเวลาที่ใช้ไปเลย — จึงไม่มีทางรู้ว่า endpoint ไหนเป็นคอขวด)
//
// ทำไมไม่ใช้ pino/winston: ที่โรงพยาบาลนี้ล็อกถูกอ่านด้วยตาจากหน้าจอ terminal
// หรือไฟล์ที่ระบบ service เก็บให้ ไม่มี log aggregator ที่ต้องต่อ transport
// ประโยชน์ที่เหลือของไลบรารีเหล่านั้นคือความเร็วตอนเขียนล็อกจำนวนมหาศาล ซึ่ง
// ไม่ใช่สถานการณ์ของระบบที่มีผู้ใช้ระดับสิบคน — จึงเลือกไม่เพิ่ม dependency
// ที่ต้องดูแลต่อ แลกกับโค้ดหกสิบบรรทัดที่อ่านจบได้ในครั้งเดียว

const { randomUUID } = require("node:crypto");

/**
 * โหมดอ่านง่าย (development) เขียนสีและข้อความสั้น ส่วนโหมด production เขียน JSON
 * บรรทัดเดียวเพื่อให้เครื่องมืออ่านต่อได้ — เปิด/ปิดด้วย LOG_FORMAT
 */
const isJson = (process.env.LOG_FORMAT || (process.env.NODE_ENV === "production" ? "json" : "pretty")) === "json";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const COLOR = { debug: "\x1b[90m", info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m", reset: "\x1b[0m" };

function write(level, message, fields = {}) {
  if (LEVELS[level] < threshold) return;

  const stream = level === "error" ? process.stderr : process.stdout;

  if (isJson) {
    stream.write(`${JSON.stringify({ time: new Date().toISOString(), level, message, ...fields })}\n`);
    return;
  }

  const time = new Date().toLocaleTimeString("en-GB");
  const extra = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ");

  stream.write(`${COLOR[level]}${time} ${level.toUpperCase().padEnd(5)}${COLOR.reset} ${message}${extra ? ` ${extra}` : ""}\n`);
}

const logger = {
  debug: (message, fields) => write("debug", message, fields),
  info: (message, fields) => write("info", message, fields),
  warn: (message, fields) => write("warn", message, fields),
  error: (message, fields) => write("error", message, fields),
};

/**
 * ติด id ให้ทุก request แล้วบันทึกหนึ่งบรรทัดตอนที่ตอบกลับเสร็จ
 *
 * id ถูกส่งกลับไปใน header `x-request-id` ด้วย เพื่อให้เวลาผู้ใช้แจ้งปัญหาพร้อม
 * ภาพหน้าจอ (หรือฝั่งเว็บแนบ id มาในข้อความ error) เราไล่หาบรรทัดในล็อกได้ตรงตัว
 * ไม่ต้องเดาจากเวลาโดยประมาณ
 *
 * บันทึกตอน "finish" ไม่ใช่ตอนเริ่ม เพราะบรรทัดเดียวที่มีทั้งผลลัพธ์และเวลาที่ใช้
 * มีประโยชน์กว่าสองบรรทัดที่ต้องเอามาจับคู่กันเอง
 */
function requestLogger() {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();

    // ถ้ามี reverse proxy ใส่ id มาให้แล้วก็ใช้ตัวนั้นต่อ เพื่อให้ไล่ข้ามชั้นได้
    req.id = req.headers["x-request-id"] || randomUUID();
    res.setHeader("x-request-id", req.id);

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

      write(level, `${req.method} ${req.originalUrl}`, {
        request_id: req.id,
        status: res.statusCode,
        duration_ms: Math.round(durationMs * 10) / 10,
        // ผู้ใช้ที่ยิง request นี้ — มีค่าเฉพาะหลังผ่าน require-auth แล้ว
        // บันทึกเฉพาะ username ไม่บันทึก token หรือเนื้อหา body ที่อาจมีรหัสผ่าน
        user: req.user?.username,
      });
    });

    next();
  };
}

module.exports = { logger, requestLogger };
