// apps/api/src/import/registry-sheet.test.js — อ่านไฟล์ทะเบียนดิบของผู้ให้เช่า (#132)
//
// ข้อมูลในเทสนี้สมมติทั้งหมด แต่จำลองโครงของไฟล์จริง: หัวรายงานก่อนหัวตาราง หลายแผ่น
// ชื่อคอลัมน์สะกดหลายแบบ คอลัมน์ฝ่ายไม่มีหัว และแถวหัวตารางซ้ำกลางแผ่น

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseRegistryWorkbook } = require("./registry-sheet");
const { splitBrandModel } = require("./brand-model");

const TITLE = "รายงานสถานะเครื่องOKI ES5112 และตำแหน่งที่ตั้งเดือน กรกฏาคม 2568 : สัญญาเลขที่ TEST 9/2567 (เริ่ม วันที่ 29 กันยายน 2567 - 29 กันยายน 2570)";

// แผ่นแบบ OKI: หัวตารางแถวที่ 3 คอลัมน์ฝ่าย (index 6) ไม่มีหัว มีคอลัมน์ข้อมูลส่วนบุคคล
const okiSheet = {
  name: "OKI",
  rows: [
    ["", TITLE],
    [],
    ["no.", "Model", "Building", "Floor.", "Depatment", "แผนก", "", "Location", "Serial No.", "IP Address", "ชื่อ-สกุล ผู้รับการติดตั้ง", "เบอร์โทรศัพท์"],
    ["1", "OKI ES5112", "อาคารตัวอย่าง (EX)", "11", "หอผู้ป่วย A", "หอผู้ป่วยเอ", "ฝ่ายตัวอย่าง", "เคาน์เตอร์", "TESTSN0001", "10.0.0.1", "สมมติ ทดสอบ", "0000"],
    ["2", "OKI ES5112", "อาคารตัวอย่าง (EX)", "5", "หอผู้ป่วย B", "หอผู้ป่วยบี", "ฝ่ายตัวอย่าง", "ห้องตรวจ", "TESTSN0002", "10.0.0.2", "สมมติ ทดสอบ", "0000"],
    ["no.", "Model", "Building", "Floor.", "Depatment", "แผนก", "", "Location", "Serial No.", "IP Address", "", ""],
    ["3", "OKI ES5112", "ยังไม่มีจุดติดตั้ง", "", "", "", "ฝ่ายตัวอย่าง", "", "TESTSN0003", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "", ""],
  ],
};

// แผ่นแบบ HP: หัวตารางแถวที่ 4 มีคอลัมน์ฝ่าย สถานะ และวันที่ติดตั้ง
const hpSheet = {
  name: "HP ",
  rows: [
    [],
    ["", TITLE.replace("OKI ES5112", "HP MFP M430F")],
    [],
    ["no.", "Model", "Building", "Floor.", "Depatment", "แผนก", "ฝ่าย", "Printer Name", "Location", "Date", "Serial No.", "สถานะ"],
    ["1", "HP MFP M430F", "อาคารตัวอย่าง", "12", "หอ C", "หอซี", "ฝ่ายตัวอย่าง", "ชื่อเครื่อง", "ห้องพยาบาล", "21/09/2024", "TESTSN0004", "completed"],
    ["2", "HP MFP E731DN", "อาคารตัวอย่าง", "4", "บัญชี", "บัญชี", "ฝ่ายตัวอย่าง", "ชื่อเครื่อง", "ห้องถ่ายเอกสาร", "31/02/2024", "TESTSN0005", "completed"],
  ],
};

const hpA3Sheet = {
  name: "HP A3",
  rows: [
    [],
    ["", TITLE],
    [],
    ["no.", "Model", "Building", "Floor.", "Depatment", "Location", "Serial No."],
    ["1", "HP MFP E731DN", "อาคารตัวอย่าง", "4", "บัญชี", "ห้องถ่ายเอกสาร", "TESTSN0005"],
  ],
};

