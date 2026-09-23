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
// ไฟล์นี้ไม่คำนวณค่าใช้จ่ายเองอีกแล้ว — อ่านยอดที่ `v_monthly_kpi` คิดไว้ต่อหนึ่ง
// เครื่องหนึ่งเดือน แล้วบวกกันในหน่วยสตางค์ที่เป็นจำนวนเต็ม
//
// เดิมหน้านี้หาราคาเองจากค่าปัจจุบันของเครื่องและสัญญา ซึ่งเป็นเส้นทางคำนวณเงิน
// เส้นที่สองของระบบ พอราคาผูกกับช่วงเวลาที่มีผลจริง (ADR-0019) เส้นทางนั้นจะตอบ
// คนละคำตอบกับแดชบอร์ดทันที เพราะใช้ราคา ณ ปัจจุบันกับทุกเดือนย้อนหลัง
//
// ยอดที่เป็น `null` แปลว่า "หาราคาไม่ได้" ไม่ใช่ศูนย์บาท — ทางเขียนปฏิเสธยอดแบบนี้แล้ว
// (ADR-0021) จึงเหลือเฉพาะยอดเก่า แต่ทุกยอดรวมยังมาพร้อม `unpriced_readings` เสมอ

const express = require("express");
const { z } = require("zod");

const router = express.Router();
const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const requireAuth = require("../auth/require-auth");
const { validate, monthListQuery } = require("../shared/validate");
const { notFound } = require("../shared/http-error");
const cache = require("../shared/cache");
const { effectiveLocationJoin } = require("../shared/effective-location-sql");
const { toSatang, fromSatang, sumSatang } = require("@suth/domain");

router.use(requireAuth);

/**
 * รวมยอดพิมพ์รายเดือนของเครื่องหนึ่งให้เป็นก้อนพร้อมค่าใช้จ่าย
 *
 * ## ค่าใช้จ่ายมาจาก v_monthly_kpi ไม่ได้คำนวณซ้ำที่นี่
 *
 * เดิมไฟล์นี้หาราคาเองด้วย `effectivePriceSatang(price_override, contract_price)`
 * จากค่าปัจจุบัน แล้วคูณเอง ซึ่งเป็นการคำนวณเงินเส้นทางที่สองของระบบ พอราคาเปลี่ยน
 * มาผูกกับช่วงเวลาที่มีผลจริง (ADR-0019) เส้นทางนี้จะตอบคนละคำตอบกับแดชบอร์ดทันที
 * เพราะมันยังใช้ราคา ณ ปัจจุบันกับทุกเดือน
 *
 * ตอนนี้อ่านยอดที่ view คำนวณไว้แล้วมาบวกกัน — จุดปัดเศษและกฎการหาราคาจึงมีชุดเดียว
 *
 * `cost` เป็น `null` แปลว่า "หาราคาไม่ได้" (ยอดเก่าก่อน ADR-0021) ไม่ใช่ศูนย์บาท และ
 * ไม่ถูกนับรวมในยอดรวม ผู้เรียกต้องแสดง `unpriced_readings` ควบคู่เสมอ
 *
 * @param {{ month: string, pages: number, total_cost: string|null }[]} transactions
 */
