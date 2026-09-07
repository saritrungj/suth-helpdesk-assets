// apps/api/src/expense/routes.js
//
// ค่าใช้จ่ายแยกตามสัญญา — สัญญา → เครื่อง → ยอดพิมพ์รายเดือน
//
// ## สิ่งที่แก้รอบนี้: การยิงคำสั่งฐานข้อมูลแบบ N+1
//
// โค้ดเดิมวนแบบนี้
//
//     ดึงสัญญาทั้งหมด                          → 1 คำสั่ง
//     สำหรับแต่ละสัญญา: ดึงเครื่องในสัญญา       → 1 คำสั่งต่อสัญญา
//       สำหรับแต่ละเครื่อง: ดึงยอดพิมพ์          → 1 คำสั่งต่อเครื่อง
//
// สัญญา 8 ฉบับกับเครื่อง 300 เครื่อง = **309 คำสั่ง** ต่อการเปิดหน้าหนึ่งครั้ง
// ทุกคำสั่งมีค่าใช้จ่ายคงที่ของการรับส่งข้อมูลไป-กลับกับ MySQL ซึ่งบนเครือข่าย
// ภายในโรงพยาบาลอยู่ที่ระดับหลายมิลลิวินาทีต่อครั้ง — รวมแล้วหน้านี้ใช้เวลาเป็น
// วินาทีทั้งที่ข้อมูลจริงมีไม่กี่ร้อยกิโลไบต์ และยังกิน connection ใน pool ไว้
// ตลอดเวลานั้นด้วย ทำให้ผู้ใช้คนอื่นที่เปิดหน้าอื่นพร้อมกันต้องรอตาม
//
// ตอนนี้เป็น **3 คำสั่งคงที่** ไม่ว่าจะมีกี่สัญญาหรือกี่เครื่อง แล้วจัดกลุ่มฝั่ง JS
// ซึ่งเป็นงานที่ CPU ทำเสร็จในหลักมิลลิวินาที
//
// ## เรื่องเงิน
//
// ทุกยอดคิดเป็นจำนวนเต็มสตางค์ใน JS ไม่คิดใน SQL (ดู packages/domain/money.cjs)
// ราคาที่ใช้จริงคือ COALESCE(device.price_override, contract.price_per_page, 0)
// ให้ตรงกับ v_monthly_kpi ใน schema.sql — เดิมโค้ดตรงนี้อิงแค่ราคาของสัญญา ทำให้
// สัญญาที่ไม่ได้กรอกราคาต่อแผ่นแสดงค่าใช้จ่ายเป็น 0.00 ทั้งหน้า ทั้งที่หลายเครื่อง
// มีราคาเฉพาะเครื่องของตัวเองอยู่แล้ว

const express = require("express");
const { z } = require("zod");

const router = express.Router();
const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const requireAuth = require("../auth/require-auth");
const { validate, monthListQuery } = require("../shared/validate");
const { notFound } = require("../shared/http-error");
const cache = require("../shared/cache");
const { costSatangAt, effectivePriceSatang, fromSatang, sumSatang } = require("@suth/domain");

router.use(requireAuth);

/**
 * รวมยอดพิมพ์รายเดือนของเครื่องหนึ่งให้เป็นก้อนพร้อมค่าใช้จ่าย
 *
 * @param {{ month: string, pages: number }[]} transactions
 * @param {number} priceSatang ราคาต่อแผ่นในหน่วยสตางค์
 */
function summarise(transactions, priceSatang) {
  const monthly = transactions.map((row) => {
    const satang = costSatangAt(row.pages, priceSatang);
    return { month: row.month, pages: row.pages, cost_satang: satang, cost: fromSatang(satang) };
  });

  const total_cost_satang = sumSatang(monthly.map((m) => m.cost_satang));

  return {
    monthly,
    total_pages: monthly.reduce((sum, m) => sum + Number(m.pages || 0), 0),
    total_cost_satang,
    total_cost: fromSatang(total_cost_satang),
  };
}

/**
 * ดึงยอดพิมพ์ของเครื่องหลายเครื่องพร้อมกันในคำสั่งเดียว แล้วจัดกลุ่มตามเครื่อง
 *
 * @param {number[]} deviceIds
 * @param {string} startMonth
 * @param {string} endMonth
 * @param {string[]} monthsFilter เดือนที่ผู้ใช้เลือก (ว่าง = ทั้งช่วงปีงบ)
 * @returns {Promise<Map<number, { month: string, pages: number }[]>>}
 */
