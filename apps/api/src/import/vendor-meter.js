// apps/api/src/import/vendor-meter.js
//
// อ่านรายงานมิเตอร์รายงวดของผู้ให้เช่า (ADR-0023) — ไม่แตะฐานข้อมูล จึงเทสได้ตรงๆ
//
// ## รูปแบบที่รองรับ
//
// ผู้ให้เช่าส่งหนึ่งแผ่นต่อหนึ่งงวด แผ่นละหลายร้อยแถว ตัวอย่างจริงสองแบบ
//
//   SUTH192/2568  "Meter Reading Report from Installation Date; July 24, 2569 to Aug 23, 2569
//                  : Contract No. SUTH192/2568  งวดที่ 6/36"  — งวด 24 ถึง 23
//   SUTH 86/2567  "ค่าเช่าเครื่องพิมพ์... วันที่ 1 สิงหาคม 2569 - 31 สิงหาคม 2569
//                  : สัญญาเลขที่ SUTH 86/2567 (เริ่ม วันที่ 29 กันยายน 2567 - ...)" — เดือนปฏิทิน
//
// ทั้งสองแบบมีหัวตาราง "Meter Start (B&W)" / "Meter End (B&W)" และราคาต่อหน้าในแถว
// ส่วนคอลัมน์เลขเครื่องชื่อ "SN." หรือ "Serial Number"
//
// ## เดือนของงวด
//
// งวดนับเป็นเดือนที่งวดสิ้นสุด (ADR-0023) อ่านจากวันที่ตัวสุดท้าย "ก่อน" คำว่า
// Contract/สัญญา ในหัวแผ่น — หลังคำนั้นอาจมีวันที่ของอายุสัญญาซึ่งไม่ใช่งวด
//
// ## มิเตอร์สี
//
// เครื่องที่มีมิเตอร์สีปรากฏสองแถวในแผ่นเดียว (เลขเครื่องเดียวกัน) แถวแรกคือมิเตอร์
// ขาวดำ แถวที่สองคือมิเตอร์สี ผู้เรียกต้องตรวจราคาในแถวกับราคาในระบบอีกชั้น ถ้าจับ
// มิเตอร์ผิด ราคาจะไม่ตรงและทั้งไฟล์ถูกปฏิเสธ

const { MAX_PAGES_PER_MONTH, MONTHS_TH_FULL, normalizeMonth } = require("@suth/domain");

const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const normalizeHeader = (cell) => String(cell ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * วันเริ่มและวันสิ้นสุดของงวดจากหัวแผ่น — "YYYY-MM-DD" ค.ศ. หรือ null
 *
 * อ่านเฉพาะส่วนก่อนคำว่า Contract/สัญญา เพราะหลังจากนั้นอาจเป็นอายุสัญญา
 * @param {string} title
 */
function periodDatesFromTitle(title) {
  const text = String(title ?? "");
  const cut = text.search(/contract|สัญญา/i);
  const head = cut === -1 ? text : text.slice(0, cut);

  const dates = [];
  for (const match of head.matchAll(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})/g)) {
    const month = EN_MONTHS.indexOf(match[1].slice(0, 3).toLowerCase());
    if (month !== -1) dates.push({ index: match.index, year: Number(match[3]), month: month + 1, day: Number(match[2]) });
  }
  for (const match of head.matchAll(/(\d{1,2})\s+([ก-๙]+)\s+(\d{4})/g)) {
    const month = MONTHS_TH_FULL.indexOf(match[2]);
    if (month !== -1) dates.push({ index: match.index, year: Number(match[3]), month: month + 1, day: Number(match[1]) });
  }
  if (!dates.length) return null;

  // ปี พ.ศ./ค.ศ. แยกด้วยกติกาเดียวกับทั้งระบบ (ADR-0002) — ปีที่วางไม่ได้คืน null
  const iso = (d) => {
    const month = normalizeMonth(`${d.year}-${String(d.month).padStart(2, "0")}`);
    return month && `${month}-${String(d.day).padStart(2, "0")}`;
  };
  const ordered = dates.sort((a, b) => a.index - b.index);
  const end = iso(ordered.at(-1));
  if (!end) return null;
  return { start: ordered.length > 1 ? iso(ordered.at(-2)) : null, end };
}

