import { expect, test } from "@playwright/test";
import { assetFixture } from "./asset-fixture.js";
import { importSessionFixture } from "./import-session-fixture.js";

// หน้านำเข้าไฟล์แบบ session (#180) — เส้นทาง HTTP จำลอง ส่วนการเขียนฐานจริงอยู่ที่ import-session.spec.js (ชุด db)
//
// สิ่งที่พิสูจน์ที่นี่: ทุกการเลือกถูกส่งเข้า session ทันที ออกจากหน้าแล้วกลับมา (หรือรีเฟรช) ได้สิ่งที่เลือกไว้คืน
// จากเซิร์ฟเวอร์ สัญญาสร้างจากค่าที่อ่านจากหัวไฟล์ และปุ่มบันทึกเปิดเมื่อ API บอกว่าครบเท่านั้น

async function openUploadedSession(page) {
  await page.goto("/admin/import");
  await page.locator('input[type="file"]').setInputFiles({ name: "meter-report.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("x") });
  await expect(page).toHaveURL(/\/admin\/import\/41$/);
  await expect(page.getByTestId("import-checklist")).toBeVisible();
}

test("อัปโหลดแล้วไปหน้าตรวจของงาน บอกสิ่งที่ต้องทำ และบันทึกไม่ได้จนกว่าจะครบ", async ({ page }) => {
  await assetFixture(page, "admin");
  await importSessionFixture(page);
  await openUploadedSession(page);

  await expect(page.getByTestId("checklist-item").filter({ hasText: "ยังไม่มีสัญญา TEST1/2569" })).toHaveAttribute("data-state", "blocking");
  await expect(page.getByTestId("import-commit")).toBeDisabled();
});

test("ทุกการเลือกถูกเก็บในงาน — ออกจากหน้า กลับมาจากรายการงานค้าง แล้วรีเฟรช ยังได้ค่าเดิม", async ({ page }) => {
  await assetFixture(page, "admin");
  const server = await importSessionFixture(page);
  await openUploadedSession(page);

  await page.getByRole("combobox", { name: "ตัดสินชื่อ ศูนย์ ก (EMC)" }).selectOption({ label: "สร้างอาคารใหม่ชื่อนี้" });
  await page.getByRole("combobox", { name: "หมวดมิเตอร์ของรุ่น ES5112" }).selectOption({ label: "A4 เลเซอร์ ขาวดำ" });

  // ออกทันทีโดยไม่รอ — หน้าต้องส่งสิ่งที่เลือกให้เสร็จก่อนออก
  await page.locator('aside a[href="/dashboard"]').first().click();
  await expect(page).toHaveURL(/\/dashboard/);
  expect(server.puts.at(-1)).toEqual({
    names: { building: { "ศูนย์ ก (EMC)": { action: "create" } } },
    models: { "oki|es5112": { meter_category_id: 2, has_color_meter: false } },
  });

  await page.goto("/admin/import");
  await page.getByTestId("import-session-row").getByRole("link", { name: "ทำต่อ" }).click();
  await expect(page).toHaveURL(/\/admin\/import\/41$/);
  await expect(page.getByRole("combobox", { name: "ตัดสินชื่อ ศูนย์ ก (EMC)" })).toHaveValue("create");
  await expect(page.getByRole("combobox", { name: "หมวดมิเตอร์ของรุ่น ES5112" })).toHaveValue("2");

  await page.reload();
  await expect(page.getByRole("combobox", { name: "ตัดสินชื่อ ศูนย์ ก (EMC)" })).toHaveValue("create");
});

test("สร้างสัญญาจากค่าที่อ่านจากหัวไฟล์ แล้วบันทึก — ได้ลิงก์ไปภาพรวมของปีงบในไฟล์", async ({ page }) => {
  await assetFixture(page, "admin");
  const server = await importSessionFixture(page);
  await openUploadedSession(page);

  await page.getByRole("combobox", { name: "ตัดสินชื่อ ศูนย์ ก (EMC)" }).selectOption({ label: "สร้างอาคารใหม่ชื่อนี้" });
  await page.getByRole("combobox", { name: "หมวดมิเตอร์ของรุ่น ES5112" }).selectOption({ label: "A4 เลเซอร์ ขาวดำ" });
  await expect.poll(() => server.puts.length).toBeGreaterThan(0);
  await expect(page.getByRole("textbox", { name: "ราคาต่อหน้า A4 เลเซอร์ ขาวดำ" })).toHaveValue("0.41");

  await page.getByTestId("create-contract").click();
  await expect.poll(() => server.contractBodies.length).toBe(1);
  expect(server.contractBodies[0]).toMatchObject({
    contract_no: "TEST1/2569",
    effective_from: "2026-02-24",
    effective_to: "2029-02-23",
    monthly_rental: null,
    vat_rate: null,
    price_lines: [{ category_id: 2, price_per_page: "0.41" }],
  });

  await expect(page.getByTestId("import-commit")).toBeEnabled();
  await page.getByTestId("import-commit").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByTestId("import-result")).toBeVisible();
  expect(server.commits).toBe(1);
  await expect(page.getByTestId("open-dashboard")).toHaveAttribute("href", /\/dashboard\?fy=1/);
});
