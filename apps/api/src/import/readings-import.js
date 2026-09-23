// apps/api/src/import/readings-import.js
//
// นำเข้ายอดพิมพ์ (มิเตอร์) — อ่านแผ่นงานเป็นยอดรายมิเตอร์ เทียบกับยอดเดิม และตรวจยอดที่เขียนแล้วกับราคาในระบบ
// ใช้ทั้ง POST /print-transactions/import และ import session
// ย้ายมาจาก import/controller.js โดยไม่เปลี่ยนพฤติกรรม (#178)
//
// รับสองรูปแบบ ตรวจรูปแบบเองจากหัวตาราง
//
//   1. รายงานมิเตอร์รายงวดของผู้ให้เช่า (ADR-0023) — หลายแผ่น แผ่นละงวด มีเลขมิเตอร์
//      ต้นงวด/สิ้นงวดและราคาต่อหน้า ดู import/vendor-meter.js
//   2. เทมเพลตเดิม — แผ่นเดียว คอลัมน์ "meter M/YY" เป็นยอดรายเดือนของมิเตอร์หลัก
//      ไฟล์จริงเก็บนอก repo (repo เป็น public) — หัวตารางดูที่ docs/reference/import-format.md

const crypto = require("crypto");
const { badRequest } = require("../shared/http-error");
const { assertReadingsPriced } = require("../devices/meters");
const { MAX_PAGES_PER_MONTH, normalizeMonth } = require("@suth/domain");
const { parseVendorWorkbook, comparableContractNo } = require("./vendor-meter");
const { normalizeName } = require("../master-data/names");
const { serialIndex } = require("./registry-plan");

// ============================================================
// แปลง "เดือน/ปี พ.ศ. 2 หลัก" ในหัวคอลัมน์ไฟล์มิเตอร์ (เช่น "meter 9/67",
// "meter10/67", "meter 1/68") ให้เป็น "YYYY-MM" (ค.ศ.) ที่ตรงกับเดือนจริง
//
// ⚠️ ห้ามใช้ "ลำดับคอลัมน์" (column position) มาเดาว่าเป็นเดือนไหนของปีงบ
// เพราะไฟล์ Excel เดิมเรียงคอลัมน์เดือนเริ่มจาก "กันยายน" (เดือนก่อนปีงบใหม่)
// ไม่ได้เริ่มจาก "ตุลาคม" แบบปีงบราชการไทยที่ระบบใช้ (ดู @suth/domain)
// ถ้า map ตามตำแหน่งคอลัมน์ตรงๆ ยอดของเดือนกันยาจะไปตกที่เดือนตุลาแทน (เพี้ยนทั้งแถว)
// จึงต้อง "อ่านชื่อเดือน/ปีจากหัวคอลัมน์" ทุกครั้ง แล้วคำนวณเป็นเดือนปฏิทินจริงเสมอ
// เมื่อเดือนจริงถูกต้องแล้ว การ query ด้วยช่วงปีงบ (start_month/end_month) ฝั่ง
// print-transactions.js ก็จะแบ่งเดือนเข้าปีงบที่ถูกต้องเองโดยอัตโนมัติ
function parseMeterMonthHeader(header) {
  const match = String(header || "").match(/meter\s*(\d{1,2})\s*\/\s*(\d{2})/i);
  if (!match) return null;

  const month = Number(match[1]);
  if (month < 1 || month > 12) return null;

  // ปี พ.ศ. ในไฟล์เก็บแค่ 2 หลัก (เช่น "67" = 2567) — เดาศตวรรษ 2500 เอา
  // เพราะไฟล์นี้เป็นข้อมูลปีงบปัจจุบัน ไม่มีทางเป็นปี 2400 หรือ 2600
  const beYearFull = 2500 + Number(match[2]);

  // ส่งต่อให้ normalizeMonth() แปลง พ.ศ. เป็น ค.ศ. — การลบ 543 อยู่ที่ @suth/domain ที่เดียว
  return normalizeMonth(`${beYearFull}-${month}`);
}

