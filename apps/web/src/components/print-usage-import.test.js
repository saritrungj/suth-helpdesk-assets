// @vitest-environment jsdom
//
// หน้าตรวจไฟล์นำเข้ายอดพิมพ์ — ตรวจรายการที่จะเขียนทับได้ครบก่อนยืนยัน (#106)

import { afterEach, describe, expect, test, vi } from "vitest";
import { meterHeader, overwriteCsv, recentMonths, templateCsv } from "./print-usage-import";

const post = vi.fn();
vi.mock("../services/api", () => ({ default: { post: (...a) => post(...a) } }));

const { mount, flushPromises } = await import("@vue/test-utils");
const PrintUsageImportPanel = (await import("./PrintUsageImportPanel.vue")).default;

describe("ไฟล์ตัวอย่างใช้เดือนล่าสุด ไม่ตรึงเดือนเก่า", () => {
  test("หัวคอลัมน์เป็นเดือน/ปี พ.ศ. 2 หลักแบบที่ API อ่านได้", () => {
    expect(meterHeader("2025-10")).toBe("meter 10/68");
    expect(meterHeader("2026-01")).toBe("meter 1/69");
  });

  test("สามเดือนล่าสุดนับถอยข้ามปีได้", () => {
    expect(recentMonths("2026-01", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });

  test("ไฟล์ตัวอย่างมีหัว SN. ตามด้วยเดือนที่ส่งมา ไม่ใช่ 10/67–12/67", () => {
    const [header] = templateCsv(["2026-07", "2026-08", "2026-09"]).split("\r\n");
    expect(header).toBe("SN.,meter 7/69,meter 8/69,meter 9/69");
  });
});

test("รายการที่จะเขียนทับส่งออกครบทุกแถว พร้อมค่าเดิมและค่าใหม่", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ serial_number: `00${i}`, month: "2025-10", previous_pages: i, pages: i + 1 }));
  const lines = overwriteCsv(rows).split("\r\n");
  expect(lines).toHaveLength(13);
  expect(lines[1]).toContain("000");
});

describe("หน้าตรวจไฟล์", () => {
  const mounted = [];
  afterEach(() => { while (mounted.length) mounted.pop().unmount(); });

  async function previewWith(data) {
    post.mockResolvedValue({ data });
    const wrapper = mount(PrintUsageImportPanel, { global: { stubs: { FileDropzone: true } } });
    mounted.push(wrapper);
    wrapper.vm.selectFile(new File(["x"], "meter.xlsx"));
    await wrapper.vm.inspectFile();
    await flushPromises();
    return wrapper;
  }

  const overwrite = Array.from({ length: 12 }, (_, i) => ({ device_id: i + 1, serial_number: `SN-${i + 1}`, month: "2025-11", previous_pages: 10, pages: 20 }));

  test("บอกเดือนที่พบในไฟล์ก่อนยืนยัน", async () => {
    const wrapper = await previewWith({ valid: true, preview_token: "t", months_found: ["2025-10", "2025-11"], new_rows: [], overwrite_rows: overwrite, unchanged_rows: [], errors: [] });
    expect(wrapper.text()).toContain("ต.ค. 2568");
    expect(wrapper.text()).toContain("พ.ย. 2568");
  });

  test("รายการเขียนทับเกิน 10 แถวกดดูครบได้ในหน้าเดียวกัน", async () => {
    const wrapper = await previewWith({ valid: true, preview_token: "t", months_found: ["2025-11"], new_rows: [], overwrite_rows: overwrite, unchanged_rows: [], errors: [] });
    const rows = () => wrapper.findAll("[data-testid=overwrite-row]");
    expect(rows()).toHaveLength(10);
    await wrapper.get("[data-testid=show-all-overwrites]").trigger("click");
    expect(rows()).toHaveLength(12);
  });

  test("ไฟล์ผู้ให้เช่าแสดงแผ่นงาน คำเตือน และยอดตามใบแจ้งหนี้ก่อนยืนยัน", async () => {
    const wrapper = await previewWith({
      valid: true,
      preview_token: "t",
      months_found: ["2026-03"],
      new_rows: [{ device_id: 1 }],
      overwrite_rows: [],
      unchanged_rows: [],
      errors: [],
      sheets: [{ sheet: "งวด 24", month: "2026-03", period_start: "2026-02-24", period_end: "2026-03-23", contract_no: "SUTH192/2568" }],
      warnings: [{ sheet: "งวด 24", row: 8, serial_number: "SN-1", month: "2026-03", reason: "เลขต้นงวดไม่ต่อเนื่อง" }],
      invoice: [{ month: "2026-03", contract_no: "SUTH192/2568", category: "A3 สี", price_per_page: "3.9000", pages: 100, net_pages: "98.00", line_total: "382.20" }],
    });

    expect(wrapper.get("[data-testid=source-sheet]").text()).toContain("งวด 24");
    expect(wrapper.get("[data-testid=source-sheet]").text()).toContain("SUTH192/2568");
    expect(wrapper.get("[data-testid=import-warning]").text()).toContain("เลขต้นงวดไม่ต่อเนื่อง");
    expect(wrapper.get("[data-testid=invoice-line]").text()).toContain("A3 สี");
    expect(wrapper.get("[data-testid=invoice-line]").text()).toContain("382.20");
  });

  test("ข้อผิดพลาดระบุชื่อแผ่นงาน", async () => {
    const wrapper = await previewWith({
      valid: false,
      preview_token: null,
      months_found: [],
      new_rows: [],
      overwrite_rows: [],
      unchanged_rows: [],
      errors: [{ sheet: "งวด 25", row: 9, serial_number: "SN-2", reason: "ไม่พบเครื่อง" }],
    });
    expect(wrapper.text()).toContain("งวด 25");
    expect(wrapper.text()).toContain("ไม่พบเครื่อง");
  });
});
