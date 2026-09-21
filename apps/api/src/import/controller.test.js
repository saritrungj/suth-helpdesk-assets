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
