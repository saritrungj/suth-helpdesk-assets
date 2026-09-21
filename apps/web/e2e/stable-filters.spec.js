import { test, expect } from "@playwright/test";
import { comparisonFixture } from "./comparison-fixture.js";

for (const path of ["/assets", "/print-transactions", "/report"]) {
  test(`${path}: same-named floors remain separate options with their building labels`, async ({ page }) => {
    await comparisonFixture(page);
    await page.route(/\/api\/buildings$/, (route) => route.fulfill({ json: [
      { id: 1, name: "อาคารผู้ป่วยนอก" },
      { id: 2, name: "อาคารผู้ป่วยใน" },
    ] }));
    await page.route(/\/api\/floors$/, (route) => route.fulfill({ json: [
      { id: 1, name: "ชั้น 2", building_id: 1 },
      { id: 2, name: "ชั้น 2", building_id: 2 },
    ] }));
    await page.goto(path);
    await page.getByRole("button", { name: /ตัวกรอง/ }).first().click();
    await page.getByRole("button", { name: "ชั้น ทุกชั้น", exact: true }).click();
    await expect(page.getByRole("option", { name: "ชั้น 2 — อาคารผู้ป่วยนอก", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "ชั้น 2 — อาคารผู้ป่วยใน", exact: true })).toBeVisible();
  });
}

for (const path of ["/assets", "/print-transactions", "/report"]) {
  test(`${path}: reference failure has a working retry`, async ({ page }) => {
    await comparisonFixture(page);
    let failed = true;
    await page.route(/\/api\/buildings$/, route => route.fulfill(failed
      ? { status: 503, json: {} }
      : { json: [{ id: 1, name: "อาคารผู้ป่วยนอก" }] }));
    await page.goto(path);
    const alert = page.getByRole("alert").filter({ hasText: "โหลดข้อมูลอ้างอิงไม่สำเร็จ" });
    await expect(alert).toBeVisible();
    failed = false;
    await alert.getByRole("button", { name: "ลองใหม่", exact: true }).click();
    await expect(alert).not.toBeVisible();
    await page.getByRole("button", { name: /ตัวกรอง/ }).first().click();
    await page.getByRole("button", { name: "อาคาร ทุกอาคาร", exact: true }).click();
    await expect(page.getByRole("option", { name: "อาคารผู้ป่วยนอก", exact: true })).toBeVisible();
  });
}

for (const path of ["/assets", "/print-transactions", "/report"]) {
  test(`${path}: ambiguous legacy floor is removed with a notice`, async ({ page }) => {
    await comparisonFixture(page);
    await page.route(/\/api\/floors$/, route => route.fulfill({ json: [
      { id: 1, name: "ชั้น 2", building_id: 1 },
      { id: 2, name: "ชั้น 2", building_id: 2 },
    ] }));
    await page.goto(`${path}?floor=${encodeURIComponent("ชั้น 2")}`);
    await expect(page.getByRole("status").filter({ hasText: "ตัวกรองจากลิงก์" })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has("floor")).toBe(false);
  });
}

for (const path of ["/assets", "/print-transactions", "/report"]) {
  test(`${path}: duplicate department names select only the chosen ID`, async ({ page }) => {
    await comparisonFixture(page);
    await page.route(/\/api\/divisions$/, route => route.fulfill({ json: [
      { id: 1, name: "ฝ่าย A" }, { id: 2, name: "ฝ่าย B" },
    ] }));
    await page.route(/\/api\/departments$/, route => route.fulfill({ json: [
      { id: 11, name: "งานบริการ", division_id: 1 }, { id: 21, name: "งานบริการ", division_id: 2 },
    ] }));
    await page.route(/\/api\/devices$/, route => route.fulfill({ json: [
      { id: 101, serial_number: "DEPT-A", status: "active", division_id: 1, division_name: "ฝ่าย A", department_id: 11, department_name: "งานบริการ" },
      { id: 102, serial_number: "DEPT-B", status: "active", division_id: 2, division_name: "ฝ่าย B", department_id: 21, department_name: "งานบริการ" },
    ] }));
    await page.goto(path);
    await page.getByRole("button", { name: /ตัวกรอง/ }).first().click();
    await page.getByRole("button", { name: "แผนก ทุกแผนก", exact: true }).click();
    await expect(page.getByRole("option", { name: "งานบริการ — ฝ่าย A", exact: true })).toBeVisible();
    await page.getByRole("option", { name: "งานบริการ — ฝ่าย B", exact: true }).click();
    await expect(page.getByRole("link", { name: "DEPT-B", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "DEPT-A", exact: true })).toHaveCount(0);
  });
}

for (const path of ["/assets", "/print-transactions", "/report"]) {
  test(`${path}: parent resolves a legacy floor name and preserves both IDs`, async ({ page }) => {
    await comparisonFixture(page);
    await page.route(/\/api\/floors$/, route => route.fulfill({ json: [
      { id: 1, name: "ชั้น 2", building_id: 1 }, { id: 2, name: "ชั้น 2", building_id: 2 },
    ] }));
    await page.goto(`${path}?building=${encodeURIComponent("อาคารใหม่")}&floor=${encodeURIComponent("ชั้น 2")}`);
    await expect.poll(() => new URL(page.url()).searchParams.get("building")).toBe("2");
    await expect.poll(() => new URL(page.url()).searchParams.get("floor")).toBe("2");
    await expect(page.getByRole("button", { name: "ชั้น ชั้น 2 — อาคารใหม่", exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "ตัวกรองจากลิงก์" })).toHaveCount(0);
  });
}


for (const path of ["/assets", "/print-transactions", "/report"]) {
  test(`${path}: reference query follows history and rejects an unknown ID`, async ({ page }) => {
    await comparisonFixture(page);
    await page.route(/\/api\/floors$/, route => route.fulfill({ json: [
      { id: 1, name: "ชั้น 2", building_id: 1 }, { id: 2, name: "ชั้น 2", building_id: 2 },
    ] }));
    await page.goto(`${path}?building=1&floor=1`);
    await expect(page.getByRole("button", { name: "ชั้น ชั้น 2 — อาคารผู้ป่วยนอก", exact: true })).toBeVisible();
    // Simulate same-document browser navigation through the public History API.
    await page.evaluate((url) => {
      history.pushState({}, "", url);
      dispatchEvent(new PopStateEvent("popstate"));
    }, `${path}?building=2&floor=2`);
    await expect(page.getByRole("button", { name: "ชั้น ชั้น 2 — อาคารใหม่", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("button", { name: "ชั้น ชั้น 2 — อาคารผู้ป่วยนอก", exact: true })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("button", { name: "ชั้น ชั้น 2 — อาคารใหม่", exact: true })).toBeVisible();
    await page.goto(`${path}?floor=999999`);
    await expect(page.getByRole("status").filter({ hasText: "ตัวกรองจากลิงก์" })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has("floor")).toBe(false);
  });
}
