// apps/api/src/contracts/routes.js
//
// สัญญาเช่าเครื่องพิมพ์ และราคาต่อแผ่นที่ผูกกับสัญญา
//
// ราคาต่อแผ่นในไฟล์นี้คือตัวเลขที่ทำให้ทั้งระบบมีความหมาย — ทุกยอดเงินในทุกหน้า
// คำนวณจาก `จำนวนแผ่นสุทธิ × ราคาต่อแผ่น` โดยราคาที่ใช้จริงคือ
// `COALESCE(device.price_override, contract.price_per_page, 0)` (ดู schema.sql
// และ packages/domain/money.cjs) การกรอกราคาผิดหนึ่งตัวจึงทำให้รายงานทั้งปีเพี้ยน
//
// สิ่งที่เพิ่ม: คำตอบของ GET บอกด้วยว่าสัญญานี้มีเครื่องผูกอยู่กี่เครื่อง เพื่อให้
// หน้าจัดการสัญญาเตือนได้ก่อนกดลบ ว่าการลบจะกระทบเครื่องกี่เครื่อง — เดิมผู้ใช้
// กดลบแล้วเจอข้อความ error ของ MySQL ดิบๆ โดยไม่รู้ล่วงหน้าว่าจะลบไม่ได้

const express = require("express");
const { z } = require("zod");

const router = express.Router();
const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const requireAuth = require("../auth/require-auth");
const requireAdmin = require("../auth/require-admin");
const {
  validate,
  idParam,
  requiredText,
  optionalId,
  optionalMoney,
  optionalText,
  dateString,
} = require("../shared/validate");
const { notFound, badRequest } = require("../shared/http-error");
const cache = require("../shared/cache");
const { openPeriodsForContract } = require("../devices/contract-history");
const { fiscalYearDateRange } = require("@suth/domain");

router.use(requireAuth);

const contractBody = z.object({
  contract_no: requiredText("เลขที่สัญญา", 100),
  fiscal_year_id: optionalId,
  price_per_page: optionalMoney,
});

/**
 * ยืนยันช่วงที่สัญญาและราคามีผลจริง (ADR-0019 Q26)
 *
 * ไม่มีค่าตั้งต้นฝั่งเซิร์ฟเวอร์ — ฝั่งเว็บเป็นคนเสนอช่วงของปีงบให้ผู้ใช้เห็นก่อน
 * แล้วผู้ใช้กดยืนยันหรือแก้ ระบบจึงไม่เคยบันทึกช่วงที่ไม่มีใครอ่าน
 */
const termBody = z.object({
  effective_from: dateString,
  effective_to: dateString,
  price_source: optionalText(255),
});

/**
 * คอลัมน์ที่ทุก endpoint ของสัญญาส่งออกเหมือนกัน
 *
 * device_count นับด้วย subquery ไม่ใช่ LEFT JOIN + GROUP BY เพราะ join กับตาราง
 * devices แล้วรวมกลุ่มจะทำให้ต้องใส่ทุกคอลัมน์ของ contracts ลงใน GROUP BY และ
 * ผลลัพธ์จะผิดทันทีถ้าวันหลังมีการ join ตารางอื่นเพิ่ม — subquery อ่านง่ายกว่าและ
 * ไม่มีทางนับเกิน
 */
const CONTRACT_COLUMNS = `
  c.id,
  c.contract_no,
  c.price_per_page,
  c.fiscal_year_id,
  c.effective_from,
  c.effective_to,
  c.price_source,
  c.price_verified_at,
  fy.year AS fiscal_year,
  fy.start_month AS fiscal_start_month,
  fy.end_month AS fiscal_end_month,
  (SELECT COUNT(*) FROM devices d WHERE d.contract_id = c.id) AS device_count
`;

/**
 * เติมสถานะการยืนยันและช่วงที่ "เสนอ" ให้ผู้ใช้เห็นก่อนกดรับรอง
 *
 * ช่วงที่เสนอมาจากปีงบของสัญญา ซึ่งเอกสารสัญญาระบุไว้อยู่แล้ว — เป็นการช่วยกรอก
 * ไม่ใช่การยืนยันแทน ตราบใดที่ผู้ดูแลยังไม่กด ค่าใช้จ่ายของสัญญานี้ยังขึ้นว่า
 * "ยังยืนยันราคาไม่ได้" (ADR-0019 Q26, Q27)
 */
function withPriceStatus(row) {
  const proposed = fiscalYearDateRange({
    startMonth: row.fiscal_start_month,
    endMonth: row.fiscal_end_month,
  });

  return {
    ...row,
    price_confirmed: Boolean(row.price_verified_at && row.effective_from),
    proposed_effective_from: row.effective_from ?? proposed?.from ?? null,
    proposed_effective_to: row.effective_to ?? proposed?.to ?? null,
  };
}

