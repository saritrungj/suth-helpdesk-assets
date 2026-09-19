import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { strFromU8, unzipSync } from "fflate";
import { createWorkbook } from "../lib/export-xlsx";
import { buildComparison, buildDifference } from "./comparison";
import { comparisonSheet, conditionsSheet, detailSheet, differenceSheet, exportFilename, monthsSlug } from "./comparison-export";

const row = (overrides) => ({
  device_id: 1, serial_number: "00123", brand_name: "HP", model: "M404", month: "2025-10",
  pages_printed: 100, net_pages: 98, price_per_page: "0.4275", total_cost: "41.90",
  division_id: 1, division_name: "ฝ่าย A", department_id: 10, department_name: "แผนก A1",
  billing_contract_id: 7, billing_contract_no: "0007/2569", building_name: "อาคาร 1", ...overrides,
});

const rows = [
  row({}),
  row({ month: "2025-11", pages_printed: 200, net_pages: 196, total_cost: "83.79" }),
  row({ device_id: 2, serial_number: "SN-2", division_id: 2, division_name: "ฝ่าย B", department_id: 20, department_name: "แผนก B1", pages_printed: 0, net_pages: 0, total_cost: "0.00" }),
  row({ device_id: 3, serial_number: "SN-3", month: "2025-11", division_id: 2, division_name: "ฝ่าย B", department_id: 21, department_name: "แผนก B2", pages_printed: 50, net_pages: 49, price_per_page: null, total_cost: null }),
];

async function open(sheets) {
  const bytes = await createWorkbook({ sheets });
  const workbook = XLSX.read(bytes, { type: "array", cellNF: true });
  return { bytes, workbook, files: unzipSync(bytes) };
}

