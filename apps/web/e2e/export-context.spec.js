import { test, expect } from "@playwright/test";
import { comparisonFixture } from "./comparison-fixture.js";
import { prototypeFixture } from "./prototype-fixture.js";

test("failed reports explain the disabled export without hovering, then recover", async ({ page }) => {
  const state = await comparisonFixture(page);
  state.fail = true;
  await page.goto("/compare");
  const button = page.getByRole("button", { name: "ส่งออก", exact: true }).first();
  await expect(button).toBeDisabled();
  await expect(page.getByText("โหลดข้อมูลไม่สำเร็จ — ลองใหม่ก่อนส่งออก", { exact: true }).first()).toBeVisible();
  const description = await button.getAttribute("aria-describedby");
  expect(description).toBeTruthy();
  const note = page.locator(`[id="${description}"]`);
  await expect(note).toContainText("ปีงบ");
  await note.focus();
  await expect(note).toBeFocused();
  state.fail = false;
  await page.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await expect(button).toBeEnabled();
  await expect(note).toContainText("ทุกหน่วยงาน");
  await expect(note).not.toContainText("โหลดข้อมูลไม่สำเร็จ");
  await button.click();
  await expect(page.getByRole("menuitem")).toHaveCount(2);
});

test("loading and empty reports have different visible explanations", async ({ page }) => {
  const state = await comparisonFixture(page, { rows: [] });
  state.delay = 1200;
  await page.goto("/compare");
  const button = page.getByRole("button", { name: "ส่งออก", exact: true }).first();
  await expect(button).toBeDisabled();
  await expect(page.getByText("กำลังโหลดข้อมูลสำหรับส่งออก", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("ยังไม่มีการพิมพ์ในขอบเขตที่เลือก", { exact: true }).first()).toBeVisible();
  await expect(button).toBeDisabled();
  await expect(page.getByText("กำลังโหลดข้อมูลสำหรับส่งออก", { exact: true })).toHaveCount(0);
});

test("expense loading and failure explain the block and retry restores export", async ({ page }) => {
  const state = await prototypeFixture(page);
  state.expenseDelay = 1000;
  state.failExpense = true;
  await page.goto("/expense");
  const button = page.getByTestId("expense-export");
  await expect(button).toBeDisabled();
  await expect(page.getByText("กำลังโหลดข้อมูลสำหรับส่งออก", { exact: true })).toBeVisible();
  await expect(page.getByText("โหลดข้อมูลไม่สำเร็จ — ลองใหม่ก่อนส่งออก", { exact: true })).toBeVisible();
  state.failExpense = false;
  state.expenseDelay = 0;
  await page.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await expect(button).toBeEnabled();
  await expect(page.getByText("โหลดข้อมูลไม่สำเร็จ — ลองใหม่ก่อนส่งออก", { exact: true })).toHaveCount(0);
});

for (const width of [1280, 1440, 640, 720]) {
  for (const theme of ["light", "dark"]) {
    test(`export scope wraps without overflow at ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : width === 1440 ? 900 : width === 640 ? 400 : 450 });
      await page.addInitScript(theme => localStorage.setItem("suth-ui-mode", theme), theme);
      await comparisonFixture(page);
      await page.goto("/compare?division=1,2&months=2025-10,2025-11");
      await expect(page.locator("html")).toHaveAttribute("data-mode", theme);
      const button = page.getByRole("button", { name: "ส่งออก", exact: true }).first();
      await expect(button).toBeEnabled();
      const description = await button.getAttribute("aria-describedby");
      const note = page.locator(`[id="${description}"]`);
      await expect(note).toContainText("ข้อมูลทั้งหมดที่ตรงตัวกรอง");
      await expect(note).toContainText("ฝ่าย:");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("menuitem")).toHaveCount(2);
      await page.keyboard.press("Escape");
      await expect(button).toBeFocused();
    });
  }
}

test("expense export states its file scope and explains an unmatched search", async ({ page }) => {
  await prototypeFixture(page);
  await page.goto("/expense");
  const button = page.getByTestId("expense-export");
  await expect(button).toBeEnabled();
  const search = page.getByPlaceholder("เลขที่สัญญา, Serial, รุ่น…");
  await search.fill("NO-SUCH-DEVICE");
  await expect(button).toBeDisabled();
  await expect(page.getByText("ไม่มีเครื่องตรงคำค้น — เปลี่ยนหรือล้างคำค้นก่อนส่งออก", { exact: true })).toBeVisible();
  const description = await button.getAttribute("aria-describedby");
  expect(description).toBeTruthy();
  const note = page.locator(`[id="${description}"]`);
  await expect(note).toContainText("NO-SUCH-DEVICE");
  await expect(note).toContainText("ปีงบประมาณ");
  await note.focus();
  await expect(note).toBeFocused();
  await search.fill("");
  await expect(button).toBeEnabled();
  await expect(note).toContainText("ทุกเครื่องในสัญญา");
  await expect(note).not.toContainText("NO-SUCH-DEVICE");
});
