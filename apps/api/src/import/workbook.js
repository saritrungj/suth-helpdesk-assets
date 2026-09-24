// apps/api/src/import/workbook.js
//
// อ่านไฟล์ที่อัปโหลดเป็นแผ่นงาน และกันไฟล์ใหญ่ผิดปกติ — ใช้ทั้งการนำเข้าทะเบียน ยอดมิเตอร์ และ import session
// ย้ายมาจาก import/controller.js โดยไม่เปลี่ยนพฤติกรรม (#178)

const fs = require("fs");
const XLSX = require("xlsx");
const { badRequest } = require("../shared/http-error");
const { assertZipWithinLimits } = require("./zip-limit");

/** เพดานไฟล์ยอดพิมพ์ต่อการนำเข้าหนึ่งครั้ง — ไฟล์รายงวดจริงมีไม่กี่สิบแผ่น แผ่นละไม่กี่ร้อยแถว */
const MAX_IMPORT_SHEETS = 60;
const MAX_IMPORT_ROWS = 50000;
const MAX_IMPORT_COLUMNS = 200;
// แถว × คอลัมน์ที่ประกาศรวมทุกแผ่น — แถวกับคอลัมน์ที่ผ่านเพดานของตัวเองทั้งคู่ยังคูณกันได้หลายล้าน
// เซลล์ (SheetJS กางทุกเซลล์ในช่วงที่ประกาศ) ไฟล์จริงมีไม่กี่หมื่นเซลล์ (#142)
const MAX_IMPORT_CELLS = 1_000_000;

/**
 * ลบไฟล์ที่อัปโหลดเข้ามาชั่วคราว — ต้องเรียกใน finally เสมอ
 *
 * เดิมการลบถูกเขียนซ้ำสามที่ (ทางสำเร็จหนึ่ง ทาง catch อีกสอง) ซึ่งแปลว่าเส้นทาง
 * ที่ไม่ได้ผ่านสามจุดนั้นจะทิ้งไฟล์ค้างไว้ใน uploads/ ตลอดไป
 *
 * การลบเองก็พังได้ (ไฟล์ถูกลบไปแล้ว สิทธิ์ไม่พอ) — ห้ามให้ error ตอนเก็บกวาด
 * ไปทับ error ตัวจริงที่กำลังจะถูกโยนออกไป
 */
function removeUploadedFile(file) {
  if (!file || !file.path) return;

  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch (err) {
    console.error("IMPORT TEMP FILE CLEANUP ERROR:", err);
  }
}

/**
 * อ่านไฟล์ที่อัปโหลดมาเป็นแผ่นงานแรก — ไฟล์ที่ SheetJS แกะไม่ออกต้องเป็น 400 ไม่ใช่ 500
 *
 * ด่านนามสกุล/MIME ที่ routes.js กันไว้เชื่อได้แค่ชื่อไฟล์กับหัวที่ client ส่งมา ซึ่ง
 * ทั้งสองอย่างผู้ส่งตั้งเองได้ ไฟล์ HTML ที่ถูกเปลี่ยนนามสกุลเป็น .xlsx (ซึ่งเกิดจริง
 * เวลาคน "Save as" จากระบบอื่น) จึงผ่านด่านนั้นมาแล้วไประเบิดตอน XLSX.readFile
 * ผู้ใช้เห็น "เกิดข้อผิดพลาดในระบบ" ซึ่งบอกไม่ได้ว่าต้องไปแก้อะไร
 */
function readWorkbook(filePath, options) {
  try {
    // CSV อ่านเป็นข้อความ UTF-8 เอง — SheetJS อ่าน CSV ที่ไม่มี BOM เป็น latin1 แล้วหัวคอลัมน์ไทย
    // อย่าง "สถานะ" กลายเป็นตัวอ่านไม่ออก ตัด BOM ออกถ้ามี
    if (options?.csv) {
      const text = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "");
      return XLSX.read(text, { type: "string", raw: true });
    }
    // คลายไม่เกินเพดานก่อนให้ SheetJS คลายทั้งก้อนเข้าหน่วยความจำ (#207, zip-limit.js)
    const buffer = fs.readFileSync(filePath);
    assertZipWithinLimits(buffer);
    return XLSX.read(buffer, { ...options, type: "buffer" });
  } catch (err) {
    if (err?.status === 400) throw err;
    throw badRequest("ไฟล์นี้เปิดเป็นตารางไม่ได้", {
      code: "unreadable_file",
      detail: "ไฟล์อาจเสียหาย หรือเป็นไฟล์ชนิดอื่นที่ถูกเปลี่ยนนามสกุลมาเป็น .xlsx/.csv — ลองเปิดด้วย Excel แล้วบันทึกใหม่",
    });
  }
}