/** มิเตอร์ทั้งหมด จัดตามเครื่อง — { primary, color } */
async function loadMeters(conn) {
  const [devices] = await conn.query("SELECT id, serial_number FROM devices");
  const [meters] = await conn.query(
    `SELECT dm.id, dm.device_id, mc.is_color
     FROM device_meter dm
     JOIN meter_category mc ON mc.id = dm.category_id
     ORDER BY mc.sort_order, dm.id`
  );

  const byDevice = new Map();
  for (const meter of meters) {
    const entry = byDevice.get(meter.device_id) ?? { primary: null, color: null };
    if (meter.is_color) entry.color ??= meter.id;
    else entry.primary ??= meter.id;
    byDevice.set(meter.device_id, entry);
  }

  const bySerial = new Map();
  for (const device of devices) {
    // คีย์รูปเดียวกับเลขซีเรียลที่ตัวอ่านไฟล์คืนมา (normalizeName) — ไม่งั้นเลขในทะเบียนที่มีช่องว่างซ้อน
    // จะไม่ตรงกับเลขเดียวกันในไฟล์ (#147)
    bySerial.set(normalizeName(device.serial_number).toUpperCase(), {
      deviceId: device.id,
      ...(byDevice.get(device.id) ?? { primary: null, color: null }),
    });
  }
  return bySerial;
}

/** รายงานของผู้ให้เช่า → ยอดรายมิเตอร์ */
/**
 * เหตุผลของเลขซีเรียลที่ไม่มีในทะเบียน — ถ้าในทะเบียนมีเลขที่น่าจะเป็นเครื่องเดียวกันแต่พิมพ์ผิด
 * (เช่น "WB1B…" ในรายงานของผู้ให้เช่ากับ "BW1B…" ในทะเบียน) บอกเลขนั้นด้วย คนแก้จะรู้ว่าต้องแก้ที่ไหน
 */
const indexOfMeters = new WeakMap();

function unknownSerialReason(serial, meters) {
  // ดัชนีสร้างครั้งเดียวต่อชุดมิเตอร์ ไฟล์ที่มีเลขไม่รู้จักหลายหมื่นแถวต้องไม่เทียบทุกคู่
  if (!indexOfMeters.has(meters)) indexOfMeters.set(meters, serialIndex([...meters.keys()]));
  const [similar] = indexOfMeters.get(meters).similar(serial);
  return similar
    ? `ไม่พบเครื่อง SN "${serial}" ในทะเบียน — ในทะเบียนมี "${similar}" ตรวจว่าพิมพ์ผิดหรือไม่`
    : `ไม่พบเครื่อง SN "${serial}" ในทะเบียน — ลงทะเบียนเครื่องก่อน`;
}

function mapVendorReadings(vendor, meters) {
  const candidates = [];
  const errors = [...vendor.errors];
  const seen = new Set();

  for (const reading of vendor.readings) {
    const where = {
      sheet: reading.sheet,
      row: reading.row,
      serial_number: reading.serial_number,
      month: reading.month,
    };
    const device = meters.get(reading.serial_number.toUpperCase());
    if (!device) {
      errors.push({ ...where, reason: unknownSerialReason(reading.serial_number, meters) });
      continue;
    }

    const meterId = reading.meter === "color" ? device.color : device.primary;
    if (!meterId) {
      errors.push({
        ...where,
        reason:
          reading.meter === "color"
            ? "ไฟล์มีแถวมิเตอร์สีของเครื่องนี้ แต่ในทะเบียนเครื่องนี้ไม่มีมิเตอร์สี"
            : "เครื่องนี้ยังไม่มีมิเตอร์ในทะเบียน",
      });
      continue;
    }

    const key = `${meterId}|${reading.month}`;
    if (seen.has(key)) {
      errors.push({ ...where, reason: "มิเตอร์และงวดนี้ซ้ำกันในไฟล์" });
      continue;
    }
    seen.add(key);

    candidates.push({
      device_id: device.deviceId,
      meter_id: meterId,
      meter: reading.meter,
      serial_number: reading.serial_number,
      month: reading.month,
      pages: reading.pages,
      meter_start: reading.meter_start,
      meter_end: reading.meter_end,
      file_price: reading.file_price,
      contract_no: reading.contract_no,
      sheet: reading.sheet,
      row: reading.row,
    });
  }

  return { candidates, errors, months: [...new Set(vendor.sheets.map((s) => s.month))].sort() };
}