describe("ไฟล์ Excel ของการเปรียบเทียบ — ไฟล์เดียวสามแผ่น", () => {
  test("แผ่นเปรียบเทียบของรายการที่เลือกมีตัวเลขชุดเดียวกับบนจอ และกราฟเส้นหนึ่งเส้นต่อรายการ", async () => {
    const model = buildComparison({ rows, dimension: "division", view: "select", items: ["1", "2"], metric: "rawPages" });
    const { workbook, files } = await open([comparisonSheet(model), detailSheet(model.scopeRows), conditionsSheet("test", [["ช่วงเวลา", "ต.ค. 2568 – พ.ย. 2568"]])]);
    expect(workbook.SheetNames).toEqual(["เปรียบเทียบ", "ข้อมูลรายละเอียด", "เงื่อนไขรายงาน"]);

    const [header, first, second] = XLSX.utils.sheet_to_json(workbook.Sheets["เปรียบเทียบ"], { header: 1, defval: null });
    expect(header).toEqual(["ฝ่าย", "ยอดพิมพ์จริง (หน้า)", "สุทธิหลังหัก 2% (หน้า)", "ค่าใช้จ่ายที่ยืนยันแล้ว (บาท)", "เครื่องที่มีข้อมูล (เครื่อง)", "รายการรอยืนยันราคา", "สถานะข้อมูล", "ต.ค. 2568", "พ.ย. 2568"]);
    expect(first).toEqual(["ฝ่าย A", 300, 294, 125.69, 1, 0, "ยืนยันราคาครบ", 100, 200]);
    expect(second).toEqual(["ฝ่าย B", 50, 49, 0, 2, 1, "รอยืนยันราคา 1 รายการ", 0, 50]);

    const chart = strFromU8(files["xl/charts/chart1.xml"]);
    expect(chart).toContain("<c:lineChart>");
    expect(chart.match(/<c:ser>/g)).toHaveLength(2);
    expect(chart).toContain("&apos;เปรียบเทียบ&apos;!$H$1:$I$1");
    expect(chart).toContain("&apos;เปรียบเทียบ&apos;!$H$3:$I$3");
  });

  test("อันดับ: กราฟแท่งแนวนอนของตัวชี้วัด และข้อมูลรายละเอียดครบทุกหน่วยงานก่อนตัดอันดับ", async () => {
    const model = buildComparison({ rows, dimension: "department", view: "rank", metric: "rawPages", limit: 5, direction: "high" });
    const { workbook, files } = await open([comparisonSheet(model), detailSheet(model.scopeRows)]);
    const table = XLSX.utils.sheet_to_json(workbook.Sheets["เปรียบเทียบ"], { header: 1, defval: null });
    expect(table.slice(1).map((line) => line.slice(0, 4))).toEqual([[1, "แผนก A1", "ฝ่าย A", 300], [2, "แผนก B2", "ฝ่าย B", 50], [3, "แผนก B1", "ฝ่าย B", 0]]);
    const chart = strFromU8(files["xl/charts/chart1.xml"]);
    expect(chart).toContain('<c:barDir val="bar"/>');
    expect(chart).toContain("&apos;เปรียบเทียบ&apos;!$B$2:$B$4");
    expect(chart).toContain("&apos;เปรียบเทียบ&apos;!$D$2:$D$4");
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["ข้อมูลรายละเอียด"])).toHaveLength(rows.length);
  });

  test("ข้อมูลรายละเอียด: เดือนเป็นวันที่ ปีงบตามกฎ ต.ค.–ก.ย. รหัสไม่เสียเลขศูนย์ และราคาที่ไม่รู้เป็นเซลล์ว่าง", async () => {
    const { workbook } = await open([detailSheet(rows)]);
    const sheet = workbook.Sheets["ข้อมูลรายละเอียด"];
    expect(sheet.A2).toMatchObject({ t: "n", v: 45931 });
    expect(sheet.B2).toMatchObject({ t: "n", v: 2569 });
    expect(sheet.C2).toMatchObject({ t: "s", v: "00123" });
    expect(sheet.H2).toMatchObject({ t: "s", v: "0007/2569" });
    expect(sheet.L2).toMatchObject({ t: "n", v: 0.4275 });
    const unpriced = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }).find((line) => line[2] === "SN-3");
    expect(unpriced.slice(9)).toEqual([50, 49, null, null, "ยังยืนยันราคาไม่ได้"]);
    expect(sheet["!autofilter"]).toEqual({ ref: "A1:N5" });
  });

  test("ส่วนต่างในไฟล์ใช้ค่าเดียวกับหน้าจอ: เปอร์เซ็นต์เป็นสัดส่วนจริง ฐานศูนย์ไม่มีเปอร์เซ็นต์", async () => {
    const model = buildDifference({
      dimension: "department", basis: "units", items: ["20", "10", "21"], baseKey: "20", metric: "rawPages",
      current: { months: ["2025-10", "2025-11"], rows },
    });
    const { workbook, files } = await open([differenceSheet(model, { title: "ส่วนต่าง" })]);
    const table = XLSX.utils.sheet_to_json(workbook.Sheets["เปรียบเทียบ"], { header: 1, defval: null });
    expect(table[0]).toEqual(["แผนก", "ฝ่าย", "บทบาทในการเทียบ", "ยอดพิมพ์จริง (หน้า)", "สุทธิหลังหัก 2% (หน้า)", "ส่วนต่าง (หน้า)", "ส่วนต่าง (%)", "หมายเหตุการเทียบ", "เครื่องที่มีข้อมูล (เครื่อง)", "สถานะข้อมูล"]);
    expect(table[1].slice(2, 8)).toEqual(["ฐาน", 0, 0, null, null, "รายการฐาน"]);
    expect(table[2].slice(2, 8)).toEqual(["เทียบกับฐาน", 300, 294, 300, null, "ฐานเป็นศูนย์ แสดงเฉพาะส่วนต่างจริง ไม่คิดเปอร์เซ็นต์"]);
    expect(strFromU8(files["xl/charts/chart1.xml"])).toContain("&apos;เปรียบเทียบ&apos;!$D$2:$D$4");
  });

  test("ช่วง A/B ของยอดพิมพ์แสดงยอดจริงคู่กับยอดสุทธิทั้งสองช่วง", async () => {
    const reference = { months: ["2024-10"], rows: [row({ month: "2024-10", pages_printed: 150, net_pages: 147 })] };
    const model = buildDifference({ dimension: "division", basis: "periods", items: ["1"], metric: "rawPages", current: { months: ["2025-10", "2025-11"], rows }, reference });
    const { workbook } = await open([differenceSheet(model, { title: "A/B", currentLabel: "ช่วงที่ดู", referenceLabel: "ช่วงฐาน" })]);
    const table = XLSX.utils.sheet_to_json(workbook.Sheets["เปรียบเทียบ"], { header: 1, defval: null });
    expect(table[0].slice(0, 5)).toEqual(["ฝ่าย", "ช่วงฐาน (หน้า)", "สุทธิหลังหัก 2% — ช่วงฐาน (หน้า)", "ช่วงที่ดู (หน้า)", "สุทธิหลังหัก 2% — ช่วงที่ดู (หน้า)"]);
    expect(table[1].slice(0, 5)).toEqual(["ฝ่าย A", 150, 147, 300, 294]);
  });

  test("ช่วง A/B: สองคอลัมน์ค่าและกราฟสองชุด เปอร์เซ็นต์มีรูปแบบ %", async () => {
    const reference = { months: ["2024-10"], rows: [row({ month: "2024-10", pages_printed: 150, net_pages: 147, total_cost: "62.84" })] };
    const model = buildDifference({ dimension: "division", basis: "periods", items: ["1"], metric: "cost", current: { months: ["2025-10", "2025-11"], rows }, reference });
    const { workbook, files } = await open([differenceSheet(model, { title: "A/B", currentLabel: "ช่วงที่ดู", referenceLabel: "ช่วงฐาน" })]);
    const sheet = workbook.Sheets["เปรียบเทียบ"];
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })[1].slice(0, 5)).toEqual(["ฝ่าย A", 62.84, 125.69, 62.85, 62.85 / 62.84]);
    expect(sheet.E2.z).toBe("0.0%");
    expect(strFromU8(files["xl/charts/chart1.xml"]).match(/<c:ser>/g)).toHaveLength(2);
  });

  test("ชื่อไฟล์บอกขอบเขตเป็น ASCII", () => {
    expect(exportFilename(["print-comparison", "fy2569", monthsSlug(["2025-11", "2025-10"]), "department", "rank"]))
      .toBe("print-comparison-fy2569-2025-10_2025-11-department-rank");
    expect(monthsSlug([], ["2025-10"])).toBe("full-year");
  });
});
