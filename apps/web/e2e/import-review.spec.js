import { test, expect } from "@playwright/test";
import { importReviewFixture } from "./import-review-fixture.js";

test("editing a decision immediately hides old preview and disables confirmation until checked", async ({ page }) => {
  const state = await importReviewFixture(page);
  await page.goto("/admin/import/41");
  const commit = page.getByTestId("import-commit");
  await expect(commit).toBeEnabled();
  await expect(commit).toContainText("5 รายการ");
  state.delay = 1000;
  await page.getByRole("combobox", { name: "ตัดสินชื่อ Review building" }).selectOption("alias:1");
  await expect(commit).toBeDisabled({ timeout: 400 });
  await expect(page.getByTestId("import-preview")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "กำลังบันทึกการเลือกและตรวจใหม่" })).toBeVisible();
  await expect(commit).toBeEnabled();
  await expect(commit).toContainText("4 รายการ");
  expect(state.puts).toHaveLength(1);
  expect(state.commits).toHaveLength(0);
});

test("a second edit during a request waits for its own preview", async ({ page }) => {
  const state = await importReviewFixture(page);
  await page.goto("/admin/import/41");
  const choice = page.getByRole("combobox", { name: "ตัดสินชื่อ Review building" });
  const commit = page.getByTestId("import-commit");
  await expect(commit).toBeEnabled();
  state.delay = 1200;
  await choice.selectOption("alias:1");
  await expect.poll(() => state.puts.length).toBe(1);
  await choice.selectOption("create");
  await expect(commit).toBeDisabled();
  await expect.poll(() => state.puts.length).toBe(2);
  await expect(commit).toBeDisabled();
  await expect(page.getByTestId("import-preview")).toHaveCount(0);
  await expect(commit).toBeEnabled();
  await expect(commit).toContainText("5 รายการ");
  expect(state.puts[1].fingerprint).toBe("review-2");
  expect(state.commits).toHaveLength(0);
});

test("confirmation keeps the shown fingerprint and requires a new human confirmation after 409", async ({ page }) => {
  const state = await importReviewFixture(page);
  await page.goto("/admin/import/41");
  const commit = page.getByTestId("import-commit");
  await commit.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  state.revision++;
  state.building = { action: "alias", target_id: 1 };
  await dialog.getByRole("button", { name: "ยืนยันบันทึก", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "ถูกแก้จากหน้าอื่น" })).toBeVisible();
  await expect(commit).toContainText("4 รายการ");
  expect(state.commits).toEqual([{ fingerprint: "review-1" }]);
  await expect(page.getByTestId("import-result")).toHaveCount(0);
  await commit.click();
  await expect(dialog).toBeVisible();
  expect(state.commits).toHaveLength(1);
  await dialog.getByRole("button", { name: "ยืนยันบันทึก", exact: true }).click();
  await expect(page.getByTestId("import-result")).toBeVisible();
  expect(state.commits[1]).toEqual({ fingerprint: "review-2" });
  await expect(page.getByTestId("open-dashboard")).toHaveAttribute("href", "/dashboard?fy=1");
  await expect(page.getByTestId("import-commit")).toHaveCount(0);
});

for (const outcome of ["data_changed", "failed", "503"]) {
  test(`commit ${outcome} shows no success and never automatically submits twice`, async ({ page }) => {
    const state = await importReviewFixture(page);
    state.outcome = outcome;
    state.commitDelay = 700;
    await page.goto("/admin/import/41");
    const commit = page.getByTestId("import-commit");
    await commit.click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ยืนยันบันทึก", exact: true }).click();
    await expect.poll(() => state.commits.length).toBe(1);
    await expect(commit).toBeDisabled();
    await expect(page.getByTestId("import-result")).toHaveCount(0);
    if (outcome === "data_changed") await expect(page.getByTestId("import-notice")).toBeVisible();
    else if (outcome === "failed") await expect(page.getByTestId("import-error")).toBeVisible();
    else await expect(page.locator("#main-content").getByRole("alert").filter({ hasText: "บันทึกไม่สำเร็จ กรุณาตรวจอีกครั้ง" })).toBeVisible();
    expect(state.commits).toHaveLength(1);
    await page.getByTestId("revalidate").click();
    await expect(commit).toBeEnabled();
    expect(state.commits).toHaveLength(1);
  });
}

