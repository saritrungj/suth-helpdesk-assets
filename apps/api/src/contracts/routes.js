// apps/api/src/contracts/routes.js
//
// สัญญาเช่าเครื่อง อายุสัญญา และรายการราคา (ADR-0021, ADR-0023)
//
// ราคาในไฟล์นี้คือตัวเลขที่ทำให้ทั้งระบบมีความหมาย — ทุกยอดเงินคำนวณจาก
// `หน้าสุทธิ × ราคาของรายการราคา` ใน v_monthly_kpi และราคามีผลทันทีที่บันทึก
// ตลอดอายุสัญญา ไม่มีขั้นยืนยันแยก การกรอกราคาผิดหนึ่งตัวจึงทำให้รายงานทั้งปีเพี้ยน
// ทางกันคือ "ดูผลกระทบก่อนบันทึก": PUT ที่มี preview: true จะคำนวณยอดก่อน/หลังจาก
// view จริงใน transaction แล้วย้อนกลับ ผู้ใช้จึงเห็นตัวเลขเดียวกับที่รายงานจะแสดง
//
// การแก้ที่ทำให้ยอดที่มีอยู่หาราคาไม่ได้ (ตัดอายุสัญญาจนยอดหลุดช่วง หรือลบรายการ
// ราคาที่มิเตอร์ใช้อยู่) ถูกปฏิเสธ เพราะหน้าภาพรวมต้องไม่มีสถานะ "รอราคา"

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
  requiredPrice,
  dateString,
  booleanQuery,
} = require("../shared/validate");
const { notFound, badRequest, conflict } = require("../shared/http-error");
const cache = require("../shared/cache");

router.use(requireAuth);

/** ค่าเช่าคงที่ต่อเดือน — จำนวนเงินจริง ทศนิยมไม่เกินสองตำแหน่ง */
const optionalBaht = z
  .preprocess((value) => (value === "" || value === undefined ? null : value), z.union([
    z.null(),
    z.coerce.string().trim()
      .regex(/^\d+(\.\d{1,2})?$/, "ค่าเช่าต้องเป็นจำนวนเงินไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง")
      // คอลัมน์เป็น DECIMAL(12,2) — เกินนี้ฐานข้อมูลปฏิเสธเป็น 500 แทนที่จะบอกผู้ใช้
      .refine((value) => Number(value) < 1e10, "ค่าเช่าสูงเกินกว่าที่ระบบเก็บได้"),
  ]))
  .transform((value) => (value === null ? null : Number(value)));

/** อัตรา VAT เป็นเปอร์เซ็นต์ เช่น 7 */
const optionalVatRate = z
  .preprocess((value) => (value === "" || value === undefined ? null : value), z.union([
    z.null(),
    z.coerce.number().min(0, "อัตรา VAT ต้องไม่ติดลบ").max(100, "อัตรา VAT ต้องไม่เกิน 100"),
  ]));

const MAX_TERM_YEARS = 10;

const priceLine = z.object({
  category_id: z.coerce.number({ error: "กรุณาเลือกหมวด" }).int().positive("กรุณาเลือกหมวด"),
  price_per_page: requiredPrice,
});

const contractBody = z
  .object({
    contract_no: requiredText("เลขที่สัญญา", 100),
    effective_from: dateString,
    effective_to: dateString,
    price_lines: z.array(priceLine).min(1, "สัญญาต้องมีรายการราคาอย่างน้อยหนึ่งรายการ").max(20),
    monthly_rental: optionalBaht,
    vat_rate: optionalVatRate,
    preview: booleanQuery.optional(),
  })
  .refine((body) => body.effective_to >= body.effective_from, {
    message: "วันสิ้นสุดสัญญาต้องไม่มาก่อนวันเริ่ม",
    path: ["effective_to"],
  })
  // v_contract_invoice กางค่าเช่าทีละเดือนตลอดอายุสัญญา ปี พ.ศ. ที่พิมพ์ปนมา (2571 แทน 2028)
  // จะทำให้สัญญายาวหลายพันเดือนจนหน้าค่าใช้จ่ายของทุกคนล่ม — จึงรับเฉพาะปี ค.ศ. และไม่เกิน 10 ปี
  .refine((body) => [body.effective_from, body.effective_to].every((date) => date >= "2000-01-01" && date <= "2100-12-31"), {
    message: "วันที่ของสัญญาต้องเป็นปี ค.ศ. 2000–2100",
    path: ["effective_to"],
  })
  .refine((body) => body.effective_to < `${Number(body.effective_from.slice(0, 4)) + MAX_TERM_YEARS}${body.effective_from.slice(4)}`, {
    message: `อายุสัญญาต้องไม่เกิน ${MAX_TERM_YEARS} ปี`,
    path: ["effective_to"],
  })
  .refine(
    (body) => new Set(body.price_lines.map((line) => line.category_id)).size === body.price_lines.length,
    { message: "หมวดเดียวกันมีได้ราคาเดียวต่อสัญญา", path: ["price_lines"] }
  );

