import { expect, test } from "@playwright/test";
import { assetFixture } from "./asset-fixture.js";
import { CONTRAST_HELPERS } from "./contrast-helper.js";

async function auditContrast(page, scope) {
  const result = await page.evaluate(`${CONTRAST_HELPERS} contrast.auditText(${JSON.stringify(scope)});`);
  expect(result.measured).toBeGreaterThan(0);
  expect(result.unsupported).toEqual([]);
  expect(result.failures, JSON.stringify(result.failures)).toEqual([]);
}

for (const mode of ["light", "dark"]) {
  for (const width of [1440, 1280]) {
    test(`login hierarchy and password keyboard behavior ${mode} ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
      const state = await assetFixture(page);
      state.user = null;
      await page.addInitScript((value) => localStorage.setItem("suth-ui-mode", value), mode);
      await page.goto("/login");
      const username = page.getByLabel("ชื่อผู้ใช้", { exact: true });
      const password = page.getByLabel("รหัสผ่าน", { exact: true });
      await auditContrast(page, ".login__form");
      await username.fill("synthetic-user");
      await password.fill("fixture-only");
      await auditContrast(page, ".login__form");
      await page.screenshot({ path: testInfo.outputPath("login.png") });
      const sizes = await username.evaluate((input) => ({
        label: parseFloat(getComputedStyle(input.labels[0]).fontSize),
        input: parseFloat(getComputedStyle(input).fontSize),
      }));
      expect(sizes.label).toBeGreaterThan(sizes.input);
      await expect(page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).locator("svg")).toHaveCount(0);
      await expect(username).toHaveAttribute("autocomplete", "username");
      await expect(password).toHaveAttribute("autocomplete", "current-password");
      const toggle = page.getByRole("button", { name: /^แสดงรหัสผ่าน/ });
      await page.keyboard.press("Tab");
      await expect(toggle).toBeFocused();
      await page.keyboard.press("Space");
      await expect(password).toHaveAttribute("type", "text");
      await expect(page.getByRole("button", { name: "ซ่อนรหัสผ่าน", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.screenshot({ path: testInfo.outputPath("password-visible.png") });
      await page.keyboard.press("Enter");
      await expect(password).toHaveAttribute("type", "password");
    });
  }
}

for (const [role, label] of [["admin", "ผู้ดูแลระบบ"], ["staff", "เจ้าหน้าที่"], ["viewer", "ดูอย่างเดียว"]]) {
  for (const mode of ["light", "dark"]) {
    for (const width of [1440, 1280]) {
      test(`account identity shows ${role} without opening menu ${mode} ${width}`, async ({ page }, testInfo) => {
        const state = await assetFixture(page, role);
        state.user.username = "synthetic-long-account-name-for-desktop";
        await page.addInitScript((value) => localStorage.setItem("suth-ui-mode", value), mode);
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
        await page.goto("/assets");
        const account = page.getByRole("button", { name: /^บัญชีของ/ });
        await expect(account).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("identity.png") });
        await expect(account.getByText(label, { exact: true })).toBeVisible();
        await expect(account).toContainText(state.user.username);
        await expect(account).toHaveAccessibleName(`บัญชีของ ${state.user.username} — ${label}`);
        await expect(page.getByRole("menu")).toHaveCount(0);
        await auditContrast(page, "header[data-print='hide']");
        const box = await account.boundingBox();
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      });
    }
  }
}

test("Enter submits once while login is pending and keeps typed values on failure", async ({ page }) => {
  const state = await assetFixture(page);
  state.user = null;
  let requests = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/auth/login", async (route) => {
    requests += 1;
    await pending;
    await route.fulfill({ status: 401, json: { title: "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง" } });
  });
  await page.goto("/login");
  await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("synthetic-user");
  const password = page.getByLabel("รหัสผ่าน", { exact: true });
  await password.fill("fixture-only");
  await password.press("Enter");
  await expect(page.getByRole("button", { name: "กำลังเข้าสู่ระบบ…", exact: true })).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(password).toBeDisabled();
  expect(requests).toBe(1);
  release();
  await expect(page.getByRole("alert")).toContainText("ข้อมูลเข้าสู่ระบบไม่ถูกต้อง");
  await expect(password).toHaveValue("fixture-only");
  await expect(password).toBeEnabled();
});
