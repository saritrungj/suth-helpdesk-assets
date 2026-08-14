const express = require("express");
const router = express.Router();

const db = require("../db");
const authMiddleware = require("../middlewares/authMiddleware");
const staffMiddleware = require("../middlewares/staffMiddleware");

// ต้อง login ก่อนถึงจะบันทึก/ดูยอดพิมพ์ได้ (เดิมไม่มีการป้องกันเลย)
router.use(authMiddleware);

// ============================================================
// เดือนต้องเก็บเป็นรูปแบบ "YYYY-MM" เสมอ (เติม 0 หน้าเดือนหลักเดียว)
// เดิมไม่มีการตรวจสอบเลย ถ้ามีการยิง API เข้ามาตรงๆ ด้วยค่าเช่น
// "2026-7" (ไม่เติม 0) มันจะถูกมองว่าเป็นคนละเดือนกับ "2026-07"
// ทำให้ dropdown เดือนที่หน้า "บันทึกยอดพิมพ์รายเดือน" ขึ้นซ้ำ/ผิดตำแหน่ง
// และเวลา filter ข้อมูลด้วย month ที่ format ไม่ตรงกัน ก็จะหาไม่เจอ
// (เดือนที่มีข้อมูลจริงกลับโชว์ว่างเปล่า)
function normalizeMonth(value) {
  if (typeof value !== "string") return null;

  const match = value.trim().match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;

  const [, year, monthNum] = match;
  const m = Number(monthNum);
  if (m < 1 || m > 12) return null;

  return `${year}-${String(m).padStart(2, "0")}`;
}

