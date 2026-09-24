import { describe, expect, test } from "vitest";
import {
  DEFAULT_BY,
  PAGE_DIMENSIONS,
  comparePageQuery,
  emptyView,
  filterRows,
  pruneUnavailableScopes,
  requestedMonths,
  selectedKeysFor,
  viewFromQuery,
  viewToQuery,
} from "./dashboard-view";

const row = (overrides) => ({
  device_id: 1, month: "2025-10", pages_printed: 100, net_pages: 98, total_cost: "49.00",
  division_id: 1, department_id: 11, billing_contract_id: 7, contract_id: 99, building_id: 1, ...overrides,
});

describe("ตัวกรองชุดเดียวของหน้าภาพรวม", () => {
  const rows = [
    row({ device_id: 1, division_id: 1, department_id: 11, building_id: 1 }),
    row({ device_id: 2, division_id: 1, department_id: 12, building_id: 2 }),
    row({ device_id: 3, division_id: 2, department_id: 21, building_id: 1 }),
    row({ device_id: 4, division_id: null, department_id: null, billing_contract_id: null, building_id: 2 }),
  ];

  test("ในมิติเดียวเลือกได้หลายค่า และมิติต่างกันต้องเป็นจริงพร้อมกัน", () => {
    expect(filterRows(rows, { divisions: ["1", "2"] }).map((item) => item.device_id)).toEqual([1, 2, 3]);
    expect(filterRows(rows, { divisions: ["1"], buildings: ["2"] }).map((item) => item.device_id)).toEqual([2]);
    expect(filterRows(rows, {})).toEqual(rows);
  });

  test("เปลี่ยนปีงบแล้วตัดเฉพาะตัวกรองที่ไม่มีแถวในปีใหม่", () => {
    const view = { ...emptyView(), divisions: ["1", "2"], departments: ["12"], devices: ["9"] };
    const result = pruneUnavailableScopes(view, [row({ division_id: 1, department_id: 11, device_id: 9 })]);
    expect(result.view.divisions).toEqual(["1"]);
    expect(result.view.departments).toEqual([]);
    expect(result.view.devices).toEqual(["9"]);
    expect(result.removed).toEqual([
      { key: "divisions", values: ["2"] },
      { key: "departments", values: ["12"] },
    ]);
    expect(view.divisions).toEqual(["1", "2"]);
  });

  test("เลือกแผนกข้ามฝ่ายได้โดยไม่ต้องเลือกฝ่ายก่อน — สองตัวกรองไม่ผูกกัน", () => {
    expect(filterRows(rows, { departments: ["12", "21"] }).map((item) => item.device_id)).toEqual([2, 3]);
  });

  test("ตัวกรองสัญญาใช้สัญญาที่คิดเงินของเดือนนั้น ไม่ใช่สัญญาปัจจุบันของเครื่อง (ADR-0019)", () => {
    expect(filterRows(rows, { contracts: ["7"] })).toHaveLength(3);
    // contract_id = 99 ของทุกแถว ต้องไม่ทำให้แถวไหนผ่านตัวกรองสัญญา 99
    expect(filterRows(rows, { contracts: ["99"] })).toHaveLength(0);
  });

  test("แถวที่ไม่มีสังกัดเลือกดูได้ด้วยรหัส unassigned ไม่หายไปจากรายงาน", () => {
    expect(filterRows(rows, { divisions: ["unassigned"] }).map((item) => item.device_id)).toEqual([4]);
    expect(filterRows(rows, { contracts: ["unassigned"] }).map((item) => item.device_id)).toEqual([4]);
  });

  test("รหัสที่เลือกไว้ของมิติที่กำลังเทียบ ใช้คงกลุ่มที่ยังไม่มียอดไว้ในตาราง", () => {
    const view = { ...emptyView(), divisions: ["1", "4"], contracts: ["7"] };
    expect(selectedKeysFor(view, "division")).toEqual(["1", "4"]);
    expect(selectedKeysFor(view, "contract")).toEqual(["7"]);
    // ภาพรวมและปีงบไม่มีตัวกรองคู่ของตัวเอง
    expect(selectedKeysFor(view, "overall")).toEqual([]);
    expect(selectedKeysFor(view, "fiscalYear")).toEqual([]);
  });
});

