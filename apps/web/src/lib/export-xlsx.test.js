import { describe, test, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { chartXml, createWorkbook, createWorkbookBytes, FORMATS, monthCell } from "./export-xlsx";

/**
 * ยามกันก้อน xlsx หลุดกลับเข้า chunk ที่โหลดตั้งแต่เปิดเว็บ
 *
 * `import * as XLSX from "xlsx"` ที่หัวไฟล์ไหนก็ตาม จะทำให้ Vite รวมไลบรารี
 * ~490 kB เข้ากับ chunk ของไฟล์นั้น ซึ่งเคยทำให้ทุกหน้าที่มีตารางต้องโหลด
 * ไปด้วยทั้งที่ผู้ใช้ไม่ได้กดส่งออก (issue #30)
 *
 * เทสนี้อ่านซอร์สจริง ไม่ได้อ่านผล build — จับได้ตั้งแต่ตอนเขียนโค้ด
 */
const SRC = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function sourceFiles(dir) {
  const found = [];

  for (const name of readdirSync(dir)) {
    const path = join(dir, name);

    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }

    if (/\.(vue|js)$/.test(name) && !name.endsWith(".test.js")) found.push(path);
  }

  return found;
}

describe("การส่งออก Excel ต้องโหลดไลบรารีตอนกดปุ่มเท่านั้น", () => {
  test("ห้ามมีไฟล์ไหน import xlyx แบบ static นอกจาก lib/export-xlsx.js", () => {
    const offenders = sourceFiles(SRC).filter((path) => {
      if (path.endsWith("export-xlsx.js")) return false;
      return /^\s*import[^\n]*["']xlsx["']/m.test(readFileSync(path, "utf8"));
    });

    expect(offenders).toEqual([]);
  });

  test("ตัว helper เองต้องใช้ dynamic import", () => {
    const source = readFileSync(join(SRC, "lib", "export-xlsx.js"), "utf8");

    expect(source).toMatch(/await import\(["']xlsx["']\)/);
    expect(source).not.toMatch(/^\s*import .* from ["']xlsx["']/m);
  });
});

describe("ไฟล์ Excel ที่พร้อมใช้ต่อ", () => {
  test("ตารางทั่วไปตรึงหัว เปิดตัวกรอง รักษาเลข Serial เป็นข้อความ และมีแผ่นบริบท", async () => {
    const bytes = await createWorkbookBytes({
      header: ["Serial", "จำนวนหน้า"],
      rows: [["00123", 0], ["ABC", 120]],
      sheetName: "ข้อมูล",
      filename: "test",
      context: [["ช่วงเวลา", "ทั้งปีงบ"]],
    });
    const files = unzipSync(bytes);
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(sheet).toContain('<autoFilter ref="A1:B3"/>');
    expect(sheet).toMatch(/<c r="A2" t="(?:s|str)"/);
    expect(strFromU8(files["xl/workbook.xml"])).toContain("บริบทรายงาน");
    // แผ่นบริบทไม่มีหัวตาราง จึงไม่ตรึงและไม่มีตัวกรอง
    expect(strFromU8(files["xl/worksheets/sheet2.xml"])).not.toContain("<pane ");
  });

  test("หลายแผ่นงาน: ตัวเลขเป็นตัวเลขพร้อมรูปแบบ เดือนเป็นวันที่ และกราฟอยู่บนแผ่นของมัน", async () => {
    const bytes = await createWorkbook({
      sheets: [
        { name: "เปรียบเทียบ", header: ["ฝ่าย", "ยอดพิมพ์"], rows: [["ฝ่าย A", 120], ["ฝ่าย B", 0]],
          columns: [{}, { format: FORMATS.count }],
          chart: { type: "bar", title: "อันดับยอดพิมพ์", valueFormat: FORMATS.count, valueTitle: "หน้า",
            series: [{ name: { c1: 1, r1: 0 }, categories: { c1: 0, r1: 1, r2: 2 }, values: { c1: 1, r1: 1, r2: 2 } }] } },
        { name: "ข้อมูลรายละเอียด", header: ["เดือน", "Serial", "ค่าใช้จ่าย (บาท)"], rows: [[monthCell("2025-10"), "00123", 1234.5], [monthCell("2025-11"), "00124", null]],
          columns: [{ format: FORMATS.month }, { text: true }, { format: FORMATS.baht }] },
        { name: "เงื่อนไขรายงาน", header: ["หัวข้อ", "รายละเอียด"], rows: [["ช่วงเวลา", "ต.ค. 2568"]], filter: false },
      ],
    });
    const files = unzipSync(bytes);
    const chart = strFromU8(files["xl/charts/chart1.xml"]);
    expect(strFromU8(files["xl/worksheets/sheet1.xml"])).toContain('<drawing r:id="rId999"/>');
    expect(strFromU8(files["xl/worksheets/_rels/sheet1.xml.rels"])).toContain("../drawings/drawing1.xml");
    expect(strFromU8(files["[Content_Types].xml"])).toContain("/xl/charts/chart1.xml");
    expect(chart).toContain('<c:barDir val="bar"/>');
    expect(chart).toContain("&apos;เปรียบเทียบ&apos;!$A$2:$A$3");
    expect(chart).toContain("&apos;เปรียบเทียบ&apos;!$B$2:$B$3");
    expect(chart).toContain('<c:crosses val="max"/>');
    expect(files["xl/charts/chart2.xml"]).toBeUndefined();

    const detail = strFromU8(files["xl/worksheets/sheet2.xml"]);
    expect(detail).toContain('<pane ySplit="1"');
    expect(detail).toMatch(/<c r="A2" s="\d+"><v>45931<\/v>/);
    expect(detail).toMatch(/<c r="B2" t="(?:s|str)"/);
    // ค่าว่างเป็นเซลล์ว่าง ไม่ใช่ศูนย์
    expect(detail).not.toContain('r="C3"');
    expect(strFromU8(files["xl/styles.xml"])).toContain('formatCode="yyyy-mm"');
    expect(strFromU8(files["xl/worksheets/sheet3.xml"])).not.toContain("<autoFilter");
  });

  test("กราฟเส้นหลายชุดอ่านชุดข้อมูลตามแถว และแนบค่าไว้ให้โปรแกรมดูตัวอย่าง", () => {
    const xml = chartXml({
      name: "เปรียบเทียบ",
      aoa: [["ฝ่าย", "ต.ค. 2568", "พ.ย. 2568"], ["A", 10, null], ["B", 0, 5]],
      chart: { type: "line", title: "รายเดือน", valueFormat: FORMATS.count,
        series: [1, 2].map((r) => ({ name: { c1: 0, r1: r }, categories: { c1: 1, r1: 0, c2: 2, r2: 0 }, values: { c1: 1, r1: r, c2: 2, r2: r } })) },
    });
    expect(xml).toContain("<c:lineChart>");
    expect(xml).toContain("&apos;เปรียบเทียบ&apos;!$B$2:$C$2");
    expect(xml).toContain("<c:legend>");
    expect(xml).toContain('<c:dispBlanksAs val="gap"/>');
    // เซลล์ว่างไม่มีจุดใน cache — เส้นขาดแทนการตกลงไปที่ศูนย์
    expect(xml).toContain('<c:ptCount val="2"/><c:pt idx="0"><c:v>10</c:v></c:pt></c:numCache>');
  });

  test("เดือนแปลงเป็นวันที่ Excel โดยไม่ขึ้นกับ timezone และค่าที่ไม่ใช่เดือนเป็นเซลล์ว่าง", () => {
    expect(monthCell("2025-10")).toBe(45931);
    expect(monthCell("1900-03")).toBe(61);
    expect(monthCell("")).toBeNull();
    expect(monthCell("2568-1")).toBeNull();
  });
});
