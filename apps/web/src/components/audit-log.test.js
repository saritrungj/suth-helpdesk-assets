// ประวัติการแก้ไขต้องอ่านออกโดยไม่ต้องเปิดตารางอ้างอิงเทียบรหัส (#237)
//
// เดิมได้ "ฝ่าย (รหัส): 21 → 27", "สถานะ: active", "เริ่ม: 2035-01-01" — ผู้ตรวจย้อนหลังอ่านไม่ออกว่า
// เครื่องย้ายจากฝ่ายไหนไปฝ่ายไหน

import { describe, expect, test } from "vitest";
import { auditValueText } from "./audit-log";

const names = {
  division: { 21: "ฝ่ายการพยาบาล", 27: "ฝ่ายเภสัชกรรม" },
  department: {},
  meter_category: { 2: "A4 เลเซอร์ ขาวดำ" },
};

describe("auditValueText", () => {
  test("รหัสของรายการอ้างอิงแสดงเป็นชื่อ ทั้งค่าเดิมและค่าใหม่", () => {
    const text = auditValueText({ division_id: 21, department_id: 495 }, { division_id: 27, department_id: null }, names);
    expect(text).toBe("ฝ่าย: ฝ่ายการพยาบาล → ฝ่ายเภสัชกรรม\nแผนก: รหัส 495 (ไม่พบชื่อ) → ว่าง");
  });

  test("ไม่ส่งชื่อมา (API รุ่นเก่า) ยังอ่านได้เป็นรหัสที่บอกว่าเป็นรหัส", () => {
    expect(auditValueText({ building_id: 3 }, { building_id: 4 })).toBe("อาคาร: รหัส 3 (ไม่พบชื่อ) → รหัส 4 (ไม่พบชื่อ)");
  });

  test("สถานะ สถานะการติดตั้ง และบทบาทเป็นคำไทยชุดเดียวกับหน้าอื่น", () => {
    expect(auditValueText(null, { status: "active", installation_status: "installed", role: "viewer" }))
      .toBe("สถานะ: ใช้งานอยู่\nสถานะการติดตั้ง: ติดตั้งแล้ว\nสิทธิ์: ดูอย่างเดียว");
    expect(auditValueText({ status: "repair", installation_status: "not_installed", role: "admin" }, { status: "retired", installation_status: null, role: "staff" }))
      .toBe("สถานะ: ซ่อมบำรุง → ปลดระวาง\nสถานะการติดตั้ง: ยังไม่ได้ติดตั้ง → ว่าง\nสิทธิ์: ผู้ดูแลระบบ → เจ้าหน้าที่");
  });

  test("วันที่และเดือนแสดงแบบเดียวกับที่อื่นในระบบ ไม่ใช่ YYYY-MM-DD", () => {
    const text = auditValueText({ effective_from: "2035-01-01", start_month: "2025-10" }, null);
    expect(text).not.toContain("2035-01-01");
    expect(text).toContain("2578");
    expect(text).toContain("ต.ค.");
  });

  test("ราคาตามหมวดแสดงชื่อหมวดและราคา ไม่ใช่ 'รหัส:ราคา'", () => {
    expect(auditValueText(null, { price_lines: "2:0.4500, 9:1.2000" }, names))
      .toBe("ราคาต่อหน้า: A4 เลเซอร์ ขาวดำ 0.4500 บาท, หมวดรหัส 9 (ไม่พบชื่อ) 1.2000 บาท");
  });

  test("ค่าที่ไม่รู้จักแสดงตามเดิม ไม่ถูกแปลงผิด", () => {
    expect(auditValueText({ pages: 1200, status: "custom" }, { pages: 1500, status: "custom" }))
      .toBe("ยอดพิมพ์: 1,200 → 1,500\nสถานะ: custom → custom");
  });
});
