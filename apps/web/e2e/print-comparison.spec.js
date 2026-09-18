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
    await card.getByRole("radio", { name: "เลือกรายการมาเทียบ", exact: true }).click();
    await chooseItems(page, /^ฝ่ายที่จะเทียบ/, ["ฝ่ายการพยาบาล", "ฝ่ายบริหารทั่วไป"]);
    await card.getByRole("radio", { name: "ยอดพิมพ์จริง", exact: true }).click();
    await expect(page).toHaveURL(/by=division/);
    await expect(page).toHaveURL(/view=select/);
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
    expect(file.name).toBe("print-comparison-fy2569-full-year-division-select-pages.xlsx");
    expect(file.workbook.SheetNames).toEqual(["เปรียบเทียบ", "ข้อมูลรายละเอียด", "เงื่อนไขรายงาน"]);
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

  test("อันดับมาก–น้อย: ยอดศูนย์อยู่ในอันดับ ข้อมูลขาดไม่ถูกจัด ค่าใช้จ่ายที่ราคาไม่ครบไม่จัดอันดับ", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard");
    const card = comparisonCard(page);
    await card.getByRole("radio", { name: "แผนก", exact: true }).click();
    await expect(card.getByRole("radio", { name: "อันดับมาก–น้อย", exact: true })).toBeChecked();

    await expect(card.getByRole("alert").or(card.locator(".bg-warn-soft"))).toContainText("ยังจัดอันดับค่าใช้จ่ายไม่ได้");
    await expect(page.getByRole("heading", { name: /ยังจัดอันดับไม่ได้จนกว่าราคาจะครบ/ })).toBeVisible();
    await expect(page.getByRole("group", { name: "ส่งออก Excel" }).getByRole("button", { name: "ส่งออก Excel" })).toBeDisabled();
    await expect(detailTable(page)).toContainText("ยังจัดอันดับค่าใช้จ่ายไม่ได้จนกว่าราคาจะครบ");

    await card.getByRole("button", { name: "จัดอันดับตามยอดพิมพ์จริง" }).click();
    await expect(page).toHaveURL(/measure=pages/);
    await expect(card).toContainText("อันดับใช้เพื่อหาจุดที่ควรตรวจสอบ ไม่ได้หมายความว่ารายการที่มียอดสูงสิ้นเปลือง");
    const table = detailTable(page);
    await expect(table.getByRole("row")).toHaveCount(5);
    await expect(table.getByRole("row").nth(1)).toContainText(/1\s*งานผู้ป่วยนอก.*3,200/);
    await expect(table.getByRole("row").nth(4)).toContainText(/4\s*งานคลังยา.*0/);
    await expect(table).not.toContainText("งานเอกซเรย์");

    await card.getByRole("radio", { name: "น้อยสุด", exact: true }).click();
    await expect(table.getByRole("row").nth(1)).toContainText(/1\s*งานคลังยา/);
    await card.getByRole("radio", { name: "10", exact: true }).click();
    await expect(page).toHaveURL(/n=10/);
    await expect(page.getByRole("heading", { name: "อันดับแผนกตามยอดพิมพ์จริง — ต่ำสุด 10 อันดับ", exact: true })).toBeVisible();

    const file = await download(page, () => page.getByRole("button", { name: "ส่งออก Excel", exact: true }).click());
    expect(file.name).toBe("print-comparison-fy2569-full-year-department-rank-low10-pages.xlsx");
    expect(file.rows("เปรียบเทียบ").slice(1).map((line) => line.slice(0, 4))).toEqual([
      [1, "งานคลังยา", "ฝ่ายเภสัชกรรม", 0], [2, "งานผู้ป่วยใน", "ฝ่ายการพยาบาล", 1350], [3, "งานการเงิน", "ฝ่ายบริหารทั่วไป", 1420], [4, "งานผู้ป่วยนอก", "ฝ่ายการพยาบาล", 3200],
    ]);
    expect(file.chart()).toContain('<c:barDir val="bar"/>');
    // ข้อมูลรายละเอียดครบทุกหน่วยงานก่อนตัดอันดับ
    expect(file.rows("ข้อมูลรายละเอียด")).toHaveLength(16);
    expect(conditionsOf(file)["ขอบเขตข้อมูลรายละเอียด"]).toBe("ทุกแผนกในช่วงที่เลือก ก่อนตัดอันดับ");
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
    await expect(drawer).toContainText("เจาะค่าใช้จ่าย · ฝ่ายการพยาบาล");
    await drawer.getByRole("link", { name: "0100-SN" }).click();
    await expect(page).toHaveURL(/\/assets\/1$/);
    await page.goBack();
    await expect(page).toHaveURL(/by=division&view=select&items=1%2C2&measure=pages|items=1,2/);
    const card = comparisonCard(page);
    await expect(card.getByRole("radio", { name: "ฝ่าย", exact: true })).toBeChecked();
    await expect(card.getByRole("radio", { name: "ยอดพิมพ์จริง", exact: true })).toBeChecked();
    await expect(detailTable(page).getByRole("row", { name: /ฝ่ายการพยาบาล\s+4,550/ })).toBeVisible();
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

  test("เปลี่ยนช่วงเวลาแล้วไม่แสดงตัวเลขของช่วงเดิมระหว่างโหลด", async ({ page }) => {
    const state = await comparisonFixture(page);
    await page.goto("/dashboard?by=division&view=select&items=1,2&measure=pages");
    const table = detailTable(page);
    await expect(table.getByRole("row", { name: /ฝ่ายการพยาบาล\s+4,550/ })).toBeVisible();
    state.delay = 1500;
    await page.getByLabel(/^ช่วงเวลา \(ปีงบ/).click();
    await page.getByRole("option", { name: /เดือนล่าสุดที่มีข้อมูล/ }).click();
    await page.keyboard.press("Escape");
    await expect(comparisonCard(page)).toHaveAttribute("aria-busy", "true");
    await expect(page.getByText("4,550")).toHaveCount(0);
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
    await card.getByRole("radio", { name: "เลือกรายการมาเทียบ", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/view=select/);
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

test.describe("หน้าเปรียบเทียบ → ฝ่าย/แผนก", () => {
  test("เปิดโหมดฝ่าย/แผนกไม่โหลดข้อมูลอ้างอิงชุดเดิมซ้ำ และแก้ฐานจากลิงก์ให้เป็นรายการที่เลือก", async ({ page }) => {
    const state = await comparisonFixture(page);
    await page.goto("/compare?type=department&items=1,2&base=99&measure=pages");
    await expect(page).toHaveURL(/base=1(?:&|$)/);
    await expect(page).not.toHaveURL(/base=99/);
    await expect.poll(() => state.masterRequests.filter((key) => key === "divisions").length).toBe(1);
    expect(state.masterRequests.filter((key) => key === "departments")).toHaveLength(1);
    expect(state.masterRequests).not.toContain("contracts");
  });

  test("สลับจากเดือนเป็นฝ่าย/แผนกใช้ cache ข้อมูลอ้างอิงเดิม และเดือนนอกปีงบไม่ติด URL หรือชื่อไฟล์", async ({ page }) => {
    const state = await comparisonFixture(page);
    await page.goto("/compare?type=month");
    await expect.poll(() => state.masterRequests.filter((key) => key === "divisions").length).toBe(1);
    await page.getByRole("radio", { name: "ฝ่าย / แผนก", exact: true }).click();
    await expect(page).toHaveURL(/type=department/);
    await expect.poll(() => state.masterRequests.filter((key) => key === "divisions").length).toBe(1);
    expect(state.masterRequests.filter((key) => key === "departments")).toHaveLength(1);

    await page.goto("/compare?type=department&months=2024-01&items=1,2&measure=pages");
    await expect(page).not.toHaveURL(/months=2024-01/);
    const file = await download(page, () => page.getByRole("button", { name: "ส่งออก Excel", exact: true }).click());
    expect(file.name).toContain("full-year");
  });

  test("หน่วยงานในช่วงเดียวกัน: ส่วนต่างจริงและเปอร์เซ็นต์เทียบกับฐานที่เลือก ฐานศูนย์ไม่มีเปอร์เซ็นต์", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/compare?type=department");
    await expect(page.getByRole("radio", { name: "หน่วยงานในช่วงเดียวกัน", exact: true })).toBeChecked();
    await chooseItems(page, /^ฝ่ายที่จะเทียบ/, ["ฝ่ายบริหารทั่วไป", "ฝ่ายเภสัชกรรม", "ฝ่ายรังสีวิทยา"]);
    await page.getByRole("radio", { name: "ยอดพิมพ์จริง", exact: true }).click();

    const table = page.getByRole("table", { name: "ตารางความแตกต่าง" });
    await expect(page.getByText("เทียบทุกรายการกับ ฝ่ายบริหารทั่วไป (ฐาน)").first()).toBeVisible();
    await expect(table.getByRole("row", { name: /ฝ่ายบริหารทั่วไป\s+ฐาน\s+1,420/ })).toContainText("รายการฐาน");
    await expect(table.getByRole("row", { name: /ฝ่ายบริหารทั่วไป/ })).toContainText("1,391.6");
    await expect(table.getByRole("row", { name: /ฝ่ายเภสัชกรรม/ })).toContainText("−1,420");
    await expect(table.getByRole("row", { name: /ฝ่ายเภสัชกรรม/ })).toContainText("−100.0%");
    await expect(table.getByRole("row", { name: /ฝ่ายรังสีวิทยา/ })).toContainText("ไม่มีข้อมูลในช่วงนี้");

    await page.getByLabel(/^ฐานของการเทียบ/).selectOption({ label: "ฝ่ายเภสัชกรรม" });
    await expect(page).toHaveURL(/base=3/);
    await expect(table.getByRole("row", { name: /ฝ่ายบริหารทั่วไป/ })).toContainText("+1,420");
    await expect(table.getByRole("row", { name: /ฝ่ายบริหารทั่วไป/ })).toContainText("ฐานเป็นศูนย์ แสดงเฉพาะส่วนต่างจริง ไม่คิดเปอร์เซ็นต์");
    await expect(page.getByText(/จำนวนเครื่องที่มีข้อมูลต่างกัน \(1–2 เครื่อง\)/)).toBeVisible();

    const file = await download(page, () => page.getByRole("button", { name: "ส่งออก Excel", exact: true }).click());
    expect(file.workbook.SheetNames).toEqual(["เปรียบเทียบ", "ข้อมูลรายละเอียด", "เงื่อนไขรายงาน"]);
    const rows = file.rows("เปรียบเทียบ");
    expect(rows[0].slice(0, 7)).toEqual(["ฝ่าย", "บทบาทในการเทียบ", "ยอดพิมพ์จริง (หน้า)", "สุทธิหลังหัก 2% (หน้า)", "ส่วนต่าง (หน้า)", "ส่วนต่าง (%)", "หมายเหตุการเทียบ"]);
    expect(rows.slice(1).map((line) => line.slice(0, 6))).toEqual([
      ["ฝ่ายบริหารทั่วไป", "เทียบกับฐาน", 1420, 1391.6, 1420, null],
      ["ฝ่ายเภสัชกรรม", "ฐาน", 0, 0, null, null],
      ["ฝ่ายรังสีวิทยา", "เทียบกับฐาน", null, null, null, null],
    ]);
    expect(file.chart()).toContain('<c:barDir val="bar"/>');
    const conditions = conditionsOf(file);
    expect(conditions["วิธีเทียบ"]).toBe("หน่วยงานในช่วงเดียวกัน");
    expect(conditions["รายการฐาน"]).toBe("ฝ่ายเภสัชกรรม");
    expect(conditions["สูตรส่วนต่าง"]).toMatch(/ส่วนต่าง = ค่าของรายการ − ค่าฐาน/);
  });

  test("ค่าใช้จ่ายที่ราคาไม่ครบแสดงยอดที่ยืนยันแล้วแต่ไม่คิดส่วนต่าง", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/compare?type=department&items=1,2");
    const table = page.getByRole("table", { name: "ตารางความแตกต่าง" });
    await expect(table.getByRole("row", { name: /ฝ่ายการพยาบาล/ })).toContainText("1,962.45");
    await expect(table.getByRole("row", { name: /ฝ่ายการพยาบาล/ })).toContainText("เฉพาะที่ยืนยันแล้ว");
    await expect(table.getByRole("row", { name: /ฝ่ายบริหารทั่วไป/ })).toContainText("ราคายังยืนยันไม่ครบ จึงยังไม่คิดส่วนต่างค่าใช้จ่าย");
    await expect(page.getByRole("heading", { name: /ค่าใช้จ่ายที่ยืนยันแล้วของฝ่ายที่เลือก/ })).toBeVisible();
  });

  test("ช่วง A กับ B: ช่วงเดียวกันของปีงบก่อน และช่วงก่อนหน้าที่ข้ามรอยต่อปีงบ", async ({ page }) => {
    const state = await comparisonFixture(page);
    await page.goto("/compare?type=department&basis=periods&items=1,2&measure=pages&months=2025-10,2025-11,2025-12");
    const table = page.getByRole("table", { name: "ตารางความแตกต่าง" });
    await expect(page.getByText(/ช่วงที่ดู ต\.ค\. 2568 – ธ\.ค\. 2568 เทียบกับช่วงฐาน ต\.ค\. 2567 – ธ\.ค\. 2567 \(ช่วงเดียวกันของปีงบก่อน\)/).first()).toBeVisible();
    await expect(table.getByRole("row", { name: /ฝ่ายการพยาบาล/ })).toContainText(/2,700\s*2,646\s*4,550\s*4,459\s*\+1,850\s*\+68\.5%\s*1 → 3/);
    await expect(table.getByRole("row", { name: /ฝ่ายบริหารทั่วไป/ })).toContainText(/700\s*686\s*1,420\s*1,391\.6\s*\+720\s*\+102\.9%\s*1 → 2/);
    expect(state.requests.some((request) => request.months.join(",") === "2024-10,2024-11,2024-12")).toBe(true);
    await expect(page.getByText(/จำนวนเครื่องที่มีข้อมูลของสองช่วงไม่เท่ากัน/)).toBeVisible();

    await page.getByRole("combobox", { name: /^ช่วงฐาน/ }).selectOption({ index: 1 });
    await expect(page).toHaveURL(/ref=previous-span/);
    await expect(table.getByRole("row", { name: /ฝ่ายการพยาบาล/ })).toContainText(/1,950\s*1,911\s*4,550\s*4,459\s*\+2,600/);
    await expect(table.getByRole("row", { name: /ฝ่ายบริหารทั่วไป/ })).toContainText(/100\s*98\s*1,420\s*1,391\.6\s*\+1,320/);
    expect(state.requests.some((request) => request.months.join(",") === "2025-07,2025-08,2025-09")).toBe(true);

    const file = await download(page, () => page.getByRole("button", { name: "ส่งออก Excel", exact: true }).click());
    const rows = file.rows("เปรียบเทียบ");
    expect(rows[0].slice(0, 7)).toEqual(["ฝ่าย", "ช่วงฐาน ก.ค. 2568 – ก.ย. 2568 (หน้า)", "สุทธิหลังหัก 2% — ช่วงฐาน ก.ค. 2568 – ก.ย. 2568 (หน้า)", "ช่วงที่ดู ต.ค. 2568 – ธ.ค. 2568 (หน้า)", "สุทธิหลังหัก 2% — ช่วงที่ดู ต.ค. 2568 – ธ.ค. 2568 (หน้า)", "ส่วนต่าง (หน้า)", "ส่วนต่าง (%)"]);
    expect(rows[1].slice(0, 7)).toEqual(["ฝ่ายการพยาบาล", 1950, 1911, 4550, 4459, 2600, 2600 / 1950]);
    expect(file.chart().match(/<c:ser>/g)).toHaveLength(2);
    // ข้อมูลรายละเอียดครอบทั้งสองช่วง และบอกปีงบของแต่ละแถวตามกฎ ต.ค.–ก.ย.
    const fiscalYears = new Set(file.rows("ข้อมูลรายละเอียด").slice(1).map((line) => line[1]));
    expect(fiscalYears).toEqual(new Set([2568, 2569]));
    expect(conditionsOf(file)["ช่วงฐาน"]).toBe("ก.ค. 2568 – ก.ย. 2568 (ช่วงก่อนหน้าที่ยาวเท่ากัน)");
  });
});
