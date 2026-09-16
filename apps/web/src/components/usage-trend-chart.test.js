// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from "vitest";
import { ref } from "vue";
import { shallowMount } from "@vue/test-utils";
import { fiscalYearMonths } from "@suth/domain";

const data = ref([]);
vi.mock("../api/queries", () => ({
  useMonthlyKpi: () => ({ data, isPending: ref(false), isFetching: ref(false), isError: ref(false), refetch: vi.fn() }),
}));
vi.mock("../store/fiscalYear", () => ({
  activeFiscalYearRange: ref({ startMonth: "2025-10", endMonth: "2026-09" }),
  fiscalYearMonths,
}));
const { default: UsageTrendChart } = await import("./UsageTrendChart.vue");

beforeEach(() => {
  data.value = [
    { month: "2026-01", net_pages: 0, total_cost: 0 },
    { month: "2025-10", net_pages: 98, total_cost: 44.1 },
    { month: "2025-10", net_pages: 196, total_cost: 88.2 },
    { month: "2025-09", net_pages: 980, total_cost: 441 },
    { month: "2026-10", net_pages: 980, total_cost: 441 },
  ];
});

test("omits absent months, retains recorded zero, and respects fiscal boundaries", () => {
  const wrapper = shallowMount(UsageTrendChart, { props: { metric: "cost" } });
  const chart = wrapper.findComponent({ name: "UiChart" });
  expect(chart.props("labels")).toHaveLength(2);
  expect(chart.props("series")[0].data).toEqual([132.3, 0]);
  expect(chart.props("kind")).toBe("bar");
  wrapper.unmount();
});

test("filters selected months without inventing missing records and switches units", async () => {
  const wrapper = shallowMount(UsageTrendChart, { props: { filter: { month: "2026-01,2025-12,2025-10" }, metric: "cost" } });
  await wrapper.setProps({ metric: "pages" });
  const chart = wrapper.findComponent({ name: "UiChart" });
  expect(chart.props("series")[0].data).toEqual([294, 0]);
  expect(chart.props("kind")).toBe("line");
  wrapper.unmount();
});

test("shows an empty state for a selection with no recorded data", () => {
  const wrapper = shallowMount(UsageTrendChart, { props: { filter: { month: "2025-12" } } });
  expect(wrapper.findComponent({ name: "UiChart" }).exists()).toBe(false);
  expect(wrapper.findComponent({ name: "UiEmpty" }).exists()).toBe(true);
  wrapper.unmount();
});