test("อ่านไฟล์ทะเบียนหลายแผ่นที่มีหัวรายงานก่อนหัวตาราง", () => {
  const parsed = parseRegistryWorkbook([okiSheet, hpSheet]);
  assert.deepEqual(parsed.sheets.map((s) => [s.sheet, s.header_row, s.contract_no]), [
    ["OKI", 3, "TEST 9/2567"],
    ["HP", 4, "TEST 9/2567"],
  ]);
  assert.deepEqual(parsed.rows.map((r) => r.serial_number), ["TESTSN0001", "TESTSN0002", "TESTSN0003", "TESTSN0004", "TESTSN0005"]);
});

test("แยกยี่ห้อจากชื่อรุ่น และใช้คอลัมน์ 'แผนก' ก่อน 'Depatment'", () => {
  const [row] = parseRegistryWorkbook([okiSheet]).rows;
  assert.equal(row.brand, "OKI");
  assert.equal(row.model, "ES5112");
  assert.equal(row.floor, "11");
  assert.equal(row.department, "หอผู้ป่วยเอ");
  assert.equal(row.building, "อาคารตัวอย่าง (EX)");
  assert.equal(row.contract_no, "TEST 9/2567");
});

test("คอลัมน์ฝ่ายที่ไม่มีหัวถูกเดาจากค่า และแจ้งไว้ในหมายเหตุของแผ่น", () => {
  const parsed = parseRegistryWorkbook([okiSheet]);
  assert.equal(parsed.rows[0].division, "ฝ่ายตัวอย่าง");
  assert.match(parsed.sheets[0].notes[0], /คอลัมน์ที่ 7/);
});

test("ข้ามแถวหัวตารางที่ซ้ำกลางแผ่นและแถวว่าง", () => {
  const serials = parseRegistryWorkbook([okiSheet]).rows.map((r) => r.serial_number);
  assert.ok(!serials.some((s) => /serial/i.test(s)));
  assert.equal(serials.length, 3);
});

test("'ยังไม่มีจุดติดตั้ง' ในช่องอาคาร = ยังไม่ได้ติดตั้ง ไม่ใช่ชื่ออาคาร", () => {
  const row = parseRegistryWorkbook([okiSheet]).rows[2];
  assert.equal(row.building, "");
  assert.equal(row.installation, "not_installed");
});

test("รายงานสถานะเครื่อง = ติดตั้งแล้ว และอ่านวันที่ติดตั้งแบบ วัน/เดือน/ปี", () => {
  const [installed, badDate] = parseRegistryWorkbook([hpSheet]).rows;
  assert.equal(installed.installation, "installed");
  assert.equal(installed.installed_on, "2024-09-21");
  assert.equal(installed.installed_on_known, true); // วันที่ระบุในไฟล์ = ยืนยันย้อนหลังได้
  assert.equal(installed.location, "ห้องพยาบาล"); // "Location" มาก่อน "Printer Name"
  assert.equal(installed.status, "active"); // "completed" คือสถานะการติดตั้ง ไม่ใช่สถานะเครื่อง
  assert.equal(badDate.installed_on, null); // 31 ก.พ. ไม่มีจริง — ไม่เดาวันอื่น และเตือน
  assert.equal(badDate.installed_on_known, false);
});

test("ไม่เก็บชื่อ เบอร์โทร และ IP ของเจ้าหน้าที่", () => {
  const text = JSON.stringify(parseRegistryWorkbook([okiSheet]));
  assert.doesNotMatch(text, /สมมติ ทดสอบ|10\.0\.0\.1|"0000"/);
});

test("เครื่องที่อยู่หลายแผ่นใช้แถวแรกและเตือน ไม่ปฏิเสธ", () => {
  const parsed = parseRegistryWorkbook([hpSheet, hpA3Sheet]);
  assert.equal(parsed.rows.filter((r) => r.serial_number === "TESTSN0005").length, 1);
  assert.equal(parsed.errors.length, 0);
  assert.ok(parsed.warnings.some((w) => w.serial_number === "TESTSN0005" && w.reason.includes("HP แถว 6")));
});