/** เทมเพลตเดิม (meter M/YY) → ยอดของมิเตอร์หลัก */
function mapTemplateReadings(raw, meters) {
  const headerRowIndex = raw.findIndex((row) =>
    row.some((cell) => /^sn\.?$/i.test(String(cell || "").trim()))
  );
  if (headerRowIndex === -1) {
    throw badRequest("ไม่พบแถวหัวตารางในไฟล์", {
      code: "header_row_not_found",
      detail:
        "หาคอลัมน์ \"SN.\" หรือหัวตาราง \"Meter Start/Meter End\" ไม่เจอ ไฟล์นี้อาจไม่ใช่รูปแบบที่รองรับ — ดูตัวอย่างที่ docs/reference/import-format.md",
    });
  }

  const headerRow = raw[headerRowIndex];
  const snColIndex = headerRow.findIndex((cell) => /^sn\.?$/i.test(String(cell || "").trim()));

  // เก็บ "index คอลัมน์ -> เดือนจริง (YYYY-MM)" เฉพาะคอลัมน์ meter M/YY เท่านั้น
  // (ไม่ยุ่งกับคอลัมน์ "พิมพ์ประจำเดือน"/"พิมพ์สะสม" ที่ซ้ำ/เป็นยอดคำนวณ ไม่ใช่ค่าดิบ)
  const meterColumns = [];
  headerRow.forEach((cell, idx) => {
    const month = parseMeterMonthHeader(cell);
    if (month) meterColumns.push({ idx, month });
  });
  if (!meterColumns.length) {
    throw badRequest("ไม่พบคอลัมน์มิเตอร์รายเดือนในไฟล์", {
      code: "meter_columns_not_found",
      detail: "หัวคอลัมน์ต้องอยู่ในรูป \"meter M/YY\" เช่น \"meter 9/67\" หรือเป็นรายงานมิเตอร์ของผู้ให้เช่า",
    });
  }

  const candidates = [];
  const errors = [];
  const seenKeys = new Set();

  for (let r = headerRowIndex + 1; r < raw.length; r++) {
    const row = raw[r];
    if (!row || !row.length) continue;

    const sn = normalizeName(row[snColIndex]);
    if (!sn) continue;

    const device = meters.get(sn.toUpperCase());
    if (!device || !device.primary) {
      errors.push({ row: r + 1, serial_number: sn, reason: device ? `เครื่อง SN "${sn}" ยังไม่มีมิเตอร์ในทะเบียน` : unknownSerialReason(sn, meters) });
      continue;
    }

    for (const { idx, month } of meterColumns) {
      const cellValue = row[idx];

      // ช่องว่าง = ไม่เปลี่ยนข้อมูลเดิม ส่วน 0 = ยืนยันว่าเดือนนั้นเป็นศูนย์
      if (cellValue === "" || cellValue === null || cellValue === undefined) continue;

      const pages = Number(cellValue);
      if (!Number.isFinite(pages) || pages < 0 || !Number.isInteger(pages) || pages > MAX_PAGES_PER_MONTH) {
        errors.push({
          row: r + 1,
          serial_number: sn,
          month,
          reason: `ยอดพิมพ์ต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง ${MAX_PAGES_PER_MONTH.toLocaleString("th-TH")} (พบ "${cellValue}")`,
        });
        continue;
      }

      const key = `${device.primary}|${month}`;
      if (seenKeys.has(key)) {
        errors.push({ row: r + 1, serial_number: sn, month, reason: "Serial และเดือนนี้ซ้ำกันในไฟล์" });
        continue;
      }
      seenKeys.add(key);
      candidates.push({
        device_id: device.deviceId,
        meter_id: device.primary,
        meter: "primary",
        serial_number: sn,
        month,
        pages,
        meter_start: null,
        meter_end: null,
        file_price: null,
        contract_no: null,
        row: r + 1,
      });
    }
  }

  return { candidates, errors, months: [...new Set(meterColumns.map((m) => m.month))].sort() };
}

async function writeCandidates(conn, rows) {
  if (!rows.length) return;
  await conn.query(
    `INSERT INTO print_transactions (device_id, meter_id, month, meter_start, meter_end, pages)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       pages = VALUES(pages), meter_start = VALUES(meter_start), meter_end = VALUES(meter_end)`,
    [rows.map((row) => [row.device_id, row.meter_id, row.month, row.meter_start, row.meter_end, row.pages])]
  );
}

