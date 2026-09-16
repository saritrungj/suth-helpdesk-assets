import { expect, test } from "vitest";
import { dueMonthCount, requiredDeviceCount } from "./entry-coverage";

/*
 * เทสชุดนี้คุ้มกัน #89 — หน้าบันทึกยอดเคยขึ้นว่า "กรอกครบแล้ว 0 จาก 46 เครื่อง"
 * ตลอดทั้งปีงบ เพราะเทียบกับ 12 เดือนตายตัว ซึ่งไม่มีทางครบจนกว่าปีจะจบ
 */

const MONTHS_OF_FY = [
  ...Array.from({ length: 11 }, (_, i) => ({ month: `m${i}`, status: "complete", total: 45 })),
  { month: "m11", status: "not_due", total: 45 },
];

test("เดือนที่ยังไม่ถึงกำหนดไม่ถูกนับเป็นงานค้าง", () => {
  expect(dueMonthCount(MONTHS_OF_FY, 12)).toBe(11);
});

test("ปีงบที่จบแล้วนับครบทุกเดือน", () => {
  const closed = MONTHS_OF_FY.map((m) => ({ ...m, status: "complete" }));
  expect(dueMonthCount(closed, 12)).toBe(12);
});

test("เดือนที่ยังกรอกไม่ครบยังนับว่าถึงกำหนดแล้ว — ไม่ครบกับยังไม่ถึงกำหนดคนละเรื่อง", () => {
  const months = [{ status: "complete" }, { status: "incomplete" }, { status: "not_due" }];
  expect(dueMonthCount(months, 12)).toBe(2);
});

test("ยังโหลด coverage ไม่ได้ ใช้ค่าสำรองแทนการเดาเป็นศูนย์", () => {
  // ศูนย์จะทำให้ทุกเครื่องกลายเป็น "ครบ" ทันที ซึ่งอันตรายกว่าการรอข้อมูล
  expect(dueMonthCount(undefined, 12)).toBe(12);
  expect(dueMonthCount([], 12)).toBe(12);
  expect(dueMonthCount(null, 12)).toBe(12);
});

test("ทุกเดือนยังไม่ถึงกำหนด (เพิ่งขึ้นปีงบใหม่) ใช้ค่าสำรอง ไม่ใช่ศูนย์", () => {
  expect(dueMonthCount([{ status: "not_due" }, { status: "not_due" }], 12)).toBe(12);
});

test("จำนวนเครื่องที่ต้องบันทึกยอดมาจาก API ไม่ใช่จำนวนแถวในตาราง", () => {
  expect(requiredDeviceCount(MONTHS_OF_FY, 46)).toBe(45);
});

test("เครื่องเข้าใหม่กลางปี ใช้จำนวนสูงสุดของปี เพราะหัวหน้าพูดถึงทั้งปีงบ", () => {
  const months = [{ total: 40 }, { total: 45 }, { total: 45 }];
  expect(requiredDeviceCount(months, 46)).toBe(45);
});

test("coverage ที่ไม่มีตัวเลขใช้ได้ ตกกลับไปที่จำนวนแถวในตาราง", () => {
  expect(requiredDeviceCount([{ total: 0 }, { total: null }], 46)).toBe(46);
  expect(requiredDeviceCount(undefined, 46)).toBe(46);
});

test("ตัวเลขที่มาเป็นสตริงจาก JSON ยังอ่านได้", () => {
  expect(requiredDeviceCount([{ total: "45" }], 46)).toBe(45);
});
