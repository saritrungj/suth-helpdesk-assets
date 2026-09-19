// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { expect, test, vi } from "vitest";

const exportSheet = vi.fn(async () => {});
vi.mock("../lib/export-xlsx", () => ({ exportSheet: (...args) => exportSheet(...args) }));

const { default: UiDataTable } = await import("./UiDataTable.vue");

test("malformed saved search falls back to an empty search", () => {
  window.sessionStorage.setItem("suth:table:Master:years", JSON.stringify({ search: 42 }));
  let wrapper;
  try {
    wrapper = mount(UiDataTable, {
      global: { config: { globalProperties: { $route: { name: "Master" } } } },
      props: {
        stateKey: "years", rows: [{ id: 1, year: 2569 }],
        columns: [{ key: "year", label: "Year" }], maxHeight: "none", showExport: false,
      },
    });
    expect(wrapper.get("tbody").text()).toContain("2569");
  } finally {
    wrapper?.unmount();
    window.sessionStorage.removeItem("suth:table:Master:years");
  }
});

test("a descending default still lets the user sort years ascending", async () => {
  const wrapper = mount(UiDataTable, {
    props: {
      rows: [{ id: 1, year: 2568 }, { id: 2, year: 2569 }],
      columns: [{ key: "year", label: "Year" }],
      defaultSort: { key: "year", dir: "desc" },
      maxHeight: "none",
      showExport: false,
    },
  });
  const firstYear = () => wrapper.find("tbody tr td").text();
  expect(firstYear()).toBe("2569");
  await wrapper.get("thead button").trigger("click");
  expect(firstYear()).toBe("2568");
  await wrapper.get("thead button").trigger("click");
  expect(firstYear()).toBe("2569");
  wrapper.unmount();
});

test("export keeps a missing value as an empty cell and a recorded zero as 0", async () => {
  const wrapper = mount(UiDataTable, {
    attachTo: document.body,
    props: {
      rows: [{ id: 1, pages: 0 }, { id: 2, pages: null }],
      columns: [{ key: "pages", label: "Pages", csv: (row) => row.pages }],
      maxHeight: "none",
    },
  });
  await flushPromises();

  const button = [...document.body.querySelectorAll("button")].find((b) => b.textContent.includes("Excel"));
  button.click();
  await flushPromises();

  expect(exportSheet).toHaveBeenCalledTimes(1);
  expect(exportSheet.mock.calls[0][0].rows).toEqual([[0], [null]]);
  wrapper.unmount();
});
