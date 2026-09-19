import { describe, expect, test } from "vitest";
import {
  buildComparison,
  buildDifference,
  buildYearComparison,
  fiscalPosition,
  fiscalYearsMonths,
  monthText,
  comparisonChart,
  comparisonFromQuery,
  comparisonScope,
  comparisonToQuery,
  deviceSpread,
  difference,
  differenceChart,
  differenceFromQuery,
  itemOptions,
  periodChange,
  periodLabel,
  rankEntries,
  referenceMonths,
  rowsInScope,
  stableSlots,
  summarize,
} from "./comparison";

const row = (overrides) => ({
  device_id: 1, month: "2025-10", pages_printed: 100, net_pages: 98, total_cost: "49.00",
  division_id: 1, division_name: "ฝ่าย A", department_id: 10, department_name: "แผนก A1",
  billing_contract_id: 7, billing_contract_no: "CT-007", ...overrides,
});

const entry = (key, label, summary) => ({ key, label, displayLabel: label, summary: { readings: 1, rawPages: 0, netPages: 0, costSatang: 0, cost: 0, unpriced: 0, devices: 1, ...summary } });

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

  test("ไม่มีข้อมูลฝั่งใดฝั่งหนึ่ง หรือราคายังไม่ครบ ไม่สร้างส่วนต่าง", () => {
    const missing = { readings: 0 };
    expect(difference(missing, summaryOf(1, 1), "rawPages").reason).toBe("no-base-data");
    expect(difference(summaryOf(1, 1), missing, "rawPages").reason).toBe("no-data");
    expect(difference(summaryOf(1, 1, { unpriced: 1 }), summaryOf(2, 2), "cost")).toMatchObject({ diff: null, ratio: null, reason: "unpriced" });
    // ยอดพิมพ์ยังเทียบได้แม้ราคาไม่ครบ เพราะไม่ขึ้นกับราคา
    expect(difference(summaryOf(1, 1, { unpriced: 1 }), summaryOf(2, 2), "rawPages").diff).toBe(1);
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

  test("ไม่สรุปอันดับค่าใช้จ่ายเมื่อมีราคาไม่ครบในขอบเขต แต่ยอดพิมพ์ยังจัดอันดับได้", () => {
    const withUnpriced = [...groups, entry("u", "รอราคา", { rawPages: 20, unpriced: 1 })];
    expect(rankEntries(withUnpriced, { metric: "cost" })).toBeNull();
    expect(rankEntries(withUnpriced, { metric: "rawPages" })[0].key).toBe("c");
  });
});

