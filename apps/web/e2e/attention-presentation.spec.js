import { expect, test } from "@playwright/test";
import { prototypeFixture } from "./prototype-fixture.js";
import { CONTRAST_HELPERS } from "./contrast-helper.js";

const attention = [
  { code: "missing_readings", severity: "warning", title: "ค้างกรอก 3 เดือน", detail: "ตรวจยอดรายเดือน", count: 3,
    action: { label: "บันทึกจำนวนพิมพ์", to: "/print-transactions", query: { month: "2026-08" } } },
  { code: "unverified_installation", severity: "warning", title: "มี 20 เครื่องที่ยังไม่ได้ตรวจยืนยันสถานะการติดตั้ง", detail: "ตรวจสถานะก่อนยืนยันความครบถ้วน", count: 20,
    action: { label: "ตรวจยืนยันการติดตั้ง", to: "/admin/installation-review" } },
  { code: "idle_devices", severity: "info", title: "มี 17 เครื่องที่ไม่มีการพิมพ์ในปีงบนี้", detail: "ตรวจความจำเป็นก่อนต่อสัญญา", count: 17,
    action: { label: "ดูรายการเครื่อง", to: "/assets", query: { status: "active" } } },
];

async function expectBackground(locator, token) {
  await expect.poll(() => locator.evaluate((element, name) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = `var(${name})`;
    document.body.append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    // CSS transitions may serialize the same color as OKLab instead of OKLCH.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const pixel = (color) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].join(",");
    };
    return pixel(getComputedStyle(element).backgroundColor) === pixel(expected);
  }, token), { message: `Background settles to ${token}` }).toBe(true);
}

async function expectContrast(page, selector) {
  const result = await page.evaluate(`${CONTRAST_HELPERS} contrast.auditText(${JSON.stringify(selector)});`);
  expect(result.measured).toBeGreaterThan(0);
  expect(result.unsupported).toEqual([]);
  expect(result.failures, JSON.stringify(result.failures)).toEqual([]);
}

for (const mode of ["light", "dark"]) {
  for (const width of [1440, 1280]) {
    test(`attention counts and entry navigation ${mode} ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
      await page.addInitScript((value) => localStorage.setItem("suth-ui-mode", value), mode);
      await prototypeFixture(page);
      await page.route("**/api/dashboard/overview**", (route) => route.fulfill({ json: { attention,
        coverage: { total_months: 12, annual_complete_months: 12, months: [], verifiable: true } } }));
      await page.goto("/dashboard");
      const entry = page.getByRole("navigation").getByRole("link", { name: "บันทึกจำนวนพิมพ์", exact: true });
      await page.getByRole("button", { name: "งานที่ต้องติดตาม", exact: true }).click();
      const drawer = page.getByRole("dialog");
      await expect(drawer).toBeVisible();
      await drawer.evaluate((element) => Promise.all(
        element.getAnimations().map((animation) => animation.finished.catch(() => {}))
      ));
      const drawerBox = await drawer.boundingBox();
      expect(drawerBox.x).toBeGreaterThanOrEqual(0);
      expect(Math.round(drawerBox.x + drawerBox.width)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath("attention.png") });
      await expect(drawer.getByRole("heading", { name: "มีงานค้าง (2 รายการ)", exact: true })).toBeVisible();
      await expect(drawer.getByRole("heading", { name: "น่าตรวจสอบ (1 รายการ)", exact: true })).toBeVisible();
      await expectBackground(drawer.locator("#attention-warning + ul > li").first(), "--warn-soft");
      await expectBackground(drawer.locator("#attention-info + ul > li"), "--surface");
      await expectContrast(page, "[role='dialog']");
      await page.keyboard.press("Escape");
      await expect(drawer).not.toBeVisible();
      await expectBackground(entry, "--brand-soft");
      await expect(entry).not.toHaveAttribute("aria-current", "page");
      await expectContrast(page, "aside nav");
      await entry.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/print-transactions/);
      await expect(entry).toHaveAttribute("aria-current", "page");
      await expectBackground(entry, "--brand");
      await expectContrast(page, "aside nav");
      await page.screenshot({ path: testInfo.outputPath("navigation-active.png") });
      await page.getByRole("button", { name: "พับเมนู", exact: true }).click();
      await expect(entry).toHaveAccessibleName("บันทึกจำนวนพิมพ์");
      await expect(entry).toHaveAttribute("aria-current", "page");
      await expectBackground(entry, "--brand");
    });
  }
}
