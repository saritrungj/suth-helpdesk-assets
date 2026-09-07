import { askConfirm } from "../store/confirmDialog";

/**
 * draft-guard.js — ถามก่อนทำสิ่งที่จะทำให้ของที่กรอกค้างไว้หาย
 *
 * ## ปัญหาที่ตัวนี้แก้
 *
 * หน้ากรอกข้อมูลเก็บค่าที่ยังไม่ได้บันทึกไว้ใน component ของตาราง พอตารางถูกถอด
 * ออกจากหน้าจอ ค่าเหล่านั้นหายทันทีโดยไม่มีอะไรเตือน และมีหลายเส้นทางที่ทำให้ตาราง
 * ถูกถอด — เปลี่ยนเดือน ออกจากโหมดกรอก เปลี่ยนปีงบ ล้างตัวกรอง — ซึ่งเดิมต่างคน
 * ต่างเขียนคำถามเอง แล้วสองเส้นทางหลังลืมถาม
 *
 * ## ทำไมข้อความต้องมาจากผู้เรียก
 *
 * ไฟล์นี้อยู่ใน `lib/` ซึ่ง AGENTS.md กำหนดว่าเป็น "ฟังก์ชันช่วยทั่วไปที่ไม่ผูกกับ
 * component ไหน" การฝังคำว่า "ยอดพิมพ์" ไว้ที่นี่จะทำให้มันผูกกับหน้าเดียวทันที
 * ผู้เรียกจึงส่ง `describe` มาบอกวิธีประกอบข้อความเอง
 *
 * ## ทำไมต้องรับ confirm เข้ามาแทนที่จะเรียก askConfirm ตรงๆ
 *
 * เพื่อให้เทสส่งของปลอมเข้ามาตอบแทนคนได้ โดยไม่ต้อง mount กล่อง dialog จริง —
 * ค่าเริ่มต้นคือ askConfirm ตัวจริง ผู้เรียกในแอปจึงไม่ต้องส่งอะไรเพิ่ม
 */

/**
 * @param {object} deps
 * @param {() => number} deps.dirtyCount จำนวนรายการที่แก้ค้างอยู่ตอนนี้
 * @param {() => void} deps.discard ล้างของที่แก้ค้างทิ้ง เรียกเมื่อผู้ใช้ยืนยันแล้วเท่านั้น
 * @param {(count: number, consequence: string) => string} deps.describe ประกอบข้อความที่จะถาม
 * @param {string} [deps.title] หัวข้อกล่องถาม
 * @param {(message: string, options: object) => Promise<boolean>} [deps.confirm]
 * @returns {(consequence: string, options?: object) => Promise<boolean>}
 *   true = ทำต่อได้ (ไม่มีของค้าง หรือผู้ใช้ยืนยันแล้วและ draft ถูกล้างไปแล้ว)
 */
export function createDraftGuard({
  dirtyCount,
  discard,
  describe,
  title = "ยังมีข้อมูลที่ยังไม่ได้บันทึก",
  confirm = askConfirm,
}) {
  // กันเปิดกล่องถามซ้อนกัน — เช่นเปลี่ยนปีงบระหว่างที่กล่องของการเปลี่ยนเดือนยังค้างอยู่
  // ถ้าปล่อยให้ถามซ้อน askConfirm จะ resolve(false) กล่องใบแรกทิ้งโดยที่ผู้ใช้ไม่เคย
  // เห็นคำตอบตัวเอง — ใบที่มาทีหลังจึงถูกปฏิเสธไป ผู้ใช้กดใหม่ได้หลังตอบใบแรกเสร็จ
  let asking = false;

  return async function confirmDiscard(consequence, options = {}) {
    const count = dirtyCount();
    if (count === 0) return true;
    if (asking) return false;

    asking = true;
    let ok;
    try {
      ok = await confirm(describe(count, consequence), {
        title,
        confirmText: options.confirmText ?? "ทำต่อโดยไม่บันทึก",
        danger: true,
      });
    } finally {
      asking = false;
    }

    if (!ok) return false;

    discard();
    return true;
  };
}
