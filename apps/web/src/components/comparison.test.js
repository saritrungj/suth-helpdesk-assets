import { describe, expect, test } from "vitest";
import {
  monthsWithData,
  yearComparisonOptions,
  MAX_ITEMS,
  buildComparison,
  chartState,
  buildYearComparison,
  fiscalPosition,
  fiscalYearsMonths,
  monthText,
  comparisonChart,
  deviceYearSelection,
  difference,
  itemOptions,
  periodChange,
  periodLabel,
  rankEntries,
  stableSlots,
  summarize,
} from "./comparison";

const row = (overrides) => ({
  device_id: 1, month: "2025-10", pages_printed: 100, net_pages: 98, total_cost: "49.00",
  division_id: 1, division_name: "ฝ่าย A", department_id: 10, department_name: "แผนก A1",
  billing_contract_id: 7, billing_contract_no: "CT-007", ...overrides,
});

const entry = (key, label, summary) => ({ key, label, displayLabel: label, summary: { readings: 1, rawPages: 0, netPages: 0, costSatang: 0, cost: 0, unpriced: 0, devices: 1, ...summary } });

test("กราฟรายเครื่องเลือกสองถึงสามปีจาก URL และลิงก์ปีซ้ำกลับไปคู่ตั้งต้น", () => {
  const options = [2567, 2568, 2569, 2570].map((year) => ({ value: String(year) }));
  expect(deviceYearSelection(undefined, options, 2569)).toEqual(["2568", "2569"]);
  expect(deviceYearSelection("2567,2568,2569", options, 2569)).toEqual(["2567", "2568", "2569"]);
  expect(deviceYearSelection("2568,2568", options, 2569)).toEqual(["2568", "2569"]);
  expect(deviceYearSelection("0000,2568", options, 2569)).toEqual(["2568", "2569"]);
  expect(deviceYearSelection("2567,2568,2569,2570", options, 2569)).toEqual(["2568", "2569", "2570"]);
});

describe("สรุปยอดของกลุ่ม", () => {
  test("รวมเงินเป็นสตางค์ หน้าสุทธิไม่มีเศษทศนิยมลอย และนับเครื่องไม่ซ้ำ", () => {
    const summary = summarize([
      row({ total_cost: "0.10", net_pages: 0.98 }),
      row({ month: "2025-11", total_cost: "0.20", net_pages: 97.99 }),
      row({ device_id: 2, total_cost: "0.00", pages_printed: 0, net_pages: 0 }),
    ]);
    expect(summary).toMatchObject({ readings: 3, rawPages: 200, netPages: 98.97, cost: 0.3, costSatang: 30, unpriced: 0, devices: 2 });
  });

  test("ไม่มีรายการ หรือทุกรายการยังไม่รู้ราคา = ยอดเงิน null ไม่ใช่ศูนย์บาท", () => {
    expect(summarize([]).cost).toBeNull();
    expect(summarize([row({ total_cost: null })])).toMatchObject({ cost: null, unpriced: 1, readings: 1 });
    expect(summarize([row({ total_cost: null }), row({ device_id: 2, total_cost: "10.00" })])).toMatchObject({ cost: 10, unpriced: 1 });
  });
});

describe("ส่วนต่างสูตรเดียวของหน้าจอและไฟล์", () => {
  const summaryOf = (rawPages, costSatang, extra = {}) => ({ readings: 1, rawPages, costSatang, cost: costSatang / 100, unpriced: 0, devices: 1, ...extra });

  test("ส่วนต่างจริงและสัดส่วนเทียบกับฐาน เงินคิดจากสตางค์", () => {
    expect(difference(summaryOf(100, 1000), summaryOf(125, 1250), "rawPages")).toEqual({ diff: 25, ratio: 0.25, reason: null });
    expect(difference(summaryOf(100, 1010), summaryOf(125, 1000), "cost")).toEqual({ diff: -0.1, ratio: -10 / 1010, reason: null });
  });

  test("ฐานเป็นศูนย์แสดงส่วนต่างจริงแต่ไม่คิดเปอร์เซ็นต์", () => {
    expect(difference(summaryOf(0, 0), summaryOf(40, 400), "rawPages")).toEqual({ diff: 40, ratio: null, reason: "zero-base" });
    expect(difference(summaryOf(0, 0), summaryOf(0, 0), "cost")).toEqual({ diff: 0, ratio: null, reason: "zero-base" });
  });

  test("ไม่มีข้อมูลฝั่งใดฝั่งหนึ่งไม่สร้างส่วนต่าง", () => {
    const missing = { readings: 0 };
    expect(difference(missing, summaryOf(1, 1), "rawPages").reason).toBe("no-base-data");
    expect(difference(summaryOf(1, 1), missing, "rawPages").reason).toBe("no-data");
  });
});

