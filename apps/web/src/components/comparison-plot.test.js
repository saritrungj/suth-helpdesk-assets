import { expect, test } from "vitest";
import { buildComparison, buildYearComparison } from "./comparison";
import { comparisonPlot } from "./comparison-plot";

const row = (overrides = {}) => ({ device_id: 1, division_id: 1, division_name: "A", month: "2025-10", pages_printed: 10, net_pages: 9.8, total_cost: "0.10", ...overrides });

test("total includes unselected groups, uses satang and preserves missing/recorded-zero months", () => {
  const model = buildComparison({ rows: [row(), row({ division_id: 2, total_cost: "0.20" }), row({ month: "2025-11", pages_printed: 0, total_cost: "0.00" })], dimension: "division", months: ["2025-10", "2025-11", "2025-12"] });
  expect(comparisonPlot(model, ["1"], new Map()).series[0]).toMatchObject({ reference: true, values: [0.3, 0, null] });
  expect(comparisonPlot(model, [], new Map()).series).toHaveLength(1);
  expect(comparisonPlot(model, [], new Map()).series[0].values).toEqual([0.3, 0, null]);
});

test("partial and wholly unpriced money have explicit monthly notes, pages remain complete", () => {
  const model = buildComparison({ rows: [row(), row({ division_id: 2, total_cost: null }), row({ month: "2025-11", total_cost: null })], dimension: "division" });
  const plot = comparisonPlot(model, ["2"], new Map());
  expect(plot.series[0].values).toEqual([0.1, null]);
  expect(plot.notes[0]).toContain("เฉพาะรายการที่มีราคา");
  expect(plot.notes[1]).toContain("ยังคำนวณไม่ได้");
  const pages = comparisonPlot({ ...model, metric: "rawPages" }, [], new Map());
  expect(pages.series[0].values).toEqual([20, 10]);
  expect(pages.notes).toEqual({});
});

test("different fiscal years retain separate lines without a misleading cross-year total", () => {
  const model = buildYearComparison({ rows: [row(), row({ month: "2024-10" })], years: [2568, 2569] });
  const plot = comparisonPlot(model, model.entries.map((entry) => entry.key), new Map());
  expect(plot.series).toHaveLength(2);
  expect(plot.series.some((series) => series.reference)).toBe(false);
});