function summarise(transactions) {
  // เครื่องที่มีมิเตอร์สีมีสองแถวต่อเดือน รวมเป็นหนึ่งแถวต่อเดือนของเครื่อง
  const byMonth = new Map();
  for (const row of transactions) {
    const satang = row.total_cost === null || row.total_cost === undefined ? null : toSatang(row.total_cost);
    const entry = byMonth.get(row.month) ?? {
      ...row,
      pages: 0,
      cost_satang: 0,
      unpriced: 0,
      prices: new Set(),
    };
    entry.pages += Number(row.pages || 0);
    if (satang === null) entry.unpriced += 1;
    else entry.cost_satang += satang;
    if (row.price_per_page !== null && row.price_per_page !== undefined) entry.prices.add(String(row.price_per_page));
    byMonth.set(row.month, entry);
  }

  const monthly = [...byMonth.values()].map(({ prices, unpriced, ...entry }) => {
    const cost_satang = unpriced ? null : entry.cost_satang;
    return {
      ...entry,
      price_per_page: prices.size === 1 ? [...prices][0] : null,
      cost_satang,
      cost: cost_satang === null ? null : fromSatang(cost_satang),
      unpriced_readings: unpriced,
    };
  });

  const total_cost_satang = sumSatang(monthly.filter((m) => m.cost_satang !== null).map((m) => m.cost_satang));
  const prices = [
    ...new Set(
      transactions
        .map((m) => m.price_per_page)
        .filter((price) => price !== null && price !== undefined)
        .map(String)
    ),
  ];

  return {
    monthly,
    total_pages: monthly.reduce((sum, m) => sum + m.pages, 0),
    unpriced_readings: monthly.reduce((sum, m) => sum + m.unpriced_readings, 0),
    effective_prices: prices,
    effective_price: prices.length === 1 ? Number(prices[0]) : null,
    total_cost_satang,
    total_cost: fromSatang(total_cost_satang),
  };
}

// ============================================================
// GET /api/expense/unassigned-devices
//
// เครื่องที่ยังไม่ได้ผูกกับสัญญาใดๆ — ต้องประกาศก่อน "/:fiscal_year_id" ไม่งั้น
// Express จะจับ "unassigned-devices" เป็นค่าของพารามิเตอร์แทน
//
// กลุ่มนี้สำคัญกว่าที่เห็น: เครื่องที่ไม่มีสัญญาและไม่มีราคาพิเศษเฉพาะเครื่อง จะคิด
// ค่าใช้จ่ายได้ 0 บาทเสมอ — ยอดพิมพ์ของมันหายไปจากงบโดยไม่มีใครรู้ หน้าเว็บจึง
// ต้องเห็นกลุ่มนี้แยกออกมาชัดๆ ไม่ใช่ซ่อนไว้
// ============================================================
router.get(
  "/unassigned-devices",
  asyncHandler(async (req, res) => {
    const [devices] = await db.query(`
      SELECT d.id, d.serial_number, d.model, d.price_override, b.name AS brand_name, d.location, eb.name AS building_name, ef.name AS floor_name
      FROM devices d
      LEFT JOIN brand b ON d.brand_id = b.id
      LEFT JOIN building eb ON eb.id = d.building_id
      LEFT JOIN floor ef ON ef.id = d.floor_id
      WHERE d.contract_id IS NULL
      ORDER BY d.serial_number
    `);

    // ไม่จำกัดช่วงเดือน เพราะเครื่องกลุ่มนี้ไม่ผูกกับปีงบไหนเลย
    const readings = devices.length
      ? await (async () => {
          const [rows] = await db.query(
            `SELECT device_id, month, pages_printed AS pages, price_per_page, total_cost
             FROM v_monthly_kpi WHERE device_id IN (?) ORDER BY month`,
            [devices.map((d) => d.id)]
          );
          const grouped = new Map(devices.map((d) => [d.id, []]));
          for (const row of rows) grouped.get(row.device_id)?.push(row);
          return grouped;
        })()
      : new Map();

    for (const device of devices) {
      Object.assign(device, summarise(readings.get(device.id) ?? []));
    }

    const total_cost_satang = sumSatang(devices.map((d) => d.total_cost_satang));

    cache.operationalData(res);
    res.json({
      devices,
      total_cost_satang,
      total_cost: fromSatang(total_cost_satang),
      unpriced_readings: devices.reduce((sum, d) => sum + d.unpriced_readings, 0),
    });
  })
);