describe("อันดับมาก–น้อย — มีเฉพาะในไฟล์ Excel (#115)", () => {
  const groups = [
    entry("a", "ฝ่าย A", { rawPages: 120, costSatang: 6000 }),
    entry("b", "ฝ่าย B", { rawPages: 0, costSatang: 0 }),
    entry("c", "ฝ่าย C", { rawPages: 900, costSatang: 45000 }),
    { key: "missing", label: "ฝ่ายที่ยังไม่บันทึก", summary: { readings: 0, rawPages: 0, costSatang: 0, unpriced: 0 } },
  ];

  test("ทุกรายการเรียงมาก→น้อย ยอดศูนย์ที่บันทึกแล้วอยู่ท้าย แต่ข้อมูลขาดไม่ถูกสร้างเป็นศูนย์", () => {
    expect(rankEntries(groups, { metric: "rawPages" }).map((item) => [item.key, item.rank]))
      .toEqual([["c", 1], ["a", 2], ["b", 3]]);
  });

  test("เรียงค่าที่เท่ากันด้วยชื่อเพื่อให้ผลคงที่ และไม่ตัดจำนวน — อันดับต้นและท้ายอยู่ในรายการเดียว", () => {
    const many = Array.from({ length: 12 }, (_, index) => entry(String(index), `ฝ่าย ${String(index).padStart(2, "0")}`, { rawPages: 100 }));
    expect(rankEntries(many, { metric: "rawPages" }).map((item) => item.label)).toEqual(many.map((item) => item.label));
  });

});