for (const role of ["staff", "viewer"]) {
  test(`${role} cannot reach import confirmation`, async ({ page }) => {
    const state = await importReviewFixture(page, { role });
    await page.goto("/admin/import/41");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId("import-commit")).toHaveCount(0);
    expect(state.commits).toHaveLength(0);
  });
}

for (const width of [1280, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`long review keeps one confirmation visible at ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
      await page.addInitScript(theme => localStorage.setItem("suth-ui-mode", theme), theme);
      await importReviewFixture(page);
      await page.goto("/admin/import/41");
      await expect(page.locator("html")).toHaveAttribute("data-mode", theme);
      const rail = page.getByTestId("import-review-summary");
      const commit = page.getByTestId("import-commit");
      await expect(commit).toHaveCount(1);
      await expect(rail).toContainText("ข้าม 1 · ยอดไม่เปลี่ยน 3");
      await page.evaluate(() => window.scrollTo(0, 900));
      await expect(commit).toBeInViewport();
      const box = await rail.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(56);
      await rail.getByRole("button", { name: "ดูรายละเอียดก่อนยืนยัน", exact: true }).click();
      const heading = page.getByRole("heading", { name: "รายละเอียดก่อนยืนยัน", exact: true });
      await expect(heading).toBeFocused();
      await expect(heading).toBeInViewport();
      await expect.poll(async () => (await heading.boundingBox()).y).toBeGreaterThanOrEqual(56);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

for (const width of [640, 720]) test(`200% desktop zoom equivalent ${width} stacks the summary without covering focused controls`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 640 ? 400 : 450 });
  await importReviewFixture(page);
  await page.goto("/admin/import/41");
  const rail = page.getByTestId("import-review-summary");
  await expect(rail).toHaveCSS("position", "static");
  const commit = page.getByTestId("import-commit");
  await commit.focus();
  await expect(commit).toBeFocused();
  await expect(commit).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a blocked preview cannot be confirmed and another admin can continue it", async ({ page }) => {
  const state = await importReviewFixture(page, { status: "draft" });
  state.building = null;
  await page.goto("/admin/import/41");
  await expect(page.getByRole("status").filter({ hasText: "other-admin — คุณทำต่อได้" })).toBeVisible();
  await expect(page.getByTestId("import-commit")).toBeDisabled();
  await expect(page.getByTestId("import-preview")).toHaveCount(0);
  await page.getByRole("combobox", { name: "ตัดสินชื่อ Review building" }).selectOption("create");
  await expect(page.getByTestId("import-commit")).toBeEnabled();
  expect(state.puts).toHaveLength(1);
  expect(state.commits).toHaveLength(0);
});

test("failed decision checking offers explicit retry and never confirms an older preview", async ({ page }) => {
  const state = await importReviewFixture(page);
  await page.goto("/admin/import/41");
  state.failDecisions = true;
  await page.getByRole("combobox", { name: "ตัดสินชื่อ Review building" }).selectOption("alias:1");
  await expect(page.getByRole("alert").filter({ hasText: "ตรวจตัวเลือกไม่สำเร็จ" })).toBeVisible();
  const commit = page.getByTestId("import-commit");
  await expect(commit).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "ตรวจตัวเลือกใหม่ไม่สำเร็จ — กดตรวจอีกครั้ง" })).toBeVisible();
  await expect(page.getByTestId("import-preview")).toHaveCount(0);
  state.failDecisions = false;
  await page.getByTestId("revalidate").click();
  await expect(commit).toBeEnabled();
  await expect(commit).toContainText("4 รายการ");
  expect(state.puts).toHaveLength(2);
  expect(state.commits).toHaveLength(0);
});
