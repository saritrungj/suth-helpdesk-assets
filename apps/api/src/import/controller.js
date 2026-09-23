const fs = require("fs");
const crypto = require("crypto");
const XLSX = require("xlsx");
const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const { badRequest, conflict } = require("../shared/http-error");
const { z } = require("zod");
const { today } = require("../devices/contract-history");
const { assertReadingsPriced } = require("../devices/meters");
const { MAX_PAGES_PER_MONTH, normalizeMonth } = require("@suth/domain");

/** เพดานไฟล์ยอดพิมพ์ต่อการนำเข้าหนึ่งครั้ง — ไฟล์รายงวดจริงมีไม่กี่สิบแผ่น แผ่นละไม่กี่ร้อยแถว */
const MAX_IMPORT_SHEETS = 60;
const MAX_IMPORT_ROWS = 50000;
const MAX_IMPORT_COLUMNS = 200;
// แถว × คอลัมน์ที่ประกาศรวมทุกแผ่น — แถวกับคอลัมน์ที่ผ่านเพดานของตัวเองทั้งคู่ยังคูณกันได้หลายล้าน
// เซลล์ (SheetJS กางทุกเซลล์ในช่วงที่ประกาศ) ไฟล์จริงมีไม่กี่หมื่นเซลล์ (#142)
const MAX_IMPORT_CELLS = 1_000_000;
const { parseVendorWorkbook, comparableContractNo } = require("./vendor-meter");
const { normalizeName } = require("../master-data/names");
const { parseRegistryWorkbook } = require("./registry-sheet");
const { planRegistryImport, serialIndex } = require("./registry-plan");
const { loadRegistryContext, applyRegistryPlan } = require("./registry-import");

// ============================================================
// ตัวช่วยที่ทั้งสอง handler ใช้ร่วมกัน
// ============================================================

/**
 * ลบไฟล์ที่อัปโหลดเข้ามาชั่วคราว — ต้องเรียกใน finally เสมอ
 *
 * เดิมการลบถูกเขียนซ้ำสามที่ (ทางสำเร็จหนึ่ง ทาง catch อีกสอง) ซึ่งแปลว่าเส้นทาง
 * ที่ไม่ได้ผ่านสามจุดนั้นจะทิ้งไฟล์ค้างไว้ใน uploads/ ตลอดไป
 *
 * การลบเองก็พังได้ (ไฟล์ถูกลบไปแล้ว สิทธิ์ไม่พอ) — ห้ามให้ error ตอนเก็บกวาด
 * ไปทับ error ตัวจริงที่กำลังจะถูกโยนออกไป
 */
function removeUploadedFile(file) {
  if (!file || !file.path) return;

  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch (err) {
    console.error("IMPORT TEMP FILE CLEANUP ERROR:", err);
  }
}

/**
 * อ่านไฟล์ที่อัปโหลดมาเป็นแผ่นงานแรก — ไฟล์ที่ SheetJS แกะไม่ออกต้องเป็น 400 ไม่ใช่ 500
 *
 * ด่านนามสกุล/MIME ที่ routes.js กันไว้เชื่อได้แค่ชื่อไฟล์กับหัวที่ client ส่งมา ซึ่ง
 * ทั้งสองอย่างผู้ส่งตั้งเองได้ ไฟล์ HTML ที่ถูกเปลี่ยนนามสกุลเป็น .xlsx (ซึ่งเกิดจริง
 * เวลาคน "Save as" จากระบบอื่น) จึงผ่านด่านนั้นมาแล้วไประเบิดตอน XLSX.readFile
 * ผู้ใช้เห็น "เกิดข้อผิดพลาดในระบบ" ซึ่งบอกไม่ได้ว่าต้องไปแก้อะไร
 */
function readWorkbook(filePath, options) {
  try {
    // CSV อ่านเป็นข้อความ UTF-8 เอง — SheetJS อ่าน CSV ที่ไม่มี BOM เป็น latin1 แล้วหัวคอลัมน์ไทย
    // อย่าง "สถานะ" กลายเป็นตัวอ่านไม่ออก ตัด BOM ออกถ้ามี
    if (options?.csv) {
      const text = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "");
      return XLSX.read(text, { type: "string", raw: true });
    }
    return XLSX.readFile(filePath, options);
  } catch (err) {
    throw badRequest("ไฟล์นี้เปิดเป็นตารางไม่ได้", {
      code: "unreadable_file",
      detail: "ไฟล์อาจเสียหาย หรือเป็นไฟล์ชนิดอื่นที่ถูกเปลี่ยนนามสกุลมาเป็น .xlsx/.csv — ลองเปิดด้วย Excel แล้วบันทึกใหม่",
    });
  }
}

