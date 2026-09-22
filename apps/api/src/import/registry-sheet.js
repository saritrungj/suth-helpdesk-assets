// apps/api/src/import/registry-sheet.js
//
// อ่านไฟล์ทะเบียนเครื่องเป็นแถวที่มีรูปเดียวกัน — ไม่แตะฐานข้อมูล จึงเทสได้ตรงๆ (#132)
//
// ## รูปแบบที่รองรับ
//
//   1. เทมเพลตของระบบ — แผ่นเดียว หัวตารางแถวแรก คอลัมน์ serial_number, brand, ...
//   2. รายงานสถานะเครื่องของผู้ให้เช่า — หลายแผ่น (เช่น OKI / HP / HP A3) มีหัวรายงาน
//      ก่อนหัวตาราง เลขที่สัญญาอยู่ในหัวรายงาน ไม่มีคอลัมน์ยี่ห้อ (อยู่ในชื่อรุ่น)
//      ชื่อคอลัมน์สะกดหลายแบบ (`Serial No.`, `Floor.`, `Depatment`) บางแผ่นคอลัมน์ฝ่าย
//      ไม่มีหัว และมีแถวหัวตารางซ้ำกลางแผ่น
//   3. รายงานมิเตอร์รายงวดของผู้ให้เช่า (ADR-0023) — สัญญาที่ไม่มีไฟล์ทะเบียนแยก
//      (SUTH192/2568) มีข้อมูลเครื่องอยู่ในรายงานมิเตอร์เท่านั้น
//
// ## สิ่งที่ตั้งใจไม่อ่าน
//
// ชื่อผู้รับการติดตั้ง ตำแหน่งงาน เบอร์โทร IP และ MAC — เป็นข้อมูลส่วนบุคคลหรือข้อมูล
// เครือข่ายที่ระบบไม่ได้ใช้ ไม่มีเหตุผลให้เก็บ (#132)

const XLSX = require("xlsx");
const { dateFromParts, parseDayFirstDate } = require("@suth/domain");
const { normalizeName } = require("../master-data/names");
const { splitBrandModel } = require("./brand-model");
const { parseVendorWorkbook, contractNoFromTitle } = require("./vendor-meter");

const header = (cell) => normalizeName(cell).toLowerCase();

/**
 * ชื่อหัวคอลัมน์ที่รับ เรียงตามลำดับความสำคัญ — เจอชื่อแรกในรายการก่อนใช้ชื่อนั้น
 * เช่น แผ่น OKI มีทั้ง "Depatment" และ "แผนก" ใช้ "แผนก" (ภาษาไทยตรงตัว) ก่อน
 */
const COLUMNS = {
  serial: ["serial_number", "serial number", "serial no.", "serial no", "sn.", "sn", "s/n", "เลขซีเรียล", "หมายเลขเครื่อง"],
  brand: ["brand", "ยี่ห้อ"],
  model: ["model", "รุ่น"],
  building: ["building", "อาคาร"],
  floor: ["floor", "floor.", "fool.", "fool", "ชั้น"],
  division: ["division", "ฝ่าย"],
  department: ["department", "แผนก", "depatment"],
  // ไม่รับ "ตำแหน่ง" เดี่ยวๆ — ในไฟล์ของผู้ให้เช่าคำนี้คือตำแหน่งงานของผู้รับการติดตั้ง (ข้อมูลส่วนบุคคล)
  location: ["location", "ตำแหน่งที่ตั้ง", "printer name"],
  contract: ["contract_no", "contract no", "contract no.", "เลขที่สัญญา"],
  status: ["status", "สถานะ"],
  installedOn: ["date", "installed_on", "วันที่ติดตั้ง"],
  meterCategory: ["meter_category", "meter category", "หมวดมิเตอร์"],
  priceOverride: ["price_override", "price override", "ราคาพิเศษเฉพาะเครื่อง"],
};

// ข้อความที่ไฟล์ใช้แทน "ยังไม่มีที่ตั้ง" — ไม่ใช่ชื่ออาคาร แต่เป็นสถานะการติดตั้ง (ADR-0018)
const NOT_INSTALLED = /ยังไม่มีจุดติดตั้ง|รอจุดติดตั้ง|รอติดตั้ง|not installed/i;

// ค่าคอลัมน์สถานะที่บอกว่าเครื่องติดตั้งแล้ว (แผ่น HP ใช้ "completed")
const INSTALLED_STATUS = /^(completed|installed|ติดตั้งแล้ว)$/i;

const DEVICE_STATUS = {
  active: "active",
  repair: "repair",
  retired: "retired",
  "ใช้งานอยู่": "active",
  "ซ่อมบำรุง": "repair",
  "ปลดระวาง": "retired",
};

