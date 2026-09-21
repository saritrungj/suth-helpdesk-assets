import { describe, expect, test } from "vitest";
import { dashboardCsv } from "./dashboard-csv";

const reading = (overrides) => ({
  month: "2025-10", serial_number: "SN-1", division_name: "ฝ่าย A", department_name: "แผนก A1",
  billing_contract_no: "CT-HISTORY", contract_no: "CT-CURRENT", building_name: "อาคาร 1", floor_name: "2",
  pages_printed: 100, net_pages: 98, total_cost: "49.00", ...overrides,
});
const cells = (csv, line) => csv.split("\r\n")[line].split(",").map((cell) => cell.replace(/^"|"$/g, ""));

describe("CSV รายละเอียดของหน้าภาพรวม", () => {
  test("ใช้สัญญาที่คิดเงินของเดือนนั้น ไม่ใช่สัญญาปัจจุบันของเครื่อง (ADR-0019)", () => {
    const csv = dashboardCsv([reading()]);
    expect(csv).toContain('"CT-HISTORY"');
    expect(csv).not.toContain("CT-CURRENT");
  });

  test("ไฟล์ไม่มีคอลัมน์สถานะราคา และคงเซลล์ว่างเมื่อข้อมูลผิดปกติ", () => {
    const row = cells(dashboardCsv([reading({ total_cost: null })]), 1);
    expect(row.at(-1)).toBe("");
    expect(cells(dashboardCsv([reading()]), 0).at(-1)).toBe("ค่าใช้จ่าย (บาท)");
    expect(cells(dashboardCsv([reading()]), 1).at(-1)).toBe("49.00");
  });

  test("มีปีงบประมาณกำกับทุกแถว — ไฟล์ที่เทียบหลายปีงบต้องแยกออกว่าแถวไหนเป็นปีไหน", () => {
    const csv = dashboardCsv([reading({ month: "2025-10" }), reading({ month: "2025-09" })]);
    expect(cells(csv, 0).slice(0, 2)).toEqual(["เดือน", "ปีงบประมาณ"]);
    // ก.ย. กับ ต.ค. ของปีปฏิทินเดียวกันอยู่คนละปีงบ (ADR-0001)
    expect(cells(csv, 1).slice(0, 2)).toEqual(["2025-10", "2569"]);
    expect(cells(csv, 2).slice(0, 2)).toEqual(["2025-09", "2568"]);
  });

  test("แถวของการเทียบข้ามปีงบใช้เดือนจริง ไม่ใช่ตำแหน่งเดือนบนแกน", () => {
    const csv = dashboardCsv([reading({ month: "P01", calendar_month: "2024-10" })]);
    expect(cells(csv, 1).slice(0, 2)).toEqual(["2024-10", "2568"]);
  });
});
