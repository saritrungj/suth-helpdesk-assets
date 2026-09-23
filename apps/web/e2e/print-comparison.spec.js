import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { strFromU8, unzipSync } from "fflate";
import { COMPARISON_ROWS, comparisonFixture } from "./comparison-fixture.js";
import { prototypeFixture } from "./prototype-fixture.js";

/*
 * หน้าภาพรวมการพิมพ์ (#126)
 *
 * ข้อกำหนดกลางของหน้านี้คือ **ตัวกรองชุดเดียวคุมทุกอย่าง** — ตัวเลขสำคัญ กราฟ ตาราง
 * แผงรายละเอียด ไฟล์ Excel และไฟล์ CSV ต้องมาจากแถวชุดเดียวกันเสมอ ส่วน "เปรียบเทียบตาม"
 * เป็นแค่วิธีแบ่ง ไม่ใช่การเลือกข้อมูล เทสในไฟล์นี้จึงตรวจหลายทางพร้อมกันเมื่อทำได้
 */

async function download(page, action) {
  const pending = page.waitForEvent("download");
  await action();
  const file = await pending;
  const buffer = await readFile(await file.path());
  const workbook = XLSX.read(buffer, { type: "buffer", cellNF: true });
  const files = unzipSync(buffer);
  return {
    name: file.suggestedFilename(),
    workbook,
    rows: (sheet) => XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: null }),
    chart: (index = 1) => (files[`xl/charts/chart${index}.xml`] ? strFromU8(files[`xl/charts/chart${index}.xml`]) : null),
    sheetXml: (index) => strFromU8(files[`xl/worksheets/sheet${index}.xml`]),
  };
}

async function downloadText(page, action) {
  const pending = page.waitForEvent("download");
  await action();
  const file = await pending;
  return { name: file.suggestedFilename(), text: await readFile(await file.path(), "utf8") };
}

const conditionsOf = (file) => Object.fromEntries(file.rows("เงื่อนไขรายงาน").slice(1));

const comparisonCard = (page) => page.getByRole("region", { name: "พื้นที่เปรียบเทียบ" });
const detailTable = (page) => page.locator("section.card").filter({ has: page.getByRole("heading", { name: "ตารางรายละเอียด", exact: true }) });
const kpiOf = (page) => page.getByRole("region", { name: "สรุปตัวเลขสำคัญ" });

/** เปิดแผงตัวกรอง แล้วเลือกค่าในช่องของมิติที่ระบุ */
async function filterBy(page, label, names) {
  const filters = page.getByRole("region", { name: "ตัวกรองข้อมูล" });
  const toggle = filters.getByRole("button", { name: /^ตัวกรองเพิ่มเติม/ });
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  await filters.getByLabel(new RegExp(`^${label} `)).click();
  for (const name of names) await page.getByRole("option", { name }).first().click();
  await page.keyboard.press("Escape");
}

async function exportAs(page, format) {
  await page.getByRole("button", { name: "ส่งออก", exact: true }).first().click();
  return page.getByRole("menuitem", { name: new RegExp(`^${format}`) });
}