/**
 * แปลง error ของฐานข้อมูลที่มีความหมายเฉพาะกับการนำเข้า ให้เป็น ApiError
 *
 * `fromDatabaseError` กลางแปลง ER_DUP_ENTRY เป็น "มีข้อมูลนี้อยู่ในระบบแล้ว"
 * ซึ่งถูกต้องแต่ไม่ช่วยคนที่กำลังนำเข้าไฟล์ 300 แถว — ที่นี่บอกได้ว่าให้ไปดู
 * เลขซีเรียลที่ซ้ำ error อื่นปล่อยผ่านไปให้ handler กลางจัดการตามปกติ
 */
function asImportError(err) {
  if (err && err.code === "ER_DUP_ENTRY") {
    return conflict("มีเลขซีเรียลในไฟล์ซ้ำกับที่มีอยู่แล้วในระบบ", {
      code: "duplicate_serial",
      detail: "กรุณาตรวจสอบและลบแถวที่ซ้ำออกก่อนนำเข้าใหม่",
    });
  }

  return err;
}

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

// ============================================================
// นำเข้าทะเบียนเครื่อง (#132)
//
// รับเทมเพลตของระบบ รายงานสถานะเครื่องของผู้ให้เช่า (หลายแผ่น หัวรายงานก่อนหัวตาราง)
// และรายงานมิเตอร์รายงวด ดู import/registry-sheet.js
//
// ## ตรวจก่อน แล้วค่อยบันทึก
//
//   mode=preview  อ่านไฟล์ วางแผน แล้วตอบว่าจะสร้าง/เติม/ข้ามอะไร และยังต้องตัดสินอะไร
//   mode=commit   วางแผนใหม่จากไฟล์เดิม + decisions แล้วบันทึกทั้งก้อนใน transaction เดียว
//
// ไม่มี token ระหว่างสองขั้นเหมือนหน้ายอดมิเตอร์ เพราะ commit วางแผนใหม่จากข้อมูลปัจจุบัน
// ทุกครั้ง แผนที่ไม่ครบ (ชื่อที่ยังไม่ตัดสิน สัญญาที่ไม่มี) ถูกปฏิเสธก่อนเขียน
//
// decisions (JSON ในช่อง form) = สิ่งที่ผู้ดูแลเลือกในหน้าตรวจ ดู registry-plan.js
// ============================================================

const nameDecision = z.union([
  z.object({ action: z.literal("create"), as: z.string().max(255).optional() }),
  z.object({ action: z.literal("alias"), target_id: z.coerce.number().int().positive() }),
  z.object({ action: z.literal("alias"), target_new: z.string().min(1).max(255) }),
]);

const decisionSchema = z.object({
  names: z.object({
    brand: z.record(z.string().max(255), nameDecision).optional(),
    building: z.record(z.string().max(255), nameDecision).optional(),
    division: z.record(z.string().max(255), nameDecision).optional(),
  }).optional(),
  models: z.record(
    z.string().max(600),
    z.object({
      meter_category_id: z.coerce.number().int().positive(),
      has_color_meter: z.boolean().optional(),
    })
  ).optional(),
});

function parseDecisions(raw) {
  if (!raw) return {};
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw badRequest("ข้อมูลการตัดสินใจไม่ใช่ JSON", { code: "invalid_decisions" });
  }
  const parsed = decisionSchema.safeParse(value);
  if (!parsed.success) throw badRequest("ข้อมูลการตัดสินใจไม่ถูกต้อง", { code: "invalid_decisions" });
  return parsed.data;
}

/**
 * ปฏิเสธไฟล์ที่ประกาศขนาดใหญ่ผิดปกติ ก่อนกางแผ่นใดเป็นแถว — ใช้กับการนำเข้าทั้งสองแบบ
 *
 * SheetJS กางทุกเซลล์ในช่วงที่แผ่นประกาศ (`!ref`) ไม่ใช่เฉพาะเซลล์ที่มีค่า และการกางเป็นงาน
 * sync ที่บล็อกทั้ง API ไฟล์ .xlsx 16 KB ที่ประกาศ A1:XFD1500 ทำให้ health check รอ 17 วินาที
 * (#142) ด่านนี้เคยมีเฉพาะนำเข้าทะเบียน ส่วนนำเข้ายอดมิเตอร์ตรวจแค่แผ่นกับแถว
 */