describe("แบบจำลองของพื้นที่เปรียบเทียบบนหน้าภาพรวม", () => {
  const rows = [
    row({ device_id: 1, month: "2025-10", pages_printed: 1000, net_pages: 980, total_cost: "490.00" }),
    row({ device_id: 1, month: "2025-11", pages_printed: 500, net_pages: 490, total_cost: "245.00" }),
    row({ device_id: 2, month: "2025-10", division_id: 2, division_name: "ฝ่าย B", department_id: 20, department_name: "แผนก B1", pages_printed: 0, net_pages: 0, total_cost: "0.00", billing_contract_id: 8, billing_contract_no: "CT-008" }),
    row({ device_id: 3, month: "2025-11", division_id: 2, division_name: "ฝ่าย B", department_id: 21, department_name: "แผนก B2", pages_printed: 40, net_pages: 39.2, total_cost: "19.60", billing_contract_id: null, billing_contract_no: null }),
  ];

  test("ภาพรวมเป็นรายเดือน ค่าใช้จ่ายเป็นแท่งตั้ง และยอดพิมพ์เป็นเส้น", () => {
    const model = buildComparison({ rows, dimension: "overall", metric: "cost" });
    expect(model.entries.map((item) => item.key)).toEqual(["2025-10", "2025-11"]);
    const chart = comparisonChart(model);
    expect(chart).toMatchObject({ kind: "bar", horizontal: false });
    expect(chart.series[0].data).toEqual([490, 264.6]);
    expect(chart.labels[1]).toBe("พ.ย. 2568");
    expect(comparisonChart(buildComparison({ rows, dimension: "overall", metric: "rawPages" })).kind).toBe("line");
  });

  test("แบ่งตามฝ่าย: ทุกฝ่ายในขอบเขต เรียงมาก→น้อย และยอดรวมไม่เปลี่ยนไปจากตัวกรอง", () => {
    const model = buildComparison({ rows, dimension: "division", metric: "rawPages" });
    expect(model.entries.map((item) => [item.key, item.summary.rawPages, item.summary.devices])).toEqual([["1", 1500, 1], ["2", 40, 2]]);
    // แบบจำลองไม่คัดแถวออกอีก — ยอดรวมของมันเท่ากับตัวเลขสำคัญบนหัวหน้าเสมอ
    expect(model.scopeRows).toEqual(rows);
    expect(model.scope.rawPages).toBe(summarize(rows).rawPages);
    const chart = comparisonChart(model);
    expect(chart.kind).toBe("line");
    // ฝ่าย B ไม่มีรายการเดือน พ.ย. ของแผนก B1 แต่มีของ B2 — เส้นของฝ่ายเป็นยอดรวมจริงรายเดือน
    expect(chart.series.map((series) => series.data)).toEqual([[1000, 500], [0, 40]]);
  });

  test("กลุ่มที่เลือกไว้ในตัวกรองแต่ยังไม่มียอด ยังอยู่ในแบบจำลองเป็น \"ไม่มีข้อมูล\" ต่างจากยอดศูนย์", () => {
    const model = buildComparison({
      rows: rows.filter((item) => item.month === "2025-10"),
      dimension: "department", metric: "rawPages", include: ["20", "99"],
      options: [{ value: "99", label: "แผนกที่ยังไม่บันทึก" }],
    });
    const chart = comparisonChart(model);
    expect(chart).toMatchObject({ kind: "bar", horizontal: true });
    expect(chart.series[0].data).toEqual([1000, 0, null]);
    expect(chart.labels[2]).toBe("แผนกที่ยังไม่บันทึก · ไม่มีข้อมูล");
  });

  test("หลายสัญญาใช้สัญญาที่คิดเงินของเดือนนั้น และยอดที่ไม่มีสัญญาอยู่ในกลุ่มไม่ผูกสัญญา", () => {
    const model = buildComparison({ rows, dimension: "contract", metric: "cost" });
    expect(model.entries.map((item) => [item.key, item.summary.cost])).toEqual([["7", 735], ["unassigned", 19.6], ["8", 0]]);
    expect(model.entries.find((item) => item.key === "unassigned").label).toBe("ไม่ผูกสัญญา");
  });

  test("อันดับสำหรับไฟล์มีทุกกลุ่มของมิติ", () => {
    const pages = buildComparison({ rows, dimension: "department", metric: "rawPages" });
    expect(pages.ranking.entries.map((item) => [item.key, item.rank])).toEqual([["10", 1], ["21", 2], ["20", 3]]);
    expect(pages.ranking).toMatchObject({ from: 3, blocked: null });
    const cost = buildComparison({ rows, dimension: "department", metric: "cost" });
    expect(cost.ranking).toMatchObject({ blocked: null, from: 3 });
    expect(buildComparison({ rows, dimension: "overall" }).ranking).toBeNull();
  });

  test("ค่าใช้จ่ายเรียงจากมากไปน้อย", () => {
    const byCost = buildComparison({ rows, dimension: "department", metric: "cost" });
    expect(byCost.entries.map((item) => item.key)).toEqual(["10", "21", "20"]);
  });

  test("กราฟวาดเท่าที่มีสี ส่วนตารางและไฟล์ได้ครบทุกกลุ่ม พร้อมจำนวนที่ไม่ได้ขึ้นกราฟ", () => {
    const bigger = Array.from({ length: 10 }, (_, index) => row({
      device_id: index + 10, department_id: 100 + index, department_name: `แผนก ${index}`, pages_printed: 100 * (index + 1),
    }));
    const model = buildComparison({ rows: bigger, dimension: "department", metric: "rawPages" });
    expect(model.entries).toHaveLength(10);
    expect(model.chartEntries).toHaveLength(MAX_ITEMS);
    expect(model.hidden).toBe(10 - MAX_ITEMS);
    // กราฟเอากลุ่มที่ยอดสูงสุดขึ้นก่อน ไม่ใช่ตัดตามลำดับที่ข้อมูลมาถึง
    expect(model.chartEntries[0].key).toBe("109");
    expect(comparisonChart(model).series[0].data).toHaveLength(MAX_ITEMS);
  });

  test("ตัวเลือกของรายการรวมหน่วยงานที่ยังไม่มียอดและกลุ่มที่ไม่ระบุ", () => {
    const options = itemOptions("department", {
      divisions: [{ id: 1, name: "ฝ่าย A" }],
      departments: [{ id: 10, name: "แผนก A1", division_id: 1 }, { id: 11, name: "แผนกว่าง", division_id: 1 }],
    }, [row({ department_id: null, department_name: null })]);
    expect(options.map((option) => [option.value, option.label, option.hint])).toEqual([
      ["10", "แผนก A1", "ฝ่าย A"], ["11", "แผนกว่าง", "ฝ่าย A"], ["unassigned", "ไม่ระบุแผนก", "ฝ่าย A"],
    ]);
  });
});

