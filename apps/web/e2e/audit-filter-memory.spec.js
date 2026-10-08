import { expect, test } from "@playwright/test";
import { assetFixture } from "./asset-fixture.js";

const selected = { entity: "device", user_id: "42", q: "SYNTHETIC-283", from: "2026-09-01", to: "2026-09-30" };
const fields = { entity: "ประเภท", user_id: "ผู้ทำ", q: "ค้นหา", from: "ตั้งแต่วันที่", to: "ถึงวันที่" };

async function fixture(page) {
  const state = await assetFixture(page);
  const requests = [];
  await page.route(/\/api\/users(?:\?.*)?$/, (route) => route.fulfill({ json: [{ id: 42, username: "synthetic-actor" }] }));
  await page.route(/\/api\/audit-log(?:\?.*)?$/, (route) => {
    requests.push(Object.fromEntries(new URL(route.request().url()).searchParams));
    return route.fulfill({ json: { rows: [], total: 0 } });
  });
  return { state, requests };
}

async function setFilters(page) {
  for (const [key, value] of Object.entries(selected)) {
    const input = page.getByLabel(fields[key], { exact: true });
    if (key === "entity" || key === "user_id") await input.selectOption(value);
    else await input.fill(value);
  }
}

async function assertFilters(page, values = selected) {
  for (const [key, value] of Object.entries(values)) await expect(page.getByLabel(fields[key], { exact: true })).toHaveValue(value);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  test(`audit filters survive menu, history and reload at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { requests } = await fixture(page);
    await page.goto("/admin/audit-log");
    await setFilters(page);
    await expect.poll(() => requests.at(-1)).toMatchObject(selected);
    await page.locator('aside a[href="/assets"]').click();
    await page.locator('aside a[href="/admin/audit-log"]').click();
    await assertFilters(page);
    await page.goBack();
    await page.goForward();
    await assertFilters(page);
    const before = requests.length;
    await page.reload();
    await assertFilters(page);
    await expect.poll(() => requests.length).toBeGreaterThan(before);
    expect(requests[before]).toMatchObject({ ...selected, page: "1" });
    // แถบบนยังเติม fy ตามระบบเดิมได้ แต่ตัวกรอง audit ทั้งห้าห้ามเข้าประวัติ URL
    for (const key of Object.keys(selected)) expect(new URL(page.url()).searchParams.has(key)).toBe(false);
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("suth:state:AuditLog")));
    expect(Object.keys(saved.values)).toEqual(["filters"]);
    expect(Object.keys(saved.values.filters).sort()).toEqual(Object.keys(selected).sort());
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme });
      await expect(page.locator("html")).toHaveAttribute("data-mode", theme);
      await page.screenshot({ path: `../../output/finish-issue/283/audit-${viewport.width}-${theme}.png` });
    }
  });
}

test("invalid saved shapes fall back before the first request", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-08T05:00:00Z"));
  const { requests } = await fixture(page);
  await page.goto("/admin/audit-log");
  await page.evaluate(() => sessionStorage.setItem("suth:state:AuditLog", JSON.stringify({ query: {}, values: { filters: { entity: "constructor", user_id: "-42", q: {}, from: "2026-02-30", to: "broken", rows: ["private"] } } })));
  requests.length = 0;
  await page.reload();
  await assertFilters(page, { entity: "", user_id: "", q: "" });
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests[0]).not.toHaveProperty("entity");
  expect(requests[0]).not.toHaveProperty("user_id");
  expect(requests[0]).not.toHaveProperty("q");
  expect(requests[0].from).toBe("2026-09-08");
  expect(requests[0].to).toBe("2026-10-08");
});

for (const mode of ["same-owner expiry", "new-owner expiry", "logout"]) {
  test(`audit filter lifetime: ${mode}`, async ({ page }) => {
    const { state, requests } = await fixture(page);
    await page.goto("/admin/audit-log");
    await setFilters(page);
    await expect.poll(() => requests.at(-1)).toMatchObject(selected);
    if (mode === "logout") {
      await page.getByRole("button", { name: /^บัญชีของ/ }).click();
      await page.getByRole("menuitem", { name: /ออกจากระบบ/ }).click();
      await expect(page).toHaveURL(/\/login$/);
      expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith("suth:")))).toEqual([]);
    } else {
      state.user = null;
      await page.reload();
      await expect(page).toHaveURL(/\/login\?redirect=/);
    }
    state.nextUser = { id: mode === "new-owner expiry" ? 2 : 1, username: "admin", role: "admin" };
    await page.getByLabel("ชื่อผู้ใช้").fill("admin");
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill("fixture-only");
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
    if (mode === "logout") await page.locator('aside a[href="/admin/audit-log"]').click();
    await assertFilters(page, mode === "same-owner expiry" ? selected : { entity: "", user_id: "", q: "" });
  });
}

test("audit table pagination is not persisted alongside filters", async ({ page }) => {
  await fixture(page);
  const rows = Array.from({ length: 60 }, (_, index) => ({ id: index + 1, occurred_at: "2026-10-08T05:00:00Z", username: "synthetic-actor", action: "update", summary: `Synthetic audit ${index + 1}`, before: null, after: null }));
  await page.route(/\/api\/audit-log(?:\?.*)?$/, (route) => route.fulfill({ json: { rows, total: rows.length } }));
  await page.goto("/admin/audit-log");
  await page.getByRole("combobox", { name: "จำนวนรายการต่อหน้า" }).selectOption("10");
  // รอให้ browser dispatch change และ Vue watchers แล้ว ก่อนตรวจ storage
  await expect(page.getByRole("combobox", { name: "จำนวนรายการต่อหน้า" })).toHaveValue("10");
  await page.locator('aside a[href="/assets"]').click();
  expect(await page.evaluate(() => sessionStorage.getItem("suth:table:AuditLog:audit-log"))).toBeNull();
  await page.locator('aside a[href="/admin/audit-log"]').click();
  await expect(page.getByRole("combobox", { name: "จำนวนรายการต่อหน้า" })).toHaveValue("50");
});

test("malformed memory query envelope cannot break an audit URL", async ({ page }) => {
  await fixture(page);
  await page.goto("/admin/audit-log");
  await page.evaluate(() => sessionStorage.setItem("suth:state:AuditLog", JSON.stringify({ query: null, values: { filters: { q: "old" } } })));
  await page.goto("/admin/audit-log?unknown=1");
  await expect(page.getByRole("heading", { name: "ประวัติการแก้ไข", exact: true })).toBeVisible();
  await assertFilters(page, { q: "" });
});