/** สถานะเครื่องจากข้อความในไฟล์ — Object.hasOwn กันชื่ออย่าง "constructor" ไปเจอของที่ติดมากับ prototype */
function deviceStatusOf(text) {
  const key = Object.hasOwn(DEVICE_STATUS, text.toLowerCase()) ? text.toLowerCase() : text;
  return Object.hasOwn(DEVICE_STATUS, key) ? DEVICE_STATUS[key] : null;
}

/** หาแถวหัวตารางและตำแหน่งคอลัมน์ใน 15 แถวแรก — null ถ้าแผ่นนี้ไม่ใช่ตารางเครื่อง */
function findColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = (rows[r] ?? []).map(header);
    const at = {};
    for (const [key, names] of Object.entries(COLUMNS)) {
      at[key] = -1;
      for (const name of names) {
        const index = cells.indexOf(name);
        if (index !== -1) {
          at[key] = index;
          break;
        }
      }
    }
    if (at.serial === -1 || (at.model === -1 && at.brand === -1 && at.building === -1)) continue;
    return { headerRow: r, at, cells };
  }
  return null;
}

/**
 * คอลัมน์ฝ่ายที่ไม่มีหัว — คอลัมน์หัวว่างที่ค่าส่วนใหญ่ขึ้นต้นด้วย "ฝ่าย"
 * เป็นการเดา จึงคืนเลขคอลัมน์ให้ผู้เรียกแจ้งในหน้าตรวจเสมอ
 */
function guessDivisionColumn(rows, headerRow, cells) {
  const body = rows.slice(headerRow + 1).filter((row) => row.some((cell) => normalizeName(cell)));
  return cells.findIndex((cell, c) => {
    if (cell) return false;
    const values = body.map((row) => normalizeName(row[c])).filter(Boolean);
    return values.length >= 3 && values.filter((v) => v.startsWith("ฝ่าย")).length / values.length >= 0.5;
  });
}

/**
 * วันติดตั้งจากเซลล์ดิบ — เซลล์วันที่ของ Excel เป็นเลขลำดับวัน อ่านตรงจากเลขนั้น ไม่ผ่านรูปแบบ
 * การแสดงผล (ซึ่งอาจเป็น m/d/yy แล้วสลับวันกับเดือน) ข้อความต้องเป็น วัน/เดือน/ปี 4 หลัก
 * @returns {{ date: string|null, unreadable: boolean }}
 */
