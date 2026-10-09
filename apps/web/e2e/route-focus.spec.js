import { expect, test } from "@playwright/test";
import { prototypeFixture } from "./prototype-fixture.js";

async function fixture(page, role = "admin") {
  const state = await prototypeFixture(page, role);
  await page.route(/\/api\/audit-log(?:\?.*)?$/, (route) => route.fulfill({ json: { rows: [], total: 0 } }));
  await page.addInitScript(() => {
    window.pageFocusEvents = [];
    document.addEventListener("focusin", (event) => {
      if (event.target.matches("h1, main")) window.pageFocusEvents.push(event.target.textContent.trim());
    });
  });
  return state;
}

async function keyboardNavigate(page, path) {
  const link = page.locator(`aside a[href="${path}"]`).last();
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(path.replaceAll("/", "\\/") + "(?:\\?|$)"));
  const heading = page.locator("main h1");
  await expect(heading).toBeFocused();
  await expect(heading).toHaveAttribute("tabindex", "-1");
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  test(`keyboard navigation and history focus the destination heading at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await fixture(page);
    await page.goto("/assets");
    for (const path of ["/dashboard", "/compare", "/admin/import", "/report", "/admin/audit-log"]) await keyboardNavigate(page, path);
    await expect.poll(() => page.evaluate(() => window.pageFocusEvents.length)).toBe(5);
    await page.goBack();
    await expect(page.locator("main h1")).toBeFocused();
    await page.goForward();
    await expect(page.locator("main h1")).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.pageFocusEvents.length)).toBe(7);
    const heading = await page.locator("main h1").textContent();
    expect(await page.title()).toContain(heading.trim());
    // ไม่เพิ่ม tab stop และ Tab จากหัวเรื่องเดินต่อเข้าตัวกรองของหน้าจริง
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("ตั้งแต่วันที่", { exact: true })).toBeFocused();
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme });
      await expect(page.locator("html")).toHaveAttribute("data-mode", theme);
      await page.screenshot({ path: `../../output/finish-issue/284/focus-${viewport.width}-${theme}.png` });
    }
  });
}

test("query/hash/history and data refresh retain focused input and scroll", async ({ page }) => {
  await fixture(page);
  await page.goto("/admin/audit-log");
  const input = page.getByLabel("ค้นหา", { exact: true });
  await input.fill("focus stays here");
  await input.focus();
  // พื้นที่เลื่อนสังเคราะห์ทำให้ตรวจ preventScroll/query-only ได้โดยไม่อิงความยาวข้อมูล
  await page.evaluate(() => { document.querySelector("main").style.minHeight = "2000px"; window.scrollTo(0, 400); });
  const originalScroll = await page.evaluate(() => window.scrollY);
  expect(originalScroll).toBe(400);
  await page.evaluate(() => { history.pushState(history.state, "", "?view=one#filters"); history.pushState(history.state, "", "?view=two#filters"); });
  await page.goBack();
  await expect(input).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(originalScroll);
  await page.goForward();
  await expect(input).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(originalScroll);
  await expect.poll(() => page.evaluate(() => window.pageFocusEvents.length)).toBe(0);
});

test("heading focus preserves the router's Back scroll position", async ({ page }) => {
  await fixture(page);
  await page.goto("/assets");
  await expect(page.locator("main h1")).toBeVisible();
  await page.evaluate(() => { document.querySelector("main").style.minHeight = "2000px"; window.scrollTo(0, 400); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
  await keyboardNavigate(page, "/compare");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.goBack();
  await expect(page.locator("main h1")).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
});

test("initial login retains username autofocus and a final redirect focuses once", async ({ page }) => {
  await fixture(page);
  await page.route(/\/api\/auth\/me$/, (route) => route.fulfill({ status: 401, json: { title: "กรุณาเข้าสู่ระบบ", code: "no_token" } }));
  await page.goto("/login");
  await expect(page.getByLabel("ชื่อผู้ใช้", { exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.pageFocusEvents)).toEqual([]);
  await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("admin");
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill("fixture-only");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.locator("main h1")).toBeFocused();
  await keyboardNavigate(page, "/assets");
  // History API + popstate เป็นทางเข้าของ router เดียวกับ Back/Forward ไม่ reload แอป
  await page.evaluate(() => { history.pushState(history.state, "", "/admin/import-devices"); window.dispatchEvent(new PopStateEvent("popstate", { state: history.state })); });
  await expect(page).toHaveURL(/\/admin\/import(?:\?|$)/);
  await expect(page.locator("main h1")).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.pageFocusEvents.length)).toBe(3);
  await page.evaluate(() => { history.pushState(history.state, "", "/not-a-page"); window.dispatchEvent(new PopStateEvent("popstate", { state: history.state })); });
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page.locator("main h1")).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.pageFocusEvents.length)).toBe(4);
});

test("dialog open and close do not invoke page focus", async ({ page }) => {
  await fixture(page);
  await page.goto("/assets");
  await page.getByRole("button", { name: /^บัญชีของ/ }).click();
  await page.getByRole("menuitem", { name: /เปลี่ยนรหัสผ่าน/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(await page.evaluate(() => window.pageFocusEvents)).toEqual([]);
});
