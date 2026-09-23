// apps/api/src/import/workbook.test.js
//
// ไฟล์ที่มีแผ่นหรือแถวเกินเพดานต้องถูกปฏิเสธตอนอ่านไฟล์ ก่อนแตะฐานข้อมูล — ไฟล์ 5MB ที่บีบอัดได้ดี
// กางออกเป็นแถวได้มหาศาล ย้ายมาจาก controller.test.js เมื่อถอดเส้นทางนำเข้าเดิมออก (#192):
// ด่านนี้อยู่ที่ workbook.js ซึ่งงานนำเข้า (session-service.js) เรียกทุกครั้งที่ตรวจไฟล์

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const XLSX = require("xlsx");

const { readAllSheets, readRawSheets } = require("./workbook");
const { parseRegistryWorkbook } = require("./registry-sheet");

function withFile(workbook, check) {
  const file = path.join(os.tmpdir(), `suth-workbook-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  XLSX.writeFile(workbook, file);
  try {
    return check(file);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

const tooLarge = (error) => error.status === 400 && error.code === "import_too_large";

test("ปฏิเสธไฟล์ที่มีแผ่นเกินเพดาน", () => {
  const workbook = XLSX.utils.book_new();
  for (let i = 1; i <= 61; i++) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["serial_number"]]), `S${i}`);
  withFile(workbook, (file) => assert.throws(() => readAllSheets(file, "big.xlsx"), tooLarge));
});

test("ปฏิเสธไฟล์ที่ประกาศแถวรวมเกินเพดาน", () => {
  const sheet = XLSX.utils.aoa_to_sheet([["serial_number", "month", "pages"]]);
  sheet["!ref"] = "A1:C50001";
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "ยอด");
  withFile(workbook, (file) => assert.throws(() => readAllSheets(file, "rows.xlsx"), tooLarge));
});

/** แผ่นเล็กที่ประกาศขอบเขต `ref` — ไฟล์จริงแบบนี้เกิดจากการจัดรูปแบบทั้งแถวหรือทั้งคอลัมน์ใน Excel */
function declared(ref) {
  const sheet = XLSX.utils.aoa_to_sheet([["SN.", "meter 9/67"], ["TEST-SN-1", 5]]);
  sheet["!ref"] = ref;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "ยอด");
  return workbook;
}

// ไฟล์ 16 KB ที่ประกาศ A1:XFD1500 เคยทำให้ health check รอ 17 วินาที (#142) — ต้องถูกปฏิเสธก่อนกางแผ่นเป็นแถว
// เทสใช้ 228 คอลัมน์ (เกินเพดาน 200) เพราะการ "เขียน" ไฟล์กว้างแบบนั้นด้วย SheetJS เองก็ช้า ไม่เกี่ยวกับ API
test("ปฏิเสธแผ่นที่ประกาศคอลัมน์เกินเพดาน ทั้งตอนอ่านแบบทะเบียนและแบบแถวดิบ", () => {
  withFile(declared("A1:HT3"), (file) => {
    assert.throws(() => readRawSheets(file), tooLarge);
    assert.throws(() => readAllSheets(file, "wide.xlsx"), tooLarge);
  });
});

// 200 คอลัมน์ × 6,000 แถว ผ่านเพดานแถวและคอลัมน์ทั้งคู่ แต่เป็น 1.2 ล้านเซลล์
test("ปฏิเสธไฟล์ที่เซลล์รวมเกินเพดานแม้แถวและคอลัมน์ไม่เกิน", () => {
  withFile(declared("A1:GR6000"), (file) => {
    assert.throws(() => readRawSheets(file), tooLarge);
    assert.throws(() => readAllSheets(file, "cells.xlsx"), tooLarge);
  });
});

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
