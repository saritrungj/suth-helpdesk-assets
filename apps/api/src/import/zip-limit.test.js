// apps/api/src/import/zip-limit.test.js — ไฟล์ .xlsx ที่คลายแล้วใหญ่ผิดปกติถูกปฏิเสธก่อนถึง SheetJS (#207)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const XLSX = require("xlsx");
const { assertZipWithinLimits } = require("./zip-limit");
const { readAllSheets } = require("./workbook");

function smallWorkbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["SN.", "Model"], ["X1", "M"]]), "S");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

/** zip หนึ่งส่วนแบบ deflate — declaredSize ใส่ตัวเลขหลอกที่หัว zip ได้ */
function zipOne(name, content, declaredSize = content.length) {
  const data = zlib.deflateRawSync(content, { level: 9 });
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(declaredSize, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(declaredSize, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = local.length + nameBuf.length + data.length;
  const cdSize = central.length + nameBuf.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
}

const code = (fn) => {
  try { fn(); return null; } catch (err) { return err.code ?? err.message; }
};

test("ไฟล์ .xlsx ปกติผ่าน และไฟล์ที่ไม่ใช่ zip ไม่ถูกตรวจ", () => {
  assert.equal(code(() => assertZipWithinLimits(smallWorkbook())), null);
  assert.equal(code(() => assertZipWithinLimits(Buffer.from("SN.,Model\nX1,M\n"))), null);
});

test("คลายแล้วเกินเพดาน → 400 file_too_large_uncompressed", () => {
  assert.equal(code(() => assertZipWithinLimits(smallWorkbook(), { total: 500 })), "file_too_large_uncompressed");
  const bomb = zipOne("xl/worksheets/sheet1.xml", Buffer.alloc(2 * 1024 * 1024, 0x20));
  assert.ok(bomb.length < 10 * 1024, "สองเมกะไบต์ของช่องว่างบีบเหลือไม่กี่ KB");
  assert.equal(code(() => assertZipWithinLimits(bomb, { entry: 1024 * 1024 })), "file_too_large_uncompressed");
});

test("หัว zip ประกาศขนาดเล็กหลอกไว้ก็ยังถูกจับ — วัดจากการคลายจริง", () => {
  const liar = zipOne("xl/worksheets/sheet1.xml", Buffer.alloc(2 * 1024 * 1024, 0x20), 10);
  assert.equal(code(() => assertZipWithinLimits(liar, { entry: 1024 * 1024 })), "file_too_large_uncompressed");
});

test("zip ที่โครงสร้างเสีย → 400 unreadable_file ไม่ใช่ 500", () => {
  const broken = smallWorkbook().subarray(0, 200);
  assert.equal(code(() => assertZipWithinLimits(broken)), "unreadable_file");
});

test("readAllSheets ปฏิเสธไฟล์ที่คลายเกินเพดานก่อนให้ SheetJS อ่าน", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-limit-"));
  const file = path.join(dir, "bomb.xlsx");
  // 90 MB ของช่องว่าง > เพดานรวม 80 MB — บีบเหลือราว 90 KB
  fs.writeFileSync(file, zipOne("xl/worksheets/sheet1.xml", Buffer.alloc(90 * 1024 * 1024, 0x20)));
  try {
    assert.throws(() => readAllSheets(file, "bomb.xlsx"), (err) => err.code === "file_too_large_uncompressed" && err.status === 400);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
