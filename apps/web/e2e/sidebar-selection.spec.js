import { expect, test } from "@playwright/test";
import { prototypeFixture } from "./prototype-fixture.js";

for (const role of ["admin", "staff", "viewer"]) {
  test(`print entry selection follows navigation for ${role}`, async ({ page }) => {
    await prototypeFixture(page, role);
    await page.goto("/dashboard");
    const nav = page.locator("aside nav");
    const entry = nav.getByRole("link", { name: "บันทึกจำนวนพิมพ์", exact: true });
    const assets = nav.getByRole("link", { name: "ทะเบียนเครื่องพิมพ์", exact: true });
    // Two inactive items in the same group must not look selected differently.
    const inactive = await assets.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, weight: getComputedStyle(el).fontWeight }));
    await expect(entry).toHaveCSS("background-color", inactive.background);
    await expect(entry).toHaveCSS("font-weight", inactive.weight);
    await entry.click();
    await expect(page).toHaveURL(/\/print-transactions(?:\?|$)/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(entry).toHaveAttribute("aria-current", "page");
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await nav.getByRole("link", { name: "ภาพรวมการพิมพ์", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
    await expect(entry).not.toHaveAttribute("aria-current", "page");
    await expect(entry).toHaveCSS("background-color", inactive.background);
    await page.goBack();
    await expect(entry).toHaveAttribute("aria-current", "page");
    await page.goForward();
    await expect(entry).not.toHaveAttribute("aria-current", "page");
  });
}

test("contract heading omits the redundant sidebar category", async ({ page }) => {
  await prototypeFixture(page, "admin");
  await page.goto("/admin/contracts");
  const heading = page.getByRole("heading", { level: 1, name: "สัญญาเช่า" });
  await expect(heading).toBeVisible();
  await expect(page.locator("header").filter({ has: heading }).locator(".eyebrow")).toHaveCount(0);
});