function assertWithinImportLimits(workbook) {
  let rows = 0;
  let widest = 0;
  let cells = 0;
  for (const name of workbook.SheetNames) {
    const ref = workbook.Sheets[name]?.["!ref"];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    const sheetRows = range.e.r + 1;
    const sheetColumns = range.e.c + 1;
    rows += sheetRows;
    widest = Math.max(widest, sheetColumns);
    cells += sheetRows * sheetColumns;
  }
  if (
    workbook.SheetNames.length > MAX_IMPORT_SHEETS ||
    rows > MAX_IMPORT_ROWS ||
    widest > MAX_IMPORT_COLUMNS ||
    cells > MAX_IMPORT_CELLS
  ) {
    throw badRequest("ไฟล์ใหญ่เกินกว่าที่นำเข้าได้ในครั้งเดียว", {
      code: "import_too_large",
      detail:
        `รับได้ไม่เกิน ${MAX_IMPORT_SHEETS} แผ่น ${MAX_IMPORT_ROWS.toLocaleString("th-TH")} แถวรวม ` +
        `${MAX_IMPORT_COLUMNS} คอลัมน์ต่อแผ่น และ ${MAX_IMPORT_CELLS.toLocaleString("th-TH")} เซลล์รวม — ` +
        "ถ้าไฟล์มีข้อมูลไม่มาก ให้ลบแถว/คอลัมน์ว่างที่จัดรูปแบบไว้ แล้วบันทึกใหม่ หรือแยกไฟล์",
    });
  }
}

/**
 * แผ่นทั้งหมดของไฟล์ ทั้งค่าที่จัดรูปแล้ว (ทะเบียน) และค่าดิบ (รายงานมิเตอร์) — กันไฟล์ใหญ่ผิดปกติก่อน
 *
 * CSV อ่านเป็นข้อความตรงๆ (raw) — ไม่งั้น SheetJS แปลง "1/10/2567" เป็นวันที่แบบ เดือน/วัน
 * ของสหรัฐ ได้ 10 ม.ค. แทน 1 ต.ค. โดยไม่มีอะไรเตือน วันที่จึงผ่าน parseDayFirstDate แทน
 */
function readAllSheets(filePath, originalName = "") {
  const isCsv = /\.csv$/i.test(originalName);
  const workbook = readWorkbook(filePath, isCsv ? { csv: true } : undefined);
  assertWithinImportLimits(workbook);
  return workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: false }),
    rawRows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: true }),
  }));
}

/** คำตอบของทั้งสองโหมด — ไม่ส่งค่าภายใน (ref ของรายการใหม่) ออกไป */
function describeRegistryPlan(parsed, plan, context) {
  return {
    valid: plan.valid,
    blocking: plan.blocking,
    sheets: parsed.sheets,
    errors: parsed.errors,
    warnings: [...parsed.warnings, ...plan.warnings],
    summary: plan.summary,
    unresolved: plan.unresolved,
    models: plan.models,
    contracts: plan.contracts,
    new_floors: plan.new_floors.map(({ name, rows }) => ({ name, rows })),
    new_departments: plan.new_departments.map(({ name, rows }) => ({ name, rows })),
    rows: plan.rows.map((row) => ({
      sheet: row.sheet,
      row: row.row,
      serial_number: row.serial_number,
      action: row.action,
      reasons: row.reasons,
      notes: row.notes,
      waiting: row.waiting,
      fill: row.fill,
      installation: row.installation,
      ...row.display,
    })),
    // ตัวเลือกของหน้าตรวจ: "เป็นชื่อเรียกอื่นของ…" และหมวดมิเตอร์ของรุ่น
    choices: {
      brand: context.master.brand.names,
      building: context.master.building.names,
      division: context.master.division.names,
      meter_categories: context.categories.filter((c) => !c.is_color).map(({ id, code, name }) => ({ id, code, name })),
    },
  };
}

