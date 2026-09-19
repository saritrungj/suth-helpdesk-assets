// @vitest-environment jsdom
//
// เทสหน้ารายงานสรุปยอดพิมพ์ในระดับ "ผลที่ผู้ใช้เห็น" (issue #104)
//
// หน้านี้ถูกพิมพ์ส่งผู้บริหารและส่งออกเป็น Excel จึงต้องตอบให้ได้ว่ายอดของเดือน
// หนึ่งเป็นของหน่วยงานไหน โดยนับครั้งเดียว — ตรงกับ API และ ADR-0014
//
// ใช้ shallow mount แล้วอ่านแถวและคอลัมน์ที่หน้าส่งให้ตาราง ไม่ได้ตรวจหน้าตา

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";

const get = vi.fn();
vi.mock("../services/api", () => ({ default: { get: (...args) => get(...args) } }));

// store/fiscalYear.js import ../router ซึ่งลาก view ทุกหน้าตามมา — ตัดทิ้ง
vi.mock("../router", () => ({
  default: { replace: vi.fn(), currentRoute: { value: { query: {} } } },
}));

const { mount, flushPromises } = await import("@vue/test-utils");
const { fiscalYearState } = await import("../store/fiscalYear");
const Report = (await import("./Report.vue")).default;

const FISCAL_YEARS = [
  { id: 1, year: "2568", start_month: "2024-10", end_month: "2025-09" },
  { id: 2, year: "2569", start_month: "2025-10", end_month: "2026-09" },
];

/** เครื่องปัจจุบันอยู่ฝ่าย B — เคยอยู่ฝ่าย A ก่อนย้ายวันที่ 20 ม.ค. 2569 */
const MOVED = {
  id: 1,
  serial_number: "SN-MOVED",
  model: "M1",
  brand_name: "Brand",
  status: "active",
  building_id: 20,
  building_name: "ตึก B",
  floor_id: 200,
  floor_name: "ชั้น 2",
  location: "ห้อง B",
  division_id: 2,
  division_name: "ฝ่าย B",
  department_id: 21,
  department_name: "แผนก B1",
  contract_id: null,
};

const MOVED_HISTORY = [
  {
    id: 11, device_id: 1,
    building_id: 10, building_name: "ตึก A", floor_id: 100, floor_name: "ชั้น 1", location: "ห้อง A",
    division_id: 1, division_name: "ฝ่าย A", department_id: 11, department_name: "แผนก A1",
    effective_from: "2025-10-01", effective_to: "2026-01-20",
  },
  {
    id: 12, device_id: 1,
    building_id: 20, building_name: "ตึก B", floor_id: 200, floor_name: "ชั้น 2", location: "ห้อง B",
    division_id: 2, division_name: "ฝ่าย B", department_id: 21, department_name: "แผนก B1",
    effective_from: "2026-01-20", effective_to: null,
  },
];

/** ยอดของเครื่องที่ย้าย — ต.ค.–ธ.ค. อยู่ A, ม.ค. เป็นต้นไปอยู่ B (เดือนที่ย้ายเป็นของที่ใหม่) */
const MOVED_READINGS = [
  { device_id: 1, month: "2025-10", pages_printed: 100, location_history_id: 11 },
  { device_id: 1, month: "2025-11", pages_printed: 0, location_history_id: 11 },
  { device_id: 1, month: "2025-12", pages_printed: 30, location_history_id: 11 },
  { device_id: 1, month: "2026-01", pages_printed: 50, location_history_id: 12 },
];

let data;

function respond(path) {
  if (path === "/fiscal-years") return { data: FISCAL_YEARS };
  if (path === "/devices") return { data: data.devices };
  if (path === "/devices/location-history") return { data: data.history };
  if (path === "/dashboard/monthly-kpi") return { data: data.readings };
  return { data: [] };
}