/**
 * ปฏิเสธไฟล์ที่ประกาศขนาดใหญ่ผิดปกติ ก่อนกางแผ่นใดเป็นแถว — ใช้กับการนำเข้าทั้งสองแบบ
 *
 * SheetJS กางทุกเซลล์ในช่วงที่แผ่นประกาศ (`!ref`) ไม่ใช่เฉพาะเซลล์ที่มีค่า และการกางเป็นงาน
 * sync ที่บล็อกทั้ง API ไฟล์ .xlsx 16 KB ที่ประกาศ A1:XFD1500 ทำให้ health check รอ 17 วินาที
 * (#142) ด่านนี้เคยมีเฉพาะนำเข้าทะเบียน ส่วนนำเข้ายอดมิเตอร์ตรวจแค่แผ่นกับแถว
 */
function assertWithinImportLimits(workbook) {
  let rows = 0;
  let widest = 0;
  let cells = 0;
  for (const name of workbook.SheetNames) {
    const ref = workbook.Sheets[name]?.["!ref"];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    const sheetRows = range.e.r + 1;
    const sheetColumns = range.e.c + 1;
    rows += sheetRows;
    widest = Math.max(widest, sheetColumns);
    cells += sheetRows * sheetColumns;
  }
  if (
    workbook.SheetNames.length > MAX_IMPORT_SHEETS ||
    rows > MAX_IMPORT_ROWS ||
    widest > MAX_IMPORT_COLUMNS ||
    cells > MAX_IMPORT_CELLS
  ) {
    throw badRequest("ไฟล์ใหญ่เกินกว่าที่นำเข้าได้ในครั้งเดียว", {
      code: "import_too_large",
      detail:
        `รับได้ไม่เกิน ${MAX_IMPORT_SHEETS} แผ่น ${MAX_IMPORT_ROWS.toLocaleString("th-TH")} แถวรวม ` +
        `${MAX_IMPORT_COLUMNS} คอลัมน์ต่อแผ่น และ ${MAX_IMPORT_CELLS.toLocaleString("th-TH")} เซลล์รวม — ` +
        "ถ้าไฟล์มีข้อมูลไม่มาก ให้ลบแถว/คอลัมน์ว่างที่จัดรูปแบบไว้ แล้วบันทึกใหม่ หรือแยกไฟล์",
    });
  }
}

/**
 * แผ่นทั้งหมดของไฟล์ ทั้งค่าที่จัดรูปแล้ว (ทะเบียน) และค่าดิบ (รายงานมิเตอร์) — กันไฟล์ใหญ่ผิดปกติก่อน
 *
 * CSV อ่านเป็นข้อความตรงๆ (raw) — ไม่งั้น SheetJS แปลง "1/10/2567" เป็นวันที่แบบ เดือน/วัน
 * ของสหรัฐ ได้ 10 ม.ค. แทน 1 ต.ค. โดยไม่มีอะไรเตือน วันที่จึงผ่าน parseDayFirstDate แทน
 */
function readAllSheets(filePath, originalName = "") {
  const isCsv = /\.csv$/i.test(originalName);
  const workbook = readWorkbook(filePath, isCsv ? { csv: true } : undefined);
  assertWithinImportLimits(workbook);
  return workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: false }),
    rawRows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: true }),
  }));
}

/**
 * แผ่นทั้งหมดเป็นค่าดิบอย่างเดียว — ตัวนำเข้ายอดมิเตอร์ (ตัวเลขต้องเป็นตัวเลข ไม่ใช่ " 42,127 ")
 *
 * ไฟล์ 5MB ที่บีบอัดได้ดีกางออกเป็นแถวได้มหาศาล — ตรวจจากขอบเขตของแผ่นก่อนแปลง
 * ทุกแถวเป็น object และก่อนยิงคำสั่งเขียนก้อนเดียว (ไฟล์จริงมีไม่กี่แผ่น แผ่นละไม่กี่ร้อยแถว)
 */
function readRawSheets(filePath) {
  const workbook = readWorkbook(filePath);
  assertWithinImportLimits(workbook);
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: true }),
  }));
  if (!sheets.length) {
    throw badRequest("ไม่พบแผ่นงานในไฟล์", { code: "no_sheet", detail: "ไฟล์นี้ไม่มีแผ่นงานที่อ่านข้อมูลได้" });
  }
  return sheets;
}

module.exports = {
  MAX_IMPORT_SHEETS,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_CELLS,
  removeUploadedFile,
  readWorkbook,
  assertWithinImportLimits,
  readAllSheets,
  readRawSheets,
};