describe("มิติอาคารและรายเครื่องบนหน้าภาพรวม (#115)", () => {
  const rows = [
    row({ device_id: 1, month: "2025-10", building_id: 1, building_name: "อาคาร A", location: "ห้อง 101", serial_number: "0100-SN", pages_printed: 300 }),
    // เครื่อง 1 ย้ายไปอาคาร B ในเดือน พ.ย. — อาคารนับตามเดือนนั้น เครื่องยังเป็นรายการเดียว
    row({ device_id: 1, month: "2025-11", building_id: 2, building_name: "อาคาร B", location: "ห้อง 201", serial_number: "0100-SN", pages_printed: 200 }),
    row({ device_id: 2, month: "2025-10", building_id: 2, building_name: "อาคาร B", location: "ห้อง 202", serial_number: "0200-SN", brand_name: "Laser Pro", pages_printed: 50 }),
  ];

  test("อาคารใช้ที่ตั้งของเดือนนั้น", () => {
    const model = buildComparison({ rows, dimension: "building", items: ["1", "2"], metric: "rawPages" });
    expect(model.entries.map((item) => [item.displayLabel, item.summary.rawPages])).toEqual([["อาคาร A", 300], ["อาคาร B", 250]]);
    expect(itemOptions("building", { buildings: [{ id: 1, name: "อาคาร A" }, { id: 3, name: "อาคารว่าง" }] }, rows).map((option) => option.label))
      .toEqual(["อาคาร A", "อาคารว่าง", "อาคาร B"]);
  });

  test("รายเครื่องเป็นเส้นเดียวต่อเนื่องแม้ย้าย ป้ายเป็น Serial · ที่ตั้งล่าสุด และค้นด้วยยี่ห้อได้", () => {
    const model = buildComparison({ rows, dimension: "device", items: ["1"], metric: "rawPages" });
    expect(model.entries[0]).toMatchObject({ displayLabel: "0100-SN · อาคาร B ห้อง 201" });
    expect(model.entries[0].monthly.map((summary) => summary.rawPages)).toEqual([300, 200]);
    const options = itemOptions("device", {}, rows);
    expect(options.map((option) => [option.value, option.label, option.hint])).toEqual([["1", "0100-SN", "อาคาร B ห้อง 201"], ["2", "0200-SN", "อาคาร B ห้อง 202"]]);
    expect(options[1].keywords).toContain("Laser Pro");
  });
});

