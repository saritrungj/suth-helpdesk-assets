import { expect, test } from "@playwright/test";
import { assetFixture } from "./asset-fixture.js";

test.beforeEach(async ({ page }) => {
  const state = await assetFixture(page);
  state.user = null;
  await page.route("**/api/auth/login", route => route.fulfill({ status: 401, json: { title: "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง" } }));
  await page.goto("/login");
});

test("forgot password opens the approved support contact without moving focus", async ({ page }) => {
  const help = page.getByRole("button", { name: "ลืมรหัสผ่าน?", exact: true });
  await expect(help).toHaveAttribute("aria-expanded", "false");
  await help.click();
  await expect(help).toBeFocused();
  await expect(help).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("heading", { name: "ติดต่อแผนกสารสนเทศ" })).toBeVisible();
  await expect(page.getByRole("link", { name: "0 4437 6555" })).toHaveAttribute("href", "tel:044376555");
  await help.click();
  await expect(page.getByRole("link", { name: "0 4437 6555" })).toBeHidden();
});

test("remembering is opt-in, stores only the username and clears immediately on opt-out", async ({ page }) => {
  const username = page.getByLabel("ชื่อผู้ใช้", { exact: true });
  const password = page.getByLabel("รหัสผ่าน", { exact: true });
  const remember = page.getByRole("checkbox", { name: "จดจำชื่อผู้ใช้" });
  await expect(remember).not.toBeChecked();
  await username.fill("synthetic-user");
  await password.fill("fixture-only-secret");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("suth.login.username"))).toBeNull();
  await remember.check();
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("suth.login.username"))).toBe("synthetic-user");
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain("fixture-only-secret");
  await page.reload();
  await expect(username).toHaveValue("synthetic-user");
  await expect(password).toHaveValue("");
  await expect(remember).toBeChecked();
  await remember.uncheck();
  expect(await page.evaluate(() => localStorage.getItem("suth.login.username"))).toBeNull();
  await page.reload();
  await expect(username).toHaveValue("");
  await expect(remember).not.toBeChecked();
});

test("Caps Lock live region does not guess from uppercase, Shift or synthetic events", async ({ page }) => {
  const password = page.getByLabel("รหัสผ่าน", { exact: true });
  await expect(page.locator("#current-password-caps")).toHaveAttribute("role", "status");
  await password.focus();
  await page.keyboard.press("Shift+A");
  await expect(page.getByText("Caps Lock เปิดอยู่", { exact: true })).toHaveCount(0);
  await password.dispatchEvent("keydown", { key: "CapsLock", modifiers: ["CapsLock"] });
  await expect(page.getByText("Caps Lock เปิดอยู่", { exact: true })).toHaveCount(0);
  await expect(password).toBeFocused();
});

test("minimum-height screens and expanded errors remain scrollable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 300 });
  await page.getByRole("button", { name: "ลืมรหัสผ่าน?", exact: true }).click();
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByText("กรอกชื่อผู้ใช้", { exact: true })).toBeVisible();
  await expect(page.getByText("กรอกรหัสผ่าน", { exact: true })).toBeVisible();
  await page.locator("footer").scrollIntoViewIfNeeded();
  const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, scroll: scrollY }));
  expect(size.width).toBeLessThanOrEqual(320);
  expect(size.height).toBeGreaterThan(300);
  expect(size.scroll).toBeGreaterThan(0);
  await expect(page.locator("footer")).toBeInViewport();
});

for (const mode of ["light", "dark"]) {
  test(`successful login follows redirect and restores the authenticated palette ${mode}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem("suth-ui-mode", value), mode);
    await page.goto("/login?redirect=/assets");
    const baseline = await page.locator("html").evaluate(el => ({
      canvas: getComputedStyle(el).getPropertyValue("--canvas").trim(),
      surface: getComputedStyle(el).getPropertyValue("--surface").trim(),
      brand: getComputedStyle(el).getPropertyValue("--brand").trim(),
    }));
    await page.unroute("**/api/auth/login");
    await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("synthetic-user");
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill("fixture-only");
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await expect(page).toHaveURL(/\/assets$/);
    await expect(page.locator(".auth-stage")).toHaveCount(0);
    const restored = await page.locator("html").evaluate(el => ({
      canvas: getComputedStyle(el).getPropertyValue("--canvas").trim(),
      surface: getComputedStyle(el).getPropertyValue("--surface").trim(),
      brand: getComputedStyle(el).getPropertyValue("--brand").trim(),
    }));
    expect(restored).toEqual(baseline);
    await expect(page.locator("html")).toHaveCSS("scrollbar-gutter", "stable");
    await expect(page.locator("body")).toHaveCSS("background-image", "none");
  });
}
