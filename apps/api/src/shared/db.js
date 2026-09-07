// apps/api/src/shared/db.js
//
// การเชื่อมต่อฐานข้อมูล MySQL — pool เดียวใช้ร่วมทั้งระบบ
//
// สิ่งที่แก้จากเดิม
//
//   1. **ตอนต่อฐานข้อมูลไม่ได้ ระบบเคยเปิดขึ้นมาเฉยๆ** — โค้ดเดิมเรียก
//      getConnection() แล้ว .catch(console.error) ทำให้เซิร์ฟเวอร์บูตขึ้นมาปกติ
//      พร้อมข้อความสีแดงหนึ่งบรรทัดที่ไม่มีใครเห็น แล้วทุกคำขอจากผู้ใช้จะพังทีละอัน
//      ตอนนี้ตรวจการเชื่อมต่อผ่าน verifyConnection() ที่ index.js เรียกก่อนเปิดรับ
//      คำขอ — ต่อไม่ได้ = ไม่เปิดเลย ดีกว่าเปิดแล้วพังทุกคำขอ
//
//   2. **ไม่มีการปิด pool ตอนปิดโปรแกรม** — ทำให้ตอน deploy/รีสตาร์ต คำสั่งที่ค้าง
//      อยู่ถูกตัดกลางคัน แทนที่จะรอให้จบก่อน ดู closePool()
//
//   3. **ไม่มี timeout** — คำขอที่ค้างจะกิน connection ใน pool ไปเรื่อยๆ จนเต็ม
//      แล้วทั้งระบบค้างตามกันหมด
//
// เก็บ credentials ไว้ใน environment variables เท่านั้น (ดู AGENTS.md) — ค่า
// เริ่มต้นในไฟล์นี้มีไว้ให้เครื่องพัฒนาเริ่มได้เร็ว ไม่ใช่ค่าที่ใช้จริง

const mysql = require("mysql2/promise");
const { logger } = require("./logger");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "test",

  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,

  // รอ connection ใหม่ไม่เกิน 10 วินาที — ถ้าฐานข้อมูลไม่ตอบ ควรตอบผู้ใช้ว่าผิดพลาด
  // ไปเลย ดีกว่าปล่อยให้หน้าหมุนค้างจนผู้ใช้กดซ้ำแล้วยิ่งทำให้ pool เต็มเร็วขึ้น
  connectTimeout: 10_000,

  // คืนค่า DECIMAL เป็น string ไม่ใช่ number — จำนวนเงินในระบบนี้คิดเป็นจำนวนเต็ม
  // สตางค์เสมอ (ดู packages/domain/money.cjs) การให้ driver แปลงเป็น float ให้ก่อน
  // เท่ากับทำให้เสียความละเอียดตั้งแต่ก่อนที่โค้ดของเราจะได้เห็นค่า
  decimalNumbers: false,

  // ชื่อวันที่กลับมาเป็น string "YYYY-MM-DD" ตรงๆ ไม่ใช่ Date object ที่ผูกกับ
  // timezone ของเครื่อง — device_location_history.effective_from ถูกเทียบระดับ
  // "เดือน" เสมอ การแปลงเป็น Date แล้วส่ง JSON ทำให้เลื่อนไปหนึ่งวันบนเครื่องที่
  // ตั้ง timezone ต่างกัน
  dateStrings: true,
});

/**
 * ตรวจว่าต่อฐานข้อมูลได้จริงก่อนเปิดรับคำขอ
 *
 * @returns {Promise<void>} throw ถ้าต่อไม่ได้ — ตั้งใจให้ index.js จับแล้วปิดโปรแกรม
 */
async function verifyConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.query("SELECT 1");
    logger.info("เชื่อมต่อฐานข้อมูลสำเร็จ", {
      host: process.env.DB_HOST || "localhost",
      database: process.env.DB_NAME || "test",
    });
  } finally {
    connection.release();
  }
}

/**
 * ตรวจสุขภาพแบบเบา ใช้กับ /api/health — ไม่ throw แต่คืนผลว่าได้หรือไม่ได้
 * เพื่อให้ health check ตอบ 503 พร้อมเหตุผล แทนที่จะพังเป็น 500
 *
 * @returns {Promise<{ ok: boolean, latency_ms?: number, error?: string }>}
 */
async function ping() {
  const startedAt = process.hrtime.bigint();
  try {
    await pool.query("SELECT 1");
    return { ok: true, latency_ms: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e5) / 10 };
  } catch (err) {
    return { ok: false, error: err.code || err.message };
  }
}

/**
 * ปิด pool ตอนปิดโปรแกรม — รอให้คำสั่งที่กำลังทำงานอยู่จบก่อน
 * @returns {Promise<void>}
 */
async function closePool() {
  await pool.end();
  logger.info("ปิดการเชื่อมต่อฐานข้อมูลแล้ว");
}

/**
 * ทำงานหลายคำสั่งใน transaction เดียว แล้วคืน connection ให้ pool เสมอ
 *
 * ปัญหาเดิม: ทุกที่ที่ใช้ transaction เขียน getConnection / beginTransaction /
 * commit / rollback / release เองครบห้าบรรทัด และมีอย่างน้อยหนึ่งที่ที่เรียก
 * rollback() ใน catch ทั้งที่ error เกิดตั้งแต่ตอน validate ก่อน beginTransaction
 * (ซึ่ง rollback บน connection ที่ยังไม่เปิด transaction ทำให้เกิด error ซ้อนอีกตัว
 * บังคับให้ข้อความจริงหายไป) — ห่อไว้ที่เดียวแล้วเรียกใช้แทน
 *
 * @template T
 * @param {(connection: import("mysql2/promise").PoolConnection) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function withTransaction(work) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (err) {
    // rollback เองก็พังได้ (เช่นการเชื่อมต่อขาดไปแล้ว) — ถ้าปล่อยให้ throw ทับ
    // error ตัวจริงจะหาย เราสนใจสาเหตุแรกเสมอ
    await connection.rollback().catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
}

// ส่งออกตัว pool เองเป็นค่าหลัก เพื่อให้ทุกไฟล์เรียก db.query() ได้เหมือนเดิม
// แล้วแปะฟังก์ชันช่วยเพิ่มเข้าไปบนนั้น
//
// ⚠️ ห้ามแปะชื่อที่ mysql2 ใช้อยู่แล้ว — เคยแปะ `pool` (ชี้กลับมาที่ตัวเอง) ทับ
// คุณสมบัติภายในของ mysql2 ที่ชื่อเดียวกัน ทำให้ pool.end() พังทันทีด้วยข้อความที่
// ไม่เกี่ยวกับสาเหตุเลย ("Cannot read properties of undefined (reading
// 'connectionConfig')") ถ้าจะเพิ่มชื่อใหม่ ให้ตรวจก่อนว่ายังไม่มีใน pool
module.exports = pool;
module.exports.verifyConnection = verifyConnection;
module.exports.ping = ping;
module.exports.closePool = closePool;
module.exports.withTransaction = withTransaction;
