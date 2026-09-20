import { describe, expect, test } from "vitest";
import { dashboardScopeFromQuery, dashboardScopeToQuery, filterDashboardRows } from "./dashboard-scope";

const rows = [
  { device_id: 1, division_id: 10, department_id: 101, building_id: 1001, billing_contract_id: 501, contract_id: 999 },
  { device_id: 2, division_id: 20, department_id: 201, building_id: 1002, billing_contract_id: 502, contract_id: 501 },
  { device_id: 3, division_id: 10, department_id: 102, building_id: 1002, billing_contract_id: null, contract_id: 502 },
];

describe("ขอบเขตกลางของ Dashboard", () => {
  test("เลือกหลายแผนกข้ามฝ่ายและกรองมิติอื่นร่วมกันได้", () => {
    expect(filterDashboardRows(rows, {
      divisions: ["10", "20"],
      departments: ["101", "201"],
      buildings: ["1002"],
      contracts: [],
      devices: [],
    }).map((row) => row.device_id)).toEqual([2]);
  });

  test("สัญญาย้อนหลังใช้ billing_contract_id ไม่ใช้สัญญาปัจจุบันของเครื่อง", () => {
    expect(filterDashboardRows(rows, {
      divisions: [], departments: [], buildings: [], devices: [], contracts: ["501"],
    }).map((row) => row.device_id)).toEqual([1]);
  });

  test("ค่าที่ไม่ได้ระบุเลือกด้วย unassigned ได้", () => {
    expect(filterDashboardRows(rows, {
      divisions: [], departments: [], buildings: [], devices: [], contracts: ["unassigned"],
    }).map((row) => row.device_id)).toEqual([3]);
  });

  test("สถานะใน URL ตัดค่าผิดรูปแบบและเขียนกลับแบบไม่ซ้ำ", () => {
    const scope = dashboardScopeFromQuery({ filterDepartments: "101,constructor,101,unassigned" });
    expect(scope.departments).toEqual(["101", "unassigned"]);
    expect(dashboardScopeToQuery(scope).filterDepartments).toBe("101,unassigned");
  });
});