/**
 * สัญญาพร้อมรายการราคา
 *
 * วันที่จัดรูปเป็น "YYYY-MM-DD" ใน SQL เพราะ mysql2 แปลง DATE เป็น Date ตามเขตเวลา
 * ของเครื่อง แล้ว JSON ส่งออกเป็น UTC — 1 ต.ค. จะกลายเป็น 30 ก.ย. ในเบราว์เซอร์
 */
async function loadContracts(conn, id = null) {
  const [contracts] = await conn.query(
    `SELECT c.id, c.contract_no,
            DATE_FORMAT(c.effective_from, '%Y-%m-%d') AS effective_from,
            DATE_FORMAT(c.effective_to, '%Y-%m-%d') AS effective_to,
            c.monthly_rental, c.vat_rate,
            (SELECT COUNT(*) FROM devices d WHERE d.contract_id = c.id) AS device_count
     FROM contracts c
     ${id ? "WHERE c.id = ?" : ""}
     ORDER BY c.effective_from DESC, c.contract_no`,
    id ? [id] : []
  );
  if (!contracts.length) return [];

  const [lines] = await conn.query(
    `SELECT l.contract_id, l.category_id, mc.code AS category_code, mc.name AS category_name,
            mc.is_color, l.price_per_page
     FROM contract_price_line l
     JOIN meter_category mc ON mc.id = l.category_id
     WHERE l.contract_id IN (?)
     ORDER BY mc.sort_order`,
    [contracts.map((c) => c.id)]
  );

  return contracts.map((contract) => ({
    ...contract,
    price_lines: lines
      .filter((line) => line.contract_id === contract.id)
      .map(({ contract_id, ...line }) => ({ ...line, is_color: Boolean(line.is_color) })),
  }));
}

/**
 * ยอดตามใบแจ้งหนี้รายงวด (ค่าพิมพ์ + ค่าเช่าคงที่ + VAT) และจำนวนยอดที่หาราคาไม่ได้ ของสัญญานี้
 *
 * ยอดเงินอ่านจาก v_contract_invoice ตัวเดียวกับหน้าค่าใช้จ่าย — เดิมอ่านแค่ค่าพิมพ์จาก v_monthly_kpi
 * การเพิ่มค่าเช่าหรือ VAT จึงแสดงว่า "ยอดเงินทุกงวดไม่เปลี่ยน" ทั้งที่ใบแจ้งหนี้เปลี่ยนหลายหมื่นบาท (#156)
 */
async function billingSnapshot(conn, contractId) {
  const [[unpricedRows], [invoiceRows]] = await Promise.all([
    conn.query(
      `SELECT v.month, SUM(v.total_cost IS NULL) AS unpriced
       FROM v_monthly_kpi v
       WHERE v.billing_contract_id = ?
       GROUP BY v.month`,
      [contractId]
    ),
    conn.query("SELECT month, invoice_total FROM v_contract_invoice WHERE contract_id = ?", [contractId]),
  ]);
  const unpricedBy = new Map(unpricedRows.map((row) => [row.month, Number(row.unpriced)]));
  const invoiceBy = new Map(invoiceRows.map((row) => [row.month, row.invoice_total === null ? null : String(row.invoice_total)]));
  return [...new Set([...unpricedBy.keys(), ...invoiceBy.keys()])].sort().map((month) => ({
    month,
    cost: invoiceBy.get(month) ?? null,
    unpriced: unpricedBy.get(month) ?? 0,
  }));
}

