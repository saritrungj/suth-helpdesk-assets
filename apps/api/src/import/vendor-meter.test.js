const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const {
  comparableContractNo,
  contractNoFromTitle,
  parseVendorWorkbook,
  periodDatesFromTitle,
} = require("./vendor-meter");

describe("vendor meter workbook", () => {
  test("reads the billing period before the contract term in English and Thai titles", () => {
    assert.deepEqual(periodDatesFromTitle(
      "Meter Reading Report; July 24, 2569 to Aug 23, 2569 : Contract No. SUTH192/2568"
    ), { start: "2026-07-24", end: "2026-08-23" });
    assert.deepEqual(periodDatesFromTitle(
      "ค่าเช่า วันที่ 1 สิงหาคม 2569 - 31 สิงหาคม 2569 : สัญญาเลขที่ SUTH 86/2567 (เริ่ม วันที่ 29 กันยายน 2567)"
    ), { start: "2026-08-01", end: "2026-08-31" });
  });

  test("reads Common Era titles and refuses years the domain cannot place, including Sep→Oct periods", () => {
    assert.deepEqual(periodDatesFromTitle("Meter Reading Report; Sep 24, 2026 to Oct 23, 2026 : Contract No. X"),
      { start: "2026-09-24", end: "2026-10-23" });
    assert.equal(periodDatesFromTitle("Meter Reading Report; July 24, 2400 to Aug 23, 2400 : Contract No. X"), null);
  });

  test("reports a sheet whose period year is out of range instead of failing at the database", () => {
    const result = parseVendorWorkbook([{
      name: "งวดผิด",
      rows: [
        ["Meter Reading Report; July 24, 2400 to Aug 23, 2400 : Contract No. SUTH192/2568"],
        ["SN.", "Meter Start (B&W)", "Meter End (B&W)"],
        ["SN-001", 1, 2],
      ],
    }]);
    assert.deepEqual(result.readings, []);
    assert.deepEqual(result.errors.map((error) => error.sheet), ["งวดผิด"]);
  });

  test("normalizes the vendor's contract-number variants", () => {
    assert.equal(contractNoFromTitle("Contract No. SUTH192/2568 งวดที่ 6/36"), "SUTH192/2568");
    assert.equal(contractNoFromTitle("สัญญาเลขที่ SUTH 86-2567"), "SUTH 86-2567");
    assert.equal(comparableContractNo("SUTH 86-2567"), "SUTH86/2567");
  });

  test("turns duplicate serial rows into primary and color meter readings", () => {
    const result = parseVendorWorkbook([{
      name: "งวด 6",
      rows: [
        ["Meter Reading Report; July 24, 2569 to Aug 23, 2569 : Contract No. SUTH192/2568"],
        ["SN.", "Model", "Meter Start (B&W)", "Meter End (B&W)", "Cost/Click"],
        ["SN-001", "MFP-1", 1000, 1250, 0.45],
        ["SN-001", "MFP-1", 50, 75, 4.5],
      ],
    }]);

    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.sheets, [{
      sheet: "งวด 6",
      month: "2026-08",
      period_start: "2026-07-24",
      period_end: "2026-08-23",
      contract_no: "SUTH192/2568",
    }]);
    assert.deepEqual(result.readings.map(({ serial_number, meter, pages, file_price }) => ({
      serial_number, meter, pages, file_price,
    })), [
      { serial_number: "SN-001", meter: "primary", pages: 250, file_price: 0.45 },
      { serial_number: "SN-001", meter: "color", pages: 25, file_price: 4.5 },
    ]);
  });

  test("refuses a two-meter device whose rows carry no price to tell black-and-white from color", () => {
    // ลำดับแถวอย่างเดียวบอกไม่ได้ว่าแถวไหนเป็นมิเตอร์สี ถ้าไม่มีราคาให้เทียบ ยอดสองมิเตอร์
    // จะสลับกันเงียบๆ ทั้งที่ทั้งคู่มีราคา — ต้องปฏิเสธ ไม่ใช่เดา
    const result = parseVendorWorkbook([{
      name: "งวด 6",
      rows: [
        ["Meter Reading Report; July 24, 2569 to Aug 23, 2569 : Contract No. SUTH192/2568"],
        ["SN.", "Model", "Meter Start (B&W)", "Meter End (B&W)"],
        ["SN-001", "MFP-1", 50, 75],
        ["SN-001", "MFP-1", 1000, 1250],
        ["SN-002", "LASER-1", 10, 20],
      ],
    }]);

    assert.deepEqual(result.readings.map((reading) => reading.serial_number), ["SN-002"]);
    assert.deepEqual(result.errors.map(({ row, serial_number }) => ({ row, serial_number })), [
      { row: 3, serial_number: "SN-001" },
      { row: 4, serial_number: "SN-001" },
    ]);
    assert.match(result.errors[0].reason, /Cost\/Click/);
  });

  test("reports invalid meter movement with sheet and row context", () => {
    const result = parseVendorWorkbook([{
      name: "ส.ค. 69",
      rows: [
        ["วันที่ 1 สิงหาคม 2569 - 31 สิงหาคม 2569 : สัญญาเลขที่ SUTH 86/2567"],
        ["Serial Number", "Meter Start (B&W)", "Meter End (B&W)"],
        ["SN-002", 200, 199],
      ],
    }]);

    assert.deepEqual(result.readings, []);
    assert.equal(result.errors.length, 1);
    assert.deepEqual(
      { sheet: result.errors[0].sheet, row: result.errors[0].row, serial_number: result.errors[0].serial_number },
      { sheet: "ส.ค. 69", row: 3, serial_number: "SN-002" }
    );
    assert.match(result.errors[0].reason, /น้อยกว่า/);
  });
});