function readInstallDate(raw) {
  if (raw === "" || raw === null || raw === undefined) return { date: null, unreadable: false };
  let date = null;
  if (typeof raw === "number") {
    const parts = XLSX.SSF.parse_date_code(raw);
    date = parts ? dateFromParts(parts.y, parts.m, parts.d) : null;
  } else if (raw instanceof Date) {
    date = dateFromParts(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  } else {
    date = parseDayFirstDate(normalizeName(raw));
  }
  return { date, unreadable: !date };
}

function cell(row, index) {
  return index === -1 ? "" : normalizeName(row[index]);
}

/**
 * แผ่นทะเบียน (รูปแบบ 1 และ 2)
 */
function readRegistrySheet(sheet, warnings) {
  const found = findColumns(sheet.rows);
  if (!found) return null;
  const { headerRow, at, cells } = found;

  const notes = [];
  if (at.division === -1) {
    at.division = guessDivisionColumn(sheet.rows, headerRow, cells);
    if (at.division !== -1) {
      notes.push(`คอลัมน์ฝ่ายไม่มีหัวตาราง — ใช้คอลัมน์ที่ ${at.division + 1} ซึ่งค่าส่วนใหญ่ขึ้นต้นด้วย "ฝ่าย"`);
    }
  }

  const title = sheet.rows.slice(0, headerRow).flat().map(normalizeName).filter(Boolean).join(" ");
  const titleContract = contractNoFromTitle(title);
  // หัวรายงาน "รายงานสถานะเครื่อง... และตำแหน่งที่ตั้ง" = ทุกแถวคือเครื่องที่ส่งมอบแล้ว
  const isStatusReport = /สถานะเครื่อง|installation/i.test(title);

  const rows = [];
  for (let r = headerRow + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    const serial = cell(row, at.serial);
    if (!serial) continue; // แถวว่าง แถวสรุปท้ายแผ่น
    // แถวหัวตารางซ้ำกลางแผ่น (พบในแผ่น OKI)
    if (header(serial) === cells[at.serial]) continue;

    const modelText = cell(row, at.model);
    const split = splitBrandModel(modelText);
    const brand = cell(row, at.brand) || split.brand;
    const model = cell(row, at.brand) ? modelText : split.model;

    let building = cell(row, at.building);
    const location = cell(row, at.location);
    const statusText = cell(row, at.status);
    const placeholder = NOT_INSTALLED.test(building) || NOT_INSTALLED.test(location);
    if (NOT_INSTALLED.test(building)) building = "";

    // สถานะการติดตั้งจากหลักฐานในไฟล์เท่านั้น (ADR-0018, ADR-0026): "รอจุดติดตั้ง" ในช่องใดก็ตาม
    // = ยังไม่ติดตั้ง, สถานะ "completed" หรือหัวรายงานสถานะเครื่อง = ติดตั้งแล้ว ค่าสถานะที่ไม่รู้จัก
    // ในรายงานสถานะเครื่อง (เช่น "ยกเลิก") = ยังไม่รู้ ให้ผ่านหน้าตรวจยืนยัน ไม่ถือว่าติดตั้งแล้ว
    const knownStatus = !statusText || INSTALLED_STATUS.test(statusText) || Boolean(deviceStatusOf(statusText));
    let installation = null;
    if (placeholder || NOT_INSTALLED.test(statusText)) installation = "not_installed";
    else if (INSTALLED_STATUS.test(statusText) || (isStatusReport && knownStatus)) installation = "installed";

    const rawRow = sheet.rawRows?.[r] ?? row;
    const installDate = installation === "installed" && at.installedOn !== -1
      ? readInstallDate(rawRow[at.installedOn])
      : { date: null, unreadable: false };
    if (installDate.unreadable) {
      warnings.push({
        sheet: sheet.name.trim(),
        row: r + 1,
        serial_number: serial,
        reason: `อ่านวันติดตั้ง "${cell(row, at.installedOn)}" ไม่ได้ — ต้องเป็น วัน/เดือน/ปี 4 หลัก หรือเซลล์วันที่ของ Excel`,
      });
    }

    rows.push({
      sheet: sheet.name.trim(),
      row: r + 1,
      serial_number: serial,
      brand,
      model,
      building,
      floor: cell(row, at.floor),
      division: cell(row, at.division),
      department: cell(row, at.department),
      location,
      contract_no: cell(row, at.contract) || titleContract || "",
      status: deviceStatusOf(statusText) ?? "active",
      installation,
      installed_on: installDate.date,
      // วันติดตั้งที่ไฟล์ระบุตรงๆ = ยืนยันย้อนหลังได้ ไม่มีวันในไฟล์ = รู้แค่ว่าติดตั้งอยู่ตอนนี้ (ADR-0018 Q21)
      installed_on_known: Boolean(installDate.date),
      meter_category: cell(row, at.meterCategory),
      price_override: cell(row, at.priceOverride),
      has_color_meter: false,
    });
  }

  return {
    info: { sheet: sheet.name.trim(), kind: "registry", header_row: headerRow + 1, contract_no: titleContract, rows: rows.length, notes },
    rows,
  };
}

/**
 * รายงานมิเตอร์ของผู้ให้เช่า (รูปแบบ 3) → แถวทะเบียนหนึ่งแถวต่อเครื่อง
 *
 * ที่ตั้งเป็นของแผ่นล่าสุดที่เครื่องปรากฏ เครื่องที่มีสองแถวในแผ่นเดียวคือเครื่องที่มีมิเตอร์สี
 * และเครื่องที่ไม่มีเลขสิ้นงวดเลยสักแผ่นคือยังไม่ได้ติดตั้ง — กติกาเดียวกับ
 * scripts/load-vendor-workbooks.cjs
 */
function readVendorReport(input) {
  // ตัวอ่านรายงานมิเตอร์ต้องได้ค่าดิบ (ตัวเลขเป็นตัวเลข) — ค่าที่จัดรูปแล้วอย่าง " 42,127 " แปลงเป็นตัวเลขไม่ได้
  const sheets = input.map((sheet) => ({ name: sheet.name, rows: sheet.rawRows ?? sheet.rows }));
  const parsed = parseVendorWorkbook(sheets);
  if (!parsed || !parsed.sheets.length) return null;

  const devices = new Map();
  parsed.sheets.forEach((info, order) => {
    const rows = sheets.find((sheet) => sheet.name.trim() === info.sheet).rows;
    const headerRow = rows.findIndex((row) => row.some((c) => header(c).startsWith("meter start")));
    const cells = rows[headerRow].map(header);
    const col = (...names) => cells.findIndex((c) => names.includes(c));
    // รายงานมิเตอร์ใช้ "Printer Name" เป็นที่ตั้งจริง ส่วนคอลัมน์ชื่อ "location" บางแผ่นคือหน่วยงานย่อย
    const at = {
      serial: col("sn.", "sn", "serial number"),
      model: col("model"),
      location: col("printer name"),
      division: col("division"),
      department: col("department"),
      building: col("building"),
      floor: col("fool.", "floor"),
    };
    const seen = new Set();
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      const serial = cell(row, at.serial);
      if (!serial) continue;
      const key = serial.toUpperCase();
      const previous = devices.get(key);
      if (seen.has(key)) {
        previous.has_color_meter = true; // แถวที่สองของเลขเดียวกันในแผ่นเดียว = มิเตอร์สี
        continue;
      }
      seen.add(key);
      const split = splitBrandModel(cell(row, at.model));
      const location = cell(row, at.location);
      devices.set(key, {
        sheet: info.sheet,
        row: r + 1,
        serial_number: serial,
        brand: split.brand,
        model: split.model,
        building: NOT_INSTALLED.test(cell(row, at.building)) ? "" : cell(row, at.building),
        floor: cell(row, at.floor),
        division: cell(row, at.division),
        department: cell(row, at.department),
        location: NOT_INSTALLED.test(location) ? "" : location,
        contract_no: info.contract_no ?? "",
        status: "active",
        // "รอจุดติดตั้ง" ในชื่อจุดติดตั้งคือหลักฐานว่ายังไม่ติดตั้ง
        installation: NOT_INSTALLED.test(location) || NOT_INSTALLED.test(cell(row, at.building)) ? "not_installed" : null,
        installed_on: null,
        installed_on_known: false,
        meter_category: "",
        price_override: "",
        has_color_meter: previous?.has_color_meter ?? false,
        first_reading_order: previous?.first_reading_order ?? null,
      });
    }
  });

  for (const reading of parsed.readings) {
    const device = devices.get(reading.serial_number.toUpperCase());
    const order = parsed.sheets.findIndex((s) => s.sheet === reading.sheet);
    if (device.first_reading_order === null || order < device.first_reading_order) device.first_reading_order = order;
  }

  const rows = [...devices.values()].map(({ first_reading_order: order, ...device }) => {
    // ไม่มียอดสักงวด ≠ ยังไม่ติดตั้ง (ADR-0018 Q19) — รู้แค่ว่ายังไม่มียอด ให้ผ่านหน้าตรวจยืนยัน
    if (order === null) return device;
    // มียอด = ติดตั้งแล้วอย่างน้อยตั้งแต่งวดแรกที่มียอด ก่อนหน้านั้นยังยืนยันไม่ได้ (Q21)
    return { ...device, installation: "installed", installed_on: parsed.sheets[order].period_start, installed_on_known: false };
  });

  return {
    sheets: parsed.sheets.map((s) => ({
      sheet: s.sheet,
      kind: "meter_report",
      contract_no: s.contract_no,
      rows: rows.filter((row) => row.sheet === s.sheet).length,
      notes: [],
    })),
    rows,
    errors: parsed.errors,
    warnings: [],
  };
}

