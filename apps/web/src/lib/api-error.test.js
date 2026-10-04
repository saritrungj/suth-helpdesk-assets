import { describe, test, expect } from "vitest";
import { errorItems, errorMessage } from "./api-error";

/** จำลอง error ของ axios ที่ API ตอบ Problem Details */
function apiError(data) {
  return { response: { status: 400, data } };
}

describe("errorItems — รายการที่ทำให้ทั้งชุดบันทึกไม่ได้", () => {
  test("คืนเครื่อง เดือน และเหตุผลของยอดที่ยังไม่มีราคา", () => {
    const error = apiError({
      code: "unpriced_reading",
      title: "บันทึกไม่ได้",
      errors: [{ serial_number: "SN-1", month: "2026-09", reason: "เครื่องยังไม่ได้ผูกสัญญาในเดือนนี้" }],
    });

    expect(errorItems(error)).toEqual([
      { serial_number: "SN-1", month: "2026-09", reason: "เครื่องยังไม่ได้ผูกสัญญาในเดือนนี้" },
    ]);
  });

  test("ไม่ปนกับข้อผิดพลาดรายช่องของฟอร์ม", () => {
    const error = apiError({ code: "validation_error", errors: [{ field: "name", message: "กรอกชื่อ" }] });
    expect(errorItems(error)).toEqual([]);
  });

  test("ไม่มีคำตอบจากเซิร์ฟเวอร์ = ไม่มีรายการ", () => {
    expect(errorItems({ code: "ERR_NETWORK" })).toEqual([]);
    expect(errorItems(undefined)).toEqual([]);
  });
});

// API เขียนขั้นต่อไปไว้ใน detail แต่เดิมหน้าเว็บแสดงแค่ title ผู้ใช้จึงรู้ว่าทำไม่ได้ แต่ไม่รู้ว่าต้องทำอะไรต่อ (#238)
describe("errorMessage — รวมคำแนะนำจาก detail", () => {
  const problem = (data, status = 409) => ({ response: { status, data } });

  test("ต่อ detail ท้าย title", () => {
    const error = problem({ code: "still_referenced", title: "ลบไม่ได้เพราะยังมีข้อมูลอื่นอ้างถึงอยู่", detail: "ย้ายหรือลบข้อมูลที่อ้างถึงรายการนี้ออกก่อน แล้วจึงลบใหม่" });
    expect(errorMessage(error)).toBe("ลบไม่ได้เพราะยังมีข้อมูลอื่นอ้างถึงอยู่ — ย้ายหรือลบข้อมูลที่อ้างถึงรายการนี้ออกก่อน แล้วจึงลบใหม่");
  });

  test("title ที่มีขีดคั่นอยู่แล้วใช้จุดกลางคั่น detail", () => {
    const error = problem({ title: "บันทึกไม่ได้ — ยอดเปลี่ยนไปแล้ว", detail: "โหลดยอดล่าสุดแล้วตรวจก่อนบันทึกอีกครั้ง" });
    expect(errorMessage(error)).toBe("บันทึกไม่ได้ — ยอดเปลี่ยนไปแล้ว · โหลดยอดล่าสุดแล้วตรวจก่อนบันทึกอีกครั้ง");
  });

  test("ไม่มี detail หรือ detail ซ้ำกับ title = title อย่างเดียว", () => {
    expect(errorMessage(problem({ title: "ไม่พบเครื่อง" }, 404))).toBe("ไม่พบเครื่อง");
    expect(errorMessage(problem({ title: "ไม่พบเครื่อง", detail: "ไม่พบเครื่อง" }, 404))).toBe("ไม่พบเครื่อง");
  });

  test("ข้อผิดพลาดของระบบและการหมดสิทธิ์เข้าใช้ไม่แสดง detail — เป็นข้อความสำหรับผู้ดูแล ไม่ใช่ขั้นต่อไปของผู้ใช้", () => {
    expect(errorMessage(problem({ title: "ระบบขัดข้อง", detail: "แจ้งผู้ดูแลระบบให้รัน migration ที่ค้างอยู่" }, 500))).toBe("ระบบขัดข้อง");
    expect(errorMessage(problem({ title: "กรุณาเข้าสู่ระบบ", detail: "ไม่พบข้อมูลการเข้าสู่ระบบในคำขอนี้" }, 401))).toBe("กรุณาเข้าสู่ระบบ");
  });
});
