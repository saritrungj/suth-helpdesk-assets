// apps/api/src/import/vendor-terms.js
//
// เงื่อนไขสัญญาและยอดท้ายแผ่นจากรายงานมิเตอร์ของผู้ให้เช่า (#179) — ไม่แตะฐานข้อมูล
//
// ตัวนำเข้าเดิมอ่านแค่งวดและเลขที่สัญญาจากหัวแผ่น ส่วนที่เหลือถูกทิ้ง ทั้งที่เป็นหลักฐานเดียวกับใบแจ้งหนี้
// ผู้ใช้จึงพิมพ์อายุสัญญาและค่าเช่าเองแล้วพลาด (audit 2026-09-23: ไม่มีค่าเช่า/VAT → ยอด 4 เดือนขาด 36,376 บาท
// และวันสิ้นสุดผิดทำให้ยอดเดือนถัดไปหาราคาไม่ได้) ที่นี่อ่านมาให้ import session ใช้สองทาง
//
//   - เติมฟอร์มสร้างสัญญาจากไฟล์ เมื่อยังไม่มีสัญญานั้นในระบบ
//   - เทียบกับสัญญาที่มีอยู่ และเทียบยอดตามใบแจ้งหนี้ของระบบกับยอดท้ายแผ่น
//
// ## อายุสัญญา
//
//   แบบเลขงวด   "…February 24, 2569 to March 23, 2569 : Contract No. X งวดที่ 1/36" — วันเริ่มสัญญา
//               = วันเริ่มงวดของแผ่นที่เลขงวดน้อยที่สุด ย้อนกลับ (เลขงวด − 1) เดือน อายุ = จำนวนงวด
//   แบบหัวแผ่น  "…สัญญาเลขที่ X (เริ่ม วันที่ 29 กันยายน 2567 - 29 กันยายน 2570)"
//
// เงินทั้งหมดคืนเป็นข้อความทศนิยมสองตำแหน่ง (เหมือน DECIMAL ของ mysql2) ไม่ใช่ float

const { MONTHS_TH_FULL, normalizeMonth } = require("@suth/domain");
const { findColumns, periodDatesFromTitle, contractNoFromTitle, comparableContractNo } = require("./vendor-meter");

const text = (cell) => String(cell ?? "").replace(/\s+/g, " ").trim();
const baht = (value) => (Number.isFinite(value) ? (Math.round(value * 100) / 100).toFixed(2) : null);

/** วันที่ ค.ศ. "YYYY-MM-DD" จากปีที่อาจเป็น พ.ศ. — null ถ้าวางไม่ได้ */
function isoDate(year, month, day) {
  const ce = normalizeMonth(`${year}-${String(month).padStart(2, "0")}`);
  return ce ? `${ce}-${String(day).padStart(2, "0")}` : null;
}

/** เลื่อนวันที่ไป n เดือน (n ติดลบได้) แบบเดียวกับการนับงวดรายเดือนของสัญญา */
function shiftMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + n, d));
  return date.toISOString().slice(0, 10);
}

function minusOneDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** "(เริ่ม วันที่ 29 กันยายน 2567 - 29 กันยายน 2570)" → { from, to } */
function termFromTitle(title) {
  const match = title.match(/เริ่ม\s*(?:วันที่)?\s*(\d{1,2})\s+([ก-๙]+)\s+(\d{4})\s*[-–]\s*(?:วันที่)?\s*(\d{1,2})\s+([ก-๙]+)\s+(\d{4})/);
  if (!match) return null;
  const month = (name) => MONTHS_TH_FULL.indexOf(name) + 1;
  if (!month(match[2]) || !month(match[5])) return null;
  const from = isoDate(match[3], month(match[2]), match[1]);
  const to = isoDate(match[6], month(match[5]), match[4]);
  return from && to ? { from, to } : null;
}

/** "งวดที่ 6/36" → { number: 6, of: 36 } */
function installmentFromTitle(title) {
  const match = title.match(/งวดที่\s*(\d+)\s*\/\s*(\d+)/);
  return match ? { number: Number(match[1]), of: Number(match[2]) } : null;
}