test.describe("หน้าภาพรวมการพิมพ์", () => {
  // chart.js เคยติดไปในไฟล์ที่ทุกหน้าโหลด (#169) — กราฟต้องโหลดเฉพาะหน้าที่วาดกราฟ และยังวาดได้จริง
  test("กราฟโหลดเฉพาะหน้าที่ใช้: หน้าเข้าสู่ระบบไม่โหลด ส่วนหน้าภาพรวมโหลดแล้ววาดได้", async ({ page }) => {
    const chartRequests = [];
    page.on("request", (request) => {
      if (/UiChart/.test(request.url())) chartRequests.push(request.url());
    });

    await page.goto("/login");
    await expect(page.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeVisible();
    expect(chartRequests, "หน้าเข้าสู่ระบบต้องไม่โหลดโค้ดกราฟ").toEqual([]);

    await comparisonFixture(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "ค่าใช้จ่ายสุทธิรายเดือน", exact: true })).toBeVisible();
    await expect(page.locator("#main-content canvas").first()).toBeVisible();
    expect(chartRequests.length, "หน้าภาพรวมต้องโหลดโค้ดกราฟเมื่อใช้").toBeGreaterThan(0);
  });

  test("โครงหน้าเรียงตัวกรอง → ตัวเลขสำคัญ → เปรียบเทียบ → ตารางรายละเอียด และมีปุ่มส่งออกปุ่มเดียว", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard");

    const filter = page.getByLabel(/^ช่วงเวลา/);
    const kpi = kpiOf(page);
    const chart = page.getByRole("heading", { name: "ค่าใช้จ่ายสุทธิรายเดือน", exact: true });
    const table = page.getByRole("heading", { name: "ตารางรายละเอียด", exact: true });
    await expect(table).toBeVisible();
    const tops = await Promise.all([filter, kpi, chart, table].map(async (item) => (await item.boundingBox()).y));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));

    // ปุ่มส่งออกมีปุ่มเดียวชื่อ "ส่งออก" แล้วค่อยเลือกรูปแบบในเมนู
    await expect(page.getByRole("button", { name: "ส่งออก", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /ส่งออก Excel|ส่งออก CSV/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "ดูรายละเอียด", exact: true })).toBeVisible();

    // คำที่สั่งให้เลิกใช้ ต้องไม่กลับมาอยู่บนหน้า
    for (const banned of ["แยกข้อมูลตาม", "ข้อมูลที่แสดง", "แนวโน้ม"]) {
      await expect(page.locator("#main-content")).not.toContainText(banned);
    }
    await expect(page.getByText("เปรียบเทียบตาม", { exact: true })).toBeVisible();

    await expect(kpi).toContainText("5,970");
    // หน้าที่คิดเงิน (หลังหัก 2%) เป็นคำอธิบายของการ์ดหน้าที่พิมพ์ ไม่ใช่การ์ดแยก (#197)
    await expect(kpi).toContainText("คิดเงิน 5,850.6 หน้า (หัก 2%)");
    await expect(kpi).toContainText("เฉลี่ยหน้าละ");
    await expect(kpi).toContainText("2,632.77");
    await expect(kpi.locator(":scope > div")).toHaveCount(4);
    await expect(kpi).not.toContainText("รอราคา");
  });

  test("เปรียบเทียบตามฝ่าย: ตารางมีทุกฝ่ายในขอบเขต และตัวเลขสำคัญไม่เปลี่ยนตามการแบ่ง", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard");
    const card = comparisonCard(page);
    await card.getByRole("radio", { name: "ฝ่าย", exact: true }).click();
    await card.getByRole("radio", { name: "ยอดพิมพ์จริง", exact: true }).click();
    await expect(page).toHaveURL(/by=division/);
    await expect(page).toHaveURL(/measure=pages/);
    // การแบ่งข้อมูลไม่ใช่การกรอง — ยอดรวมยังเป็นของทั้งองค์กร
    await expect(kpiOf(page)).toContainText("5,970");

    const table = detailTable(page);
    await expect(table.getByRole("row", { name: /ฝ่ายการพยาบาล\s+4,550\s+4,459\s+2,006\.55/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /ฝ่ายบริหารทั่วไป\s+1,420\s+1,391\.6\s+626\.22/ })).toBeVisible();
    // ฝ่ายที่บันทึกศูนย์จริงยังอยู่ในตาราง ไม่ถูกตัดทิ้งเพราะยอดน้อย
    await expect(table.getByRole("row", { name: /ฝ่ายเภสัชกรรม\s+0/ })).toBeVisible();

    await card.getByRole("radio", { name: "ตาราง", exact: true }).click();
    const chartTable = card.getByRole("table", { name: "ค่าตัวเลขของกราฟด้านบน" });
    await expect(chartTable.getByRole("row", { name: /ต\.ค\. 2568\s+1,500\s+300\s+0/ })).toBeVisible();
    await expect(chartTable.getByRole("row", { name: /ธ\.ค\. 2568\s+1,450\s+570\s+0/ })).toBeVisible();
  });

  test("กรองด้วยฝ่าย: ตัวเลขสำคัญ กราฟ ตาราง แผงรายละเอียด และไฟล์ Excel เป็นชุดเดียวกัน", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?by=division&measure=pages");
    await filterBy(page, "ฝ่าย", ["ฝ่ายการพยาบาล", "ฝ่ายบริหารทั่วไป"]);
    await expect(page).toHaveURL(/division=1(?:%2C|,)2/);

    const kpi = kpiOf(page);
    await expect(kpi).toContainText("5,970 หน้า".replace("5,970 หน้า", "5,970"));
    await expect(page.getByText(/ตัวเลขของ ฝ่าย: ฝ่ายการพยาบาล, ฝ่ายบริหารทั่วไป/)).toBeVisible();

    const table = detailTable(page);
    await expect(table.getByRole("row", { name: /ฝ่ายการพยาบาล\s+4,550/ })).toBeVisible();
    await expect(table).not.toContainText("ฝ่ายเภสัชกรรม");
    await expect(comparisonCard(page)).toContainText("จำนวนเครื่องที่มีข้อมูลต่างกัน (2–3 เครื่อง)");

    const file = await download(page, async () => (await exportAs(page, "Excel")).click());
    expect(file.name).toBe("print-usage-report-fy2569-full-year-division-pages.xlsx");
    expect(file.workbook.SheetNames).toEqual(["สรุป", "รายเดือน", "เปรียบเทียบ", "อันดับ", "ข้อมูลรายละเอียด", "เงื่อนไขรายงาน"]);
    const [header, nursing, admin] = file.rows("เปรียบเทียบ");
    expect(header.slice(0, 5)).toEqual(["ฝ่าย", "ยอดพิมพ์จริง (หน้า)", "สุทธิหลังหัก 2% (หน้า)", "ค่าใช้จ่าย (บาท)", "เครื่องที่มีข้อมูล (เครื่อง)"]);
    expect(nursing).toEqual(["ฝ่ายการพยาบาล", 4550, 4459, 2006.55, 3, 1500, 1600, 1450]);
    expect(admin).toEqual(["ฝ่ายบริหารทั่วไป", 1420, 1391.6, 626.22, 2, 300, 550, 570]);
    expect(file.chart()).toContain("<c:lineChart>");
    expect(file.chart().match(/<c:ser>/g)).toHaveLength(2);
    expect(file.sheetXml(1)).toContain('state="frozen"');

    // ไฟล์มีเฉพาะแถวของฝ่ายที่กรองไว้ เหมือนที่เห็นบนจอ
    const detail = file.rows("ข้อมูลรายละเอียด");
    expect(new Set(detail.slice(1).map((line) => line[5]))).toEqual(new Set(["ฝ่ายการพยาบาล", "ฝ่ายบริหารทั่วไป"]));
    expect(file.workbook.Sheets["ข้อมูลรายละเอียด"].C2).toMatchObject({ t: "s", v: "0100-SN" });
    expect(file.workbook.Sheets["ข้อมูลรายละเอียด"].A2).toMatchObject({ t: "n", z: "yyyy-mm" });

    const conditions = conditionsOf(file);
    expect(conditions["ฝ่าย"]).toBe("ฝ่ายการพยาบาล, ฝ่ายบริหารทั่วไป");
    expect(conditions["เปรียบเทียบตาม"]).toBe("ฝ่าย");
    expect(conditions["ตัวเลขที่ดู"]).toBe("ยอดพิมพ์จริง (หน้า)");
    expect(conditions["สถานะราคา"]).toBeUndefined();
    expect(conditions["สร้างเมื่อ (Asia/Bangkok)"]).toBeTruthy();
  });

  /*
   * ตัวกรองทุกมิติต้องเปลี่ยน "ข้อมูลชุดที่ดู" จริง ไม่ใช่แค่ตัดแถวที่ยอดเป็นศูนย์ออก
   *
   * เทสเดิมกรองฝ่าย 1+2 ซึ่งตัดออกแค่ฝ่ายที่ยอดเป็นศูนย์ ตัวเลขสำคัญจึงเท่าเดิมทุกค่า
   * ถ้าตัวกรองไม่ถูกส่งต่อเลย เทสก็ยังเขียว — ที่นี่จึงเลือกค่าที่ทำให้ทุกทางต้องเปลี่ยนตาม
   */
  const PARITY = [
    { label: "ฝ่าย", option: /^ฝ่ายบริหารทั่วไป/, url: /division=2/, group: "ฝ่ายบริหารทั่วไป", pages: "1,420", net: "1,391.6", cost: "626.22", readings: 5 },
    { label: "แผนก", option: /^งานการเงิน/, url: /department=21/, group: "ฝ่ายบริหารทั่วไป", pages: "1,420", net: "1,391.6", cost: "626.22", readings: 5 },
    { label: "สัญญา", option: /^CT-002\/2569/, url: /contract=8/, group: "ฝ่ายบริหารทั่วไป", pages: "1,420", net: "1,391.6", cost: "626.22", readings: 8 },
    // ชุดข้อมูลหลักมีอาคารเดียว การกรองจึงไม่ตัดอะไรออกเลย — ย้ายเครื่อง 5 ไปอีกอาคารเฉพาะเทสนี้
    {
      label: "อาคาร", option: /^อาคารผู้ป่วยนอก/, url: /building=1/, group: "ฝ่ายการพยาบาล",
      pages: "5,520", net: "5,409.6", cost: "2,434.32", readings: 13,
      rows: COMPARISON_ROWS.map((row) => (row.device_id === 5 ? { ...row, building_id: 2, building_name: "อาคารเภสัชกรรม" } : row)),
    },
    { label: "เครื่อง", option: /^0300-SN/, url: /device=3/, group: "ฝ่ายบริหารทั่วไป", pages: "970", net: "950.6", cost: "427.77", readings: 3 },
  ];

  for (const parity of PARITY) {
    test(`กรองด้วย${parity.label}: ตัวเลขสำคัญ ตาราง ไฟล์ Excel และ CSV เป็นข้อมูลชุดเดียวกัน`, async ({ page }) => {
      await comparisonFixture(page, parity.rows ? { rows: parity.rows } : undefined);
      await page.goto("/dashboard?by=division&measure=pages");
      await filterBy(page, parity.label, [parity.option]);
      await expect(page).toHaveURL(parity.url);

      const kpi = kpiOf(page);
      await expect(kpi).toContainText(parity.pages);
      await expect(kpi).toContainText(`คิดเงิน ${parity.net} หน้า`);
      await expect(kpi).toContainText(parity.cost);

      // ตารางรายละเอียดอ่านจากแถวชุดเดียวกับตัวเลขสำคัญ — กลุ่มที่มียอดสูงสุดต้องมีอยู่จริง
      await expect(detailTable(page).getByRole("row", { name: new RegExp(parity.group) })).toBeVisible();

      const file = await download(page, async () => (await exportAs(page, "Excel")).click());
      expect(file.rows("ข้อมูลรายละเอียด")).toHaveLength(parity.readings + 1);

      const csv = await downloadText(page, async () => (await exportAs(page, "CSV")).click());
      expect(csv.text.trim().split(String.fromCharCode(13, 10))).toHaveLength(parity.readings + 1);
    });
  }

  test("แผนกและสัญญาใช้หน่วยงานและสัญญาที่คิดเงินของเดือนนั้น", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?by=department&measure=pages");
    const table = detailTable(page);
    await expect(table.getByRole("row", { name: /งานผู้ป่วยนอก\s+ฝ่ายการพยาบาล\s+3,200/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /งานการเงิน\s+ฝ่ายบริหารทั่วไป\s+1,420/ })).toBeVisible();

    await page.goto("/dashboard?by=contract");
    await expect(table.getByRole("row", { name: /CT-001\/2569\s+4,550.*2,006\.55/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /CT-002\/2569\s+1,420.*626\.22/ })).toBeVisible();
    const file = await download(page, async () => (await exportAs(page, "Excel")).click());
    const rows = file.rows("เปรียบเทียบ");
    expect(rows.slice(1).map((line) => [line[0], line[3]])).toEqual([["CT-001/2569", 2006.55], ["CT-002/2569", 626.22]]);
    expect(new Set(file.rows("ข้อมูลรายละเอียด").slice(1).map((line) => line[7]))).toEqual(new Set(["CT-001/2569", "CT-002/2569"]));
  });

  test("อันดับอยู่ในไฟล์ Excel เท่านั้น และหน้าจอไม่เลือกรายการยอดสูงสุดแทนผู้ใช้", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?view=rank&dir=low&n=10&by=department");
    // ค่าของมุมมองอันดับเดิมไม่มีความหมายแล้ว ต้องถูกล้างออกจาก URL ไม่ค้างไว้
    await expect(page).not.toHaveURL(/view=|dir=|n=10/);
    const card = comparisonCard(page);
    for (const name of ["อันดับมาก–น้อย", "เลือกรายการมาเทียบ", "มากสุด", "น้อยสุด"]) {
      await expect(card.getByRole("radio", { name, exact: true })).toHaveCount(0);
    }
    await expect(card).not.toContainText("ระบบเลือก");

    // ทุกแผนกที่มีข้อมูลอยู่ในตาราง ไม่ใช่แค่ยอดสูงสุดห้ารายการ
    const table = detailTable(page);
    await expect(table.getByRole("row")).toHaveCount(5);
    await expect(table.getByRole("row").nth(1)).toContainText(/งานผู้ป่วยนอก.*3,200/);

    const costFile = await download(page, async () => (await exportAs(page, "Excel")).click());
    expect(costFile.rows("อันดับ").slice(1).map((line) => line.slice(0, 3))).toEqual([
      [1, "งานผู้ป่วยนอก", "ฝ่ายการพยาบาล"], [2, "งานการเงิน", "ฝ่ายบริหารทั่วไป"], [3, "งานผู้ป่วยใน", "ฝ่ายการพยาบาล"], [4, "งานคลังยา", "ฝ่ายเภสัชกรรม"],
    ]);

    await card.getByRole("radio", { name: "ยอดพิมพ์จริง", exact: true }).click();
    const file = await download(page, async () => (await exportAs(page, "Excel")).click());
    expect(file.name).toBe("print-usage-report-fy2569-full-year-department-pages.xlsx");
    expect(file.rows("อันดับ").slice(1).map((line) => line.slice(0, 4))).toEqual([
      [1, "งานผู้ป่วยนอก", "ฝ่ายการพยาบาล", 3200], [2, "งานการเงิน", "ฝ่ายบริหารทั่วไป", 1420], [3, "งานผู้ป่วยใน", "ฝ่ายการพยาบาล", 1350], [4, "งานคลังยา", "ฝ่ายเภสัชกรรม", 0],
    ]);
    expect(file.rows("ข้อมูลรายละเอียด")).toHaveLength(16);
    expect(conditionsOf(file)["อันดับ"]).toBe("ทุกแผนก 4 รายการ เรียงตามยอดพิมพ์จริงจากมากไปน้อย (แผ่น “อันดับ”)");
  });

  test("ส่งออก CSV ได้ข้อมูลรายละเอียดแบนตามตัวกรองเดียวกับ Excel", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?division=2");
    const file = await downloadText(page, async () => (await exportAs(page, "CSV")).click());
    expect(file.name).toBe("print-usage-data-fy2569-full-year-overall-cost.csv");
    const lines = file.text.trim().split("\r\n");
    expect(lines[0]).toContain('"ปีงบประมาณ"');
    // ฝ่ายบริหารทั่วไปมี 5 รายการในปีงบนี้ (ต.ค. 1, พ.ย. 2, ธ.ค. 2)
    expect(lines).toHaveLength(6);
    expect(file.text).not.toContain("ฝ่ายการพยาบาล");
    expect(file.text).toContain('"2569"');
  });

  test("เลือกหลายปีงบแล้วเทียบตามปีงบ วางซ้อนตามเดือนของปีงบ เดือนที่ยังไม่มียอดเป็นช่องว่าง", async ({ page }) => {
    const state = await comparisonFixture(page);
    await page.route(/\/api\/fiscal-years$/, (route) => route.fulfill({ json: [
      { id: 7, year: 2568, start_month: "2024-10", end_month: "2025-09" },
      { id: 1, year: 2569, start_month: "2025-10", end_month: "2026-09" },
    ] }));
    await page.goto("/dashboard?fy=1&years=2568,2569&by=fiscalYear&measure=pages");
    const card = comparisonCard(page);
    await card.getByRole("radio", { name: "ตาราง", exact: true }).click();
    const values = card.getByRole("table", { name: "ค่าตัวเลขของกราฟด้านบน" });
    await expect(values.getByRole("row", { name: /^ต\.ค\.\s+1,200\s+1,800$/ })).toBeVisible();
    await expect(values.getByRole("row", { name: /^ธ\.ค\.\s+1,300\s+2,020$/ })).toBeVisible();
    // ปีงบ 2569 ยังไม่ถึง ก.ย. — ช่องว่าง ไม่ใช่ศูนย์ และไม่มีการประมาณ
    await expect(values.getByRole("row", { name: /^ก\.ย\.\s+750\s+—$/ })).toBeVisible();

    const request = state.requests.find((item) => item.months.length === 24);
    expect(request.months[0]).toBe("2024-10");
    expect(request.months.at(-1)).toBe("2026-09");
  });

  test("เลือกปีงบจากช่องตัวกรองได้มากสุดสามปี และปีที่เกินถูกแทนด้วยปีใหม่กว่า", async ({ page }) => {
    await comparisonFixture(page);
    await page.route(/\/api\/fiscal-years$/, (route) => route.fulfill({ json: [
      { id: 9, year: 2566, start_month: "2022-10", end_month: "2023-09" },
      { id: 8, year: 2567, start_month: "2023-10", end_month: "2024-09" },
      { id: 7, year: 2568, start_month: "2024-10", end_month: "2025-09" },
      { id: 1, year: 2569, start_month: "2025-10", end_month: "2026-09" },
    ] }));
    await page.goto("/dashboard?fy=1&measure=pages");
    const years = page.getByRole("region", { name: "ตัวกรองข้อมูล" }).getByRole("button", { name: /^ปีงบประมาณ / });

    await years.click();
    await page.getByRole("option", { name: /2568/ }).first().click();
    await page.getByRole("option", { name: /2567/ }).first().click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/years=2567(?:%2C|,)2568(?:%2C|,)2569/);

    // กราฟมีสีที่แยกกันออกจำกัด — ปีที่สี่ทำให้ปีเก่าสุดหลุดออก ไม่ใช่เพิ่มเป็นสี่ปี
    await years.click();
    await page.getByRole("option", { name: /2566/ }).first().click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/years=2567(?:%2C|,)2568(?:%2C|,)2569/);
    await expect(page).not.toHaveURL(/2566/);
    // ปีงบหลักคือปีใหม่ที่สุดในชุด แถบบนจึงต้องตรงกัน
    await expect(page.getByRole("button", { name: "ปีงบ 2569", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/fy=1/);
  });

  test("เปลี่ยนเปรียบเทียบตามเป็นปีงบไม่เพิ่มปีหรือเปลี่ยนขอบเขตข้อมูล", async ({ page }) => {
    await comparisonFixture(page);
    await page.route(/\/api\/fiscal-years$/, (route) => route.fulfill({ json: [
      { id: 7, year: 2568, start_month: "2024-10", end_month: "2025-09" },
      { id: 1, year: 2569, start_month: "2025-10", end_month: "2026-09" },
    ] }));
    await page.goto("/dashboard?fy=1&months=2025-10,2025-11&measure=pages");
    await expect(kpiOf(page)).toContainText("3,950");
    await comparisonCard(page).getByRole("radio", { name: "ปีงบ", exact: true }).click();
    await expect(page).toHaveURL(/by=fiscalYear/);
    await expect(page).not.toHaveURL(/years=/);
    await expect(kpiOf(page)).toContainText("3,950");
    await expect(comparisonCard(page)).not.toContainText("เพิ่มปีงบ");
  });

  test("ตารางรายละเอียดที่มีเกินหนึ่งหน้า: ค้นหา เรียง และแบ่งหน้าทำงานกับกลุ่มทั้งหมด", async ({ page }) => {
    // 25 เครื่อง ยอดไม่ซ้ำกัน — กราฟวาดได้ 8 กลุ่ม แต่ตารางต้องมีครบทุกกลุ่ม
    const template = COMPARISON_ROWS[0];
    const rows = Array.from({ length: 25 }, (_, index) => ({
      ...template,
      device_id: 100 + index,
      serial_number: `D${String(index + 1).padStart(2, "0")}-SN`,
      pages_printed: (index + 1) * 10,
      net_pages: ((index + 1) * 9.8).toFixed(2),
      total_cost: ((index + 1) * 9.8 * 0.45).toFixed(2),
    }));
    await comparisonFixture(page, { rows });
    await page.goto("/dashboard?by=device&measure=pages");

    const table = detailTable(page);
    // หน้าละ 20 แถวตามค่าเริ่มต้นของตาราง และบอกจำนวนทั้งหมดตรงๆ
    await expect(table).toContainText("แสดง 1–20 จาก 25");
    await expect(table.getByRole("row")).toHaveCount(21);

    // กราฟวาดได้แค่ 8 กลุ่มแรก แต่ต้องบอกว่าอีก 17 กลุ่มอยู่ครบในตาราง
    await expect(comparisonCard(page)).toContainText("อีก 17 รายการอยู่ครบในตารางด้านล่าง");

    await table.getByRole("button", { name: "ถัดไป" }).click();
    await expect(table).toContainText("แสดง 21–25 จาก 25");

    // ค้นหากรองจากค่าที่ตาเห็น และพากลับมาหน้าแรกเอง
    await table.getByRole("textbox", { name: "ค้นหาในตาราง..." }).fill("D2");
    await expect(table).toContainText("แสดง 1–6 จาก 6");
    await table.getByRole("textbox", { name: "ค้นหาในตาราง..." }).fill("");
    await expect(table).toContainText("แสดง 1–20 จาก 25");

    // เรียงจากหัวคอลัมน์ — น้อยไปมากแล้วกลับกัน
    const first = () => table.getByRole("row").nth(1);
    await expect(first()).toContainText("D25-SN");
    await table.getByRole("button", { name: /ยอดพิมพ์จริง/ }).first().click();
    await expect(first()).toContainText("D01-SN");
    await table.getByRole("button", { name: /ยอดพิมพ์จริง/ }).first().click();
    await expect(first()).toContainText("D25-SN");
  });

  test("ลิงก์ตรงที่เลือกปีงบเดียว sync ปีงบหลักก่อนตรวจช่วงเดือน", async ({ page }) => {
    await comparisonFixture(page);
    await page.route(/\/api\/fiscal-years$/, (route) => route.fulfill({ json: [
      { id: 7, year: 2568, start_month: "2024-10", end_month: "2025-09" },
      { id: 1, year: 2569, start_month: "2025-10", end_month: "2026-09" },
    ] }));
    await page.goto("/dashboard?fy=1&years=2568&months=2024-10&by=fiscalYear&measure=pages");
    await expect(page).toHaveURL(/fy=7/);
    await expect(page).toHaveURL(/months=2024-10/);
    await expect(kpiOf(page)).toContainText("1,200");
  });

  test("Back/Forward ที่ส่งเดือนนอกปีงบเข้าหน้าเดิมถูก normalize ก่อนสร้างคำขอ", async ({ page }) => {
    const state = await comparisonFixture(page);
    await page.goto("/dashboard?fy=1&months=2025-10&measure=pages");
    await expect(kpiOf(page)).toContainText("1,800");

    await page.evaluate(() => {
      history.pushState({}, "", "/dashboard?fy=1&months=2024-10&measure=pages");
    });
    await page.goBack();
    await page.goForward();

    await expect(page).not.toHaveURL(/months=2024-10/);
    await expect(kpiOf(page)).toContainText("5,970");
    const kpiRequests = state.requests.filter((request) => request.path.endsWith("/monthly-kpi"));
    // การ์ดตัวเลขขอเดือนเดียวกันของปีงบก่อนด้วย (#197) — คำขอของช่วงที่เลือกคือชุดที่มีเดือนของปีงบ 2569
    const latest = kpiRequests.filter((request) => request.months.includes("2026-09")).at(-1);
    expect(latest.months[0]).toBe("2025-10");
    expect(latest.months.at(-1)).toBe("2026-09");
  });

  test("เปลี่ยนตัวเลือกแล้วอยู่หน้าเดิม ไม่โหลดใหม่ และไม่ดึงจอขึ้นบนสุด", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?by=department");
    // ตัวนับนี้อยู่รอดได้เฉพาะตราบที่หน้าไม่ถูกโหลดใหม่จริงๆ
    await page.evaluate(() => { window.__aliveSince = Date.now(); });

    // จอเตี้ยพอให้ตัวเลือกอยู่ใต้เส้นพับ — ไม่งั้นจอไม่เคยถูกเลื่อน แล้วเทสผ่านโดยไม่ได้ตรวจอะไร
    await page.setViewportSize({ width: 1280, height: 360 });
    const radio = comparisonCard(page).getByRole("radio", { name: "สัญญา", exact: true });
    await radio.scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const before = await page.evaluate(() => window.scrollY);

    await radio.click();
    await expect(page).toHaveURL(/by=contract/);
    expect(await page.evaluate(() => window.__aliveSince)).toBeTruthy();
    // ตัวกรองเปลี่ยน query ผ่าน router.replace ทุกครั้ง — ถ้า scrollBehavior ไม่ยกเว้นการ
    // เปลี่ยนเฉพาะ query จอจะกระโดดขึ้นบนสุดทุกครั้งที่แตะตัวเลือก (#126)
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test("ตัวกรองหลายตัวเขียน URL ครบ ไม่มีตัวไหนทับกันหาย", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard");
    await filterBy(page, "ฝ่าย", ["ฝ่ายการพยาบาล"]);
    await filterBy(page, "สัญญา", ["CT-001/2569"]);
    await page.getByLabel(/^ช่วงเวลา/).click();
    await page.getByRole("option", { name: /เดือนล่าสุดที่มีข้อมูล/ }).click();
    await page.keyboard.press("Escape");
    for (const pattern of [/division=1/, /contract=7/, /months=2025-12/]) {
      await expect(page).toHaveURL(pattern);
    }
    await page.reload();
    await expect(page.getByText(/ตัวเลขของ ฝ่าย: ฝ่ายการพยาบาล · สัญญา: CT-001\/2569/)).toBeVisible();
  });

  test("ตัวเลือกยังอยู่หลังเปิดรายละเอียดเครื่องแล้วกดย้อนกลับ", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?by=division&division=1,2&measure=pages");
    await detailTable(page).getByRole("button", { name: "ดูรายละเอียดของ ฝ่ายการพยาบาล" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toContainText("รายละเอียดข้อมูล · ฝ่ายการพยาบาล");
    await drawer.getByRole("link", { name: "0100-SN" }).click();
    await expect(page).toHaveURL(/\/assets\/1$/);
    await page.goBack();
    await expect(page).toHaveURL(/division=1(?:%2C|,)2/);
    const card = comparisonCard(page);
    await expect(card.getByRole("radio", { name: "ฝ่าย", exact: true })).toBeChecked();
    await expect(card.getByRole("radio", { name: "ยอดพิมพ์จริง", exact: true })).toBeChecked();
    await expect(detailTable(page).getByRole("row", { name: /ฝ่ายการพยาบาล\s+4,550/ })).toBeVisible();
  });

  test("ลิงก์เก่าของหน้าที่ถูกยุบรวม พาไปหน้าที่ทำหน้าที่แทนจริงในเบราว์เซอร์", async ({ page }) => {
    // บุ๊กมาร์กของคนทำงานชี้ไปที่ path เก่าเหล่านี้ การ redirect จึงต้องทำงานในเบราว์เซอร์จริง
    // ไม่ใช่แค่ถูกในตารางเส้นทาง — ที่นี่จึงเปิดจริงทุกเส้นทางแล้วดูว่าหน้าปลายทางทำงานได้
    await comparisonFixture(page);

    await page.goto("/by-department?measure=pages");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).toHaveURL(/by=division/);
    await expect(detailTable(page).getByRole("row", { name: /ฝ่ายการพยาบาล\s+4,550/ })).toBeVisible();

    await page.goto("/expense?tab=department");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).toHaveURL(/by=division/);
    await expect(page).not.toHaveURL(/tab=/);
    await expect(kpiOf(page)).toContainText("5,970");
  });

  test("ลิงก์เก่าของหน้านำเข้าทรัพย์สินเปิดหน้านำเข้าไฟล์จากผู้ให้เช่า (#180)", async ({ page }) => {
    await prototypeFixture(page, "admin");
    await page.goto("/admin/import-devices");
    await expect(page).toHaveURL(/\/admin\/import(\?|$)/);
    await expect(page.getByTestId("import-sessions")).toBeVisible();
  });

  test("ลิงก์เก่าของหน้าเปรียบเทียบเปิดหน้าภาพรวมด้วยขอบเขตเดิม", async ({ page }) => {
    await comparisonFixture(page);
    // รายการที่เคยหยิบมาเทียบ กลายเป็นตัวกรองของมิตินั้น
    await page.goto("/dashboard?by=division&items=1,2&measure=pages");
    await expect(page).toHaveURL(/division=1(?:%2C|,)2/);
    await expect(page).not.toHaveURL(/items=/);
    await expect(detailTable(page)).not.toContainText("ฝ่ายเภสัชกรรม");

    await page.goto("/compare?type=contract&groups=7&metric=totalPages");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).toHaveURL(/by=contract/);
    await expect(page).toHaveURL(/contract=7/);
    await expect(page).toHaveURL(/measure=pages/);
    await expect(detailTable(page).getByRole("row", { name: /CT-001\/2569/ })).toBeVisible();
  });

  test("ลิงก์เก่าที่ระบุแบบการเทียบเป็น property บน prototype เปิดเป็นค่าเริ่มต้น", async ({ page }) => {
    await comparisonFixture(page);
    // ?type= มาจาก URL — ค่าอย่าง constructor ต้องไม่กลายเป็นชื่อมิติที่หลุดเข้า URL ปลายทาง
    await page.goto("/compare?type=constructor&groups=7");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).not.toHaveURL(/by=/);
    await expect(comparisonCard(page).getByRole("radio", { name: "ภาพรวม", exact: true })).toBeChecked();
  });

  test("ลิงก์ตรงที่ระบุเดือนนอกปีงบถูกปรับเป็นทั้งปีงบก่อนโหลดและส่งออก", async ({ page }) => {
    const state = await comparisonFixture(page);
    await page.goto("/dashboard?months=2024-01&by=division&measure=pages");
    await expect(page).not.toHaveURL(/months=2024-01/);
    await expect(detailTable(page).getByRole("row", { name: /ฝ่ายการพยาบาล\s+4,550/ })).toBeVisible();
    const monthly = state.requests.find((request) => request.path.endsWith("/monthly-kpi") && request.months.length);
    expect(monthly.months).toEqual(["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    const file = await download(page, async () => (await exportAs(page, "Excel")).click());
    expect(file.name).toContain("full-year");
  });

  test("เปลี่ยนช่วงเวลาแล้วคงข้อมูลและคำอธิบายช่วงเดิมไว้จนโหลดเสร็จ", async ({ page }) => {
    const state = await comparisonFixture(page);
    await page.goto("/dashboard?by=division&measure=pages");
    const table = detailTable(page);
    await expect(table.getByRole("row", { name: /ฝ่ายการพยาบาล\s+4,550/ })).toBeVisible();
    state.delay = 1500;
    await page.getByLabel(/^ช่วงเวลา/).click();
    await page.getByRole("option", { name: /เดือนล่าสุดที่มีข้อมูล/ }).click();
    await page.keyboard.press("Escape");
    await expect(comparisonCard(page)).toHaveAttribute("aria-busy", "true");
    await expect(table.getByRole("row", { name: /ฝ่ายการพยาบาล\s+4,550/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /ฝ่ายการพยาบาล\s+1,450/ })).toBeVisible({ timeout: 8000 });
    await expect(comparisonCard(page)).toContainText("ธ.ค. 2568");
  });

  test("โหลดไม่สำเร็จบอกข้อผิดพลาด ปิดการส่งออก และลองใหม่ได้", async ({ page }) => {
    const state = await comparisonFixture(page);
    state.fail = true;
    await page.goto("/dashboard?by=division");
    const retry = page.getByRole("button", { name: "ลองใหม่", exact: true });
    await expect(retry).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("button", { name: "ส่งออก", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "ดูรายละเอียด", exact: true })).toBeDisabled();
    state.fail = false;
    await retry.click();
    await expect(detailTable(page).getByRole("row", { name: /ฝ่ายการพยาบาล/ })).toBeVisible({ timeout: 8000 });
  });

  test("ใช้ได้ด้วยคีย์บอร์ดและบนจอ 320px โดยไม่เลื่อนแนวนอน", async ({ page }, testInfo) => {
    await comparisonFixture(page);
    await page.goto("/dashboard");
    const card = comparisonCard(page);
    await card.getByRole("radio", { name: "ฝ่าย", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/by=division/);
    await card.getByRole("radio", { name: "ยอดพิมพ์จริง", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/measure=pages/);
    await page.getByRole("button", { name: "ส่งออก", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: /^CSV/ })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 320, height: 740 });
    for (const url of ["/dashboard?by=division&division=1,2", "/dashboard?by=department&measure=pages", "/dashboard?by=device"]) {
      await page.goto(url);
      await expect(page.locator("#main-content h1")).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    }
    await page.screenshot({ path: testInfo.outputPath("dashboard-320.png"), fullPage: true });
  });
});

