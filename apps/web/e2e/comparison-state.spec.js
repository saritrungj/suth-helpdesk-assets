import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { unzipSync, strFromU8 } from "fflate";
import { assetFixture } from "./asset-fixture.js";
import { comparisonFixture } from "./comparison-fixture.js";
import { prototypeFixture } from "./prototype-fixture.js";

async function download(page, action) {
  const pending = page.waitForEvent("download");
  await action();
  const file = await pending;
  const bytes = await readFile(await file.path());
  const workbook = XLSX.read(bytes, { type: "buffer" });
  return { name: file.suggestedFilename(), workbook, zip: unzipSync(bytes), rows: (sheet) => XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: null }) };
}
const comparisonCard = (page) => page.getByRole("region", { name: "พื้นที่เปรียบเทียบ" });

test("Dashboard compares buildings and keeps a moved device on one line", async ({ page }) => {
  const { COMPARISON_ROWS } = await import("./comparison-fixture.js");
  const rows = COMPARISON_ROWS.map(row => row.device_id === 1 && row.month === "2025-12"
    ? { ...row, building_id: 2, building_name: "อาคารใหม่" } : row);
  await comparisonFixture(page, { rows });
  await page.goto("/dashboard?by=building&measure=pages");
  const table = page.getByRole("table", { name: "ตารางรายละเอียดของการเปรียบเทียบ" });
  await expect(table.getByRole("row", { name: /อาคารใหม่/ })).toContainText("900");
  await expect(table.getByRole("row", { name: /อาคารผู้ป่วยนอก/ })).toContainText("5,070");
  await comparisonCard(page).getByRole("radio", { name: "เครื่อง", exact: true }).click();
  await comparisonCard(page).getByLabel(/^เครื่องที่จะเทียบ/).click();
  await page.getByRole("option", { name: /0100-SN/ }).click();
  await page.keyboard.press("Escape");
  await expect(table.getByRole("row", { name: /0100-SN/ })).toContainText("3,100");
  await expect(table.getByRole("row", { name: /0100-SN/ })).toContainText("อาคารใหม่");
  await comparisonCard(page).getByRole("radio", { name: "ตาราง", exact: true }).click();
  await expect(comparisonCard(page).getByRole("table").getByRole("rowheader")).toHaveCount(3);
});

test("changing fiscal year clears months and keeps selected items", async ({ page }) => {
  await comparisonFixture(page);
  await page.route(/\/api\/fiscal-years$/, route => route.fulfill({ json: [
    { id: 7, year: 2568, start_month: "2024-10", end_month: "2025-09" },
    { id: 1, year: 2569, start_month: "2025-10", end_month: "2026-09" },
  ] }));
  await page.goto("/dashboard?fy=1&by=division&items=1,2&months=2025-12&measure=pages");
  await expect(comparisonCard(page)).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "ปีงบ 2569", exact: true }).click();
  await page.getByRole("menuitem", { name: /2568/ }).click();
  await expect(page).not.toHaveURL(/months=/);
  await expect(page).toHaveURL(/items=1(?:%2C|,)2/);
  await expect(page.getByRole("region", { name: "สรุปตัวเลขสำคัญ" })).toContainText("5,450");
});

