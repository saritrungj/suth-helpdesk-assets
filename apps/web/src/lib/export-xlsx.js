/**
 * export-xlsx.js — เขียนไฟล์ Excel โดย **โหลดไลบรารีตอนกดปุ่มเท่านั้น**
 *
 * ## ปัญหาที่ตัวนี้แก้
 *
 * เดิมสามไฟล์ `import * as XLSX from "xlsx"` ไว้ที่หัวไฟล์ ทำให้ก้อน xlsx
 * (~440 kB ก่อนบีบอัด) ถูกรวมเข้ากับ chunk ที่โหลดตั้งแต่เปิดเว็บ ทั้งที่ผู้ใช้
 * ส่วนใหญ่ในแต่ละครั้งที่เปิดไม่ได้กดส่งออกเลย
 *
 * `await import()` ทำให้ Vite แยกก้อนนี้ออกไปเป็น chunk ของตัวเอง แล้วดึงมา
 * ตอนกดปุ่มครั้งแรก — ครั้งต่อไปเบราว์เซอร์มีอยู่แล้วไม่ต้องโหลดซ้ำ
 *
 * **ไม่ได้ลดความสามารถของผู้ใช้แม้แต่นิดเดียว** การส่งออกเป็นงานหลักของหน้าค่าใช้จ่าย
 *
 * ## ทำไมต้องรวมมาไว้ที่เดียว
 *
 * นอกจากลดโค้ดซ้ำสามที่แล้ว ยังกันไม่ให้ใครเผลอ `import "xlsx"` ที่หัวไฟล์อีก
 * ซึ่งจะดึงก้อนใหญ่กลับเข้า chunk เริ่มต้นโดยไม่มีใครสังเกต
 */

/**
 * สร้างและดาวน์โหลดไฟล์ .xlsx หนึ่งแผ่นงาน
 *
 * @param {object} spec
 * @param {string[]} spec.header แถวหัวตาราง
 * @param {(string|number)[][]} spec.rows แถวข้อมูล
 * @param {string} spec.sheetName ชื่อแผ่นงานในไฟล์
 * @param {string} spec.filename ชื่อไฟล์ **ไม่ต้องใส่ .xlsx**
 * @param {number[]} [spec.columnWidths] ความกว้างคอลัมน์ (หน่วยตัวอักษร)
 *   ไม่ระบุ = คำนวณจากความยาวข้อความจริง ไม่งั้นเปิดไฟล์มาเจอ ##### ทุกช่อง
 */
export async function exportSheet({ header, rows, sheetName, filename, columnWidths }) {
  const XLSX = await import("xlsx");

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  worksheet["!cols"] = (columnWidths ?? autoWidths(header, rows)).map((wch) => ({ wch }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/** ความกว้างที่พอดีกับข้อความที่ยาวที่สุดของแต่ละคอลัมน์ จำกัดไม่ให้แคบหรือกว้างเกินไป */
function autoWidths(header, rows) {
  return header.map((label, i) => {
    const longest = rows.reduce(
      (max, row) => Math.max(max, String(row[i] ?? "").length),
      String(label ?? "").length
    );
    return Math.min(Math.max(longest + 2, 8), 48);
  });
}
