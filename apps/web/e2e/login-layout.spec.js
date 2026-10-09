import { expect, test } from "@playwright/test";
import { assetFixture } from "./asset-fixture.js";

const viewports = [[1920, 940], [1440, 900], [1366, 650], [1280, 600], [925, 501],
  [768, 1024], [390, 844], [390, 664], [360, 640], [320, 568]];

for (const mode of ["light", "dark"]) {
  for (const [width, height] of viewports) {
    test(`login fits and keeps its reading order ${mode} ${width}x${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      const state = await assetFixture(page);
      state.user = null;
      await page.addInitScript(value => localStorage.setItem("suth-ui-mode", value), mode);
      await page.goto("/login");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("SUTH Helpdesk Assets");
      await expect(page.getByText("ระบบดูแลทรัพย์สินและงานพิมพ์", { exact: true })).toBeVisible();
      await page.locator(".auth-logo img").evaluate(async image => { await image.decode(); });
      await page.evaluate(() => document.fonts.ready);
      const bounds = await page.evaluate(() => {
        const rect = selector => {
          const { x, y, width, height, bottom, right } = document.querySelector(selector).getBoundingClientRect();
          return { x, y, width, height, bottom, right };
        };
        return { logo: rect(".auth-logo"), card: rect(".auth-card"), footer: rect("footer"),
          stage: rect(".login"), scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight, clientWidth: document.documentElement.clientWidth };
      });
      expect(bounds.scrollWidth).toBeLessThanOrEqual(width);
      expect(bounds.scrollHeight).toBeLessThanOrEqual(height);
      expect(bounds.clientWidth).toBe(width);
      expect(bounds.stage.right).toBe(width);
      expect(bounds.footer.y).toBeGreaterThanOrEqual(bounds.card.bottom);
      expect(bounds.footer.bottom).toBeCloseTo(height, 0);
      if (width >= 900 || (width >= 720 && height <= 600)) {
        expect(bounds.logo.right).toBeLessThan(bounds.card.x);
      } else {
        expect(bounds.logo.bottom).toBeLessThanOrEqual(bounds.card.y);
      }
      const remember = await page.getByText("จดจำชื่อผู้ใช้", { exact: true }).boundingBox();
      const help = await page.getByRole("button", { name: "ลืมรหัสผ่าน?", exact: true }).boundingBox();
      expect(remember.x + remember.width).toBeLessThan(help.x);
      expect(Math.abs(remember.y + remember.height / 2 - help.y - help.height / 2)).toBeLessThan(1);
      await expect(page.locator("footer")).toContainText("แผนกสารสนเทศ");
      await expect(page.locator("footer")).toContainText(/© 25\d{2}/);
      await page.screenshot({ path: testInfo.outputPath("login.png") });
    });
  }
}