/** เลขที่สัญญาจากหัวแผ่น ตามที่ผู้ให้เช่าเขียน หรือ null */
function contractNoFromTitle(title) {
  const match = String(title ?? "").match(
    /(?:contract\s*no\.?|สัญญาเลขที่)\s*([A-Za-zก-๙.]+\s?\d+\s*[/-]\s*\d{4})/i
  );
  return match ? match[1].trim() : null;
}

/**
 * เลขที่สัญญาในรูปที่เทียบกันได้ — ไฟล์เก่าเขียน "SUTH 86-2567" ไฟล์ใหม่ "SUTH 86/2567"
 * ตัดช่องว่าง ใช้ "/" และตัวพิมพ์ใหญ่
 */
const comparableContractNo = (value) =>
  String(value ?? "").replace(/\s+/g, "").replace(/-/g, "/").toUpperCase();

/** หาแถวหัวตารางและตำแหน่งคอลัมน์ที่ต้องใช้ — null ถ้าแผ่นนี้ไม่ใช่รายงานมิเตอร์ */
function findColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const header = rows[r].map(normalizeHeader);
    const start = header.findIndex((cell) => cell.startsWith("meter start"));
    const end = header.findIndex((cell) => cell.startsWith("meter end"));
    const serial = header.findIndex((cell) => cell === "sn." || cell === "sn" || cell === "serial number");
    if (start === -1 || end === -1 || serial === -1) continue;

    return {
      headerRow: r,
      serial,
      start,
      end,
      price: header.findIndex((cell) => cell.includes("cost/click")),
      model: header.findIndex((cell) => cell === "model"),
    };
  }
  return null;
}

const isBlank = (value) => value === "" || value === null || value === undefined;

/**
 * อ่านทุกแผ่นที่เป็นรายงานมิเตอร์ของผู้ให้เช่า
 *
 * @param {Array<{ name: string, rows: unknown[][] }>} sheets แถวดิบของแต่ละแผ่น (header: 1)
 * @returns {{ readings: object[], errors: object[], sheets: object[] }|null}
 *   null = ไม่มีแผ่นไหนเป็นรูปแบบนี้ (ให้ผู้เรียกลองรูปแบบอื่น)
 */