describe("แบบจำลองของพื้นที่เปรียบเทียบบนหน้าภาพรวม", () => {
  const rows = [
    row({ device_id: 1, month: "2025-10", pages_printed: 1000, net_pages: 980, total_cost: "490.00" }),
    row({ device_id: 1, month: "2025-11", pages_printed: 500, net_pages: 490, total_cost: "245.00" }),
    row({ device_id: 2, month: "2025-10", division_id: 2, division_name: "ฝ่าย B", department_id: 20, department_name: "แผนก B1", pages_printed: 0, net_pages: 0, total_cost: "0.00", billing_contract_id: 8, billing_contract_no: "CT-008" }),
    row({ device_id: 3, month: "2025-11", division_id: 2, division_name: "ฝ่าย B", department_id: 21, department_name: "แผนก B2", pages_printed: 40, net_pages: 39.2, total_cost: null, billing_contract_id: null, billing_contract_no: null }),
  ];

  test("ภาพรวมเป็นรายเดือน ค่าใช้จ่ายเป็นแท่งตั้ง ยอดพิมพ์เป็นเส้น และเดือนที่ราคาไม่ครบมีสถานะที่ป้าย", () => {
    const model = buildComparison({ rows, dimension: "overall", metric: "cost" });
    expect(model.entries.map((item) => item.key)).toEqual(["2025-10", "2025-11"]);
    const chart = comparisonChart(model);
    expect(chart).toMatchObject({ kind: "bar", horizontal: false });
    expect(chart.series[0].data).toEqual([490, 245]);
    expect(chart.labels[1]).toMatch(/รอราคา 1/);
    expect(comparisonChart(buildComparison({ rows, dimension: "overall", metric: "rawPages" })).kind).toBe("line");
  });

  test("เลือกฝ่าย A/B: กราฟ ตาราง และขอบเขตข้อมูลรายละเอียดมาจากรายการที่เลือกเท่านั้น", () => {
    const model = buildComparison({ rows, dimension: "division", items: ["2", "1"], metric: "rawPages" });
    expect(model.entries.map((item) => [item.key, item.summary.rawPages, item.summary.devices])).toEqual([["2", 40, 2], ["1", 1500, 1]]);
    expect(model.scopeRows).toHaveLength(4);
    const chart = comparisonChart(model);
    expect(chart.kind).toBe("line");
    // ฝ่าย B ไม่มีรายการเดือน พ.ย. ของแผนก B1 แต่มีของ B2 — เส้นของฝ่ายเป็นยอดรวมจริงรายเดือน
    expect(chart.series.map((series) => series.data)).toEqual([[0, 40], [1000, 500]]);
  });

  test("เลือกแผนก: หน่วยงานที่ไม่มีรายการในช่วงนี้เป็น 'ไม่มีข้อมูล' ต่างจากยอดศูนย์", () => {
    const model = buildComparison({
      rows: rows.filter((item) => item.month === "2025-10"),
      dimension: "department", items: ["20", "99"], metric: "rawPages",
      options: [{ value: "99", label: "แผนกที่ยังไม่บันทึก" }],
    });
    const chart = comparisonChart(model);
    expect(chart).toMatchObject({ kind: "bar", horizontal: true });
    expect(chart.series[0].data).toEqual([0, null]);
    expect(chart.labels[1]).toBe("แผนกที่ยังไม่บันทึก · ไม่มีข้อมูล");
  });

  test("หลายสัญญาใช้สัญญาที่คิดเงินของเดือนนั้น และยอดที่ไม่มีสัญญาอยู่ในกลุ่มไม่ผูกสัญญา", () => {
    const model = buildComparison({ rows, dimension: "contract", items: ["7", "8", "unassigned"], metric: "cost" });
    expect(model.entries.map((item) => [item.key, item.summary.cost, item.summary.unpriced])).toEqual([["7", 735, 0], ["8", 0, 0], ["unassigned", null, 1]]);
    expect(model.entries[2].label).toBe("ไม่ผูกสัญญา");
  });

  test("อันดับสำหรับไฟล์: ทุกกลุ่มของมิติแม้เลือกไว้บางรายการ และค่าใช้จ่ายที่ราคาไม่ครบไม่ถูกจัดอันดับ", () => {
    const pages = buildComparison({ rows, dimension: "department", items: ["20"], metric: "rawPages" });
    expect(pages.ranking.entries.map((item) => [item.key, item.rank])).toEqual([["10", 1], ["21", 2], ["20", 3]]);
    expect(pages.ranking).toMatchObject({ from: 3, blocked: null });
    const cost = buildComparison({ rows, dimension: "department", items: ["20"], metric: "cost" });
    expect(cost.ranking).toMatchObject({ blocked: "unpriced", entries: [] });
    expect(buildComparison({ rows, dimension: "overall" }).ranking).toBeNull();
  });

  test("ยังไม่ได้เลือกรายการ ระบบเลือกยอดสูงสุดให้ไม่เกิน 5 รายการ และเลือกเกิน 8 ถูกตัดเหลือ 8", () => {
    const auto = buildComparison({ rows, dimension: "department", items: [], metric: "rawPages" });
    expect(auto).toMatchObject({ autoPicked: true, blocked: null });
    expect(auto.entries.map((item) => item.key)).toEqual(["10", "21", "20"]);
    // ค่าใช้จ่ายยังจัดลำดับไม่ได้ (ราคาไม่ครบ) — ระบบเลือกตามยอดพิมพ์แทน ไม่เปิดหน้ามาว่าง
    expect(buildComparison({ rows, dimension: "department", items: [], metric: "cost" }).entries.map((item) => item.key)).toEqual(["10", "21", "20"]);
    const bigger = Array.from({ length: 7 }, (_, index) => row({ device_id: index + 10, department_id: 100 + index, department_name: `แผนก ${index}`, pages_printed: 100 * (index + 1) }));
    expect(buildComparison({ rows: bigger, dimension: "department", items: [], metric: "rawPages" }).entries.map((item) => item.key)).toEqual(["106", "105", "104", "103", "102"]);
    const many = Array.from({ length: 10 }, (_, index) => String(index + 1));
    expect(buildComparison({ rows, dimension: "division", items: many }).entries).toHaveLength(8);
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

  test("ขอบเขตเดียว เช่น ฝ่ายหนึ่งฝ่าย และเลือกได้ไม่เกินสามปี", () => {
    const scoped = buildYearComparison({ rows, years: [2568, 2569], scope: { dimension: "division", key: "2" }, metric: "rawPages" });
    expect(scoped.entries.map((entry) => entry.summary.rawPages)).toEqual([0, 50]);
    expect(scoped.entries[0].summary.readings).toBe(0);
    expect(buildYearComparison({ rows, years: [2566, 2567, 2568, 2569] }).years).toEqual(["2567", "2568", "2569"]);
    expect(buildYearComparison({ rows, years: [2568, 2569], positions: ["P03", "P01"] }).months).toEqual(["P01", "P03"]);
    const october = buildYearComparison({ rows, years: [2568, 2569], positions: ["P01"], metric: "rawPages" });
    expect(october.entries.map(entry => entry.summary.rawPages)).toEqual([800, 1050]);
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

  test("เลือกฝ่าย A/B แล้ว ตัวเลขสำคัญเป็นของ A/B เท่ากับขอบเขตของกราฟและไฟล์", () => {
    const model = buildComparison({ rows, dimension: "division", items: ["1", "2"], metric: "cost" });
    const scope = comparisonScope(model);
    expect(scope).toMatchObject({ selected: true, keys: ["1", "2"] });
    expect(rowsInScope(rows, scope)).toEqual(model.scopeRows);
    expect(summarize(rowsInScope(rows, scope)).rawPages).toBe(1300);
  });

  test("ช่วงก่อนหน้าคัดด้วยรายการชุดเดียวกัน ไม่ใช่ยอดทั้งองค์กร", () => {
    const model = buildComparison({ rows, dimension: "division", items: ["1", "2"], metric: "cost" });
    const scope = comparisonScope(model);
    const before = summarize(rowsInScope(previous, scope));
    expect(before.rawPages).toBe(900);
    // (637 − 441) ÷ 441 — ถ้าใช้ยอดทั้งองค์กรของเดือนก่อน ฝ่าย C จะทำให้ดูเหมือนลดลงเกือบ 90%
    expect(periodChange(before, summarize(rowsInScope(rows, scope)), "cost").percent).toBeCloseTo(44.44, 2);
  });

  test("ภาพรวม และรายการที่ระบบเลือกให้ ใช้ทุกแถว — ผู้ใช้ยังไม่ได้จำกัดขอบเขต", () => {
    for (const input of [
      { dimension: "overall" },
      { dimension: "division", items: [] },
    ]) {
      const scope = comparisonScope(buildComparison({ rows, metric: "cost", ...input }));
      expect(scope.selected).toBe(false);
      expect(rowsInScope(rows, scope)).toEqual(rows);
    }
  });

  test("ราคาช่วงใดช่วงหนึ่งไม่ครบ ไม่คิดเปอร์เซ็นต์ค่าใช้จ่าย และฐานศูนย์ไม่มีเปอร์เซ็นต์", () => {
    const priced = summarize(rows);
    const unpricedBefore = summarize([...previous, row({ device_id: 9, month: "2025-10", total_cost: null })]);
    expect(periodChange(unpricedBefore, priced, "cost")).toEqual({ percent: null, reason: "unpriced" });
    expect(periodChange(summarize([row({ pages_printed: 0, net_pages: 0, total_cost: "0.00" })]), priced, "rawPages")).toEqual({ percent: null, reason: "zero-base" });
    expect(periodChange(summarize([]), priced, "cost")).toEqual({ percent: null, reason: "no-base-data" });
  });
});

describe("เปรียบเทียบความแตกต่างของฝ่าย/แผนก", () => {
  const current = {
    months: ["2025-10", "2025-11", "2025-12"],
    rows: [
      row({ device_id: 1, division_id: 1, pages_printed: 300, total_cost: "150.00" }),
      row({ device_id: 2, division_id: 1, pages_printed: 100, total_cost: "50.00" }),
      row({ device_id: 3, division_id: 2, division_name: "ฝ่าย B", pages_printed: 500, total_cost: "250.00" }),
      row({ device_id: 4, division_id: 3, division_name: "ฝ่าย C", pages_printed: 0, total_cost: "0.00" }),
    ],
  };

  test("หน่วยงานในช่วงเดียวกันเทียบกับรายการฐานที่เลือก", () => {
    const model = buildDifference({ dimension: "division", basis: "units", items: ["1", "2", "3"], baseKey: "2", metric: "rawPages", current });
    expect(model.baseEntry.key).toBe("2");
    expect(model.entries.map((item) => [item.key, item.isBase, item.difference?.diff, item.difference?.ratio])).toEqual([
      ["1", false, -100, -0.2], ["2", true, undefined, undefined], ["3", false, -500, -1],
    ]);
    expect(deviceSpread(model.entries.map((item) => item.summary))).toEqual({ min: 1, max: 2 });
  });

  test("ฐานที่บันทึกศูนย์ไม่มีเปอร์เซ็นต์ และต้องมีอย่างน้อยสองรายการ", () => {
    const model = buildDifference({ dimension: "division", basis: "units", items: ["3", "2"], metric: "rawPages", current });
    expect(model.entries[1].difference).toEqual({ diff: 500, ratio: null, reason: "zero-base" });
    expect(buildDifference({ dimension: "division", basis: "units", items: ["3"], metric: "rawPages", current }).blocked).toBe("no-items");
  });

  test("ช่วง A/B ของหน่วยงานเดียวกัน: ราคาไม่ครบไม่คิดส่วนต่างค่าใช้จ่าย และกราฟมีสองชุด", () => {
    const reference = { months: ["2024-10", "2024-11", "2024-12"], rows: [row({ month: "2024-10", division_id: 1, pages_printed: 200, total_cost: null })] };
    const model = buildDifference({ dimension: "division", basis: "periods", items: ["1"], metric: "cost", current, reference });
    expect(model.entries[0].difference.reason).toBe("unpriced");
    const byPages = buildDifference({ dimension: "division", basis: "periods", items: ["1"], metric: "rawPages", current, reference });
    expect(byPages.entries[0].difference).toEqual({ diff: 200, ratio: 1, reason: null });
    expect(byPages.scopeRows).toHaveLength(3);
    const chart = differenceChart(byPages, { currentLabel: "B", referenceLabel: "A" });
    expect(chart.series.map((series) => [series.label, series.data])).toEqual([["A", [200]], ["B", [400]]]);
  });

  test("ราคาไม่ครบหนึ่งรายการระงับส่วนต่างค่าใช้จ่ายของขอบเขตเปรียบเทียบทั้งหมด", () => {
    const mixed = {
      ...current,
      rows: current.rows.map((item) => (item.division_id === 3
        ? { ...item, price_per_page: null, total_cost: null }
        : item)),
    };
    const model = buildDifference({
      dimension: "division", basis: "units", items: ["1", "2", "3"], baseKey: "2", metric: "cost", current: mixed,
    });
    expect(model.scope.unpriced).toBe(1);
    expect(model.entries.map((item) => [item.key, item.isBase, item.difference?.reason])).toEqual([
      ["1", false, "unpriced"], ["2", true, undefined], ["3", false, "unpriced"],
    ]);
  });
});

describe("ช่วงเวลาตามปีงบ ต.ค.–ก.ย.", () => {
  const fy2569 = { year: "2569", start_month: "2025-10", end_month: "2026-09" };

  test("ช่วงเดียวกันของปีงบก่อนจับคู่ตามตำแหน่งในปีงบ", () => {
    expect(referenceMonths(["2025-10", "2025-11", "2025-12"], "previous-year", fy2569)).toEqual(["2024-10", "2024-11", "2024-12"]);
    expect(referenceMonths([], "previous-year", fy2569)).toHaveLength(12);
    expect(referenceMonths([], "previous-year", fy2569)[0]).toBe("2024-10");
  });

  test("ช่วงก่อนหน้าที่ยาวเท่ากันข้ามรอยต่อ ก.ย. → ต.ค. ได้", () => {
    expect(referenceMonths(["2025-10", "2025-11", "2025-12"], "previous-span", fy2569)).toEqual(["2025-07", "2025-08", "2025-09"]);
    expect(referenceMonths(["2026-01", "2026-02", "2026-03"], "previous-span", fy2569)).toEqual(["2025-10", "2025-11", "2025-12"]);
  });

  test("ชื่อช่วงเวลาเป็นภาษาคน", () => {
    expect(periodLabel(["2025-12", "2025-10", "2025-11"])).toBe("ต.ค. 2568 – ธ.ค. 2568");
    expect(periodLabel(["2025-10", "2025-12"])).toBe("ต.ค. 2568, ธ.ค. 2568");
  });
});

describe("สถานะใน URL", () => {
  test("ค่าที่ไม่รู้จัก รวมถึง property ที่สืบทอดมา ตกไปที่ค่าเริ่มต้น", () => {
    expect(comparisonFromQuery({ by: "constructor", measure: "toString", dir: "__proto__", n: "7", scope: "valueOf" })).toEqual({
      by: "overall", items: [], metric: "cost", years: [], scope: "overall", scopeItem: "",
    });
  });

  test("อ่านและเขียนกลับได้ค่าเดิม โดยค่าเริ่มต้นไม่ถูกเขียนลงลิงก์", () => {
    const state = comparisonFromQuery({ by: "department", items: "10,20,unassigned,<x>", measure: "pages" });
    expect(state).toMatchObject({ by: "department", items: ["10", "20", "unassigned"], metric: "rawPages" });
    expect(comparisonToQuery(state)).toMatchObject({ by: "department", items: "10,20,unassigned", measure: "pages", dir: undefined });
    expect(comparisonToQuery(comparisonFromQuery({}))).toEqual({ by: undefined, view: undefined, items: undefined, measure: undefined, years: undefined, scope: undefined, scopeItem: undefined, dir: undefined, n: undefined, contract: undefined });
  });

  test("ตัวกรองสัญญาเดิมของหน้าภาพรวมพาไปที่การเทียบตามสัญญานั้น", () => {
    expect(comparisonFromQuery({ contract: "5" })).toMatchObject({ by: "contract", items: ["5"] });
  });

  test("ลิงก์เก่าของมุมมองอันดับเปิดเป็นการเลือกรายการ และค่าของอันดับถูกล้างจาก URL", () => {
    const state = comparisonFromQuery({ by: "division", view: "rank", dir: "low", n: "10" });
    expect(state).toMatchObject({ by: "division", items: [], metric: "cost" });
    expect(comparisonToQuery(state)).toMatchObject({ view: undefined, dir: undefined, n: undefined });
  });

  test("ลิงก์ตรงจำกัดรายการไว้ที่จำนวนสีของกราฟ ไม่ปล่อยให้ URL กับแบบจำลองแสดงคนละจำนวน", () => {
    const items = "1,2,3,4,5,6,7,8,9,10";
    expect(comparisonFromQuery({ by: "division", items }).items).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(differenceFromQuery({ items }).items).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });

  test("เทียบข้ามปีงบ: ปีเป็นตัวเลขสี่หลักไม่เกินสามปี ขอบเขตเดียว และเขียนลงลิงก์เฉพาะตอนเทียบปีงบ", () => {
    const state = comparisonFromQuery({ by: "fiscalYear", years: "2569,2566,2568,2567,abc", scope: "division", scopeItem: "3,4" });
    expect(state).toMatchObject({ years: ["2567", "2568", "2569"], scope: "division", scopeItem: "3" });
    expect(comparisonToQuery(state)).toMatchObject({ by: "fiscalYear", years: "2567,2568,2569", scope: "division", scopeItem: "3" });
    expect(comparisonFromQuery({ by: "fiscalYear", scope: "contract", scopeItem: "5" })).toMatchObject({ scope: "overall", scopeItem: "" });
    expect(comparisonToQuery({ ...state, by: "division" })).toMatchObject({ years: undefined, scope: undefined, scopeItem: undefined });
  });

  test("ฐานเปรียบเทียบจากลิงก์ต้องอยู่ในรายการที่เลือก มิฉะนั้นใช้รายการแรกเป็นฐาน", () => {
    expect(differenceFromQuery({ items: "1,2", base: "99" })).toMatchObject({ items: ["1", "2"], base: "1" });
    expect(differenceFromQuery({ items: "1,2", base: "2" })).toMatchObject({ items: ["1", "2"], base: "2" });
    expect(differenceFromQuery({ items: "", base: "99" })).toMatchObject({ items: [], base: "" });
  });
});

test("สีของรายการไม่เปลี่ยนเมื่อเอารายการอื่นออก และไม่ชนกัน", () => {
  const first = stableSlots(new Map(), ["a", "b", "c"]);
  const second = stableSlots(first, ["a", "c", "d"]);
  expect([...second.entries()]).toEqual([["a", 1], ["c", 3], ["d", 2]]);
});