// GET /api/contracts
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [rows] = await db.query(`
      SELECT ${CONTRACT_COLUMNS}
      FROM contracts c
      LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
      ORDER BY fy.year DESC, c.contract_no
    `);

    cache.referenceData(res);
    res.json(rows.map(withPriceStatus));
  })
);

// ============================================================
// GET /api/contracts/price-review — สัญญาที่ยังไม่ได้ยืนยันช่วงที่มีผล
// ============================================================
//
// รายการงานของผู้ดูแลตาม ADR-0019 — ตราบใดที่ยังไม่ยืนยัน ยอดพิมพ์ของเครื่องใน
// สัญญานั้นจะไม่มีราคา และรายงานจะบอกว่า "ยังยืนยันราคาไม่ได้" แทนการคิดเป็น 0 บาท
//
// ⚠️ ต้องประกาศก่อน "/:id" ไม่งั้น Express จะจับคำว่า price-review เป็นค่าของ :id
router.get(
  "/price-review",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [rows] = await db.query(`
      SELECT ${CONTRACT_COLUMNS},
        (SELECT COUNT(*)
           FROM v_monthly_kpi v
           JOIN devices d2 ON d2.id = v.device_id
          WHERE d2.contract_id = c.id AND v.total_cost IS NULL) AS unpriced_readings
      FROM contracts c
      LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
      WHERE c.price_verified_at IS NULL
         OR c.effective_from IS NULL
         -- สัญญาที่ยืนยันแล้วแต่ยังมียอดที่หาราคาไม่ได้ ต้องอยู่ในรายการนี้ด้วย
         --
         -- เกิดจริงเมื่อเพิ่มหรือนำเข้าเครื่องเข้าสัญญา **หลัง** ยืนยันไปแล้ว
         -- เครื่องกลุ่มนั้นยังไม่มีช่วงการคิดเงิน ยอดของมันจึงไม่มีราคา ถ้ารายการนี้
         -- แสดงเฉพาะสัญญาที่ยังไม่ยืนยัน ผู้ดูแลจะไม่มีทางรู้ว่าต้องกลับมากดอีกครั้ง
         OR EXISTS (
           SELECT 1 FROM v_monthly_kpi v
           JOIN devices d2 ON d2.id = v.device_id
           WHERE d2.contract_id = c.id AND v.total_cost IS NULL
         )
      ORDER BY fy.year DESC, c.contract_no
    `);

    cache.operationalData(res);
    res.json({ pending: rows.length, contracts: rows.map(withPriceStatus) });
  })
);

// GET /api/contracts/:id
router.get(
  "/:id",
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.query(
      `
      SELECT ${CONTRACT_COLUMNS}
      FROM contracts c
      LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
      WHERE c.id = ?
    `,
      [req.params.id]
    );

    if (!rows.length) throw notFound("ไม่พบสัญญาที่ต้องการ");

    cache.referenceData(res);
    res.json(withPriceStatus(rows[0]));
  })
);