// ============================================================
// GET /api/expense/:fiscal_year_id — ค่าใช้จ่ายตามสัญญาที่คิดเงินจริงในแต่ละเดือน
// ============================================================
//
// ยอดของเดือนหนึ่งอยู่ใต้สัญญาที่คิดเงินเครื่องนั้นในเดือนนั้น (v_monthly_kpi.billing_contract_id)
// ไม่ใช่สัญญาปัจจุบันของเครื่อง — เครื่องที่ย้ายสัญญากลางปีจึงปรากฏใต้ทั้งสองสัญญา
// ตามเดือนของมัน และยอดรวมของทุกสัญญา + กลุ่มที่ไม่มีสัญญา เท่ายอดของแดชบอร์ดเสมอ
//
// สัญญาในรายการคือทุกฉบับที่อายุสัญญาคร่อมปีงบนี้ (ADR-0023) แม้ยังไม่มียอด และแต่ละ
// ฉบับมียอดตามใบแจ้งหนี้รวมค่าเช่าคงที่และ VAT จาก v_contract_invoice
router.get(
  "/:fiscal_year_id",
  validate({
    params: z.object({ fiscal_year_id: z.coerce.number().int().positive("รหัสปีงบประมาณไม่ถูกต้อง") }),
    query: z.object({ month: monthListQuery }),
  }),
  asyncHandler(async (req, res) => {
    const fiscalYearId = req.params.fiscal_year_id;
    const monthsFilter = req.query.month;

    const [[fiscalYear]] = await db.query(
      `SELECT start_month, end_month,
              STR_TO_DATE(CONCAT(start_month, '-01'), '%Y-%m-%d') AS start_date,
              LAST_DAY(STR_TO_DATE(CONCAT(end_month, '-01'), '%Y-%m-%d')) AS end_date
       FROM fiscal_year WHERE id = ?`,
      [fiscalYearId]
    );
    if (!fiscalYear) throw notFound("ไม่พบปีงบประมาณนี้");

    const monthClause = monthsFilter.length ? " AND v.month IN (?)" : "";
    const monthParams = monthsFilter.length ? [monthsFilter] : [];

    const [contractRows] = await db.query(
      `SELECT c.id, c.contract_no,
              DATE_FORMAT(c.effective_from, '%Y-%m-%d') AS effective_from,
              DATE_FORMAT(c.effective_to, '%Y-%m-%d') AS effective_to,
              c.monthly_rental, c.vat_rate
       FROM contracts c
       WHERE c.effective_from <= ? AND c.effective_to >= ?
       ORDER BY c.contract_no`,
      [fiscalYear.end_date, fiscalYear.start_date]
    );

    const [readings] = await db.query(
      `SELECT v.device_id, v.month, v.pages_printed AS pages, v.price_per_page, v.total_cost,
              v.billing_contract_id, bc.contract_no AS billing_contract_no,
              d.serial_number, d.model, d.status, d.price_override, br.name AS brand_name,
              eb.name AS building_name, ef.name AS floor_name,
              CASE WHEN h.id IS NOT NULL THEN h.location ELSE d.location END AS location
       FROM v_monthly_kpi v
       JOIN devices d ON d.id = v.device_id
       LEFT JOIN contracts bc ON bc.id = v.billing_contract_id
       LEFT JOIN brand br ON br.id = d.brand_id
       ${effectiveLocationJoin({ deviceAlias: "d", monthExpression: "v.month", historyAlias: "h" })}
       LEFT JOIN building eb ON eb.id = CASE WHEN h.id IS NOT NULL THEN h.building_id ELSE d.building_id END
       LEFT JOIN floor ef ON ef.id = CASE WHEN h.id IS NOT NULL THEN h.floor_id ELSE d.floor_id END
       WHERE v.month BETWEEN ? AND ?${monthClause}
       ORDER BY v.month, d.serial_number`,
      [fiscalYear.start_month, fiscalYear.end_month, ...monthParams]
    );

    const [invoiceRows] = await db.query(
      `SELECT v.contract_id,
              SUM(v.rental) AS rental, SUM(v.vat) AS vat, SUM(v.invoice_total) AS invoice_total
       FROM v_contract_invoice v
       WHERE v.month BETWEEN ? AND ?${monthClause}
       GROUP BY v.contract_id`,
      [fiscalYear.start_month, fiscalYear.end_month, ...monthParams]
    );
    const invoiceBy = new Map(invoiceRows.map((row) => [row.contract_id, row]));

    // จัดยอดเป็น สัญญา → เครื่อง → เดือน
    const groups = new Map();
    for (const row of readings) {
      const key = row.billing_contract_id ?? null;
      if (!groups.has(key)) groups.set(key, new Map());
      const devices = groups.get(key);
      if (!devices.has(row.device_id)) {
        devices.set(row.device_id, {
          device: {
            id: row.device_id,
            serial_number: row.serial_number,
            model: row.model,
            status: row.status,
            brand_name: row.brand_name,
            price_override: row.price_override,
          },
          rows: [],
        });
      }
      devices.get(row.device_id).rows.push(row);
    }

    const deviceList = (key) =>
      [...(groups.get(key)?.values() ?? [])].map(({ device, rows }) => ({ ...device, ...summarise(rows) }));

    const totals = (devices) => {
      const total_cost_satang = sumSatang(devices.map((d) => d.total_cost_satang));
      return {
        device_count: devices.length,
        total_pages: devices.reduce((sum, d) => sum + d.total_pages, 0),
        total_cost_satang,
        total_cost: fromSatang(total_cost_satang),
        unpriced_readings: devices.reduce((sum, d) => sum + d.unpriced_readings, 0),
      };
    };

    const withInvoice = (contract, devices) => {
      const invoice = invoiceBy.get(contract.id);
      return {
        ...contract,
        devices,
        ...totals(devices),
        rental: invoice ? String(invoice.rental) : "0.00",
        vat: invoice ? String(invoice.vat) : "0.00",
        invoice_total: invoice ? String(invoice.invoice_total) : "0.00",
      };
    };

    const contracts = contractRows.map((contract) => withInvoice(contract, deviceList(contract.id)));

    // ยอดในปีงบที่คิดเงินใต้สัญญาซึ่งอายุไม่คร่อมปีงบนี้ — ทางเขียนทุกทางปฏิเสธยอดนอก
    // อายุสัญญาแล้ว (ADR-0021) จึงไม่ควรเกิด แต่ถ้าเกิดต้องไม่หายจากยอดรวม
    const listed = new Set(contractRows.map((c) => c.id));
    for (const key of groups.keys()) {
      if (key === null || listed.has(key)) continue;
      const contract_no = readings.find((row) => row.billing_contract_id === key)?.billing_contract_no;
      contracts.push(withInvoice({ id: key, contract_no }, deviceList(key)));
    }

    const noContractDevices = deviceList(null);
    const noContract = totals(noContractDevices);
    const grandSatang = sumSatang(contracts.map((c) => c.total_cost_satang)) + noContract.total_cost_satang;
    const invoiceSatang = sumSatang(contracts.map((c) => toSatang(c.invoice_total)));

    cache.operationalData(res);
    res.json({
      fiscal_year_id: fiscalYearId,
      month: monthsFilter.length ? monthsFilter.join(",") : null,
      contracts,
      // ค่าพิมพ์รวมทุกสัญญาและกลุ่มที่ไม่มีสัญญา — เท่ายอดค่าใช้จ่ายบนแดชบอร์ด
      total_cost_satang: grandSatang,
      total_cost: fromSatang(grandSatang),
      // ยอดตามใบแจ้งหนี้รวมค่าเช่าและ VAT ของทุกสัญญา
      invoice_total_satang: invoiceSatang,
      invoice_total: fromSatang(invoiceSatang),
      unpriced_readings:
        contracts.reduce((sum, c) => sum + c.unpriced_readings, 0) + noContract.unpriced_readings,
      no_contract_devices: noContractDevices,
      no_contract_total: noContract.total_cost,
      no_contract_unpriced_readings: noContract.unpriced_readings,
    });
  })
);

module.exports = router;
