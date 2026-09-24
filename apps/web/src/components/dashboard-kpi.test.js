import { describe, expect, it } from "vitest";
import { dashboardKpis, monthlyTrend, previousYearMonths, topShare } from "./dashboard-kpi";

const row = (month, device, pages, cost, extra = {}) => ({ month, device_id: device, pages_printed: pages, net_pages: pages * 0.98, total_cost: cost, ...extra });

describe("dashboard-kpi (#197)", () => {
  it("เดือนเดียวกันของปีงบก่อน — ข้ามปีปฏิทินได้", () => {
    expect(previousYearMonths(["2025-10", "2026-01", "2026-09"])).toEqual(["2024-10", "2025-01", "2025-09"]);
  });

  it("เส้นแนวโน้มเริ่มที่เดือนแรกที่มีข้อมูล จบที่เดือนล่าสุด — เดือนว่างตรงกลางเป็นศูนย์", () => {
    const rows = [row("2026-03", 1, 100, "10.00"), row("2026-05", 1, 300, "30.00")];
    const months = ["2025-10", "2025-11", "2026-03", "2026-04", "2026-05", "2026-06"];
    expect(monthlyTrend(rows, months, (s) => s.rawPages)).toEqual([100, 0, 300]);
    expect(monthlyTrend([], months, (s) => s.rawPages)).toEqual([]);
  });

  it("เทียบกับปีก่อนเป็นเปอร์เซ็นต์ และเฉลี่ยหน้าละคิดจากยอดพิมพ์หลังหัก 2%", () => {
    const rows = [row("2026-03", 1, 1000, "490.00"), row("2026-03", 2, 1000, "490.00")];
    const previous = [row("2025-03", 1, 1000, "490.00")];
    const k = dashboardKpis({ rows, previousRows: previous, months: ["2026-03"] });
    expect(k.comparable).toBe(true);
    expect(k.cost.delta).toBeCloseTo(100);
    expect(k.pages.delta).toBeCloseTo(100);
    expect(k.devices.delta).toBeCloseTo(100);
    expect(k.perPage.value).toBeCloseTo(0.5);
    expect(k.perPage.delta).toBeCloseTo(0);
  });

  it("ไม่มีข้อมูลปีก่อน = ไม่มีผลต่าง ไม่ใช่ +100%", () => {
    const k = dashboardKpis({ rows: [row("2026-03", 1, 10, "4.90")], previousRows: [], months: ["2026-03"] });
    expect(k.comparable).toBe(false);
    expect(k.cost.delta).toBeNull();
    expect(dashboardKpis({ rows: [], previousRows: null, months: [] }).perPage.value).toBeNull();
  });

  it("อันดับพร้อมสัดส่วน เรียงมากไปน้อย ตัดที่ limit และนับที่เหลือ", () => {
    const summary = (cost, readings = 1) => ({ cost, rawPages: cost * 10, readings });
    const model = { entries: [
      { key: "a", displayLabel: "ก", summary: summary(30) },
      { key: "b", displayLabel: "ข", summary: summary(60) },
      { key: "c", displayLabel: "ค", summary: summary(10) },
      { key: "z", displayLabel: "ไม่มียอด", summary: summary(0, 0) },
    ] };
    const top = topShare(model, { limit: 2 });
    expect(top.entries.map((e) => [e.key, e.share])).toEqual([["b", 0.6], ["a", 0.3]]);
    expect(top.others).toBe(1);
    expect(topShare(model, { metric: "rawPages", limit: 1 }).entries[0].value).toBe(600);
  });
});