// ============================================================
// PUT /api/contracts/:id/term — ยืนยันช่วงที่สัญญาและราคามีผล
// ============================================================
//
// แยกจาก PUT /:id เพราะเป็นการ "รับรองข้อเท็จจริงจากเอกสาร" ไม่ใช่การแก้ค่าในฟอร์ม
// และมีผลข้างเคียงที่ต้องตั้งใจ: เปิดช่วงการคิดเงินให้เครื่องทุกเครื่องในสัญญานี้
// ซึ่งทำให้ยอดเงินย้อนหลังของเครื่องเหล่านั้นกลับมาคำนวณได้
router.put(
  "/:id/term",
  requireAdmin,
  validate({ params: idParam, body: termBody }),
  asyncHandler(async (req, res) => {
    const { effective_from, effective_to, price_source } = req.body;

    if (effective_to < effective_from) {
      throw badRequest("วันสิ้นสุดต้องไม่มาก่อนวันเริ่ม", { code: "invalid_term" });
    }

    const devices = await db.withTransaction(async (conn) => {
      const [[contract]] = await conn.query(
        "SELECT id, price_per_page FROM contracts WHERE id = ?",
        [req.params.id]
      );
      if (!contract) throw notFound("ไม่พบสัญญาที่ต้องการยืนยัน");

      // ยืนยันช่วงของสัญญาที่ยังไม่มีราคา = ยืนยันว่า "ราคาคือไม่มี" ซึ่งไม่ใช่
      // ข้อเท็จจริงที่เอกสารสัญญาระบุได้ ปฏิเสธไปดีกว่าปล่อยให้ยืนยันแล้วยอดเงิน
      // ของเครื่องกลุ่มนี้กลายเป็นศูนย์โดยดูเหมือนผ่านการตรวจแล้ว
      if (contract.price_per_page === null || contract.price_per_page === undefined) {
        throw badRequest("กรอกราคาต่อแผ่นของสัญญาก่อนจึงจะยืนยันช่วงที่มีผลได้", {
          code: "price_required",
        });
      }

      await conn.query(
        `UPDATE contracts
         SET effective_from = ?, effective_to = ?, price_source = ?,
             price_verified_by = ?, price_verified_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [effective_from, effective_to, price_source, req.user?.id ?? null, req.params.id]
      );

      return openPeriodsForContract(conn, Number(req.params.id), {
        from: effective_from,
        to: effective_to,
      });
    });

    res.json({ message: "ยืนยันช่วงที่สัญญามีผลแล้ว", devices_linked: devices });
  })
);

// POST /api/contracts
router.post(
  "/",
  requireAdmin,
  validate({ body: contractBody }),
  asyncHandler(async (req, res) => {
    const { contract_no, fiscal_year_id, price_per_page } = req.body;

    const [result] = await db.query(
      "INSERT INTO contracts (contract_no, fiscal_year_id, price_per_page) VALUES (?, ?, ?)",
      [contract_no, fiscal_year_id, price_per_page]
    );

    res.status(201).json({ id: result.insertId, contract_no, fiscal_year_id, price_per_page });
  })
);

// PUT /api/contracts/:id
router.put(
  "/:id",
  requireAdmin,
  validate({ params: idParam, body: contractBody }),
  asyncHandler(async (req, res) => {
    const { contract_no, fiscal_year_id, price_per_page } = req.body;

    const priceChanged = await db.withTransaction(async (conn) => {
      const [[current]] = await conn.query("SELECT price_per_page FROM contracts WHERE id = ?", [
        req.params.id,
      ]);
      if (!current) throw notFound("ไม่พบสัญญาที่ต้องการแก้ไข");

      // เทียบเป็นข้อความเพราะ mysql2 คืน DECIMAL เป็น string ส่วนฟอร์มส่ง number มา
      const changed =
        String(current.price_per_page ?? "") !== String(price_per_page ?? "");

      await conn.query(
        "UPDATE contracts SET contract_no = ?, fiscal_year_id = ?, price_per_page = ? WHERE id = ?",
        [contract_no, fiscal_year_id, price_per_page, req.params.id]
      );

      // เปลี่ยนราคา = สิ่งที่เคยถูกรับรองไว้ไม่ใช่ราคานี้อีกต่อไป ต้องให้คนยืนยันใหม่
      // พร้อมเอกสาร ไม่งั้นราคาใหม่จะถูกใช้ย้อนหลังทันทีโดยยังติดป้ายว่า "ยืนยันแล้ว"
      // ซึ่งเป็นสิ่งที่ ADR-0019 ห้ามไว้ตรงๆ
      //
      // เก็บช่วงวันที่ไว้ให้ ผู้ดูแลจะได้ไม่ต้องพิมพ์ใหม่ตอนกดยืนยันรอบสอง
      if (changed) {
        await conn.query(
          "UPDATE contracts SET price_verified_by = NULL, price_verified_at = NULL WHERE id = ?",
          [req.params.id]
        );
      }

      return changed;
    });

    res.json({
      id: req.params.id,
      contract_no,
      fiscal_year_id,
      price_per_page,
      price_confirmation_reset: priceChanged,
      message: priceChanged
        ? "บันทึกแล้ว — ราคาเปลี่ยน จึงต้องยืนยันช่วงที่มีผลใหม่อีกครั้ง"
        : "บันทึกการแก้ไขเรียบร้อยแล้ว",
    });
  })
);

// DELETE /api/contracts/:id
router.delete(
  "/:id",
  requireAdmin,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    // เครื่องที่ยังผูกกับสัญญานี้จะทำให้ MySQL ปฏิเสธการลบ (foreign key) แล้ว
    // error handler กลางแปลงเป็น 409 พร้อมข้อความว่าต้องย้ายของที่อ้างถึงออกก่อน
    const [result] = await db.query("DELETE FROM contracts WHERE id = ?", [req.params.id]);
    if (!result.affectedRows) throw notFound("ไม่พบสัญญาที่ต้องการลบ");

    res.json({ message: "ลบสัญญาเรียบร้อยแล้ว" });
  })
);

module.exports = router;
