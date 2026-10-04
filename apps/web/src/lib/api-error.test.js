import { describe, test, expect } from "vitest";
import { errorItems } from "./api-error";

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