describe("สถานะใน URL", () => {
  test("ค่าที่ไม่รู้จัก รวมถึง property ที่สืบทอดมา ตกไปที่ค่าเริ่มต้น", () => {
    expect(viewFromQuery({ by: "constructor", measure: "toString", division: "__proto__", months: "2025-1" }))
      .toEqual(emptyView());
    expect(viewFromQuery({ by: "valueOf" }).by).toBe("overall");
  });

  test("ชื่อมิติที่เป็น property บน prototype ไม่ถูกจับคู่กับตัวกรองใด และไม่ทำให้หน้าพัง", () => {
    // `?scope=constructor` เคยได้ Object.prototype.constructor กลับมาเป็น "ชื่อตัวกรอง"
    // แล้วโค้ดที่อ่านต่อก็พังทั้งหน้า — ต้องไม่ตรงกับอะไรเลย
    for (const name of ["constructor", "toString", "__proto__", "valueOf", "hasOwnProperty"]) {
      expect(viewFromQuery({ scope: name, scopeItem: "5" })).toEqual(emptyView());
      expect(selectedKeysFor(emptyView(), name)).toEqual([]);
    }
  });

  test("อ่านและเขียนกลับได้ค่าเดิม โดยค่าเริ่มต้นไม่ถูกเขียนลงลิงก์", () => {
    const view = viewFromQuery({ by: "department", department: "11,12,unassigned,<x>", measure: "pages", months: "2025-11,2025-10" });
    expect(view).toMatchObject({ by: "department", departments: ["11", "12", "unassigned"], metric: "rawPages", months: ["2025-10", "2025-11"] });
    expect(viewToQuery(view)).toMatchObject({ by: "department", department: "11,12,unassigned", measure: "pages", months: "2025-10,2025-11" });
    expect(viewToQuery(emptyView())).toEqual({
      years: undefined, months: undefined, division: undefined, department: undefined,
      contract: undefined, building: undefined, device: undefined, by: undefined, measure: undefined,
    });
  });

  test("ค่าซ้ำในลิงก์ถูกตัดทิ้ง เพื่อให้จำนวนใน URL ตรงกับจำนวนที่หน้าใช้จริง", () => {
    expect(viewFromQuery({ division: "1,1,2" }).divisions).toEqual(["1", "2"]);
    expect(viewFromQuery({ months: "2025-10,2025-10" }).months).toEqual(["2025-10"]);
  });

  test("เลือกปีงบได้ไม่เกินสามปี และเก็บสามปีหลังสุด", () => {
    expect(viewFromQuery({ years: "2566,2567,2568,2569,abc" }).years).toEqual(["2567", "2568", "2569"]);
  });

  test("ลิงก์เก่าของหน้าเปรียบเทียบ: รายการที่เคยหยิบมาเทียบกลายเป็นตัวกรองของมิตินั้น", () => {
    expect(viewFromQuery({ by: "division", items: "1,2" })).toMatchObject({ by: "division", divisions: ["1", "2"] });
    expect(viewFromQuery({ by: "contract", items: "7,unassigned" }).contracts).toEqual(["7", "unassigned"]);
    // ขอบเขตของการเทียบข้ามปีงบเดิม คือตัวกรองของมิตินั้นในหน้าใหม่
    expect(viewFromQuery({ by: "fiscalYear", scope: "division", scopeItem: "2" }).divisions).toEqual(["2"]);
    // ?contract= ของหน้าภาพรวมเดิมเป็นตัวกรองสัญญาอยู่แล้ว ชื่อจึงตรงกันพอดี
    expect(viewFromQuery({ contract: "5" }).contracts).toEqual(["5"]);
  });

  test("ค่าที่ระบุเองในลิงก์ชนะค่าที่แปลงมาจากลิงก์เก่า", () => {
    expect(viewFromQuery({ by: "division", items: "1,2", division: "3" }).divisions).toEqual(["3"]);
  });
});

