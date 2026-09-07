import { describe, test, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";

// จับว่าแต่ละ hook ส่ง option อะไรให้ useQuery — เทสนี้ตรวจ "การตั้งค่า" ไม่ใช่การดึงข้อมูล
const calls = [];

vi.mock("@tanstack/vue-query", () => ({
  useQuery: (options) => {
    calls.push(options);
    return { data: ref(null) };
  },
}));

vi.mock("../services/api", () => ({ default: { get: vi.fn() } }));

const queries = await import("./queries");

beforeEach(() => {
  calls.length = 0;
});

/** เรียก hook แล้วคืน option ที่มันส่งให้ useQuery */
function optionsOf(hook, ...args) {
  hook(...args);
  return calls.at(-1);
}

describe("จอที่เปิดค้างไว้ต้องอัปเดตเอง (issue #15/#27)", () => {
  const LIVE_HOOKS = [
    ["useOverview", () => queries.useOverview({})],
    ["useMonthlyKpi", () => queries.useMonthlyKpi({})],
    ["useSummaryByBuilding", () => queries.useSummaryByBuilding({})],
  ];

  for (const [name, call] of LIVE_HOOKS) {
    test(`${name} ต้องตั้ง refetchInterval — staleTime อย่างเดียวไม่ทำให้ดึงใหม่`, () => {
      const options = optionsOf(call);

      expect(options.refetchInterval, name).toBeGreaterThan(0);
    });

    test(`${name} ต้องไม่ยิงตอนแท็บถูกซ่อน — ไม่งั้นแท็บที่ลืมเปิดทิ้งไว้ยิงทั้งวัน`, () => {
      const options = optionsOf(call);

      expect(options.refetchIntervalInBackground, name).toBe(false);
    });
  }

  const FORM_HOOKS = [
    ["useCoverage", () => queries.useCoverage(1)],
    ["useMonthPages", () => queries.useMonthPages("2568-10")],
  ];

  for (const [name, call] of FORM_HOOKS) {
    test(`${name} ต้องไม่มี polling — หน้ากรอกยอดใช้ตัวนี้ ข้อมูลขยับเองระหว่างพิมพ์ไม่ได้`, () => {
      const options = optionsOf(call);

      expect(options.refetchInterval, name).toBeUndefined();
    });
  }

  test("ข้อมูลอ้างอิงก็ต้องไม่ polling — แทบไม่เปลี่ยน และหน้ากรอกก็ใช้", () => {
    const options = optionsOf(() => queries.useBuildings());

    expect(options.refetchInterval).toBeUndefined();
  });
});