// รายชื่อเดือนของตัวเลือกช่วงเวลาเคยมาจาก /dashboard/monthly-kpi แบบไม่กรอง — ยอดรายมิเตอร์ทุกเดือน
// ทุกปี (11.6 MB ที่ 5 ปี) ดึงซ้ำทุก 5 นาที เพื่อเอาแค่ชื่อเดือน (#149) ทุกคำขอยอดต้องมีช่วงเดือนเสมอ
test("หน้าภาพรวมไม่ดึงยอดรายเดือนแบบไม่กรองเพื่อหารายชื่อเดือน", async ({ page }) => {
  const state = await comparisonFixture(page);
  await page.goto("/dashboard");
  await expect.poll(() => state.requests.some((request) => request.path.endsWith("/print-transactions/months"))).toBe(true);
  await expect.poll(() => state.requests.some((request) => request.path.endsWith("/monthly-kpi"))).toBe(true);
  await expect(page.getByRole("button", { name: /ช่วงเวลา|เดือน/ }).first()).toBeVisible();
  // เหลือได้หนึ่งคำขอ: คำขอยอดของหน้าที่ยิงก่อนรายการปีงบโหลดเสร็จ (ยังไม่รู้ช่วงเดือน) ซึ่งเป็นอีกเรื่อง
  // ที่แยกติดตามไว้ — ของเดิมมีสองคำขอ คำขอที่สองคือการหารายชื่อเดือนที่ #149 ตัดออก
  const unfiltered = state.requests.filter((request) => request.path.endsWith("/monthly-kpi") && !request.months.length);
  expect(unfiltered.length).toBeLessThanOrEqual(1);
});

test("หน้าค่าใช้จ่ายได้รายชื่อเดือนจาก /print-transactions/months ไม่ใช่ยอดทั้งหมด", async ({ page }) => {
  await prototypeFixture(page, "admin");
  const kpiRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith("/dashboard/monthly-kpi")) kpiRequests.push(url.search);
  });
  const monthsLoaded = page.waitForResponse((response) => response.url().endsWith("/api/print-transactions/months"));
  await page.goto("/expense");
  await monthsLoaded;
  await expect(page.getByText("ค่าพิมพ์สุทธิ", { exact: true })).toBeVisible();
  expect(kpiRequests.filter((search) => !new URLSearchParams(search).get("month"))).toEqual([]);
});
