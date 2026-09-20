import { describe, expect, test } from "vitest";
import { dashboardCsv } from "./dashboard-csv";

describe("CSV รายละเอียดของ Dashboard", () => {
  test("ใช้สัญญาที่คิดเงินจริงและแยกสถานะราคาที่ไม่ครบ", () => {
    const csv = dashboardCsv([{
      month: "2025-10", serial_number: "SN-1", division_name: "ฝ่าย A", department_name: "แผนก A1",
      billing_contract_no: "CT-HISTORY", contract_no: "CT-CURRENT", building_name: "อาคาร 1", floor_name: "2",
      pages_printed: 100, net_pages: 98, total_cost: null,
    }]);
    expect(csv).toContain('"CT-HISTORY"');
    expect(csv).not.toContain("CT-CURRENT");
    expect(csv).toContain('"ยังยืนยันราคาไม่ได้"');
  });
});

