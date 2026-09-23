// @vitest-environment jsdom
//
// ตัวช่วยไฟล์ตัวอย่าง และส่วนยอดมิเตอร์ของหน้านำเข้า — ตรวจรายการที่จะเขียนทับได้ครบก่อนยืนยัน (#106, #180)

import { afterEach, describe, expect, test, vi } from "vitest";
import { meterHeader, overwriteCsv, recentMonths, templateCsv } from "./print-usage-import";

const { mount } = await import("@vue/test-utils");
const ImportReadings = (await import("./import/ImportReadings.vue")).default;

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

describe("ยอดที่จะเขียนในหน้านำเข้า (#180)", () => {
  const mounted = [];
  afterEach(() => { while (mounted.length) mounted.pop().unmount(); });

  const overwrite = Array.from({ length: 12 }, (_, i) => ({ serial_number: `SN-${i + 1}`, meter: "primary", month: "2025-11", previous_pages: 10, pages: 20 }));
  const readings = (extra = {}) => ({
    status: "checked",
    months: ["2025-10", "2025-11"],
    counts: { new: 0, overwrite: overwrite.length, unchanged: 0 },
    overwrite_rows: overwrite,
    error_count: 0,
    errors: [],
    warning_count: 0,
    warnings: [],
    invoice: [],
    ...extra,
  });

  function view(props) {
    const wrapper = mount(ImportReadings, { props });
    mounted.push(wrapper);
    return wrapper;
  }

  test("บอกงวดที่พบในไฟล์ก่อนยืนยัน", () => {
    const wrapper = view({ readings: readings() });
    expect(wrapper.text()).toContain("ต.ค. 2568");
    expect(wrapper.text()).toContain("พ.ย. 2568");
  });

  test("รายการเขียนทับเกิน 10 แถวกดดูครบได้ในหน้าเดียวกัน", async () => {
    const wrapper = view({ readings: readings() });
    const rows = () => wrapper.findAll("[data-testid=overwrite-row]");
    expect(rows()).toHaveLength(10);
    await wrapper.get("[data-testid=show-all-overwrites]").trigger("click");
    expect(rows()).toHaveLength(12);
  });

  test("ยอดตามใบแจ้งหนี้ที่ต่างจากท้ายแผ่นเกิน 1 สตางค์ถูกไฮไลต์ ที่ต่าง 1 สตางค์ไม่ถูก", () => {
    const wrapper = view({
      readings: readings({ overwrite_rows: [] }),
      reconciliation: [
        { contract_no: "T", month: "2026-05", basis: "invoice", file_total: "111012.29", system_total: "111012.30", diff: "0.01", matches: true },
        { contract_no: "T", month: "2026-06", basis: "invoice", file_total: "104133.99", system_total: "101800.34", diff: "-2333.65", matches: false },
      ],
    });
    const lines = wrapper.get("[data-testid=reconciliation]").findAll("tbody tr");
    expect(lines[0].classes()).not.toContain("bg-warn-soft");
    expect(lines[1].classes()).toContain("bg-warn-soft");
  });

  test("ยอดที่ต้องแก้บอกจำนวนทั้งหมด แม้รายการที่เก็บไว้มีไม่ครบ", () => {
    const wrapper = view({ readings: readings({ error_count: 450, errors: [{ sheet: "S1", row: 3, serial_number: "TX9-1", month: "2026-05", reason: "ไม่พบเครื่อง" }] }) });
    expect(wrapper.get("[data-testid=readings-errors]").text()).toContain("450");
  });
});
