import { expect, test } from "@playwright/test";
import { assetFixture } from "./asset-fixture.js";
import { comparisonFixture } from "./comparison-fixture.js";

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
  const filters = page.getByRole("region", { name: "ตัวกรองข้อมูล" });
  await filters.getByRole("button", { name: /^ตัวกรองเพิ่มเติม/ }).click();
  await filters.getByRole("button", { name: /^เครื่อง / }).click();
  await page.getByRole("option", { name: /0100-SN/ }).first().click();
  await page.keyboard.press("Escape");
  // เครื่องที่ย้ายอาคารกลางปียังเป็นแถวเดียว ยอดรวมทั้งปีไม่ถูกแยกตามอาคาร
  await expect(table.getByRole("row", { name: /0100-SN/ })).toContainText("3,100");
  await expect(table.getByRole("row", { name: /0100-SN/ })).toContainText("อาคารใหม่");
  await expect(table.getByRole("row")).toHaveCount(2);
});

test("changing fiscal year clears months and keeps the other filters", async ({ page }) => {
  await comparisonFixture(page);
  await page.route(/\/api\/fiscal-years$/, route => route.fulfill({ json: [
    { id: 7, year: 2568, start_month: "2024-10", end_month: "2025-09" },
    { id: 1, year: 2569, start_month: "2025-10", end_month: "2026-09" },
  ] }));
  await page.goto("/dashboard?fy=1&by=division&division=1,2&months=2025-12&measure=pages");
  await expect(comparisonCard(page)).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "ปีงบ 2569", exact: true }).click();
  await page.getByRole("menuitem", { name: /2568/ }).click();
  // เดือนที่เลือกไว้เป็นของปีงบเก่า ใช้ต่อไม่ได้ — ส่วนตัวกรองหน่วยงานยังใช้ได้ทุกปี
  await expect(page).not.toHaveURL(/months=/);
  await expect(page).toHaveURL(/division=1(?:%2C|,)2/);
  await expect(page.getByRole("region", { name: "สรุปตัวเลขสำคัญ" })).toContainText("5,450");
});

test("changing fiscal year removes selections with no readings and announces it", async ({ page }) => {
  await comparisonFixture(page);
  await page.route(/\/api\/fiscal-years$/, route => route.fulfill({ json: [
    { id: 7, year: 2568, start_month: "2024-10", end_month: "2025-09" },
    { id: 1, year: 2569, start_month: "2025-10", end_month: "2026-09" },
  ] }));
  await page.goto("/dashboard?fy=1&division=9");
  await expect(comparisonCard(page)).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "ปีงบ 2569", exact: true }).click();
  await page.getByRole("menuitem", { name: /2568/ }).click();
  await expect(page).not.toHaveURL(/division=/);
  await expect(page.getByRole("status")).toContainText("นำตัวกรองที่ไม่มีข้อมูลออก");
  await page.getByRole("button", { name: "ปีงบ 2568", exact: true }).click();
  await page.getByRole("menuitem", { name: /2569/ }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("picking a second year then switching year from the topbar leaves one meaning of the fiscal year", async ({ page }) => {
  await comparisonFixture(page);
  await page.route(/\/api\/fiscal-years$/, route => route.fulfill({ json: [
    { id: 7, year: 2568, start_month: "2024-10", end_month: "2025-09" },
    { id: 1, year: 2569, start_month: "2025-10", end_month: "2026-09" },
  ] }));
  await page.goto("/dashboard?fy=1&by=division&division=1,2&measure=pages");
  await expect(comparisonCard(page)).toHaveAttribute("aria-busy", "false");

  // เลือกปีที่สองจากช่องปีงบจริงๆ — ชุดปีจึงเข้าไปอยู่ใน URL
  const filters = page.getByRole("region", { name: "ตัวกรองข้อมูล" });
  await filters.getByRole("button", { name: /^ปีงบประมาณ / }).click();
  await page.getByRole("option", { name: /2568/ }).first().click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/years=2568(?:%2C|,)2569/);

  // สลับปีงบจากแถบบน — แถบบนกับขอบเขตของรายงานต้องหมายถึงสิ่งเดียวกัน
  await page.getByRole("button", { name: "ปีงบ 2569", exact: true }).click();
  await page.getByRole("menuitem", { name: /2568/ }).click();
  await expect(page).toHaveURL(/fy=7/);
  await expect(page).not.toHaveURL(/years=/);
  await expect(page).not.toHaveURL(/months=/);
  await expect(page).toHaveURL(/division=1(?:%2C|,)2/);
  await expect(page.getByRole("button", { name: "ปีงบ 2568", exact: true })).toBeVisible();
  await expect(filters.getByRole("button", { name: /^ปีงบประมาณ / })).toContainText("2568");
});