describe("เดือนที่ต้องขอจาก API", () => {
  test("ปีงบเดียว: ไม่เจาะจงเดือน = ทั้งปีงบ ต.ค.–ก.ย. (ADR-0001)", () => {
    const months = requestedMonths({ months: [] }, ["2569"]);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-10");
    expect(months.at(-1)).toBe("2026-09");
  });

  test("ปีงบเดียว: เจาะจงเดือนแล้วได้เฉพาะเดือนนั้น", () => {
    expect(requestedMonths({ months: ["2025-10", "2025-12"] }, ["2569"])).toEqual(["2025-10", "2025-12"]);
  });

  test("หลายปีงบ: ได้เดือนตำแหน่งเดียวกันของทุกปี ไม่ใช่ช่วงติดกัน", () => {
    // ต.ค.–พ.ย. ของปีงบ 2569 → ต.ค.–พ.ย. ของทั้ง 2568 และ 2569
    expect(requestedMonths({ months: ["2025-10", "2025-11"] }, ["2568", "2569"]))
      .toEqual(["2024-10", "2024-11", "2025-10", "2025-11"]);
  });

  test("หลายปีงบ: ไม่เจาะจงเดือน = ทั้ง 12 เดือนของทุกปีที่เลือก", () => {
    const months = requestedMonths({ months: [] }, ["2568", "2569"]);
    expect(months).toHaveLength(24);
    expect(months[0]).toBe("2024-10");
    expect(months.at(-1)).toBe("2026-09");
  });

  test("เดือนฝั่ง ม.ค.–ก.ย. จับคู่ข้ามรอยต่อปีปฏิทินได้ถูกปีงบ", () => {
    // ม.ค. 2569 (ปีปฏิทิน 2026) คู่กับ ม.ค. ของปีงบ 2568 ซึ่งคือปีปฏิทิน 2025
    expect(requestedMonths({ months: ["2026-01"] }, ["2568", "2569"])).toEqual(["2025-01", "2026-01"]);
  });

  test("ยังไม่รู้ปีงบ = ยังไม่ต้องขอเดือนไหน", () => {
    expect(requestedMonths({ months: [] }, [])).toEqual([]);
  });
});

describe("หน้าภาพรวม ↔ หน้าเปรียบเทียบ (#206)", () => {
  test("ลิงก์ที่เป็นการเปรียบเทียบย้ายไปหน้าเปรียบเทียบพร้อมค่าเดิม", () => {
    expect(comparePageQuery({ by: "fiscalYear", fy: "1" })).toEqual({ by: "fiscalYear", fy: "1" });
    expect(comparePageQuery({ years: "2568,2569" })).toMatchObject({ by: "fiscalYear", years: "2568,2569" });
    expect(comparePageQuery({ division: "3" })).toMatchObject({ division: "3", by: undefined });
  });
  test("ภาพรวมที่มีแค่ช่วงเวลา สัญญา หรือปีเดียว ไม่ถูกย้าย", () => {
    expect(comparePageQuery({ months: "2026-03", contract: "2", fy: "1" })).toBeNull();
    expect(comparePageQuery({ by: "overall", years: "2569" })).toBeNull();
    expect(comparePageQuery({ by: "constructor" })).toBeNull();
  });
  test("ค่าเริ่มต้นของเปรียบเทียบตามต่างกันตามหน้า และไม่ถูกเขียนลง URL", () => {
    const compare = { defaultBy: DEFAULT_BY.compare, dimensions: PAGE_DIMENSIONS.compare };
    expect(viewFromQuery({}, compare).by).toBe("division");
    expect(viewFromQuery({ by: "overall" }, compare).by).toBe("division");
    expect(viewToQuery(viewFromQuery({}, compare), compare).by).toBeUndefined();
    expect(viewToQuery(viewFromQuery({ by: "contract" }, compare), compare).by).toBe("contract");
  });
});