test.describe("หน้าภาพรวม → เทียบข้ามปีงบ (#115)", () => {
  test("ค่าเริ่มต้นเป็นปีงบนี้กับปีก่อน วางซ้อนตามเดือนของปีงบ เดือนที่ยังไม่มียอดเป็นช่องว่าง", async ({ page }) => {
    const state = await comparisonFixture(page);
    await page.goto("/dashboard");
    const card = comparisonCard(page);
    await card.getByRole("radio", { name: "ปีงบ", exact: true }).click();
    await card.getByRole("radio", { name: "ยอดพิมพ์จริง", exact: true }).click();
    await expect(page).toHaveURL(/by=fiscalYear/);
    await expect(page).not.toHaveURL(/years=/);

    await card.getByRole("radio", { name: "ตาราง", exact: true }).click();
    const values = card.getByRole("table", { name: "ค่าตัวเลขของกราฟด้านบน" });
    await expect(values.getByRole("row", { name: /^ต\.ค\.\s+1,200\s+1,800$/ })).toBeVisible();
    await expect(values.getByRole("row", { name: /^ธ\.ค\.\s+1,300\s+2,020$/ })).toBeVisible();
    // ปีงบ 2569 ยังไม่ถึง ก.ย. — ช่องว่าง ไม่ใช่ศูนย์ และไม่มีการประมาณ
    await expect(values.getByRole("row", { name: /^ก\.ย\.\s+750\s+—$/ })).toBeVisible();
    const yearRequest = state.requests.find((request) => request.months.length === 24);
    expect(yearRequest.months[0]).toBe("2024-10");
    expect(yearRequest.months.at(-1)).toBe("2026-09");
  });

  test("ขอบเขตเดียว: ฝ่ายหนึ่งฝ่ายเทียบหลายปี การ์ดเป็นยอดปีงบนี้ของฝ่ายนั้น และไฟล์มีเดือนจริง", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?by=fiscalYear&measure=pages");
    const card = comparisonCard(page);
    await card.getByRole("radiogroup", { name: "ขอบเขต" }).getByRole("radio", { name: "ฝ่าย", exact: true }).click();
    await card.getByLabel(/^ฝ่ายที่จะดู/).click();
    await page.getByRole("option", { name: "ฝ่ายบริหารทั่วไป", exact: true }).click();
    await expect(page).toHaveURL(/scope=division/);
    await expect(page).toHaveURL(/scopeItem=2/);
    await expect(page.getByRole("region", { name: "สรุปตัวเลขสำคัญ" })).toContainText("1,420");
    await expect(page.getByText("ตัวเลขของ ฝ่าย: ฝ่ายบริหารทั่วไป")).toBeVisible();

    await card.getByRole("radio", { name: "ตาราง", exact: true }).click();
    const values = card.getByRole("table", { name: "ค่าตัวเลขของกราฟด้านบน" });
    await expect(values.getByRole("row", { name: /^พ\.ย\.\s+0\s+550$/ })).toBeVisible();

    const file = await download(page, () => page.getByRole("button", { name: "ส่งออก Excel", exact: true }).click());
    expect(file.name).toBe("print-comparison-fy2568_2569-full-year-fiscalYear-pages.xlsx");
    expect(file.workbook.SheetNames).toEqual(["เปรียบเทียบ", "ข้อมูลรายละเอียด", "เงื่อนไขรายงาน"]);
    const [header, previous, current] = file.rows("เปรียบเทียบ");
    expect(header.slice(-12, -9)).toEqual(["ต.ค.", "พ.ย.", "ธ.ค."]);
    expect(previous.slice(-12, -9)).toEqual([400, 0, 300]);
    expect(current.slice(-12, -9)).toEqual([300, 550, 570]);
    expect(current.at(-1)).toBeNull();
    const detailMonths = new Set(file.rows("ข้อมูลรายละเอียด").slice(1).map((line) => line[1]));
    expect(detailMonths).toEqual(new Set([2568, 2569]));
    const conditions = Object.fromEntries(file.rows("เงื่อนไขรายงาน").slice(1));
    expect(conditions["ปีงบที่เปรียบเทียบ"]).toBe("ปีงบ 2568, ปีงบ 2569");
    expect(conditions["ขอบเขต"]).toBe("ฝ่าย: ฝ่ายบริหารทั่วไป");
  });

  test("เลือกได้ไม่เกินสามปีงบ และสลับไปมิติอื่นแล้วกลับมายังได้ปีกับขอบเขตเดิม", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?by=fiscalYear&years=2567,2568,2569&scope=division&scopeItem=1");
    const card = comparisonCard(page);
    await card.getByRole("radio", { name: "สัญญา", exact: true }).click();
    await expect(page).not.toHaveURL(/years=|scope=/);
    await card.getByRole("radio", { name: "ปีงบ", exact: true }).click();
    await expect(page).toHaveURL(/years=2567(?:%2C|,)2568(?:%2C|,)2569/);
    await expect(page).toHaveURL(/scopeItem=1/);
  });
});

test.describe("หน้ารายละเอียดเครื่อง → เทียบกับปีงบก่อน (#115)", () => {
  test("failed previous-year readings are reported instead of appearing as missing months", async ({ page }) => {
    await comparisonFixture(page);
    await page.route(/\/api\/fiscal-years$/, route => route.fulfill({ json: [
      { id: 7, year: 2568, start_month: "2024-10", end_month: "2025-09" },
      { id: 1, year: 2569, start_month: "2025-10", end_month: "2026-09" },
    ] }));
    await page.route(/\/api\/print-transactions\/by-device\/1\b/, route => {
      const previous = new URL(route.request().url()).searchParams.get("fiscal_year_id") === "7";
      return route.fulfill(previous ? { status: 503, json: {} } : { json: [{ month: "2025-10", pages: 1000 }] });
    });
    await page.goto("/assets/1?fy=1&compare=previous-year");
    const card = page.locator("section.card").filter({ hasText: "ยอดพิมพ์รายเดือน" });
    await expect(card.getByRole("alert")).toContainText("โหลดยอดพิมพ์ของเครื่องนี้ไม่สำเร็จ");
    await expect(card.getByRole("button", { name: "ลองใหม่", exact: true })).toBeVisible();
  });

  test("สองแท่งต่อเดือนของปีงบ เดือนที่ยังไม่มียอดเป็นช่องว่าง และยังเทียบอยู่หลังโหลดหน้าใหม่", async ({ page }) => {
    await comparisonFixture(page);
    await page.route(/\/api\/fiscal-years$/, (route) => route.fulfill({ json: [
      { id: 7, year: 2568, start_month: "2024-10", end_month: "2025-09" },
      { id: 1, year: 2569, start_month: "2025-10", end_month: "2026-09" },
    ] }));
    await page.route(/\/api\/print-transactions\/by-device\/1\b/, (route) => {
      const year = new URL(route.request().url()).searchParams.get("fiscal_year_id");
      return route.fulfill({ json: year === "7"
        ? [{ month: "2024-10", pages: 800 }, { month: "2024-11", pages: 900 }, { month: "2025-01", pages: 400 }]
        : [{ month: "2025-10", pages: 1000 }, { month: "2025-11", pages: 1200 }] });
    });
    await page.goto("/assets/1?fy=1");
    const card = page.locator("section.card").filter({ hasText: "ยอดพิมพ์รายเดือน" });
    await card.getByRole("radio", { name: "เทียบกับปีงบก่อน", exact: true }).click();
    await expect(page).toHaveURL(/compare=previous-year/);
    await card.getByRole("radio", { name: "ตาราง", exact: true }).click();
    const values = card.getByRole("table", { name: "ค่าตัวเลขของกราฟด้านบน" });
    await expect(values.getByRole("row", { name: /^ต\.ค\.\s+800\s+1,000$/ })).toBeVisible();
    await expect(values.getByRole("row", { name: /^ม\.ค\.\s+400\s+—$/ })).toBeVisible();
    await page.reload();
    await expect(card.getByRole("radio", { name: "เทียบกับปีงบก่อน", exact: true })).toBeChecked();
  });
});