test.describe("หน้ารายละเอียดเครื่อง → เทียบปีงบ (#123)", () => {
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
    await page.goto("/assets/1?fy=1&years=2568,2569");
    const card = page.locator("section.card").filter({ hasText: "จำนวนพิมพ์รายเดือน" });
    await expect(card.getByRole("alert")).toContainText("โหลดจำนวนพิมพ์ของเครื่องนี้ไม่สำเร็จ");
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
    const card = page.locator("section.card").filter({ hasText: "จำนวนพิมพ์รายเดือน" });
    await expect(card.getByRole("button", { name: /ปีงบที่เปรียบเทียบ/ })).toContainText("2568");
    await card.getByRole("radio", { name: "ตาราง", exact: true }).click();
    const values = card.getByRole("table", { name: "ค่าตัวเลขของกราฟด้านบน" });
    await expect(values.getByRole("row", { name: /^ต\.ค\.\s+800\s+1,000$/ })).toBeVisible();
    await expect(values.getByRole("row", { name: /^ม\.ค\.\s+400\s+—$/ })).toBeVisible();
    await page.reload();
    await expect(card.getByRole("button", { name: /ปีงบที่เปรียบเทียบ/ })).toContainText("2568");
  });

  test("ลิงก์เลือกสามปีแสดงสามชุดและเดือนที่ไม่มียอดเป็นช่องว่าง", async ({ page }) => {
    await comparisonFixture(page);
    await page.route(/\/api\/fiscal-years$/, route => route.fulfill({ json: [
      { id: 6, year: 2567, start_month: "2023-10", end_month: "2024-09" },
      { id: 7, year: 2568, start_month: "2024-10", end_month: "2025-09" },
      { id: 1, year: 2569, start_month: "2025-10", end_month: "2026-09" },
    ] }));
    await page.route(/\/api\/print-transactions\/by-device\/1\b/, route => {
      const year = new URL(route.request().url()).searchParams.get("fiscal_year_id");
      return route.fulfill({ json: year === "6" ? [{ month: "2023-10", pages: 600 }]
        : year === "7" ? [{ month: "2024-10", pages: 800 }]
          : [{ month: "2025-10", pages: 1000 }] });
    });
    await page.goto("/assets/1?fy=1&years=2567,2568,2569");
    const card = page.locator("section.card").filter({ hasText: "จำนวนพิมพ์รายเดือน" });
    await card.getByRole("radio", { name: "ตาราง", exact: true }).click();
    const values = card.getByRole("table", { name: "ค่าตัวเลขของกราฟด้านบน" });
    await expect(values.getByRole("row", { name: /^ต\.ค\.\s+600\s+800\s+1,000$/ })).toBeVisible();
    await expect(values.getByRole("row", { name: /^พ\.ย\.\s+—\s+—\s+—$/ })).toBeVisible();
    await page.goto("/assets/1?fy=1&years=2568,2568");
    await expect(card.getByRole("button", { name: /ปีงบที่เปรียบเทียบ/ })).toContainText("2569");
    await page.getByRole("button", { name: "ปีงบ 2569", exact: true }).click();
    await page.getByRole("menuitem", { name: /2568/ }).click();
    await expect(card.getByRole("button", { name: /ปีงบที่เปรียบเทียบ/ })).toContainText("2567");
  });
});