function parseVendorWorkbook(sheets) {
  const readings = [];
  const errors = [];
  const found = [];

  for (const sheet of sheets) {
    const columns = findColumns(sheet.rows);
    if (!columns) continue;

    const title = sheet.rows.slice(0, columns.headerRow).flat().filter((cell) => !isBlank(cell)).join(" ");
    const period = periodDatesFromTitle(title);
    const month = period?.end.slice(0, 7) ?? null;
    const contractNo = contractNoFromTitle(title);
    const sheetName = sheet.name.trim();

    if (!month) {
      errors.push({ sheet: sheetName, reason: "อ่านงวดจากหัวแผ่นไม่ได้ (ต้องมีวันที่สิ้นงวด เช่น \"to Aug 23, 2569\")" });
      continue;
    }
    found.push({
      sheet: sheetName,
      month,
      period_start: period.start,
      period_end: period.end,
      contract_no: contractNo,
    });

    const seenInSheet = new Map();
    const sheetReadingsFrom = readings.length;
    for (let r = columns.headerRow + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r];
      const serial = String(row[columns.serial] ?? "").trim();
      if (!serial) continue; // แถวว่าง แถวสรุปท้ายแผ่น และแถวลายเซ็น

      const occurrence = (seenInSheet.get(serial.toUpperCase()) ?? 0) + 1;
      seenInSheet.set(serial.toUpperCase(), occurrence);

      const where = { sheet: sheetName, row: r + 1, serial_number: serial, month };
      if (occurrence > 2) {
        errors.push({ ...where, reason: "เลขเครื่องนี้มีเกินสองแถวในแผ่นเดียว (ขาวดำหนึ่ง สีหนึ่ง)" });
        continue;
      }

      const endRaw = row[columns.end];
      // ไม่มีเลขสิ้นงวด = ยังไม่มียอดของงวดนี้ (รอติดตั้ง เครื่องสำรองที่ยังไม่ใช้)
      if (isBlank(endRaw)) continue;

      // เลขต้นงวดว่างในแถวที่มีเลขสิ้นงวด = เครื่องเพิ่งเริ่มใช้งาน สูตรของผู้ให้เช่า
      // นับเป็น 0 จึงนับแบบเดียวกัน
      const startRaw = row[columns.start];
      const meterStart = isBlank(startRaw) ? 0 : Number(startRaw);
      const meterEnd = Number(endRaw);

      if (![meterStart, meterEnd].every((n) => Number.isInteger(n) && n >= 0)) {
        errors.push({ ...where, reason: `เลขมิเตอร์ต้องเป็นจำนวนเต็มไม่ติดลบ (พบ "${startRaw}" / "${endRaw}")` });
        continue;
      }
      if (meterEnd < meterStart) {
        errors.push({ ...where, reason: `เลขสิ้นงวด ${meterEnd} น้อยกว่าเลขต้นงวด ${meterStart}` });
        continue;
      }
      const pages = meterEnd - meterStart;
      if (pages > MAX_PAGES_PER_MONTH) {
        errors.push({ ...where, reason: `ยอดพิมพ์ ${pages} หน้าสูงผิดปกติ` });
        continue;
      }

      const priceRaw = columns.price === -1 ? "" : row[columns.price];
      readings.push({
        ...where,
        contract_no: contractNo,
        meter: occurrence === 1 ? "primary" : "color",
        meter_start: meterStart,
        meter_end: meterEnd,
        pages,
        file_price: isBlank(priceRaw) ? null : Number(priceRaw),
        model: columns.model === -1 ? "" : String(row[columns.model] ?? "").trim(),
      });
    }

    // มิเตอร์ขาวดำกับสีรู้จากลำดับแถวเท่านั้น ราคาในไฟล์คือด่านเดียวที่จับได้ถ้าลำดับสลับ
    // (controller เทียบกับราคาในระบบ) — เครื่องสองมิเตอร์ที่แถวใดไม่มีราคาจึงถูกปฏิเสธทั้งคู่
    // แทนการเดา เพราะถ้าเดาผิด ยอดสองมิเตอร์สลับกันโดยที่ทั้งคู่ยังหาราคาได้
    const twoMeter = new Set([...seenInSheet].filter(([, count]) => count > 1).map(([key]) => key));
    const sheetReadings = readings.splice(sheetReadingsFrom);
    const unpricedPair = new Set(sheetReadings
      .filter((reading) => twoMeter.has(reading.serial_number.toUpperCase()) && reading.file_price === null)
      .map((reading) => reading.serial_number.toUpperCase()));
    for (const reading of sheetReadings) {
      const key = reading.serial_number.toUpperCase();
      if (!unpricedPair.has(key)) {
        readings.push(reading);
        continue;
      }
      errors.push({
        sheet: reading.sheet,
        row: reading.row,
        serial_number: reading.serial_number,
        month: reading.month,
        reason: "เครื่องนี้มีสองแถว (ขาวดำและสี) แต่ไม่มีราคาในคอลัมน์ Cost/Click จึงแยกไม่ได้ว่าแถวไหนเป็นมิเตอร์สี",
      });
    }
  }

  if (!found.length && !errors.length) return null;
  return { readings, errors, sheets: found };
}

module.exports = {
  parseVendorWorkbook,
  periodDatesFromTitle,
  contractNoFromTitle,
  comparableContractNo,
};