/**
 * ตรวจยอดที่เพิ่งเขียน (ใน transaction เดียวกัน) กับราคาและสัญญาในระบบ
 * แล้วสรุปยอดตามใบแจ้งหนี้ของทุกงวดในไฟล์
 */
async function checkWrittenReadings(conn, candidates, months) {
  const errors = [];
  const warnings = [];

  try {
    await assertReadingsPriced(conn, candidates.map((row) => ({ meterId: row.meter_id, month: row.month })));
  } catch (err) {
    if (err?.code !== "unpriced_reading") throw err;
    errors.push(...(err.errors ?? []));
  }

  if (!candidates.length) return { errors, warnings, invoice: [] };

  const [priced] = await conn.query(
    `SELECT v.meter_id, v.month, v.price_per_page, c.contract_no
     FROM v_monthly_kpi v
     LEFT JOIN contracts c ON c.id = v.billing_contract_id
     WHERE v.month IN (?) AND v.meter_id IN (?)`,
    [months, [...new Set(candidates.map((row) => row.meter_id))]]
  );
  const systemBy = new Map(priced.map((row) => [`${row.meter_id}|${row.month}`, row]));

  for (const row of candidates) {
    const system = systemBy.get(`${row.meter_id}|${row.month}`);
    if (!system || system.price_per_page === null) continue; // รายงานไว้แล้วข้างบน
    const where = { sheet: row.sheet, row: row.row, serial_number: row.serial_number, month: row.month };

    if (row.file_price !== null && Math.abs(Number(system.price_per_page) - row.file_price) > 0.00001) {
      errors.push({
        ...where,
        reason: `ราคาในไฟล์ ${row.file_price} ไม่ตรงกับราคาในระบบ ${Number(system.price_per_page)} — ตรวจหมวดมิเตอร์ของเครื่องหรือราคาในสัญญา`,
      });
    }
    if (row.contract_no && comparableContractNo(row.contract_no) !== comparableContractNo(system.contract_no)) {
      errors.push({
        ...where,
        reason: `ไฟล์เป็นของสัญญา ${row.contract_no} แต่ในระบบเครื่องนี้คิดเงินใต้สัญญา ${system.contract_no ?? "(ไม่มี)"}`,
      });
    }
  }

  // เลขต้นงวดควรเท่าเลขสิ้นงวดของงวดก่อนของมิเตอร์เดียวกัน — ไม่เท่าแปลว่ามียอดหาย
  // หรือซ้ำระหว่างงวด เตือนแต่ไม่ปฏิเสธ เพราะผู้ให้เช่าเป็นคนออกเลขทั้งสองค่า
  const [gaps] = await conn.query(
    `SELECT pt.meter_id, pt.month, pt.meter_start, prev.meter_end AS previous_end, prev.month AS previous_month
     FROM print_transactions pt
     JOIN print_transactions prev ON prev.meter_id = pt.meter_id AND prev.month = (
       SELECT MAX(p2.month) FROM print_transactions p2 WHERE p2.meter_id = pt.meter_id AND p2.month < pt.month
     )
     WHERE pt.month IN (?) AND pt.meter_id IN (?)
       AND pt.meter_start IS NOT NULL AND prev.meter_end IS NOT NULL
       AND pt.meter_start <> prev.meter_end`,
    [months, [...new Set(candidates.map((row) => row.meter_id))]]
  );
  const candidateBy = new Map(candidates.map((row) => [`${row.meter_id}|${row.month}`, row]));
  for (const gap of gaps) {
    const row = candidateBy.get(`${gap.meter_id}|${gap.month}`);
    if (!row) continue;
    warnings.push({
      sheet: row.sheet,
      row: row.row,
      serial_number: row.serial_number,
      month: row.month,
      reason: `เลขต้นงวด ${gap.meter_start} ไม่เท่าเลขสิ้นงวด ${gap.previous_end} ของงวด ${gap.previous_month}`,
    });
  }

  const [invoice] = await conn.query(
    `SELECT v.month, c.contract_no, v.meter_category AS category, v.price_per_page,
            SUM(v.pages_printed) AS pages, SUM(v.net_pages) AS net_pages, SUM(v.total_cost) AS line_total
     FROM v_monthly_kpi v
     LEFT JOIN contracts c ON c.id = v.billing_contract_id
     WHERE v.month IN (?) AND v.billing_contract_id IN (
       SELECT DISTINCT v2.billing_contract_id FROM v_monthly_kpi v2
       WHERE v2.month IN (?) AND v2.meter_id IN (?)
     )
     GROUP BY v.month, c.contract_no, v.meter_category_id, v.meter_category, v.price_per_page
     ORDER BY v.month, c.contract_no, v.meter_category_id`,
    [months, months, [...new Set(candidates.map((row) => row.meter_id))]]
  );

  return {
    errors,
    warnings,
    invoice: invoice.map((line) => ({
      month: line.month,
      contract_no: line.contract_no,
      category: line.category,
      price_per_page: line.price_per_page === null ? null : String(line.price_per_page),
      pages: Number(line.pages),
      net_pages: String(line.net_pages),
      line_total: line.line_total === null ? null : String(line.line_total),
    })),
  };
}