test("เทมเพลตของระบบ (หัวตารางแถวแรก มีคอลัมน์ยี่ห้อ) ยังอ่านได้", () => {
  const [row] = parseRegistryWorkbook([{
    name: "Sheet1",
    rows: [
      ["serial_number", "brand", "model", "status", "building", "floor", "location", "division", "department", "contract_no", "price_override"],
      ["SN-001", "HP", "LaserJet M404dn", "repair", "อาคาร A", "ชั้น 2", "ห้อง 201", "ฝ่าย A", "งาน A", "CT-1/2568", "1.5"],
    ],
  }]).rows;
  assert.equal(row.brand, "HP");
  assert.equal(row.model, "LaserJet M404dn"); // มีคอลัมน์ยี่ห้อ = ไม่ตัดยี่ห้อออกจากรุ่น
  assert.equal(row.status, "repair");
  assert.equal(row.contract_no, "CT-1/2568");
  assert.equal(row.price_override, "1.5");
  assert.equal(row.installation, null); // เทมเพลตไม่บอกสถานะการติดตั้ง = รอตรวจยืนยัน (ADR-0018)
});

test("แผ่นที่ไม่มีคอลัมน์เลขซีเรียล = ไม่ใช่ทะเบียนเครื่อง", () => {
  assert.equal(parseRegistryWorkbook([{ name: "x", rows: [["a", "b"], ["1", "2"]] }]), null);
});

test("รายงานมิเตอร์ใช้ลงทะเบียนได้: มิเตอร์สี ยังไม่ติดตั้ง และที่ตั้งจากแผ่นล่าสุด", () => {
  const head = ["No.", "Model", "SN.", "Printer Name", "Division", "Department", "location", "Building", "Fool.", " Meter Start (B&W) ", " Meter End (B&W) ", " B&W Cost/Click (THB) "];
  const sheet = (name, title, rows) => ({ name, rows: [[title], head, ...rows] });
  const parsed = parseRegistryWorkbook([
    sheet("1-Mar", "Meter Reading Report from Installation Date; February 24, 2569 to March 23, 2569 : Contract No. TEST192/2568", [
      ["1", "Brother HL-L5210DN", "TESTB001", "ที่เดิม", "ฝ่าย ก", "งาน ก", "หน่วย ก", "อาคาร ก", "1", "", 100, 0.365],
      ["2", "Brother HL-L5210DN", "TESTB002", "รอจุดติดตั้ง", "", "", "", "อาคาร ก", "2", "", "", 0.365],
    ]),
    sheet("2-Apr", "Meter Reading Report from Installation Date; March 24, 2569 to April 23, 2569 : Contract No. TEST192/2568", [
      ["1", "Brother HL-L5210DN", "TESTB001", "ที่ใหม่", "ฝ่าย ก", "งาน ก", "หน่วย ก", "อาคาร ก", "3", 100, 150, 0.365],
      ["2", "Brother HL-L5210DN", "TESTB002", "รอจุดติดตั้ง", "", "", "", "อาคาร ก", "2", "", "", 0.365],
      ["3", "HP MFP E78635DN", "TESTC003", "ถ่ายเอกสาร", "ฝ่าย ข", "งาน ข", "", "อาคาร ข", "5", 10, 20, 0.35],
      ["", "HP MFP E78635DN", "TESTC003", "ถ่ายเอกสาร สี", "ฝ่าย ข", "งาน ข", "", "อาคาร ข", "5", 5, 9, 3.9],
    ]),
  ]);
  const bySerial = Object.fromEntries(parsed.rows.map((r) => [r.serial_number, r]));
  assert.equal(bySerial.TESTB001.location, "ที่ใหม่");
  assert.equal(bySerial.TESTB001.floor, "3");
  assert.equal(bySerial.TESTB001.department, "งาน ก"); // ไม่ใช่คอลัมน์ "location" ซึ่งคือหน่วยย่อย
  assert.equal(bySerial.TESTB001.installation, "installed");
  // มียอด = ติดตั้งแล้วอย่างน้อยตั้งแต่งวดแรกที่มียอด ก่อนหน้านั้นยืนยันไม่ได้ (ADR-0018 Q21)
  assert.equal(bySerial.TESTB001.installed_on, "2026-02-24");
  assert.equal(bySerial.TESTB001.installed_on_known, false);
  assert.equal(bySerial.TESTB002.installation, "not_installed"); // "รอจุดติดตั้ง" = หลักฐาน
  assert.equal(bySerial.TESTB002.location, "");
  assert.equal(bySerial.TESTC003.has_color_meter, true);
  assert.equal(bySerial.TESTC003.installed_on, "2026-03-24"); // เริ่มมียอดงวดที่สอง
  assert.equal(bySerial.TESTC003.brand, "HP");
  assert.equal(bySerial.TESTC003.contract_no, "TEST192/2568");
});