async function writeContract(conn, contractId, body) {
  const { contract_no, effective_from, effective_to, price_lines, monthly_rental, vat_rate } = body;

  let id = contractId;
  if (id) {
    const [result] = await conn.query(
      `UPDATE contracts
       SET contract_no = ?, effective_from = ?, effective_to = ?, monthly_rental = ?, vat_rate = ?
       WHERE id = ?`,
      [contract_no, effective_from, effective_to, monthly_rental, vat_rate, id]
    );
    if (!result.affectedRows) throw notFound("ไม่พบสัญญาที่ต้องการแก้ไข");
    await conn.query("DELETE FROM contract_price_line WHERE contract_id = ?", [id]);
  } else {
    const [result] = await conn.query(
      `INSERT INTO contracts (contract_no, effective_from, effective_to, monthly_rental, vat_rate)
       VALUES (?, ?, ?, ?, ?)`,
      [contract_no, effective_from, effective_to, monthly_rental, vat_rate]
    );
    id = result.insertId;
  }

  await conn.query(
    "INSERT INTO contract_price_line (contract_id, category_id, price_per_page) VALUES ?",
    [price_lines.map((line) => [id, line.category_id, line.price_per_page])]
  );
  return id;
}

/** ส่งสัญญาณให้ withTransaction ย้อนกลับ โดยพาผลลัพธ์ของ preview ออกมาด้วย */
class PreviewRollback extends Error {
  constructor(result) {
    super("preview");
    this.result = result;
  }
}

// GET /api/contracts
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const contracts = await loadContracts(db);
    cache.referenceData(res);
    res.json(contracts);
  })
);

// GET /api/contracts/meter-categories — หมวดมิเตอร์ที่ใช้ตั้งราคาได้
// ⚠️ ต้องประกาศก่อน "/:id" ไม่งั้น Express จะจับเป็นค่าของ :id
router.get(
  "/meter-categories",
  asyncHandler(async (req, res) => {
    const [rows] = await db.query(
      "SELECT id, code, name, is_color FROM meter_category ORDER BY sort_order, id"
    );
    cache.referenceData(res);
    res.json(rows.map((row) => ({ ...row, is_color: Boolean(row.is_color) })));
  })
);

// GET /api/contracts/:id
router.get(
  "/:id",
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const [contract] = await loadContracts(db, req.params.id);
    if (!contract) throw notFound("ไม่พบสัญญาที่ต้องการ");
    cache.referenceData(res);
    res.json(contract);
  })
);

// POST /api/contracts
router.post(
  "/",
  requireAdmin,
  validate({ body: contractBody }),
  asyncHandler(async (req, res) => {
    const id = await db.withTransaction((conn) => writeContract(conn, null, req.body));
    const [contract] = await loadContracts(db, id);
    res.status(201).json(contract);
  })
);

// ============================================================
// PUT /api/contracts/:id — แก้สัญญา หรือดูผลกระทบก่อนบันทึก (preview: true)
// ============================================================
//
// ผลกระทบคำนวณจาก view ตัวจริงหลังเขียนใน transaction เดียวกัน แล้วย้อนกลับถ้าเป็น
// preview — ตัวเลขที่ผู้ใช้เห็นก่อนกดจึงเป็นตัวเลขเดียวกับที่รายงานจะแสดงหลังกด
// ไม่ใช่ค่าประมาณที่คำนวณซ้ำอีกที่
router.put(
  "/:id",
  requireAdmin,
  validate({ params: idParam, body: contractBody }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);

    try {
      const result = await db.withTransaction(async (conn) => {
        const before = await billingSnapshot(conn, id);
        await writeContract(conn, id, req.body);
        const after = await billingSnapshot(conn, id);

        const unpricedIn = (rows, month) => rows.find((row) => row.month === month)?.unpriced ?? 0;
        const newlyUnpriced = after.filter((row) => row.unpriced > unpricedIn(before, row.month));
        if (newlyUnpriced.length) {
          throw badRequest(
            "บันทึกไม่ได้ เพราะยอดที่บันทึกแล้วบางเดือนจะหาราคาไม่ได้ — ตรวจอายุสัญญาและรายการราคาอีกครั้ง",
            {
              code: "would_unprice_readings",
              errors: newlyUnpriced.map((row) => ({ month: row.month, unpriced: row.unpriced })),
            }
          );
        }

        const costIn = (rows, month) => rows.find((row) => row.month === month)?.cost ?? null;
        const months = [...new Set([...before, ...after].map((row) => row.month))].sort();
        const impact = months
          .map((month) => ({ month, before: costIn(before, month), after: costIn(after, month) }))
          .filter((row) => row.before !== row.after);

        if (req.body.preview) throw new PreviewRollback({ impact });
        return { impact };
      });

      const [contract] = await loadContracts(db, id);
      res.json({ ...contract, impact: result.impact, message: "บันทึกสัญญาเรียบร้อยแล้ว" });
    } catch (err) {
      if (err instanceof PreviewRollback) {
        res.json({ preview: true, impact: err.result.impact });
        return;
      }
      throw err;
    }
  })
);