test.describe("จำมุมมองของแต่ละหน้าในแท็บนี้ (#115)", () => {
  const GROUP = { "ภาพรวมการพิมพ์": "ภาพรวม", "เปรียบเทียบการพิมพ์": "ภาพรวม", "ทะเบียนเครื่องพิมพ์": "งานประจำ", "รายงานสรุปการพิมพ์": "รายงาน", "ยี่ห้อ": "ตั้งค่าระบบ" };
  /** กดเมนูเหมือนผู้ใช้ — กลุ่มเมนูพับได้ จึงกางกลุ่มก่อนถ้าลิงก์ยังไม่แสดง */
  async function openFromMenu(page, name) {
    const menu = page.getByRole("complementary", { name: "เมนูหลัก" });
    const link = menu.getByRole("link", { name, exact: true });
    if (!(await link.isVisible())) await menu.getByRole("button", { name: GROUP[name], exact: true }).click();
    await link.click();
  }

  test("กดเมนูกลับมาได้มุมมองล่าสุด และลิงก์ที่ระบุค่ามาเองชนะความจำ", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/compare?by=contract&division=1,2&measure=pages");
    await expect(page.getByRole("region", { name: "สรุปตัวเลขสำคัญ" })).toContainText("5,970");

    await openFromMenu(page, "รายงานสรุปการพิมพ์");
    await expect(page).toHaveURL(/\/report/);
    await openFromMenu(page, "เปรียบเทียบการพิมพ์");
    await expect(page).toHaveURL(/by=contract/);
    await expect(page).toHaveURL(/division=1(?:%2C|,)2/);
    await expect(page).toHaveURL(/measure=pages/);

    // ลิงก์ที่ระบุมุมมองมาเองชนะความจำเสมอ ไม่ถูกเติมค่าเก่าทับ
    await page.goto("/compare?by=building");
    await expect(page).toHaveURL(/by=building/);
    await expect(page).not.toHaveURL(/division=1/);

    // ล้างตัวกรองแล้วกลับไปค่าเริ่มต้นจริง ทั้งใน URL และหลังไปหน้าอื่นแล้วกลับมา
    await page.goto("/compare?by=contract&division=1,2&measure=pages");
    await page.getByRole("region", { name: "ตัวกรองข้อมูล" }).getByRole("button", { name: "ล้างตัวกรอง", exact: true }).click();
    await expect(page).not.toHaveURL(/division=/);
    await openFromMenu(page, "รายงานสรุปการพิมพ์");
    await openFromMenu(page, "เปรียบเทียบการพิมพ์");
    await expect(page).not.toHaveURL(/division=/);
  });

  test("ค่าที่ไม่อยู่ใน URL เช่นคำค้นของทะเบียน ยังอยู่หลังไปหน้าอื่นแล้วกลับมา และหลังกด F5", async ({ page }) => {
    await comparisonFixture(page);
    await page.goto("/assets?building=1");
    const search = () => page.getByRole("textbox", { name: "ค้นหา Serial, รุ่น, ตำแหน่ง…" });
    await search().fill("0100");
    await openFromMenu(page, "รายงานสรุปการพิมพ์");
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

test("ล้างทั้งหมดในช่องปีงบกลับไปดูปีงบหลักปีเดียว (#204)", async ({ page }) => {
  await comparisonFixture(page);
  await page.route(/\/api\/fiscal-years$/, route => route.fulfill({ json: [
    { id: 7, year: 2568, start_month: "2024-10", end_month: "2025-09" },
    { id: 1, year: 2569, start_month: "2025-10", end_month: "2026-09" },
  ] }));
  await page.goto("/dashboard?fy=1&years=2568,2569");
  await expect(comparisonCard(page)).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: /^ปีงบประมาณ/ }).first().click();
  await page.getByRole("button", { name: "ล้างทั้งหมด" }).click();
  // เดิมปุ่มนี้ไม่ทำอะไรเลย เพราะการเลือกว่างถูกปฏิเสธเงียบๆ
  await expect(page).not.toHaveURL(/years=/);
  await expect(page.getByText(/เลือกไว้ 1 รายการ/)).toBeVisible();
});