exports.importDevices = asyncHandler(async (req, res) => {
    try {
        // routes.js ดักกรณีไม่แนบไฟล์ไว้แล้ว ที่นี่กันไว้อีกชั้นเผื่อมีคนต่อ handler นี้เข้า route ใหม่
        if (!req.file) throw badRequest("กรุณาเลือกไฟล์ที่ต้องการนำเข้า", { code: "no_file" });

        const mode = String(req.body?.mode || "preview");
        if (mode !== "preview" && mode !== "commit") {
            throw badRequest("โหมดการนำเข้าไม่ถูกต้อง", { code: "invalid_import_mode" });
        }
        const decisions = parseDecisions(req.body?.decisions);

        const parsed = parseRegistryWorkbook(readAllSheets(req.file.path, req.file.originalname));
        if (!parsed) {
            throw badRequest("ไม่พบตารางทะเบียนเครื่องในไฟล์", {
                code: "registry_not_found",
                detail: "ต้องมีคอลัมน์เลขซีเรียล (เช่น Serial No., SN., serial_number) และคอลัมน์รุ่นหรืออาคาร ในแถวหัวตารางภายใน 15 แถวแรก",
            });
        }

        const planWith = (context) => planRegistryImport({ rows: parsed.rows, ...context, decisions, today: today() });

        if (mode === "preview") {
            const context = await loadRegistryContext(db);
            return res.json({ mode, ...describeRegistryPlan(parsed, planWith(context), context) });
        }

        // บันทึก: อ่านข้อมูลและวางแผนใหม่ใน transaction เดียวกับการเขียน — สิ่งที่คนอื่นแก้ระหว่าง
        // ที่ผู้ดูแลกำลังตรวจไฟล์อยู่ ถูกนับรวมในแผนนี้ ไม่ใช่แผนเก่าตอนกดตรวจ
        const { described, result } = await db.withTransaction(async (conn) => {
            const context = await loadRegistryContext(conn);
            const plan = planWith(context);
            if (!plan.valid) {
                throw badRequest("ยังบันทึกไม่ได้ มีรายการที่ต้องตัดสินหรือแก้ก่อน", {
                    code: "import_needs_decisions",
                    detail: "ตรวจไฟล์อีกครั้งแล้วตัดสินชื่อ หมวดมิเตอร์ และสัญญาที่ขึ้นเตือนให้ครบ",
                });
            }
            return {
                described: describeRegistryPlan(parsed, plan, context),
                result: await applyRegistryPlan(conn, plan, { userId: req.user?.id ?? null }),
            };
        });
        res.json({ mode, ...described, created: result.created, filled: result.filled });
    } catch (err) {
        // ไม่ตอบ error เอง — โยนต่อให้ handler กลางแปลงเป็น Problem Details (ADR-0010)
        throw asImportError(err);
    } finally {
        removeUploadedFile(req.file);
    }
});


// ============================================================
// นำเข้ายอดพิมพ์ (มิเตอร์)
//
// รับสองรูปแบบ ตรวจรูปแบบเองจากหัวตาราง
//
//   1. รายงานมิเตอร์รายงวดของผู้ให้เช่า (ADR-0023) — หลายแผ่น แผ่นละงวด มีเลขมิเตอร์
//      ต้นงวด/สิ้นงวดและราคาต่อหน้า ดู import/vendor-meter.js
//   2. เทมเพลตเดิม — แผ่นเดียว คอลัมน์ "meter M/YY" เป็นยอดรายเดือนของมิเตอร์หลัก
//      ไฟล์จริงเก็บนอก repo (repo เป็น public) — หัวตารางดูที่ docs/reference/import-format.md
//
// ## ตรวจด้วยการเขียนจริงแล้วย้อนกลับ
//
// ขั้นตรวจไฟล์ (preview) เขียนยอดลงฐานใน transaction แล้วอ่านผลจาก v_monthly_kpi
// ก่อนย้อนกลับ กฎราคาจึงอยู่ใน view ที่เดียว และตัวเลขที่ผู้ใช้เห็นในหน้าตรวจคือ
// ตัวเลขเดียวกับที่รายงานจะแสดงหลังกดยืนยัน สิ่งที่ตรวจ
//
//   - ทุกยอดต้องหาราคาได้ (ADR-0021)
//   - ราคาในแถวของไฟล์ต้องเท่าราคาในระบบ — จับหมวดมิเตอร์ผิดหรือราคาสัญญาผิดได้
//   - เลขที่สัญญาในหัวแผ่นต้องเป็นสัญญาที่คิดเงินเครื่องนั้นในงวดนั้น
//
// ยอดตามใบแจ้งหนี้รายหมวดของทุกงวดในไฟล์ถูกส่งกลับไปให้เทียบกับใบของผู้ให้เช่า
// ============================================================

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

