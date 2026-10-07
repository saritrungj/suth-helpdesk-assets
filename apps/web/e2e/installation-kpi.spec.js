import { expect, test } from "@playwright/test";
import { comparisonFixture } from "./comparison-fixture.js";

async function installationFixture(page) {
  await comparisonFixture(page);
  const state = { fail: false, delay: 0, requests: [], counts: null, pending: null };
  await page.route("**/api/dashboard/installation-summary**", async (route) => {
    const ids = new URL(route.request().url()).searchParams.get("contract_ids") || "";
    state.requests.push(ids);
    if (state.pending) await state.pending;
    if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
    if (state.fail) return route.fulfill({ status: 503, json: { title: "Unavailable" } });
    return route.fulfill({ json: state.counts ?? (ids === "unassigned" ? { installed: 2, not_installed: 1, unverified: 1 }
      : ids === "7,unassigned" ? { installed: 7, not_installed: 3, unverified: 2 }
      : ids === "7,8" ? { installed: 8, not_installed: 3, unverified: 1 }
      : ids === "7" ? { installed: 5, not_installed: 2, unverified: 1 }
      : ids === "999" ? { installed: 0, not_installed: 0, unverified: 0 }
      : { installed: 13, not_installed: 4, unverified: 2 }) });
  });
  return state;
}

const stats = (page) => page.getByRole("region", { name: "สรุปตัวเลขสำคัญ" });
const stat = (page, label) => stats(page).locator(":scope > div").filter({ has: page.getByText(label, { exact: true }) });

for (const mode of ["light", "dark"]) {
  for (const width of [1440, 1280]) {
    test(`overview shows current installation counts ${mode} ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
      await page.addInitScript((value) => localStorage.setItem("suth-ui-mode", value), mode);
      await installationFixture(page);
      await page.goto("/dashboard");
      await expect(stat(page, "ติดตั้งแล้ว")).toContainText("13");
      await expect(stat(page, "ยังไม่ได้ติดตั้ง")).toContainText("4");
      await expect(stats(page).locator(":scope > div")).toHaveCount(4);
      await expect(stats(page)).not.toContainText("ราคาเฉลี่ยต่อหน้า");
      await expect(stats(page)).not.toContainText("เครื่องที่มีการพิมพ์");
      await expect(stats(page)).toContainText("5,970");
      await expect(stats(page)).toContainText("2,632.77");
      await expect(page.getByText("ยังไม่ตรวจยืนยันการติดตั้ง 2 เครื่อง — ไม่รวมในสองจำนวนข้างต้น", { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("overview.png") });
      await page.goto("/compare");
      await expect(stats(page)).toContainText("ราคาเฉลี่ยต่อหน้า");
      await expect(stats(page)).not.toContainText("ยังไม่ได้ติดตั้ง");
    });
  }
}

test("installation scope uses all current contracts and ignores the report month", async ({ page }) => {
  const state = await installationFixture(page);
  await page.goto("/dashboard?contract=7,8");
  await expect(stat(page, "ติดตั้งแล้ว")).toContainText("8");
  await expect(stat(page, "ยังไม่ได้ติดตั้ง")).toContainText("3");
  expect(state.requests).toContain("7,8");
  await page.goto("/dashboard?contract=7,8&months=2025-10");
  await expect(stat(page, "ติดตั้งแล้ว")).toContainText("8");
  await expect(stat(page, "ยังไม่ได้ติดตั้ง")).toContainText("3");
});

test("failed new scope hides previous counts and has retry", async ({ page }) => {
  const state = await installationFixture(page);
  await page.goto("/dashboard");
  await expect(stat(page, "ติดตั้งแล้ว")).toContainText("13");
  state.fail = true;
  await page.goto("/dashboard?contract=7");
  await expect(page.getByText("โหลดสถานะการติดตั้งไม่สำเร็จ", { exact: true })).toBeVisible();
  await expect(stat(page, "ติดตั้งแล้ว")).toContainText("—");
  await expect(stat(page, "ติดตั้งแล้ว")).not.toContainText("13");
  await expect(stat(page, "ยังไม่ได้ติดตั้ง")).toContainText("—");
  state.fail = false;
  await page.getByRole("alert").filter({ hasText: "โหลดสถานะการติดตั้งไม่สำเร็จ" }).getByRole("button", { name: "ลองใหม่" }).click();
  await expect(stat(page, "ติดตั้งแล้ว")).toContainText("5");
  await expect(stat(page, "ยังไม่ได้ติดตั้ง")).toContainText("2");
});

test("unassigned-only and mixed contracts use the current registry scope", async ({ page }) => {
  const state = await installationFixture(page);
  await page.goto("/dashboard?contract=unassigned");
  await expect(stat(page, "ติดตั้งแล้ว")).toContainText("2");
  await expect(stat(page, "ยังไม่ได้ติดตั้ง")).toContainText("1");
  expect(state.requests).toContain("unassigned");
  await page.goto("/dashboard?contract=7,unassigned");
  await expect(stat(page, "ติดตั้งแล้ว")).toContainText("7");
  await expect(stat(page, "ยังไม่ได้ติดตั้ง")).toContainText("3");
  expect(state.requests).toContain("7,unassigned");
});

test("pending counts announce loading then render verified zero without an unknown notice", async ({ page }) => {
  const state = await installationFixture(page);
  let release;
  state.pending = new Promise((resolve) => { release = resolve; });
  state.counts = { installed: 0, not_installed: 0, unverified: 0 };
  await page.goto("/dashboard");
  await expect(stat(page, "ติดตั้งแล้ว")).toHaveAttribute("aria-busy", "true");
  await expect(stat(page, "ยังไม่ได้ติดตั้ง")).toHaveAttribute("aria-busy", "true");
  await expect(stat(page, "ติดตั้งแล้ว")).not.toContainText("13");
  release();
  await expect(stat(page, "ติดตั้งแล้ว").locator("span").filter({ hasText: /^0$/ })).toBeVisible();
  await expect(stat(page, "ยังไม่ได้ติดตั้ง").locator("span").filter({ hasText: /^0$/ })).toBeVisible();
  await expect(stat(page, "ติดตั้งแล้ว")).not.toHaveAttribute("aria-busy", "true");
  await expect(page.getByText(/ยังไม่ตรวจยืนยันการติดตั้ง \d+ เครื่อง —/)).toHaveCount(0);
});