describe("เทียบข้ามปีงบ (#115)", () => {
  const rows = [
    row({ device_id: 1, month: "2024-10", pages_printed: 800 }),
    row({ device_id: 1, month: "2024-12", pages_printed: 600 }),
    row({ device_id: 1, month: "2025-10", pages_printed: 1000 }),
    row({ device_id: 1, month: "2025-11", pages_printed: 0 }),
    row({ device_id: 2, month: "2025-10", division_id: 2, division_name: "ฝ่าย B", pages_printed: 50 }),
    row({ device_id: 3, month: "2023-10", pages_printed: 999 }),
  ];

  test("เดือนเดียวกันของต่างปีงบอยู่ตำแหน่งเดียวกัน และแกนเป็นชื่อเดือนไม่มีปี", () => {
    expect(["2024-10", "2025-10", "2025-09", "2026-01"].map(fiscalPosition)).toEqual(["P01", "P01", "P12", "P04"]);
    expect(["P01", "P12"].map((key) => monthText(key))).toEqual(["ต.ค.", "ก.ย."]);
    expect(monthText("2025-10")).toBe("ต.ค. 2568");
    expect(fiscalYearsMonths([2568, 2569])).toHaveLength(24);
  });

  test("หนึ่งเส้นต่อปีงบ เดือนที่ยังไม่มียอดเป็นช่องว่าง ศูนย์ที่บันทึกจริงยังเป็นศูนย์ และไม่ปนปีที่ไม่ได้เลือก", () => {
    const model = buildYearComparison({ rows, years: [2569, 2568], metric: "rawPages" });
    expect(model.months).toEqual(["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11", "P12"]);
    expect(model.entries.map((entry) => [entry.displayLabel, entry.monthly.map((summary) => (summary.readings ? summary.rawPages : null))]))
      .toEqual([["ปีงบ 2568", [800, null, 600, null, null, null, null, null, null, null, null, null]], ["ปีงบ 2569", [1050, 0, null, null, null, null, null, null, null, null, null, null]]]);
    const chart = comparisonChart(model);
    expect(chart.labels).toEqual(["ต.ค.", "พ.ย.", "ธ.ค.", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย."]);
    expect(chart.series.map((series) => series.data)).toEqual([[800, null, 600, null, null, null, null, null, null, null, null, null], [1050, 0, null, null, null, null, null, null, null, null, null, null]]);
    expect(model.scopeRows.every((line) => line.calendar_month && line.fiscal_year !== "2567")).toBe(true);
  });

  test("ขอบเขตมาจากตัวกรองของหน้า ปีงบเรียงตามเวลา และเลือกได้ไม่เกินสามปี", () => {
    // ตัวกรองของหน้าคัดแถวมาก่อนแล้ว ฟังก์ชันนี้จึงไม่มีตัวเลือกขอบเขตของตัวเอง
    const scoped = buildYearComparison({ rows: rows.filter((line) => line.division_id === 2), years: [2568, 2569], metric: "rawPages" });
    expect(scoped.entries.map((entry) => [entry.key, entry.summary.rawPages])).toEqual([["2568", 0], ["2569", 50]]);
    expect(scoped.entries[0].summary.readings).toBe(0);
    expect(buildYearComparison({ rows, years: [2566, 2567, 2568, 2569] }).years).toEqual(["2567", "2568", "2569"]);
    expect(buildYearComparison({ rows, years: [2568, 2569], positions: ["P03", "P01"] }).months).toEqual(["P01", "P03"]);
    const october = buildYearComparison({ rows, years: [2568, 2569], positions: ["P01"], metric: "rawPages" });
    expect(october.entries.map((entry) => [entry.key, entry.summary.rawPages])).toEqual([["2568", 800], ["2569", 1050]]);
    expect(october.scopeRows.every(row => row.month === "P01")).toBe(true);
  });
});

describe("ตัวเลขสำคัญ รายละเอียด และช่วงก่อนหน้าใช้ขอบเขตเดียวกับกราฟ (R06)", () => {
  const rows = [
    row({ device_id: 1, month: "2025-11", pages_printed: 1000, net_pages: 980, total_cost: "490.00" }),
    row({ device_id: 2, month: "2025-11", division_id: 2, division_name: "ฝ่าย B", pages_printed: 300, net_pages: 294, total_cost: "147.00" }),
    row({ device_id: 3, month: "2025-11", division_id: 3, division_name: "ฝ่าย C", pages_printed: 50, net_pages: 49, total_cost: "24.50" }),
  ];
  const previous = [
    row({ device_id: 1, month: "2025-10", pages_printed: 800, net_pages: 784, total_cost: "392.00" }),
    row({ device_id: 2, month: "2025-10", division_id: 2, division_name: "ฝ่าย B", pages_printed: 100, net_pages: 98, total_cost: "49.00" }),
    row({ device_id: 3, month: "2025-10", division_id: 3, division_name: "ฝ่าย C", pages_printed: 9000, net_pages: 8820, total_cost: "4410.00" }),
  ];

  test("ฐานศูนย์และช่วงไม่มีข้อมูลไม่มีเปอร์เซ็นต์", () => {
    const priced = summarize(rows);
    expect(periodChange(summarize([row({ pages_printed: 0, net_pages: 0, total_cost: "0.00" })]), priced, "rawPages")).toEqual({ percent: null, reason: "zero-base" });
    expect(periodChange(summarize([]), priced, "cost")).toEqual({ percent: null, reason: "no-base-data" });
  });
});

describe("ช่วงเวลาตามปีงบ ต.ค.–ก.ย.", () => {
  const fy2569 = { year: "2569", start_month: "2025-10", end_month: "2026-09" };

  test("ชื่อช่วงเวลาเป็นภาษาคน", () => {
    expect(periodLabel(["2025-12", "2025-10", "2025-11"])).toBe("ต.ค. 2568 – ธ.ค. 2568");
    expect(periodLabel(["2025-10", "2025-12"])).toBe("ต.ค. 2568, ธ.ค. 2568");
  });
});

test("สีของรายการไม่เปลี่ยนเมื่อเอารายการอื่นออก และไม่ชนกัน", () => {
  const first = stableSlots(new Map(), ["a", "b", "c"]);
  const second = stableSlots(first, ["a", "c", "d"]);
  expect([...second.entries()]).toEqual([["a", 1], ["c", 3], ["d", 2]]);
});

describe("สถานะของพื้นที่กราฟ", () => {
  /** หนึ่งแถวต่อหนึ่งฝ่าย — ยอดสูงสุดเรียงตามหมายเลขฝ่าย กลุ่มท้ายจึงคือกลุ่มที่ตกจากกราฟ */
  const division = (id, pages, cost) => row({
    device_id: id, division_id: id, division_name: `ฝ่าย ${id}`,
    pages_printed: pages, net_pages: pages, total_cost: cost,
  });

  test("กราฟค่าใช้จ่ายพร้อมเมื่อทุกรายการมีราคา", () => {
    const rows = [
      ...Array.from({ length: MAX_ITEMS }, (_, index) => division(index + 1, 1000 - index, `${100 - index}.00`)),
      division(MAX_ITEMS + 1, 10, "5.00"),
    ];
    const model = buildComparison({ rows, dimension: "division", metric: "cost" });

    expect(model.chartEntries).toHaveLength(MAX_ITEMS);
    expect(model.hidden).toBe(1);
    expect(model.scope.readings).toBe(MAX_ITEMS + 1);
    expect(chartState(model)).toBe("ready");
  });

  test("ไม่มีแถวเลย = no-data ส่วนราคาครบ = ready", () => {
    expect(chartState(buildComparison({ rows: [], dimension: "division", metric: "cost" }))).toBe("no-data");
    expect(chartState(buildComparison({ rows: [division(1, 100, "49.00")], dimension: "division", metric: "cost" }))).toBe("ready");
  });
});

describe("เดือนที่มีข้อมูล และปีงบที่ยังไม่มีข้อมูล (#206)", () => {
  test("นับเดือนที่มีรายการจริง ไม่ใช่จำนวนช่องบนแกน", () => {
    const model = { view: "group", months: ["P01", "P02", "P03"], entries: [
      { monthly: [{ readings: 0 }, { readings: 2 }, { readings: 0 }] },
      { monthly: [{ readings: 0 }, { readings: 1 }, { readings: 3 }] },
    ] };
    expect(monthsWithData(model)).toBe(2);
    expect(monthsWithData({ view: "overall", months: ["2026-03"], entries: [{ summary: { readings: 0 } }] })).toBe(0);
  });
  test("ปีงบที่ไม่มียอดสักเดือนบอกไว้ในชื่อ", () => {
    const options = yearComparisonOptions([{ year: 2569 }], 2569, { dataMonths: ["2026-03"] });
    expect(options.find((o) => o.value === "2569").label).toBe("ปีงบ 2569");
    expect(options.find((o) => o.value === "2568").label).toBe("ปีงบ 2568 — ยังไม่มีข้อมูล");
  });
});
