import { expect, test } from "@playwright/test";
import { comparisonFixture } from "./comparison-fixture.js";

for (const theme of ["light", "dark"]) {
  for (const width of [1902, 1440, 1280, 640, 320]) {
    for (const [route, title] of [["dashboard", "ภาพรวมการพิมพ์"], ["compare", "เปรียบเทียบการพิมพ์"]]) {
      test(`${route} actions and export context align at ${width} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
        await page.addInitScript(theme => localStorage.setItem("suth-ui-mode", theme), theme);
        await comparisonFixture(page, { role: "admin" });
        await page.goto(`/${route}`);
        const heading = page.getByRole("heading", { level: 1, name: title });
        const header = page.locator("header").filter({ has: heading });
        const exportButton = header.getByRole("button", { name: "ส่งออก", exact: true });
        await expect(exportButton).toBeEnabled();
        await page.evaluate(() => document.fonts.ready);
        const noteId = await exportButton.getAttribute("aria-describedby");
        const note = page.locator(`[id="${noteId}"]`);
        await expect(note).toContainText("ข้อมูลทั้งหมดที่ตรงตัวกรอง");
        const buttons = header.locator("button, a");
        const boxes = await buttons.evaluateAll(nodes => nodes.map(node => {
          const rect = node.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
        }));
        const noteBox = await note.boundingBox();
        expect(noteBox.y).toBeGreaterThanOrEqual(Math.max(...boxes.map(box => box.bottom)));
        if (width >= 1280) {
          expect(Math.max(...boxes.map(box => box.top)) - Math.min(...boxes.map(box => box.top))).toBeLessThan(1);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        for (const box of boxes) expect(box.right).toBeLessThanOrEqual(width);
        await exportButton.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("menuitem")).toHaveCount(2);
        await page.keyboard.press("Escape");
        await expect(exportButton).toBeFocused();
        await header.screenshot({ path: `output/playwright/${route}-${width}-${theme}.png` });
      });
    }
  }

  test(`shell controls follow the 8px radius contract ${theme}`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem("suth-ui-mode", theme), theme);
    await comparisonFixture(page, { role: "admin" });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "ภาพรวมการพิมพ์" })).toBeVisible();
    const controls = [
      page.getByRole("link", { name: "ภาพรวมการพิมพ์", exact: true }),
      page.getByRole("link", { name: "บันทึกจำนวนพิมพ์", exact: true }),
      page.getByRole("button", { name: "พับเมนู", exact: true }),
      page.getByRole("button", { name: /ค้นหาหน้า…/ }),
      page.locator("header").first().getByRole("button", { name: /ปีงบ.*2569/ }),
      page.getByRole("button", { name: /บัญชีของ/ }),
      page.getByTestId("app-notifications"),
    ];
    for (const control of controls) {
      await expect(control).toBeVisible();
      expect(await control.evaluate(el => getComputedStyle(el).borderTopLeftRadius)).toBe("8px");
    }
    await expect(page.locator("aside nav [aria-current=page]")).toHaveCount(1);
  });
}