async function readingsByDevice(deviceIds, startMonth, endMonth, monthsFilter) {
  if (!deviceIds.length) return new Map();

  const params = [deviceIds, startMonth, endMonth];
  let sql = `
    SELECT device_id, month, pages
    FROM print_transactions
    WHERE device_id IN (?) AND month BETWEEN ? AND ?
  `;

  // ตัวกรองเดือนซ้อนอยู่ใน "ช่วงปีงบ" อีกชั้นเสมอ — เผื่อผู้ใช้ส่งเดือนนอกปีงบมา
  // ยอดของปีอื่นจะได้ไม่หลุดเข้ามาปนในหน้าที่พาดหัวว่าเป็นปีงบนี้
  if (monthsFilter.length) {
    sql += " AND month IN (?)";
    params.push(monthsFilter);
  }

  sql += " ORDER BY month";

  const [rows] = await db.query(sql, params);

  const grouped = new Map(deviceIds.map((id) => [id, []]));
  for (const row of rows) {
    grouped.get(row.device_id)?.push({ month: row.month, pages: row.pages });
  }

  return grouped;
}

// ============================================================
// GET /api/expense/unassigned-devices
//
// เครื่องที่ยังไม่ได้ผูกกับสัญญาใดๆ — ต้องประกาศก่อน "/:fiscal_year_id" ไม่งั้น
// Express จะจับ "unassigned-devices" เป็นค่าของพารามิเตอร์แทน
//
// กลุ่มนี้สำคัญกว่าที่เห็น: เครื่องที่ไม่มีสัญญาและไม่มีราคาเฉพาะเครื่อง จะคิด
// ค่าใช้จ่ายได้ 0 บาทเสมอ — ยอดพิมพ์ของมันหายไปจากงบโดยไม่มีใครรู้ หน้าเว็บจึง
// ต้องเห็นกลุ่มนี้แยกออกมาชัดๆ ไม่ใช่ซ่อนไว้
// ============================================================
router.get(
  "/unassigned-devices",
  asyncHandler(async (req, res) => {
    const [devices] = await db.query(`
      SELECT d.id, d.serial_number, d.model, d.price_override, b.name AS brand_name
      FROM devices d
      LEFT JOIN brand b ON d.brand_id = b.id
      WHERE d.contract_id IS NULL
      ORDER BY d.serial_number
    `);

    // ไม่จำกัดช่วงเดือน เพราะเครื่องกลุ่มนี้ไม่ผูกกับปีงบไหนเลย
    const readings = devices.length
      ? await (async () => {
          const [rows] = await db.query(
            "SELECT device_id, month, pages FROM print_transactions WHERE device_id IN (?) ORDER BY month",
            [devices.map((d) => d.id)]
          );
          const grouped = new Map(devices.map((d) => [d.id, []]));
          for (const row of rows) grouped.get(row.device_id)?.push(row);
          return grouped;
        })()
      : new Map();

    for (const device of devices) {
      // ไม่มีสัญญา จึงมีได้แค่ราคาเฉพาะเครื่อง
      const priceSatang = effectivePriceSatang(device.price_override, null);
      Object.assign(device, summarise(readings.get(device.id) ?? [], priceSatang));
    }

    const total_cost_satang = sumSatang(devices.map((d) => d.total_cost_satang));

    cache.operationalData(res);
    res.json({ devices, total_cost_satang, total_cost: fromSatang(total_cost_satang) });
  })
);

