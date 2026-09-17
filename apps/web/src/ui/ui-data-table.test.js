// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { expect, test } from "vitest";
import UiDataTable from "./UiDataTable.vue";

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
