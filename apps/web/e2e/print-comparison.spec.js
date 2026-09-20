import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { strFromU8, unzipSync } from "fflate";
import { comparisonFixture } from "./comparison-fixture.js";

/*
 * หน้าภาพรวมการพิมพ์และหน้าเปรียบเทียบ → ฝ่าย/แผนก (#103)
 *
 * ทุกเทสตรวจสามทางพร้อมกันเมื่อทำได้: สิ่งที่กราฟวาด (มุมมองตารางของกราฟ) ตารางรายละเอียด
 * และไฟล์ Excel ที่ดาวน์โหลดจริง — เพราะข้อกำหนดคือทั้งสามต้องมาจากข้อมูลชุดเดียวกัน
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

const conditionsOf = (file) => Object.fromEntries(file.rows("เงื่อนไขรายงาน").slice(1));

const comparisonCard = (page) => page.getByRole("region", { name: "พื้นที่เปรียบเทียบ" });
const detailTable = (page) => page.locator("section.card").filter({ has: page.getByRole("heading", { name: "ตารางรายละเอียด", exact: true }) });

async function chooseItems(page, label, names) {
  await page.getByLabel(label).click();
  for (const name of names) await page.getByRole("option", { name, exact: true }).click();
  await page.keyboard.press("Escape");
}

test.describe("หน้าภาพรวมการพิมพ์", () => {
  test("โครงหน้าเรียงตัวกรอง → ตัวเลขสำคัญ → เปรียบเทียบ → ตารางรายละเอียด ไม่มีส่งออกการ์ด และปุ่มดูรายละเอียดแยกจากส่งออก", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard");

    const filter = page.getByLabel(/^ช่วงเวลา \(ปีงบ/);
    const kpi = page.getByRole("region", { name: "สรุปตัวเลขสำคัญ" });
    const chart = page.getByRole("heading", { name: "ค่าใช้จ่ายที่ยืนยันแล้วรายเดือน", exact: true });
    const table = page.getByRole("heading", { name: "ตารางรายละเอียด", exact: true });
    await expect(table).toBeVisible();
    const tops = await Promise.all([filter, kpi, chart, table].map(async (item) => (await item.boundingBox()).y));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));

    await expect(page.getByRole("button", { name: "ส่งออกการ์ด" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "ดูรายละเอียด", exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "ส่งออก Excel" }).getByRole("button", { name: "ส่งออก Excel" })).toBeEnabled();
    // ตัวชี้วัดมีชุดเดียวทั้งหน้า และรายการตามแผนก/สัญญาที่ซ้ำกับพื้นที่เปรียบเทียบถูกยุบแล้ว
    await expect(page.getByRole("radio", { name: "ค่าใช้จ่าย", exact: true })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "ค่าใช้จ่ายตามแผนก" })).toHaveCount(0);

    await expect(kpi).toContainText("5,970");
    await expect(kpi).toContainText("สุทธิหลังหัก 2% 5,850.6 หน้า");
    await expect(kpi).toContainText("2,588.67");
    await expect(detailTable(page).getByRole("row", { name: /ธ\.ค\. 2568.*รอยืนยันราคา 1 รายการ/ })).toBeVisible();
  });

  test("เลือกฝ่าย A/B: กราฟ ตาราง และ Excel ไฟล์เดียวสามแผ่นใช้ตัวเลขชุดเดียวกัน", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard");
    const card = comparisonCard(page);
    await card.getByRole("radio", { name: "ฝ่าย", exact: true }).click();
    await chooseItems(page, /^ฝ่ายที่จะเทียบ/, ["ฝ่ายการพยาบาล", "ฝ่ายบริหารทั่วไป"]);
    await card.getByRole("radio", { name: "ยอดพิมพ์จริง", exact: true }).click();
    await expect(page).toHaveURL(/by=division/);
    await expect(page).toHaveURL(/items=1%2C2|items=1,2/);
    await expect(page).toHaveURL(/measure=pages/);

    await card.getByRole("radio", { name: "ตาราง", exact: true }).click();
    const chartTable = card.getByRole("table", { name: "ค่าตัวเลขของกราฟด้านบน" });
    await expect(chartTable.getByRole("row", { name: /ต\.ค\. 2568\s+1,500\s+300/ })).toBeVisible();
    await expect(chartTable.getByRole("row", { name: /พ\.ย\. 2568\s+1,600\s+550/ })).toBeVisible();
    await expect(chartTable.getByRole("row", { name: /ธ\.ค\. 2568\s+1,450\s+570/ })).toBeVisible();

    const table = detailTable(page);
    await expect(table.getByRole("row", { name: /ฝ่ายการพยาบาล\s+4,550\s+4,459\s+1,962\.45/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /ฝ่ายบริหารทั่วไป\s+1,420\s+1,391\.6\s+626\.22/ })).toBeVisible();
    await expect(card).toContainText("จำนวนเครื่องที่มีข้อมูลต่างกัน (2–3 เครื่อง)");

    const file = await download(page, () => page.getByRole("button", { name: "ส่งออก Excel", exact: true }).click());
    expect(file.name).toBe("print-comparison-fy2569-full-year-division-pages.xlsx");
    expect(file.workbook.SheetNames).toEqual(["เปรียบเทียบ", "อันดับ", "ข้อมูลรายละเอียด", "เงื่อนไขรายงาน"]);
    const [header, nursing, admin] = file.rows("เปรียบเทียบ");
    expect(header.slice(0, 7)).toEqual(["ฝ่าย", "ยอดพิมพ์จริง (หน้า)", "สุทธิหลังหัก 2% (หน้า)", "ค่าใช้จ่ายที่ยืนยันแล้ว (บาท)", "เครื่องที่มีข้อมูล (เครื่อง)", "รายการรอยืนยันราคา", "สถานะข้อมูล"]);
    expect(nursing).toEqual(["ฝ่ายการพยาบาล", 4550, 4459, 1962.45, 3, 1, "รอยืนยันราคา 1 รายการ", 1500, 1600, 1450]);
    expect(admin).toEqual(["ฝ่ายบริหารทั่วไป", 1420, 1391.6, 626.22, 2, 0, "ยืนยันราคาครบ", 300, 550, 570]);
    expect(file.chart()).toContain("<c:lineChart>");
    expect(file.chart().match(/<c:ser>/g)).toHaveLength(2);
    expect(file.sheetXml(1)).toContain('state="frozen"');

    const detail = file.rows("ข้อมูลรายละเอียด");
    expect(detail).toHaveLength(13);
    expect(new Set(detail.slice(1).map((line) => line[5]))).toEqual(new Set(["ฝ่ายการพยาบาล", "ฝ่ายบริหารทั่วไป"]));
    expect(file.workbook.Sheets["ข้อมูลรายละเอียด"].C2).toMatchObject({ t: "s", v: "0100-SN" });
    expect(file.workbook.Sheets["ข้อมูลรายละเอียด"].A2).toMatchObject({ t: "n", z: "yyyy-mm" });

    const conditions = conditionsOf(file);
    expect(conditions["รายการที่เปรียบเทียบ"]).toBe("ฝ่ายการพยาบาล, ฝ่ายบริหารทั่วไป");
    expect(conditions["ขอบเขตข้อมูลรายละเอียด"]).toBe("เฉพาะฝ่ายที่เลือก 2 รายการ");
    expect(conditions["ตัวชี้วัด"]).toBe("ยอดพิมพ์จริง (หน้า)");
    expect(conditions["สถานะราคา"]).toMatch(/ยังยืนยันราคาไม่ได้ 1 รายการ/);
    expect(conditions["สร้างเมื่อ (Asia/Bangkok)"]).toBeTruthy();
  });

  test("แผนก A/B และหลายสัญญา ใช้หน่วยงานและสัญญาที่คิดเงินของเดือนนั้น", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?by=department&view=select&items=11,21&measure=pages");
    const table = detailTable(page);
    await expect(table.getByRole("row", { name: /งานผู้ป่วยนอก\s+ฝ่ายการพยาบาล\s+3,200/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /งานการเงิน\s+ฝ่ายบริหารทั่วไป\s+1,420/ })).toBeVisible();

    await page.goto("/dashboard?by=contract&view=select&items=7,8,unassigned");
    await expect(table.getByRole("row", { name: /CT-001\/2569\s+4,450.*1,962\.45/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /CT-002\/2569\s+1,420.*626\.22/ })).toBeVisible();
    // ยอดที่เดือนนั้นไม่มีสัญญาคิดเงินอยู่ในกลุ่ม "ไม่ผูกสัญญา" ไม่ถูกนับเป็นศูนย์บาท
    await expect(table.getByRole("row", { name: /ไม่ผูกสัญญา\s+100\s+98\s+—.*ยังยืนยันราคาไม่ได้ 1 รายการ/ })).toBeVisible();

    const file = await download(page, () => page.getByRole("button", { name: "ส่งออก Excel", exact: true }).click());
    const rows = file.rows("เปรียบเทียบ");
    expect(rows.slice(1).map((line) => [line[0], line[3]])).toEqual([["CT-001/2569", 1962.45], ["CT-002/2569", 626.22], ["ไม่ผูกสัญญา", null]]);
    expect(new Set(file.rows("ข้อมูลรายละเอียด").slice(1).map((line) => line[7]))).toEqual(new Set(["CT-001/2569", "CT-002/2569", "ไม่ผูกสัญญา"]));
  });

  test("อันดับอยู่ในไฟล์ Excel เท่านั้น: หน้าจอเลือกยอดสูงสุดให้ ไฟล์มีทุกรายการเรียงมาก→น้อย (#115)", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?view=rank&dir=low&n=10");
    await expect(page).not.toHaveURL(/view=|dir=|n=10/);
    const card = comparisonCard(page);
    await card.getByRole("radio", { name: "แผนก", exact: true }).click();
    for (const name of ["อันดับมาก–น้อย", "เลือกรายการมาเทียบ", "มากสุด", "น้อยสุด", "10"]) {
      await expect(card.getByRole("radio", { name, exact: true })).toHaveCount(0);
    }

    // ค่าใช้จ่ายยังจัดลำดับไม่ได้ (ธ.ค. มีรายการรอราคา) ระบบจึงเลือกตามยอดพิมพ์จริง — หน้าไม่ว่าง
    await expect(card).toContainText("ระบบเลือก 4 รายการที่ยอดสูงสุดให้");
    const table = detailTable(page);
    await expect(table.getByRole("row")).toHaveCount(5);
    await expect(table.getByRole("row").nth(1)).toContainText(/งานผู้ป่วยนอก.*3,200/);
    await expect(table).not.toContainText("งานเอกซเรย์");

    const blocked = await download(page, () => page.getByRole("button", { name: "ส่งออก Excel", exact: true }).click());
    expect(blocked.workbook.SheetNames).toEqual(["เปรียบเทียบ", "อันดับ", "ข้อมูลรายละเอียด", "เงื่อนไขรายงาน"]);
    expect(blocked.rows("อันดับ")[1][0]).toMatch(/ยังจัดอันดับแผนกตามค่าใช้จ่ายไม่ได้ เพราะราคายังยืนยันไม่ครบ 1 รายการ/);

    await card.getByRole("radio", { name: "ยอดพิมพ์จริง", exact: true }).click();
    const file = await download(page, () => page.getByRole("button", { name: "ส่งออก Excel", exact: true }).click());
    expect(file.name).toBe("print-comparison-fy2569-full-year-department-pages.xlsx");
    expect(file.rows("อันดับ").slice(1).map((line) => line.slice(0, 4))).toEqual([
      [1, "งานผู้ป่วยนอก", "ฝ่ายการพยาบาล", 3200], [2, "งานการเงิน", "ฝ่ายบริหารทั่วไป", 1420], [3, "งานผู้ป่วยใน", "ฝ่ายการพยาบาล", 1350], [4, "งานคลังยา", "ฝ่ายเภสัชกรรม", 0],
    ]);
    expect(file.chart(2)).toContain('<c:barDir val="bar"/>');
    // ระบบเลือกให้ไม่ได้จำกัดขอบเขต — ข้อมูลรายละเอียดครบทุกหน่วยงาน
    expect(file.rows("ข้อมูลรายละเอียด")).toHaveLength(16);
    const conditions = conditionsOf(file);
    expect(conditions["ขอบเขตข้อมูลรายละเอียด"]).toBe("ทุกเครื่องในช่วงที่เลือก");
    expect(conditions["วิธีเลือกรายการ"]).toBe("ไม่ได้เลือกเอง — 4 รายการที่ยอดสูงสุดตามตัวชี้วัด");
    expect(conditions["อันดับ"]).toBe("ทุกแผนก 4 รายการ เรียงตามยอดพิมพ์จริงจากมากไปน้อย (แผ่น “อันดับ”)");
  });

  test("ข้อมูลดิบอย่างเดียวเป็นทางเลือกรอง ได้แผ่นข้อมูลกับเงื่อนไข ไม่มีกราฟ", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?by=department");
    await page.getByRole("button", { name: "ตัวเลือกการส่งออกอื่น" }).click();
    const file = await download(page, () => page.getByRole("menuitem", { name: "ข้อมูลดิบอย่างเดียว" }).click());
    expect(file.workbook.SheetNames).toEqual(["ข้อมูลรายละเอียด", "เงื่อนไขรายงาน"]);
    expect(file.chart()).toBeNull();
    expect(file.rows("ข้อมูลรายละเอียด")).toHaveLength(16);
  });

  test("ตัวเลือกยังอยู่หลังเปิดรายละเอียดเครื่องแล้วกดย้อนกลับ", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?by=division&view=select&items=1,2&measure=pages");
    await detailTable(page).getByRole("button", { name: "ดูรายละเอียดของ ฝ่ายการพยาบาล" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toContainText("รายละเอียดข้อมูล · ฝ่ายการพยาบาล");
    await drawer.getByRole("link", { name: "0100-SN" }).click();
    await expect(page).toHaveURL(/\/assets\/1$/);
    await page.goBack();
    await expect(page).toHaveURL(/by=division&view=select&items=1%2C2&measure=pages|items=1,2/);
    const card = comparisonCard(page);
    await expect(card.getByRole("radio", { name: "ฝ่าย", exact: true })).toBeChecked();
    await expect(card.getByRole("radio", { name: "ยอดพิมพ์จริง", exact: true })).toBeChecked();
    await expect(detailTable(page).getByRole("row", { name: /ฝ่ายการพยาบาล\s+4,550/ })).toBeVisible();
  });

  test("เลือกฝ่ายแล้ว ตัวเลขสำคัญ รายละเอียด และ Excel เป็นของฝ่ายที่เลือกชุดเดียวกัน (R06)", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?by=division&view=select&items=2");
    const kpi = page.getByRole("region", { name: "สรุปตัวเลขสำคัญ" });
    // ทั้งองค์กรคือ 5,970 หน้า 2,588.67 บาท — การ์ดต้องเป็นยอดของฝ่ายบริหารทั่วไปเท่านั้น
    await expect(kpi).toContainText("1,420");
    await expect(kpi).toContainText("626.22");
    await expect(kpi).toContainText("เครื่องที่มียอดในช่วงนี้");
    await expect(page.getByText("ตัวเลขของ ฝ่าย: ฝ่ายบริหารทั่วไป")).toBeVisible();

    await kpi.getByRole("button", { name: "ดูที่มาของค่าใช้จ่าย" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toContainText("รายละเอียดข้อมูล · ฝ่ายบริหารทั่วไป");
    await expect(drawer).toContainText("626.22");
    await expect(drawer).toContainText("1,420");
    await page.keyboard.press("Escape");

    const file = await download(page, () => page.getByRole("button", { name: "ส่งออก Excel", exact: true }).click());
    const detail = file.rows("ข้อมูลรายละเอียด").slice(1);
    expect(detail.reduce((sum, line) => sum + line[9], 0)).toBe(1420);
    expect(new Set(detail.map((line) => line[5]))).toEqual(new Set(["ฝ่ายบริหารทั่วไป"]));
  });

  test("ช่วงก่อนหน้าเทียบรายการชุดเดียวกัน ไม่ใช่ยอดทั้งองค์กร และรายการที่ระบบเลือกให้ไม่จำกัดยอดรวม (R06)", async ({ page }) => {
    const state = await comparisonFixture(page);
    state.overviewComparison = { previous_months: ["2025-10"] };
    await page.goto("/dashboard?months=2025-11&by=division&view=select&items=2");
    const kpi = page.getByRole("region", { name: "สรุปตัวเลขสำคัญ" });
    // ฝ่ายบริหารทั่วไป พ.ย. 242.55 บาท เทียบ ต.ค. 132.30 บาท = +83.3%
    // (ถ้าเอายอดทั้งองค์กรมาเทียบจะได้ +19.4% ซึ่งไม่ใช่ของฝ่ายนี้)
    await expect(kpi).toContainText("242.55");
    await expect(kpi).toContainText("+83.3%");
    await expect(kpi).toContainText("เทียบกับ ต.ค. 2568");
    const previous = state.requests.filter((request) => request.path.endsWith("/monthly-kpi")).map((request) => request.months.join(","));
    expect(previous).toContain("2025-10");

    await page.goto("/dashboard?by=division&measure=pages");
    await expect(kpi).toContainText("5,970");
    await expect(page.getByText("ตัวเลขของ ทุกหน่วยงาน")).toBeVisible();
  });

  test("วิเคราะห์ส่วนต่างพาไปหน้าเปรียบเทียบพร้อมรายการเดิม แล้วย้อนกลับได้", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?months=2025-11&by=division&view=select&items=1,2&measure=pages");
    await page.getByRole("link", { name: "วิเคราะห์ส่วนต่าง" }).click();
    await expect(page).toHaveURL(/\/compare\?/);
    await expect(page).toHaveURL(/type=department/);
    await expect(page).toHaveURL(/items=1(?:%2C|,)2/);
    await expect(page).toHaveURL(/months=2025-11/);
    await expect(page).toHaveURL(/measure=pages/);
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\?.*items=1(?:%2C|,)2/);
  });

  test("ลิงก์ตรงที่เลือกรายการเกินจำนวนสีถูกปรับให้ตรงกับแบบจำลอง", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?by=division&view=select&items=1,2,3,4,5,6,7,8,9,10&measure=pages");
    await expect(page).toHaveURL(/items=1(?:%2C|,)2(?:%2C|,)3(?:%2C|,)4(?:%2C|,)5(?:%2C|,)6(?:%2C|,)7(?:%2C|,)8(?:&|$)/);
    await expect(page).not.toHaveURL(/(?:%2C|,)9/);
  });

  test("ลิงก์ตรงที่ระบุเดือนนอกปีงบถูกปรับเป็นทั้งปีงบก่อนโหลดและส่งออก", async ({ page }) => {
    const state = await comparisonFixture(page);
    await page.goto("/dashboard?months=2024-01&by=division&view=select&items=1,2&measure=pages");
    await expect(page).not.toHaveURL(/months=2024-01/);
    await expect(detailTable(page).getByRole("row", { name: /ฝ่ายการพยาบาล\s+4,550/ })).toBeVisible();
    const monthly = state.requests.find((request) => request.path.endsWith("/monthly-kpi") && request.months.length);
    expect(monthly.months).toEqual(["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    const file = await download(page, () => page.getByRole("button", { name: "ส่งออก Excel", exact: true }).click());
    expect(file.name).toContain("full-year");
  });

  test("เปลี่ยนช่วงเวลาแล้วคงข้อมูลและคำอธิบายช่วงเดิมไว้จนโหลดเสร็จ", async ({ page }) => {
    const state = await comparisonFixture(page);
    await page.goto("/dashboard?by=division&view=select&items=1,2&measure=pages");
    const table = detailTable(page);
    await expect(table.getByRole("row", { name: /ฝ่ายการพยาบาล\s+4,550/ })).toBeVisible();
    state.delay = 1500;
    await page.getByLabel(/^ช่วงเวลา \(ปีงบ/).click();
    await page.getByRole("option", { name: /เดือนล่าสุดที่มีข้อมูล/ }).click();
    await page.keyboard.press("Escape");
    await expect(comparisonCard(page)).toHaveAttribute("aria-busy", "true");
    await expect(table.getByRole("row", { name: /ฝ่ายการพยาบาล\s+4,550/ })).toBeVisible();
    await expect(comparisonCard(page).getByRole("radio", { name: "ตาราง", exact: true })).toBeVisible();
    await expect(table.getByRole("row", { name: /ฝ่ายการพยาบาล\s+1,450/ })).toBeVisible({ timeout: 8000 });
    await expect(comparisonCard(page)).toContainText("ธ.ค. 2568");
  });

  test("โหลดไม่สำเร็จบอกข้อผิดพลาด ปิดการส่งออก และลองใหม่ได้", async ({ page }) => {
    const state = await comparisonFixture(page);
    state.fail = true;
    await page.goto("/dashboard?by=division&view=select&items=1,2");
    const retry = page.getByRole("button", { name: "ลองใหม่", exact: true });
    await expect(retry).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("group", { name: "ส่งออก Excel" }).getByRole("button", { name: "ส่งออก Excel" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "ดูรายละเอียด", exact: true })).toBeDisabled();
    state.fail = false;
    await retry.click();
    await expect(detailTable(page).getByRole("row", { name: /ฝ่ายการพยาบาล/ })).toBeVisible({ timeout: 8000 });
  });

  test("ลิงก์เดิมที่กรองสัญญาพาไปเทียบตามสัญญานั้น", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?contract=7");
    await expect(page).toHaveURL(/by=contract/);
    await expect(page).not.toHaveURL(/contract=7(&|$)/);
    await expect(comparisonCard(page).getByRole("radio", { name: "สัญญา", exact: true })).toBeChecked();
    await expect(detailTable(page).getByRole("row", { name: /CT-001\/2569/ })).toBeVisible();
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
    await page.getByRole("button", { name: "ตัวเลือกการส่งออกอื่น" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "ข้อมูลดิบอย่างเดียว" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 320, height: 740 });
    for (const url of ["/dashboard?by=division&view=select&items=1,2", "/dashboard?by=department&measure=pages", "/compare?type=department&items=1,2,3", "/compare?type=department&basis=periods&items=1,2"]) {
      await page.goto(url);
      await expect(page.locator("#main-content h1")).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    }
    await page.screenshot({ path: testInfo.outputPath("compare-periods-320.png"), fullPage: true });
  });
});
