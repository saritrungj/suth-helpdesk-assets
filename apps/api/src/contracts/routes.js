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
const { validate, idParam, requiredText, optionalId, optionalMoney } = require("../shared/validate");
const { notFound } = require("../shared/http-error");
const cache = require("../shared/cache");

router.use(requireAuth);

const contractBody = z.object({
  contract_no: requiredText("เลขที่สัญญา", 100),
  fiscal_year_id: optionalId,
  price_per_page: optionalMoney,
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
  fy.year AS fiscal_year,
  (SELECT COUNT(*) FROM devices d WHERE d.contract_id = c.id) AS device_count
`;

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
    res.json(rows);
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
    res.json(rows[0]);
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

    const [result] = await db.query(
      "UPDATE contracts SET contract_no = ?, fiscal_year_id = ?, price_per_page = ? WHERE id = ?",
      [contract_no, fiscal_year_id, price_per_page, req.params.id]
    );

    if (!result.affectedRows) throw notFound("ไม่พบสัญญาที่ต้องการแก้ไข");

    res.json({ id: req.params.id, contract_no, fiscal_year_id, price_per_page });
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