/** ส่งสัญญาณให้ withTransaction ย้อนกลับ พร้อมผลตรวจของขั้น preview */
class PreviewRollback extends Error {
  constructor(result) {
    super("preview");
    this.result = result;
  }
}

/** แผ่นงานของไฟล์ยอดพิมพ์ → ยอดรายมิเตอร์ที่จับคู่เครื่องแล้ว */
function readingsFromSheets(sheets, meters) {
  const vendor = parseVendorWorkbook(sheets);
  const format = vendor ? "vendor" : "template";
  const { candidates, errors, months } = vendor
    ? mapVendorReadings(vendor, meters)
    : mapTemplateReadings(sheets[0].rows, meters);
  return { vendor, format, candidates, errors, months };
}

/** แบ่งยอดเป็นรายการใหม่ / จะเขียนทับ / ไม่เปลี่ยน เทียบกับยอดที่มีอยู่ */
async function compareWithExisting(q, candidates, months) {
  const existingMap = new Map();
  if (candidates.length) {
    const [existing] = await q.query(
      "SELECT meter_id, month, pages FROM print_transactions WHERE meter_id IN (?) AND month IN (?)",
      [[...new Set(candidates.map((row) => row.meter_id))], months]
    );
    for (const row of existing) existingMap.set(`${row.meter_id}|${row.month}`, Number(row.pages));
  }

  const newRows = [];
  const overwriteRows = [];
  const unchangedRows = [];
  for (const row of candidates) {
    const key = `${row.meter_id}|${row.month}`;
    if (!existingMap.has(key)) newRows.push(row);
    else if (existingMap.get(key) === row.pages) unchangedRows.push(row);
    else overwriteRows.push({ ...row, previous_pages: existingMap.get(key) });
  }
  return { existingMap, newRows, overwriteRows, unchangedRows };
}

/**
 * ผูก token กับทั้งไฟล์และค่าเดิมที่ผู้ใช้เห็นในหน้าตรวจ หากมีคนแก้ยอด
 * ระหว่างเปิด preview กับกดยืนยัน token จะไม่ตรงและระบบจะให้ตรวจใหม่
 * แทนการเขียนทับค่าที่ผู้ใช้ไม่เคยเห็น
 */
function readingsToken(fileDigest, candidates, existingMap) {
  return crypto
    .createHash("sha256")
    .update(fileDigest)
    .update(JSON.stringify(candidates.map((row) => ({
      meter_id: row.meter_id,
      month: row.month,
      pages: row.pages,
      meter_start: row.meter_start,
      meter_end: row.meter_end,
      previous_pages: existingMap.has(`${row.meter_id}|${row.month}`)
        ? existingMap.get(`${row.meter_id}|${row.month}`)
        : null,
    }))))
    .digest("hex");
}

module.exports = {
  parseMeterMonthHeader,
  loadMeters,
  unknownSerialReason,
  mapVendorReadings,
  mapTemplateReadings,
  readingsFromSheets,
  compareWithExisting,
  readingsToken,
  writeCandidates,
  checkWrittenReadings,
  PreviewRollback,
};