// ============================================================
// GET /api/expense/:fiscal_year_id
// ============================================================
router.get(
  "/:fiscal_year_id",
  validate({
    params: z.object({ fiscal_year_id: z.coerce.number().int().positive("รหัสปีงบประมาณไม่ถูกต้อง") }),
    query: z.object({ month: monthListQuery }),
  }),
  asyncHandler(async (req, res) => {
    const fiscalYearId = req.params.fiscal_year_id;
    const monthsFilter = req.query.month;

    // ---------- คำสั่งที่ 1: ช่วงเดือนของปีงบ ----------
    const [[fiscalYear]] = await db.query(
      "SELECT start_month, end_month FROM fiscal_year WHERE id = ?",
      [fiscalYearId]
    );
    if (!fiscalYear) throw notFound("ไม่พบปีงบประมาณนี้");

    // ---------- คำสั่งที่ 2: สัญญาทุกฉบับพร้อมเครื่องทุกเครื่องในคราวเดียว ----------
    // LEFT JOIN เพื่อให้สัญญาที่ยังไม่มีเครื่องผูกอยู่เลยยังโผล่ในรายงาน (พร้อมยอด 0)
    // แทนที่จะหายไปเงียบๆ — สัญญาที่เพิ่งสร้างแล้วลืมผูกเครื่องคือสิ่งที่ต้องเห็น
    const [rows] = await db.query(
      `
      SELECT
        c.id AS contract_id,
        c.contract_no,
        c.price_per_page,
        d.id AS device_id,
        d.serial_number,
        d.model,
        d.price_override,
        d.status,
        b.name AS brand_name
      FROM contracts c
      LEFT JOIN devices d ON d.contract_id = c.id
      LEFT JOIN brand b ON d.brand_id = b.id
      WHERE c.fiscal_year_id = ?
      ORDER BY c.contract_no, d.serial_number
      `,
      [fiscalYearId]
    );

    // ---------- คำสั่งที่ 3: ยอดพิมพ์ของทุกเครื่องพร้อมกัน ----------
    const deviceIds = rows.filter((row) => row.device_id).map((row) => row.device_id);
    const readings = await readingsByDevice(
      deviceIds,
      fiscalYear.start_month,
      fiscalYear.end_month,
      monthsFilter
    );

    // ---------- ประกอบผลลัพธ์ฝั่ง JS ----------
    const contracts = new Map();

    for (const row of rows) {
      if (!contracts.has(row.contract_id)) {
        contracts.set(row.contract_id, {
          id: row.contract_id,
          contract_no: row.contract_no,
          price_per_page: row.price_per_page,
          devices: [],
        });
      }

      // แถวของสัญญาที่ไม่มีเครื่อง (จาก LEFT JOIN) — มีสัญญาแล้วแต่ไม่มีเครื่องให้เพิ่ม
      if (!row.device_id) continue;

      const priceSatang = effectivePriceSatang(row.price_override, row.price_per_page);

      contracts.get(row.contract_id).devices.push({
        id: row.device_id,
        serial_number: row.serial_number,
        model: row.model,
        status: row.status,
        brand_name: row.brand_name,
        price_override: row.price_override,
        // ราคาที่ใช้จริงหลังพิจารณาราคาเฉพาะเครื่องแล้ว — ส่งออกไปด้วยเพื่อให้หน้าเว็บ
        // อธิบายได้ว่าเครื่องนี้คิดที่ราคาเท่าไหร่ โดยไม่ต้องคำนวณกฎ COALESCE ซ้ำเอง
        effective_price: fromSatang(priceSatang),
        ...summarise(readings.get(row.device_id) ?? [], priceSatang),
      });
    }

    const contractList = [...contracts.values()].map((contract) => {
      const total_cost_satang = sumSatang(contract.devices.map((d) => d.total_cost_satang));

      return {
        ...contract,
        device_count: contract.devices.length,
        total_pages: contract.devices.reduce((sum, d) => sum + d.total_pages, 0),
        total_cost_satang,
        total_cost: fromSatang(total_cost_satang),
      };
    });

    const grand_total_satang = sumSatang(contractList.map((c) => c.total_cost_satang));

    cache.operationalData(res);
    res.json({
      fiscal_year_id: fiscalYearId,
      month: monthsFilter.length ? monthsFilter.join(",") : null,
      contracts: contractList,
      // ยอดรวมทั้งหน้า คำนวณฝั่งเซิร์ฟเวอร์ในหน่วยสตางค์ — เดิมฝั่งเว็บบวกเองจาก
      // ตัวเลขบาทแบบทศนิยม ซึ่งคลาดเคลื่อนได้เมื่อรวมกันหลายร้อยรายการ
      total_cost_satang: grand_total_satang,
      total_cost: fromSatang(grand_total_satang),
    });
  })
);

module.exports = router;