/** ตัวเลขตัวแรกหลังเซลล์ข้อความที่ตรง pattern ในแถวเดียวกัน */
function amountAfter(rows, pattern, { last = false } = {}) {
  for (const row of rows) {
    const at = row.findIndex((cell) => typeof cell === "string" && pattern.test(text(cell)));
    if (at === -1) continue;
    const numbers = row.slice(at + 1).filter((cell) => typeof cell === "number" && Number.isFinite(cell));
    if (numbers.length) return last ? numbers.at(-1) : numbers[0];
  }
  return null;
}

/** อัตรา VAT จากข้อความ "Vat 7%" */
function vatRateOf(rows) {
  for (const row of rows) {
    for (const cell of row) {
      const match = typeof cell === "string" && text(cell).match(/^vat\s*(\d+(?:\.\d+)?)\s*%/i);
      if (match) return match[1];
    }
  }
  return null;
}

/**
 * @param {Array<{ name: string, rows: unknown[][] }>} sheets แถวดิบ (raw: true) ของทุกแผ่น
 * @returns {Array<{
 *   contract_no: string, effective_from: string|null, effective_to: string|null, term_source: "title"|"installments"|null,
 *   monthly_rental: string|null, vat_rate: string|null,
 *   periods: Array<{ sheet: string, month: string, print_total: string|null, vat: string|null, invoice_total: string|null }>
 * }>}
 */
function vendorTerms(sheets) {
  const byContract = new Map();

  for (const sheet of sheets) {
    const columns = findColumns(sheet.rows);
    if (!columns) continue;
    const title = sheet.rows.slice(0, columns.headerRow).flat().map(text).filter(Boolean).join(" ");
    const contractNo = contractNoFromTitle(title);
    const period = periodDatesFromTitle(title);
    if (!contractNo || !period) continue;

    const key = comparableContractNo(contractNo);
    const entry = byContract.get(key) ?? {
      contract_no: contractNo,
      effective_from: null,
      effective_to: null,
      term_source: null,
      monthly_rental: null,
      vat_rate: null,
      periods: [],
      installment: null,
    };

    const term = termFromTitle(title);
    if (term && !entry.term_source) {
      Object.assign(entry, { effective_from: term.from, effective_to: term.to, term_source: "title" });
    }
    const installment = installmentFromTitle(title);
    if (installment && period.start && (!entry.installment || installment.number < entry.installment.number)) {
      entry.installment = { ...installment, start: period.start };
    }

    const body = sheet.rows.slice(columns.headerRow + 1);
    const rental = amountAfter(body, /^rental$/i, { last: true });
    const vatRate = vatRateOf(body);
    const vat = amountAfter(body, /^vat\b/i);
    const grand = amountAfter(body, /^grand total/i);
    const printOnly = amountAfter(body, /^รวมค่าพิมพ์/);
    if (rental !== null) entry.monthly_rental = baht(rental);
    if (vatRate !== null) entry.vat_rate = vatRate;

    // "GRAND TOTAL" ของแบบเดือนปฏิทินรวมค่าเช่าแล้ว ส่วน "รวมค่าพิมพ์" ของแบบเลขงวดเป็นค่าพิมพ์ล้วน
    const printTotal = printOnly ?? (grand !== null ? grand - (rental ?? 0) : null);
    const beforeVat = grand ?? printOnly;
    entry.periods.push({
      sheet: sheet.name.trim(),
      month: period.end.slice(0, 7),
      print_total: baht(printTotal),
      vat: vat === null ? null : baht(vat),
      invoice_total: beforeVat === null || vat === null ? null : baht(beforeVat + vat),
    });
    byContract.set(key, entry);
  }

  return [...byContract.values()].map(({ installment, ...entry }) => {
    if (!entry.term_source && installment) {
      const from = shiftMonths(installment.start, -(installment.number - 1));
      Object.assign(entry, {
        effective_from: from,
        effective_to: minusOneDay(shiftMonths(from, installment.of)),
        term_source: "installments",
      });
    }
    entry.periods.sort((a, b) => a.month.localeCompare(b.month));
    return entry;
  });
}

module.exports = { vendorTerms };