test("splitBrandModel รู้จักยี่ห้อที่เขียนติดกับรุ่น แต่ไม่ตัดคำที่แค่ขึ้นต้นเหมือน", () => {
  assert.deepEqual(splitBrandModel("HP-MFP E73135DN"), { brand: "HP", model: "MFP E73135DN" });
  assert.deepEqual(splitBrandModel("HPE72535DN"), { brand: "HP", model: "E72535DN" });
  assert.deepEqual(splitBrandModel("OKIDATA 123"), { brand: "", model: "OKIDATA 123" });
  assert.deepEqual(splitBrandModel("Fuji Xerox DocuPrint"), { brand: "Fuji Xerox", model: "DocuPrint" });
});

test("วันที่ไม่ถูกต้องขึ้นคำเตือน ไม่ตกไปใช้วันอื่นเงียบๆ", () => {
  const parsed = parseRegistryWorkbook([hpSheet]);
  assert.ok(parsed.warnings.some((w) => w.reason.includes('อ่านวันติดตั้ง "31/02/2024" ไม่ได้')));
});

test("เซลล์วันที่ของ Excel อ่านจากเลขลำดับวัน ไม่ใช่ข้อความที่แสดง (m/d/yy สลับวันกับเดือน)", () => {
  const rows = [
    ["", TITLE],
    ["Model", "Serial No.", "Date"],
    ["OKI ES5112", "TESTSN0100", "10/1/24"], // สิ่งที่ Excel แสดง = 1 ต.ค. 2024 แบบ m/d/yy
  ];
  const rawRows = rows.map((r) => [...r]);
  rawRows[2][2] = 45566; // เลขลำดับวันของ 2024-10-01
  const [row] = parseRegistryWorkbook([{ name: "OKI", rows, rawRows }]).rows;
  assert.equal(row.installed_on, "2024-10-01");
});

test("คอลัมน์สถานะ: 'รอติดตั้ง' = ยังไม่ติดตั้ง ค่าที่ไม่รู้จัก = ยังไม่รู้ ไม่ถือว่าติดตั้งแล้ว", () => {
  const sheet = {
    name: "HP",
    rows: [
      ["", TITLE],
      ["Model", "Serial No.", "สถานะ"],
      ["HP MFP M430F", "TESTSN0200", "รอติดตั้ง"],
      ["HP MFP M430F", "TESTSN0201", "ยกเลิก"],
      ["HP MFP M430F", "TESTSN0202", "constructor"],
    ],
  };
  const [waiting, cancelled, weird] = parseRegistryWorkbook([sheet]).rows;
  assert.equal(waiting.installation, "not_installed");
  assert.equal(cancelled.installation, null);
  assert.equal(weird.status, "active"); // ชื่อที่ชนของใน prototype ต้องไม่หลุดเป็นค่าแปลก
});

test("หัวคอลัมน์ 'ตำแหน่ง' (ตำแหน่งงานของผู้รับการติดตั้ง) ไม่ถูกอ่านเป็นที่ตั้งเครื่อง", () => {
  const [row] = parseRegistryWorkbook([{
    name: "S",
    rows: [["Model", "Serial No.", "ตำแหน่ง"], ["OKI ES5112", "TESTSN0300", "พยาบาลวิชาชีพ"]],
  }]).rows;
  assert.equal(row.location, "");
});
