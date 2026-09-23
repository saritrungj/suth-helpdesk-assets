import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { strFromU8, unzipSync } from "fflate";
import { createWorkbook } from "../lib/export-xlsx";
import { buildComparison } from "./comparison";
import { comparisonSheet, conditionsSheet, detailSheet, exportFilename, monthsSlug, rankingSheet, summarySheet } from "./comparison-export";

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
  row({ device_id: 3, serial_number: "SN-3", month: "2025-11", division_id: 2, division_name: "ฝ่าย B", department_id: 21, department_name: "แผนก B2", pages_printed: 50, net_pages: 49, total_cost: "20.95" }),
];

async function open(sheets) {
  const bytes = await createWorkbook({ sheets });
  const workbook = XLSX.read(bytes, { type: "array", cellNF: true });
  return { bytes, workbook, files: unzipSync(bytes) };
}

describe("ไฟล์ Excel ของการเปรียบเทียบ — ไฟล์เดียวสามแผ่น", () => {
  test("แผ่นสรุปมีค่าเฉลี่ยจากยอดที่บันทึกได้ทั้งหมด", () => {
    const summary = summarySheet(rows);
    expect(summary.header[5]).toBe("บาทต่อเครื่อง");
    expect(summary.rows[0][5]).toBeCloseTo(146.64 / 3);
    expect(summary.header).not.toContain("รายการรอยืนยันราคา");
  });

  test("แผ่นเปรียบเทียบของรายการที่เลือกมีตัวเลขชุดเดียวกับบนจอ และกราฟเส้นหนึ่งเส้นต่อรายการ", async () => {
    const model = buildComparison({ rows, dimension: "division", include: ["1", "2"], metric: "rawPages" });
    const { workbook, files } = await open([comparisonSheet(model), detailSheet(model.scopeRows), conditionsSheet("test", [["ช่วงเวลา", "ต.ค. 2568 – พ.ย. 2568"]])]);
    expect(workbook.SheetNames).toEqual(["เปรียบเทียบ", "ข้อมูลรายละเอียด", "เงื่อนไขรายงาน"]);

    const [header, first, second] = XLSX.utils.sheet_to_json(workbook.Sheets["เปรียบเทียบ"], { header: 1, defval: null });
    expect(header).toEqual(["ฝ่าย", "หน้าที่พิมพ์", "หน้าที่คิดเงิน", "ค่าใช้จ่าย (บาท)", "เครื่องที่มีข้อมูล (เครื่อง)", "ต.ค. 2568", "พ.ย. 2568"]);
    expect(first).toEqual(["ฝ่าย A", 300, 294, 125.69, 1, 100, 200]);
    expect(second).toEqual(["ฝ่าย B", 50, 49, 20.95, 2, 0, 50]);

    const chart = strFromU8(files["xl/charts/chart1.xml"]);
    expect(chart).toContain("<c:lineChart>");
    expect(chart.match(/<c:ser>/g)).toHaveLength(2);
    expect(chart).toContain("&apos;เปรียบเทียบ&apos;!$F$1:$G$1");
    expect(chart).toContain("&apos;เปรียบเทียบ&apos;!$F$3:$G$3");
  });

  test("แผ่นอันดับ: ทุกหน่วยงานเรียงมาก→น้อยแม้เลือกไว้รายการเดียว พร้อมกราฟแท่งแนวนอนใบเดียว (#115)", async () => {
    const model = buildComparison({ rows, dimension: "department", include: ["20"], metric: "rawPages" });
    const { workbook, files } = await open([comparisonSheet(model), rankingSheet(model), detailSheet(model.scopeRows)]);
    expect(workbook.SheetNames).toEqual(["เปรียบเทียบ", "อันดับ", "ข้อมูลรายละเอียด"]);
    const table = XLSX.utils.sheet_to_json(workbook.Sheets["อันดับ"], { header: 1, defval: null });
    expect(table.slice(1).map((line) => line.slice(0, 4))).toEqual([[1, "แผนก A1", "ฝ่าย A", 300], [2, "แผนก B2", "ฝ่าย B", 50], [3, "แผนก B1", "ฝ่าย B", 0]]);
    // กราฟใบแรกเป็นของแผ่นเปรียบเทียบ ใบที่สองของแผ่นอันดับ — ไม่ถึงสิบรายการได้ใบเดียวที่มีครบ
    // ทุกรายการ ถ้าแบ่งเป็นมากสุด/น้อยสุดจะได้สองใบที่ครอบแถวชุดเดียวกันแต่ติดป้ายขัดกันเอง
    const chart = strFromU8(files["xl/charts/chart2.xml"]);
    expect(files["xl/charts/chart3.xml"]).toBeUndefined();
    expect(chart).toContain("ทั้งหมด 3 รายการ");
    expect(chart).not.toContain("มากสุด");
    expect(chart).toContain('<c:barDir val="bar"/>');
    expect(chart).toContain("&apos;อันดับ&apos;!$B$2:$B$4");
    expect(chart).toContain("&apos;อันดับ&apos;!$D$2:$D$4");
  });

  test("แผ่นอันดับที่มีเกินสิบรายการมีกราฟ 10 อันดับแรกและ 10 อันดับท้ายในแผ่นเดียว", async () => {
    const many = Array.from({ length: 14 }, (_, index) => ({
      ...rows[0], device_id: 100 + index, division_id: 100 + index, division_name: `ฝ่าย ${String(index + 1).padStart(2, "0")}`, pages_printed: (index + 1) * 10,
    }));
    const model = buildComparison({ rows: many, dimension: "division", include: [], metric: "rawPages" });
    const { files } = await open([rankingSheet(model)]);
    const top = strFromU8(files["xl/charts/chart1.xml"]);
    const bottom = strFromU8(files["xl/charts/chart2.xml"]);
    expect(top).toContain("มากสุด 10 อันดับ");
    expect(top).toContain("&apos;อันดับ&apos;!$B$2:$B$11");
    expect(bottom).toContain("น้อยสุด 10 อันดับ");
    expect(bottom).toContain("&apos;อันดับ&apos;!$B$6:$B$15");
    const drawing = strFromU8(files["xl/drawings/drawing1.xml"]);
    expect(drawing.match(/<xdr:oneCellAnchor>/g)).toHaveLength(2);
    expect(strFromU8(files["xl/drawings/_rels/drawing1.xml.rels"])).toContain("chart2.xml");
  });

  test("แผ่นอันดับค่าใช้จ่ายมีตาราง และภาพรวมรายเดือนไม่มีแผ่นอันดับ", async () => {
    const model = buildComparison({ rows, dimension: "department", include: [], metric: "cost" });
    const sheet = rankingSheet(model);
    expect(sheet.rows).toHaveLength(3);
    expect(sheet.rows[0][0]).toBe(1);
    expect(rankingSheet(buildComparison({ rows, dimension: "overall" }))).toBeNull();
  });

  test("ข้อมูลรายละเอียด: เดือนเป็นวันที่ ปีงบตามกฎ ต.ค.–ก.ย. และรหัสไม่เสียเลขศูนย์", async () => {
    const { workbook } = await open([detailSheet(rows)]);
    const sheet = workbook.Sheets["ข้อมูลรายละเอียด"];
    expect(sheet.A2).toMatchObject({ t: "n", v: 45931 });
    expect(sheet.B2).toMatchObject({ t: "n", v: 2569 });
    expect(sheet.C2).toMatchObject({ t: "s", v: "00123" });
    expect(sheet.H2).toMatchObject({ t: "s", v: "0007/2569" });
    expect(sheet.L2).toMatchObject({ t: "n", v: 0.4275 });
    const third = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }).find((line) => line[2] === "SN-3");
    expect(third.slice(9)).toEqual([50, 49, 0.4275, 20.95]);
    expect(sheet["!autofilter"]).toEqual({ ref: "A1:M5" });
  });

  test("ชื่อไฟล์บอกขอบเขตเป็น ASCII", () => {
    expect(exportFilename(["print-comparison", "fy2569", monthsSlug(["2025-11", "2025-10"]), "department"]))
      .toBe("print-comparison-fy2569-2025-10_2025-11-department");
    expect(monthsSlug([], ["2025-10"])).toBe("full-year");
  });
});