/**
 * @param {Array<{ name: string, rows: unknown[][], rawRows?: unknown[][] }>} sheets แถวของทุกแผ่น
 *   rows = ค่าที่จัดรูปแล้ว (raw: false) ใช้กับแผ่นทะเบียน — เลขซีเรียลที่หน้าตาเป็นตัวเลขยังเป็นข้อความ
 *   rawRows = ค่าดิบ (raw: true) ใช้กับรายงานมิเตอร์ ไม่ส่ง = ใช้ rows
 * @returns {{ sheets: object[], rows: object[], errors: object[], warnings: object[] } | null} null = ไม่มีแผ่นไหนเป็นทะเบียนเครื่อง
 */
function parseRegistryWorkbook(sheets) {
  const vendor = readVendorReport(sheets);
  if (vendor) return vendor;

  const warnings = [];
  const found = sheets.map((sheet) => readRegistrySheet(sheet, warnings)).filter(Boolean);
  if (!found.length) return null;

  // เครื่องเดียวกันอยู่ได้หลายแผ่น (เครื่อง A3 อยู่ทั้งแผ่น HP และ HP A3) — ใช้แถวแรกที่พบ
  // แล้วเตือน ไม่ปฏิเสธ เพราะไม่ใช่ข้อมูลผิด
  const rows = found.flatMap((sheet) => sheet.rows);
  const firstRow = new Map();
  const duplicate = new Set();
  for (const row of rows) {
    const key = row.serial_number.toUpperCase();
    if (firstRow.has(key)) {
      const first = firstRow.get(key);
      duplicate.add(`${row.sheet}|${row.row}`);
      warnings.push({
        sheet: row.sheet,
        row: row.row,
        serial_number: row.serial_number,
        reason: `เครื่องนี้อยู่ใน ${first.sheet} แถว ${first.row} แล้ว — ใช้ข้อมูลแถวนั้น`,
      });
    } else {
      firstRow.set(key, row);
    }
  }
  return {
    sheets: found.map((sheet) => sheet.info),
    rows: rows.filter((row) => !duplicate.has(`${row.sheet}|${row.row}`)),
    errors: [],
    warnings,
  };
}

module.exports = { parseRegistryWorkbook };