exports.importPrintTransactions = asyncHandler(async (req, res) => {
    try {
        // routes.js ดักกรณีไม่แนบไฟล์ไว้แล้ว ที่นี่กันไว้อีกชั้นเผื่อมีคนต่อ handler
        // นี้เข้า route ใหม่โดยลืม handleUpload
        if (!req.file) throw badRequest("กรุณาเลือกไฟล์ที่ต้องการนำเข้า", { code: "no_file" });

        const workbook = readWorkbook(req.file.path);
        // ไฟล์ 5MB ที่บีบอัดได้ดีกางออกเป็นแถวได้มหาศาล — ตรวจจากขอบเขตของแผ่นก่อนแปลง
        // ทุกแถวเป็น object และก่อนยิงคำสั่งเขียนก้อนเดียว (ไฟล์จริงมีไม่กี่แผ่น แผ่นละไม่กี่ร้อยแถว)
        assertWithinImportLimits(workbook);
        const sheets = workbook.SheetNames.map((name) => ({
            name,
            rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: true }),
        }));
        if (!sheets.length) {
            throw badRequest("ไม่พบแผ่นงานในไฟล์", { code: "no_sheet", detail: "ไฟล์นี้ไม่มีแผ่นงานที่อ่านข้อมูลได้" });
        }

        const meters = await loadMeters(db);
        const vendor = parseVendorWorkbook(sheets);
        const format = vendor ? "vendor" : "template";
        const { candidates, errors, months } = vendor
            ? mapVendorReadings(vendor, meters)
            : mapTemplateReadings(sheets[0].rows, meters);

        const existingMap = new Map();
        if (candidates.length) {
            const [existing] = await db.query(
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

        const fileDigest = crypto.createHash("sha256").update(fs.readFileSync(req.file.path)).digest("hex");
        // ผูก token กับทั้งไฟล์และค่าเดิมที่ผู้ใช้เห็นในหน้าตรวจ หากมีคนแก้ยอด
        // ระหว่างเปิด preview กับกดยืนยัน token จะไม่ตรงและระบบจะให้ตรวจใหม่
        // แทนการเขียนทับค่าที่ผู้ใช้ไม่เคยเห็น
        const previewToken = crypto
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
        const mode = String(req.body?.mode || "preview");
        if (mode !== "preview" && mode !== "commit") {
            throw badRequest("โหมดการนำเข้าไม่ถูกต้อง", { code: "invalid_import_mode" });
        }
        if (mode === "commit") {
            if (errors.length) {
                throw badRequest("ไฟล์ยังมีข้อมูลที่ต้องแก้ จึงยังบันทึกไม่ได้", {
                    code: "import_validation_failed",
                    errors,
                });
            }
            if (!req.body?.preview_token || req.body.preview_token !== previewToken) {
                throw badRequest("กรุณาตรวจไฟล์ล่าสุดก่อนยืนยันบันทึก", { code: "preview_required" });
            }
        }

        const rowsToWrite = [...newRows, ...overwriteRows];
        let checked;
        try {
            checked = await db.withTransaction(async (conn) => {
                await writeCandidates(conn, rowsToWrite);
                const result = await checkWrittenReadings(conn, candidates, months);
                if (mode === "preview") throw new PreviewRollback(result);
                if (result.errors.length) {
                    throw badRequest("ไฟล์ยังมีข้อมูลที่ต้องแก้ จึงยังบันทึกไม่ได้", {
                        code: "import_validation_failed",
                        errors: result.errors,
                    });
                }
                return result;
            });
        } catch (err) {
            if (!(err instanceof PreviewRollback)) throw err;
            checked = err.result;
        }

        const allErrors = [...errors, ...checked.errors];
        const summary = {
            format,
            months_found: months,
            sheets: vendor ? vendor.sheets : undefined,
            invoice: checked.invoice,
            warnings: checked.warnings,
        };

        if (mode === "preview") {
            return res.json({
                ...summary,
                valid: allErrors.length === 0,
                preview_token: allErrors.length ? null : previewToken,
                new_rows: newRows,
                overwrite_rows: overwriteRows,
                unchanged_rows: unchangedRows,
                errors: allErrors,
            });
        }

        return res.json({
            ...summary,
            message: "Import ยอดพิมพ์สำเร็จ",
            rows_upserted: rowsToWrite.length,
            unchanged: unchangedRows.length,
        });
    } catch (err) {
        // โยนต่อให้ handler กลาง — ดูเหตุผลที่ importDevices
        throw asImportError(err);
    } finally {
        removeUploadedFile(req.file);
    }
});

// ให้เทสอ่านไฟล์จริงผ่านทางเดียวกับที่ API ใช้ (CSV ต้องอ่านเป็นข้อความ)
exports.readAllSheets = readAllSheets;
