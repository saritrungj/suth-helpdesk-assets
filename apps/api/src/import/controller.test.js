// apps/api/src/import/controller.test.js
//
// ไฟล์ยอดพิมพ์ที่มีแผ่นหรือแถวเกินเพดานต้องถูกปฏิเสธก่อนแตะฐานข้อมูล — ไฟล์ 5MB ที่บีบอัด
// ได้ดีกางออกเป็นแถวได้มหาศาล แล้วทั้งหมดจะไปอยู่ในคำสั่งเขียนก้อนเดียวใน transaction เดียว

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const XLSX = require("xlsx");

const db = require("../shared/db");
const { importPrintTransactions } = require("./controller");

async function importFile(workbook) {
  const file = path.join(os.tmpdir(), `suth-import-cap-${process.pid}-${Date.now()}.xlsx`);
  XLSX.writeFile(workbook, file);
  const originalQuery = db.query;
  const queries = [];
  db.query = async (sql) => { queries.push(String(sql)); return [[]]; };
  try {
    return await new Promise((resolve) => {
      const res = { json: (body) => resolve({ body }), status() { return this; } };
      importPrintTransactions({ file: { path: file }, body: {}, query: {} }, res, (error) => resolve({ error }));
    }).then((result) => ({ ...result, queries }));
  } finally {
    db.query = originalQuery;
    fs.rmSync(file, { force: true });
  }
}

test("ปฏิเสธไฟล์ที่มีแผ่นเกินเพดานก่อนถามฐานข้อมูล", async () => {
  const workbook = XLSX.utils.book_new();
  for (let i = 1; i <= 61; i++) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["serial_number"]]), `S${i}`);
  const { error, queries } = await importFile(workbook);
  assert.equal(error?.status, 400);
  assert.equal(error?.code, "import_too_large");
  assert.deepEqual(queries, []);
});

test("ปฏิเสธไฟล์ที่ประกาศแถวรวมเกินเพดาน", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([["serial_number", "month", "pages"]]);
  sheet["!ref"] = "A1:C50001";
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "ยอด");
  const { error } = await importFile(workbook);
  assert.equal(error?.code, "import_too_large");
});

/** แผ่นเล็กที่ประกาศขอบเขต `ref` — ไฟล์จริงแบบนี้เกิดจากการจัดรูปแบบทั้งแถวหรือทั้งคอลัมน์ใน Excel */
function declared(ref) {
  const sheet = XLSX.utils.aoa_to_sheet([["SN.", "meter 9/67"], ["TEST-SN-1", 5]]);
  sheet["!ref"] = ref;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "ยอด");
  return workbook;
}

// ไฟล์ 16 KB ที่ประกาศ A1:XFD1500 เคยทำให้ health check รอ 17 วินาที (#142) — ต้องถูกปฏิเสธ
// ก่อนกางแผ่นเป็นแถว เทสใช้ 228 คอลัมน์ (เกินเพดาน 200) เพราะการ "เขียน" ไฟล์กว้างแบบนั้นด้วย
// SheetJS เองก็ช้า ไม่เกี่ยวกับ API
test("นำเข้ายอดมิเตอร์ปฏิเสธแผ่นที่ประกาศคอลัมน์เกินเพดาน ก่อนถามฐานข้อมูล", async () => {
  const { error, queries } = await importFile(declared("A1:HT3"));
  assert.equal(error?.code, "import_too_large");
  assert.deepEqual(queries, []);
});

// 200 คอลัมน์ × 6,000 แถว ผ่านเพดานแถวและคอลัมน์ทั้งคู่ แต่เป็น 1.2 ล้านเซลล์
test("นำเข้ายอดมิเตอร์ปฏิเสธไฟล์ที่เซลล์รวมเกินเพดานแม้แถวและคอลัมน์ไม่เกิน", async () => {
  const { error, queries } = await importFile(declared("A1:GR6000"));
  assert.equal(error?.code, "import_too_large");
  assert.deepEqual(queries, []);
});

const { readAllSheets } = require("./controller");

test("นำเข้าทะเบียนใช้เพดานเซลล์รวมเดียวกัน", () => {
  const file = path.join(os.tmpdir(), `suth-registry-cells-${process.pid}-${Date.now()}.xlsx`);
  XLSX.writeFile(declared("A1:GR6000"), file);
  try {
    assert.throws(() => readAllSheets(file, "registry.xlsx"), (error) => error.code === "import_too_large");
  } finally {
    fs.rmSync(file, { force: true });
  }
});
const { parseRegistryWorkbook } = require("./registry-sheet");

// SheetJS แปลงข้อความที่หน้าตาเป็นวันที่ใน CSV แบบ เดือน/วัน ของสหรัฐ และอ่าน CSV ที่ไม่มี BOM
// เป็น latin1 — สองอย่างนี้ทำให้วันติดตั้งผิดและหัวคอลัมน์ไทยหายโดยไม่มีอะไรเตือน
for (const [label, bom] of [["ไม่มี BOM", ""], ["มี BOM", "﻿"]]) {
  test(`CSV ทะเบียน (${label}): วันที่ 1/10/2567 คือ 1 ต.ค. ไม่ใช่ 10 ม.ค. และหัวคอลัมน์ไทยอ่านได้`, () => {
    const file = path.join(os.tmpdir(), `suth-registry-${process.pid}-${Date.now()}-${bom ? "bom" : "plain"}`);
    fs.writeFileSync(file, `${bom}Model,Serial No.,Date,สถานะ\nOKI ES5112,TESTSN1,1/10/2567,completed\n`);
    try {
      const [row] = parseRegistryWorkbook(readAllSheets(file, "registry.csv")).rows;
      assert.equal(row.installation, "installed");
      assert.equal(row.installed_on, "2024-10-01");
      assert.equal(row.installed_on_known, true);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
}