beforeEach(() => {
  data = { devices: [MOVED], history: MOVED_HISTORY, readings: MOVED_READINGS };
  get.mockReset();
  get.mockImplementation(async (path) => respond(path));
  fiscalYearState.list = FISCAL_YEARS;
  fiscalYearState.activeId = 2;
});

// เทสที่ล้มก่อนถึงบรรทัดสุดท้ายต้องไม่ทิ้ง watcher ของหน้าไว้ยิงคำขอใส่เทสถัดไป
const mounted = [];

afterEach(() => {
  while (mounted.length) mounted.pop().unmount();
  fiscalYearState.activeId = null;
});

async function mountReport() {
  const wrapper = mount(Report, { shallow: true, global: { stubs: { RouterLink: true } } });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

const totalOf = (rows) => rows.reduce((sum, row) => sum + (row._total ?? 0), 0);
const column = (wrapper, key) => wrapper.vm.columns.find((col) => col.key === key);

describe("ยอดของเครื่องที่ย้ายอยู่กับหน่วยงานของเดือนนั้น (R02)", () => {
  test("กรองฝ่ายเดิมยังเห็นยอดตอนที่เครื่องอยู่ที่นั่น", async () => {
    const wrapper = await mountReport();
    wrapper.vm.filters.division = "ฝ่าย A";
    await nextTick();

    expect(wrapper.vm.reportRows).toHaveLength(1);
    expect(wrapper.vm.reportRows[0].division_name).toBe("ฝ่าย A");
    expect(wrapper.vm.reportRows[0]._total).toBe(130);
  });

  test("กรองฝ่ายปัจจุบันไม่พ่วงแถวของฝ่ายเดิม", async () => {
    const wrapper = await mountReport();
    wrapper.vm.filters.division = "ฝ่าย B";
    await nextTick();

    expect(wrapper.vm.reportRows.map((row) => row.division_name)).toEqual(["ฝ่าย B"]);
    expect(wrapper.vm.reportRows[0]._total).toBe(50);
  });

  test("กรองแผนกและอาคารก็ใช้ที่ตั้งของช่วงนั้นเช่นกัน", async () => {
    const wrapper = await mountReport();
    wrapper.vm.filters.building = "ตึก A";
    await nextTick();
    expect(wrapper.vm.reportRows.map((row) => row.department_name)).toEqual(["แผนก A1"]);
  });

  test("สองฝ่ายรวมกันเท่ายอดทั้งหมดของเครื่อง ไม่เกินและไม่หาย", async () => {
    const wrapper = await mountReport();
    expect(totalOf(wrapper.vm.reportRows)).toBe(180);
  });
});

describe("หนึ่งเครื่องหนึ่งเดือนนับครั้งเดียว (R03)", () => {
  test("ช่วงประวัติที่ซ้อนกันไม่ทำให้ยอดถูกนับซ้ำ", async () => {
    data.devices = [{ ...MOVED, id: 2, serial_number: "SN-OVERLAP" }];
    data.history = [
      { ...MOVED_HISTORY[0], id: 21, device_id: 2, effective_from: "2025-10-01", effective_to: null },
      { ...MOVED_HISTORY[1], id: 22, device_id: 2, effective_from: "2026-01-01", effective_to: null },
    ];
    data.readings = [{ device_id: 2, month: "2026-01", pages_printed: 100, location_history_id: 22 }];

    const wrapper = await mountReport();
    expect(totalOf(wrapper.vm.reportRows)).toBe(100);
    // ช่วงที่เริ่มทีหลังชนะ (ADR-0014 ข้อ 2)
    const owner = wrapper.vm.reportRows.find((row) => row._monthly["2026-01"] === 100);
    expect(owner.division_name).toBe("ฝ่าย B");
  });

  test("เดือนก่อนมีประวัติใช้ที่ตั้งปัจจุบัน ไม่หายจากรายงาน (ADR-0014 ข้อ 4)", async () => {
    data.history = [
      { ...MOVED_HISTORY[0], effective_from: "2025-11-01" },
      MOVED_HISTORY[1],
    ];
    data.readings = [
      { device_id: 1, month: "2025-10", pages_printed: 70, location_history_id: null },
      ...MOVED_READINGS.slice(1),
    ];

    const wrapper = await mountReport();
    expect(totalOf(wrapper.vm.reportRows)).toBe(150);
  });
});

describe("Excel แยกเดือนที่ไม่มียอดออกจากศูนย์จริง (R01)", () => {
  test("เดือนที่ไม่มียอดเป็นช่องว่าง ส่วน 0 ที่บันทึกจริงยังเป็นตัวเลข 0", async () => {
    const wrapper = await mountReport();
    const rowA = wrapper.vm.reportRows.find((row) => row.division_name === "ฝ่าย A");
    const rowB = wrapper.vm.reportRows.find((row) => row.division_name === "ฝ่าย B");

    expect(column(wrapper, "m_2025-11").csv(rowA)).toBe(0);
    expect(column(wrapper, "m_2026-02").csv(rowB)).toBeNull();
    // เดือนที่เครื่องไม่ได้อยู่ที่นี่ก็ไม่ใช่ศูนย์
    expect(column(wrapper, "m_2026-01").csv(rowA)).toBeNull();
  });

  test("แถวที่ยังไม่มียอดเลยไม่ส่งยอดรวมเป็นศูนย์", async () => {
    data.readings = [];
    const wrapper = await mountReport();
    const total = column(wrapper, "total_pages");
    for (const row of wrapper.vm.reportRows) expect(total.csv(row)).toBeNull();
  });
});

describe("สถานะยอดนับเฉพาะเดือนของแถวนั้น (R04)", () => {
  test("ช่วงที่อยู่ฝ่าย A มียอดครบทุกเดือนของช่วง ไม่ถูกนับว่าขาดเพราะอีก 9 เดือนอยู่ที่อื่น", async () => {
    const wrapper = await mountReport();
    wrapper.vm.filters.fillStatus = "done";
    await nextTick();

    expect(wrapper.vm.reportRows.map((row) => row.division_name)).toEqual(["ฝ่าย A"]);
  });

  test("นับตามเดือนที่เลือกแสดง ไม่ใช่ทั้งปีงบเสมอ", async () => {
    const wrapper = await mountReport();
    wrapper.vm.reportMonths = ["2026-01"];
    wrapper.vm.filters.fillStatus = "done";
    await nextTick();

    expect(wrapper.vm.reportRows.map((row) => row.division_name)).toEqual(["ฝ่าย B"]);
  });
});

describe("สลับปีงบเร็วๆ ไม่เห็นยอดปีเก่าใต้ปีใหม่ (R05)", () => {
  test("คำตอบของปีเก่าที่มาช้ากว่าไม่ทับผลของปีที่เลือกล่าสุด", async () => {
    const wrapper = await mountReport();

    const pending = [];
    get.mockImplementation((path, config) =>
      path === "/dashboard/monthly-kpi"
        ? new Promise((resolve) => pending.push({ months: config.params.month, resolve }))
        : Promise.resolve(respond(path))
    );

    fiscalYearState.activeId = 1;
    await flushPromises();
    fiscalYearState.activeId = 2;
    await flushPromises();
    expect(pending.map((request) => request.months.slice(0, 7))).toEqual(["2024-10", "2025-10"]);

    pending[1].resolve({ data: [{ device_id: 1, month: "2026-01", pages_printed: 200, location_history_id: 12 }] });
    await flushPromises();
    pending[0].resolve({ data: [{ device_id: 1, month: "2025-01", pages_printed: 999, location_history_id: null }] });
    await flushPromises();

    expect(totalOf(wrapper.vm.reportRows)).toBe(200);
    expect(wrapper.vm.loading).toBe(false);
  });
});