// ============================================================
// GET /api/print-transactions
// รายการยอดพิมพ์ทั้งหมด (รองรับ filter ?month=)
// ============================================================
router.get("/", async (req, res) => {
  try {
    let sql = `
      SELECT
        pt.*,
        d.serial_number
      FROM print_transactions pt
      LEFT JOIN devices d
      ON pt.device_id = d.id
    `;

    const params = [];

    if (req.query.month) {
      const month = normalizeMonth(req.query.month);
      if (!month) {
        return res.status(400).json({ error: "รูปแบบเดือนไม่ถูกต้อง (ต้องเป็น YYYY-MM)" });
      }

      sql += " WHERE pt.month = ? ";
      params.push(month);
    }

    sql += " ORDER BY pt.month DESC ";

    const [rows] = await db.query(sql, params);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/print-transactions/months
// รายชื่อเดือนที่เคยมีการบันทึกข้อมูลแล้ว (ไว้โชว์ในตัวเลือกเดือน)
// ============================================================
router.get("/months", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT month
      FROM print_transactions
      ORDER BY month DESC
    `);

    // เผื่อมีข้อมูลเก่าที่ format เพี้ยน (เช่น "2026-7") หลุดเข้ามาในฐานข้อมูล
    // ก่อนที่จะมีการ validate — normalize + ตัดตัวซ้ำออกอีกชั้น กันไม่ให้
    // เดือนเดียวกันโผล่ซ้ำในตัวเลือกเดือน
    const months = new Set(
      rows.map((r) => normalizeMonth(r.month) || r.month)
    );

    res.json([...months].sort().reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/print-transactions
// เพิ่ม/แก้ไขยอดพิมพ์ 1 รายการ (upsert — กันข้อมูลซ้ำเวลาบันทึกซ้ำเดือนเดิม)
// ============================================================
router.post("/", staffMiddleware, async (req, res) => {
  try {
    const { device_id, month: rawMonth, pages } = req.body;

    if (!device_id || !rawMonth) {
      return res.status(400).json({ error: "device_id และ month จำเป็นต้องระบุ" });
    }

    const month = normalizeMonth(rawMonth);
    if (!month) {
      return res.status(400).json({ error: "รูปแบบเดือนไม่ถูกต้อง (ต้องเป็น YYYY-MM)" });
    }

    const pagesNum = Number(pages || 0);
    if (pagesNum < 0) {
      return res.status(400).json({ error: "จำนวนหน้าต้องไม่ติดลบ" });
    }

    await db.query(
      `
      INSERT INTO print_transactions (device_id, month, pages)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE pages = VALUES(pages)
      `,
      [device_id, month, pagesNum]
    );

    res.json({ message: "บันทึกยอดพิมพ์สำเร็จ" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/print-transactions/bulk
// บันทึกยอดพิมพ์ทีเดียวหลายเครื่อง (ใช้กับหน้ากรอกข้อมูลรายเดือน)
// ต้องรัน migration_unique_print_transactions.sql ก่อน ไม่งั้น
// ON DUPLICATE KEY UPDATE จะไม่ทำงาน (ตาราง print_transactions ต้องมี
// UNIQUE KEY (device_id, month))
// ============================================================
router.post("/bulk", staffMiddleware, async (req, res) => {
  const { month: rawMonth, items } = req.body;

  if (!rawMonth || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "month และ items (array) จำเป็นต้องระบุ" });
  }

  const month = normalizeMonth(rawMonth);
  if (!month) {
    return res.status(400).json({ error: "รูปแบบเดือนไม่ถูกต้อง (ต้องเป็น YYYY-MM)" });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    for (const item of items) {
      // ข้ามรายการที่ไม่ได้กรอกจำนวนหน้าจริงๆ (null/undefined/ค่าว่าง) ไม่บันทึกลง database
      if (item.pages === null || item.pages === undefined || item.pages === "") {
        continue;
      }

      const pagesNum = Number(item.pages);
      if (pagesNum < 0) {
        throw new Error(`จำนวนหน้าของ device_id ${item.device_id} ต้องไม่ติดลบ`);
      }

      await connection.query(
        `
        INSERT INTO print_transactions (device_id, month, pages)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE pages = VALUES(pages)
        `,
        [item.device_id, month, pagesNum]
      );
    }

    await connection.commit();

    res.json({ message: `บันทึกยอดพิมพ์สำเร็จ ${items.length} รายการ` });
  } catch (err) {
    await connection.rollback();
    console.error("Bulk save error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// ============================================================
// GET /api/print-transactions/summary?fiscal_year_id=ID
// นับจำนวนเดือนที่กรอกแล้วของแต่ละเครื่อง ในปีงบที่ระบุ (ใช้โชว์ badge ในตารางหลัก)
//
// เดิมรับ ?year=YYYY แล้ว filter ด้วย "month LIKE 'YYYY-%'" ซึ่งสมมติว่าปีงบตรงกับ
// ปีปฏิทิน (ม.ค.-ธ.ค.) — ผิด เพราะปีงบราชการไทยจริงคือ ต.ค.-ก.ย. คร่อมสองปีปฏิทิน
// เปลี่ยนมารับ fiscal_year_id แล้วดึงช่วงเดือนจริงจากตาราง fiscal_year แทน
// ============================================================
router.get("/summary", async (req, res) => {
  try {
    const fiscalYearId = Number(req.query.fiscal_year_id);
    if (!fiscalYearId) {
      return res.status(400).json({ error: "fiscal_year_id ไม่ถูกต้อง" });
    }

    const [[fiscalYear]] = await db.query(
      `SELECT start_month, end_month FROM fiscal_year WHERE id = ?`,
      [fiscalYearId]
    );
    if (!fiscalYear) {
      return res.status(404).json({ error: "ไม่พบปีงบประมาณนี้" });
    }

    const [rows] = await db.query(
      `
      SELECT
        totals.device_id,
        totals.filled,
        totals.total_pages,
        totals.latest_month,
        latest.pages AS latest_pages
      FROM (
        SELECT device_id, COUNT(*) AS filled, SUM(pages) AS total_pages, MAX(month) AS latest_month
        FROM print_transactions
        WHERE month BETWEEN ? AND ?
        GROUP BY device_id
      ) totals
      JOIN print_transactions latest
        ON latest.device_id = totals.device_id AND latest.month = totals.latest_month
      `,
      [fiscalYear.start_month, fiscalYear.end_month]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/print-transactions/by-device/:deviceId?fiscal_year_id=ID
// ดึงยอดพิมพ์ทั้ง 12 เดือนของเครื่องเดียว ในปีงบที่ระบุ (ใช้ตอนเปิด Modal กรอกข้อมูล)
//
// เดิมรับ ?year=YYYY แล้ว filter ด้วย "month LIKE 'YYYY-%'" (สมมติปีงบ = ปีปฏิทิน ผิด)
// เปลี่ยนมารับ fiscal_year_id แล้วดึงช่วงเดือนจริง (ต.ค.-ก.ย.) จากตาราง fiscal_year แทน
// ============================================================
router.get("/by-device/:deviceId", async (req, res) => {
  try {
    const deviceId = Number(req.params.deviceId);
    const fiscalYearId = Number(req.query.fiscal_year_id);

    if (!deviceId) {
      return res.status(400).json({ error: "device_id ไม่ถูกต้อง" });
    }
    if (!fiscalYearId) {
      return res.status(400).json({ error: "fiscal_year_id ไม่ถูกต้อง" });
    }

    const [[fiscalYear]] = await db.query(
      `SELECT start_month, end_month FROM fiscal_year WHERE id = ?`,
      [fiscalYearId]
    );
    if (!fiscalYear) {
      return res.status(404).json({ error: "ไม่พบปีงบประมาณนี้" });
    }

    const [rows] = await db.query(
      `
      SELECT month, pages
      FROM print_transactions
      WHERE device_id = ? AND month BETWEEN ? AND ?
      `,
      [deviceId, fiscalYear.start_month, fiscalYear.end_month]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/print-transactions/bulk-device
// บันทึกยอดพิมพ์ทีเดียวหลายเดือน สำหรับเครื่องเดียว (ใช้กับ Modal กรอก 12 เดือน)
//
// เดือนที่ "ลบออกจนว่าง" ในฟอร์ม (pages เป็น null/undefined/ค่าว่าง) ต้องถือว่า
// "ยังไม่กรอก" จริงๆ ไม่ใช่แค่ข้ามไม่ส่งมา — เดิมโค้ดนี้ skip เฉยๆ ทำให้ถ้าเดือนนั้น
// เคยมีค่าบันทึกไว้ก่อนหน้า (เช่น กรอกผิดแล้วลบออก) แถวเก่าใน print_transactions
// จะไม่ถูกลบ ค่าเก่าเลยยังค้างอยู่ และ "สถานะการกรอก" (X/12 เดือน) ก็เลยไม่ลดตาม
// ทั้งที่หน้าจอโชว์ว่าช่องนั้นว่างอยู่ — ต้อง DELETE แถวเดือนนั้นทิ้งไปเลยแทน
// ============================================================
router.post("/bulk-device", staffMiddleware, async (req, res) => {
  const { device_id, items } = req.body;

  if (!device_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "device_id และ items (array) จำเป็นต้องระบุ" });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    let saved = 0;
    let cleared = 0;

    for (const item of items) {
      const month = normalizeMonth(item.month);
      if (!month) {
        throw new Error(`รูปแบบเดือนไม่ถูกต้อง: ${item.month}`);
      }

      // เดือนที่ถูกลบออกจนว่าง (null/undefined/"") — ลบแถวเดือนนี้ทิ้ง ถือว่า "ยังไม่กรอก"
      if (item.pages === null || item.pages === undefined || item.pages === "") {
        const [result] = await connection.query(
          `DELETE FROM print_transactions WHERE device_id = ? AND month = ?`,
          [device_id, month]
        );
        if (result.affectedRows > 0) cleared++;
        continue;
      }

      const pagesNum = Number(item.pages);
      if (pagesNum < 0) {
        throw new Error(`จำนวนหน้าของเดือน ${month} ต้องไม่ติดลบ`);
      }

      await connection.query(
        `
        INSERT INTO print_transactions (device_id, month, pages)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE pages = VALUES(pages)
        `,
        [device_id, month, pagesNum]
      );

      saved++;
    }

    await connection.commit();

    const parts = [];
    if (saved > 0) parts.push(`บันทึก ${saved} เดือน`);
    if (cleared > 0) parts.push(`ลบออก ${cleared} เดือน`);

    res.json({
      message: parts.length ? parts.join(" / ") : "ไม่มีการเปลี่ยนแปลง",
      saved,
      cleared,
    });
  } catch (err) {
    await connection.rollback();
    console.error("Bulk-device save error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

module.exports = router;