// DELETE /api/contracts/:id
router.delete(
  "/:id",
  requireAdmin,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await db.withTransaction(async (conn) => {
      // ล็อกสัญญาก่อนตรวจ เพื่อให้การเพิ่ม reference ใหม่รอจนกว่าการลบจะจบ
      const [contracts] = await conn.query("SELECT id FROM contracts WHERE id = ? FOR UPDATE", [id]);
      if (!contracts.length) throw notFound("ไม่พบสัญญาที่ต้องการลบ");

      const [[currentRows], [historyRows], [rentalRows]] = await Promise.all([
        conn.query("SELECT COUNT(*) AS count FROM devices WHERE contract_id = ?", [id]),
        conn.query("SELECT COUNT(*) AS count FROM device_contract_history WHERE contract_id = ?", [id]),
        conn.query(
          `SELECT COUNT(*) AS count
           FROM v_contract_invoice i
           JOIN contracts c ON c.id = i.contract_id
           WHERE i.contract_id = ? AND i.rental > 0
             AND (
               i.month < DATE_FORMAT(CURRENT_DATE, '%Y-%m')
               OR (
                 i.month = DATE_FORMAT(CURRENT_DATE, '%Y-%m')
                 AND CURRENT_DATE >= CASE
                   WHEN DAY(c.effective_from) = 1 THEN LAST_DAY(CURRENT_DATE)
                   ELSE LEAST(
                     LAST_DAY(CURRENT_DATE),
                     DATE_ADD(
                       STR_TO_DATE(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), '%Y-%m-%d'),
                       INTERVAL (DAY(c.effective_from) - 2) DAY
                     )
                   )
                 END
               )
             )`,
          [id]
        ),
      ]);

      if (Number(currentRows[0]?.count) > 0) {
        throw conflict("ลบสัญญาไม่ได้ เพราะยังมีเครื่องผูกอยู่", {
          code: "contract_has_current_devices",
          detail: "ย้ายเครื่องทั้งหมดไปยังสัญญาอื่นก่อน แล้วจึงลบสัญญานี้ได้",
        });
      }
      if (Number(historyRows[0]?.count) > 0) {
        throw conflict("ลบสัญญาไม่ได้ เพราะมีประวัติการคิดเงินอ้างถึงอยู่", {
          code: "contract_has_history",
          detail: "สัญญานี้มีประวัติผูกกับเครื่องและอาจมีผลต่อรายงานย้อนหลัง จึงเก็บสัญญาไว้",
        });
      }
      if (Number(rentalRows[0]?.count) > 0) {
        throw conflict("ลบสัญญาไม่ได้ เพราะมีงวดค่าเช่าที่เกิดขึ้นแล้ว", {
          code: "contract_has_realized_rental_months",
          detail: "ลบสัญญาจะทำให้ยอดใบแจ้งหนี้ย้อนหลังหายไป ให้เก็บสัญญานี้ไว้",
        });
      }

      await conn.query("DELETE FROM contracts WHERE id = ?", [id]);
    });

    cache.noStore(res);
    res.set("Location", req.baseUrl);
    res.json({ message: "ลบสัญญาเรียบร้อยแล้ว" });
  })
);

module.exports = router;
