// เงื่อนไขสัญญาและยอดท้ายแผ่นจากรายงานของผู้ให้เช่า (#179) — แถวสังเคราะห์ รูปเดียวกับไฟล์จริงสองแบบ
// ห้ามใส่เลขเครื่องหรือชื่อจริง (repo เป็น public)

const test = require("node:test");
const assert = require("node:assert/strict");
const { vendorTerms } = require("./vendor-terms");

const HEADER = ["No.", "Model", "SN.", "Printer Name", "Meter Start (B&W)", "Meter End (B&W)", "B&W Cost/Click (THB)"];

/** แบบงวด 24–23 ติดเลขงวด (รูปแบบ SUTH192) */
function installmentSheet(n, start, end, printTotal) {
  return {
    name: `${n}-TEST-${n}`,
    rows: [
      [`Meter Reading Report from Installation Date; ${start}  to ${end} : Contract No. TEST1/2568    งวดที่ ${n}/36`],
      HEADER,
      ["1", "Brother HL-L5210DN", "TX9-0001", "Room 1", 0, 100, 0.365],
      ["จำนวนการพิมพ์เครื่องเลเซอร์ขาว-ดำ A4", 0, 100, 100, 2, 98, 0.365, 35.77],
      ["รวมค่าพิมพ์/บาท", printTotal],
      [Math.round(printTotal * 100) / 100],
    ],
  };
}

/** แบบเดือนปฏิทิน อายุสัญญาในหัวแผ่น ค่าเช่าและ VAT ท้ายแผ่น (รูปแบบ SUTH 86) */
function calendarSheet(month, printPlusRental, vat) {
  return {
    name: `MeterReport_${month}_2026`,
    rows: [
      [`ค่าเช่าเครื่องพิมพ์และเครื่องถ่ายเอกสาร วันที่ 1 พฤษภาคม 2569 - 31 พฤษภาคม 2569 : สัญญาเลขที่ TEST 2/2567 (เริ่ม วันที่ 29 กันยายน 2567 - 29 กันยายน 2570)`],
      ["No.", "Printer Name", "Serial Number", "Model", "Meter Start (B&W)", "Meter End (B&W)", "B&W Cost/Click (THB)"],
      ["1", "Room 1", "TX9-0002", "OKI ES5112", 10, 20, 0.41],
      [null, "OKI", 10, 20, 10, -0.2, 9.8, 0.41, 4.02],
      [null, "Rental", 0, 0, 0, 0, 2333.65],
      [null, "GRAND TOTAL B&W", " Total ", printPlusRental, 6],
      [null, "Vat 7%", vat],
    ],
  };
}

test("สัญญาแบบเลขงวด: อายุสัญญาย้อนจากงวดที่ 1 และนับ 36 งวด", () => {
  const terms = vendorTerms([
    installmentSheet(1, "February 24, 2569", "March 23, 2569", 306583.9693),
    installmentSheet(2, "March 24, 2569", "April 23, 2569", 174202.5411),
  ]);
  assert.equal(terms.length, 1);
  const [contract] = terms;
  assert.equal(contract.contract_no, "TEST1/2568");
  assert.equal(contract.effective_from, "2026-02-24");
  assert.equal(contract.effective_to, "2029-02-23");
  assert.equal(contract.term_source, "installments");
  assert.equal(contract.monthly_rental, null);
  assert.equal(contract.vat_rate, null);
  assert.deepEqual(contract.periods.map((p) => [p.month, p.print_total]), [["2026-03", "306583.97"], ["2026-04", "174202.54"]]);
});

test("สัญญาที่ไม่ได้เริ่มงวดแรกในไฟล์ ย้อนวันเริ่มจากเลขงวด", () => {
  const [contract] = vendorTerms([installmentSheet(6, "July 24, 2569", "Aug 23, 2569", 164263.8809)]);
  assert.equal(contract.effective_from, "2026-02-24");
  assert.equal(contract.effective_to, "2029-02-23");
});

test("สัญญาแบบเดือนปฏิทิน: อายุสัญญาจากหัวแผ่น ค่าเช่าและอัตรา VAT จากท้ายแผ่น", () => {
  const [contract] = vendorTerms([calendarSheet(5, 103749.8026, 7262.486182)]);
  assert.equal(contract.contract_no, "TEST 2/2567");
  assert.equal(contract.effective_from, "2024-09-29");
  assert.equal(contract.effective_to, "2027-09-29");
  assert.equal(contract.term_source, "title");
  assert.equal(contract.monthly_rental, "2333.65");
  assert.equal(contract.vat_rate, "7");
  const [period] = contract.periods;
  assert.equal(period.month, "2026-05");
  assert.equal(period.print_total, "101416.15");
  assert.equal(period.invoice_total, "111012.29");
});

test("แผ่นที่ไม่ใช่รายงานมิเตอร์ของผู้ให้เช่า ไม่มีเงื่อนไขสัญญา", () => {
  assert.deepEqual(vendorTerms([{ name: "S", rows: [["serial_number", "brand"], ["TX9-1", "HP"]] }]), []);
});