test.describe("จำมุมมองของแต่ละหน้าในแท็บนี้ (#115)", () => {
  const GROUP = { "ภาพรวมการพิมพ์": "ภาพรวม", "ทะเบียนเครื่องพิมพ์": "งานประจำ", "เปรียบเทียบ": "รายงาน", "ยี่ห้อ": "ตั้งค่าระบบ" };
  /** กดเมนูเหมือนผู้ใช้ — กลุ่มเมนูพับได้ จึงกางกลุ่มก่อนถ้าลิงก์ยังไม่แสดง */
  async function openFromMenu(page, name) {
    const menu = page.getByRole("complementary", { name: "เมนูหลัก" });
    const link = menu.getByRole("link", { name, exact: true });
    if (!(await link.isVisible())) await menu.getByRole("button", { name: GROUP[name], exact: true }).click();
    await link.click();
  }

  test("กดเมนูกลับมาได้มุมมองล่าสุด ลิงก์ที่ระบุค่ามาเองชนะ และล้างตัวเลือกแล้วกลับค่าเริ่มต้นจริง", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/dashboard?by=division&items=1,2&measure=pages");
    await expect(page.getByRole("region", { name: "สรุปตัวเลขสำคัญ" })).toContainText("5,970");

    await openFromMenu(page, "เปรียบเทียบ");
    await expect(page).toHaveURL(/\/compare/);
    await page.getByRole("radio", { name: "สัญญา", exact: true }).click();
    await openFromMenu(page, "ภาพรวมการพิมพ์");
    await expect(page).toHaveURL(/by=division/);
    await expect(page).toHaveURL(/items=1(?:%2C|,)2/);
    await expect(page).toHaveURL(/measure=pages/);
    // ปีงบเป็นของทั้งแอป ไม่ใช่มุมมองของหน้า — ไม่ถูกจำแล้วเติมกลับ
    await openFromMenu(page, "เปรียบเทียบ");
    await expect(page).toHaveURL(/type=contract/);

    await page.goto("/dashboard?by=contract");
    await expect(page).toHaveURL(/by=contract/);
    await expect(page).not.toHaveURL(/items=1/);

    const card = page.getByRole("region", { name: "พื้นที่เปรียบเทียบ" });
    await card.getByRole("button", { name: "ล้างตัวเลือก" }).click();
    await expect(page).not.toHaveURL(/by=|items=|measure=/);
    await openFromMenu(page, "เปรียบเทียบ");
    await openFromMenu(page, "ภาพรวมการพิมพ์");
    await expect(page).not.toHaveURL(/by=/);
    await card.getByRole("radio", { name: "ฝ่าย", exact: true }).click();
    await expect(page).not.toHaveURL(/items=/);
  });

  test("ค่าที่ไม่อยู่ใน URL เช่นคำค้นของทะเบียน ยังอยู่หลังไปหน้าอื่นแล้วกลับมา และหลังกด F5", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/assets?building=1");
    const search = () => page.getByRole("textbox", { name: "ค้นหา Serial, รุ่น, ตำแหน่ง…" });
    await search().fill("0100");
    await openFromMenu(page, "เปรียบเทียบ");
    await openFromMenu(page, "ทะเบียนเครื่องพิมพ์");
    await expect(search()).toHaveValue("0100");
    await page.reload();
    await expect(search()).toHaveValue("0100");
  });

  test("ตารางข้อมูลอ้างอิงจำคำค้นของตัวเองไว้ เมื่อไปหน้าอื่นแล้วกลับมาทางเมนู", async ({ page }) => {
    await assetFixture(page, "admin");
    await page.goto("/admin/brands");
    const search = () => page.getByRole("textbox", { name: /ค้นหายี่ห้อ/ });
    await search().fill("HP");
    await openFromMenu(page, "ทะเบียนเครื่องพิมพ์");
    await expect(page).toHaveURL(/\/assets/);
    await openFromMenu(page, "ยี่ห้อ");
    await expect(search()).toHaveValue("HP");
  });
});
