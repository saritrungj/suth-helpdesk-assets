import { test, expect } from "@playwright/test";
import { assetFixture } from "./asset-fixture.js";

async function registryFixture(page) {
  const state = await assetFixture(page);
  const template = state.rows[0];
  state.rows = [
    { id: 9, serial_number: "S-9", location: null },
    { id: 10, serial_number: "S-10", location: "10 อาคาร" },
    { id: 4, serial_number: "S-2", location: "02 อาคาร" },
    { id: 2, serial_number: "S-2", location: " 2 อาคาร " },
    { id: 3, serial_number: "S-10", location: "2 อาคาร" },
    { id: 6, serial_number: "S-6", location: "แผนก ก" },
    { id: 7, serial_number: "S-7", location: "แผนก ข" },
    { id: 8, serial_number: "S-8", location: " \t " },
  ].map(row => ({ ...template, contract_no: `CT-${row.id}`, ...row }));
  return state;
}

const tableFor = page => page.getByRole("table", { name: "ทะเบียนเครื่องพิมพ์", exact: true });
const rowIds = table => table.locator("tbody tr a").evaluateAll(links => links.map(link => Number(link.getAttribute("href").split("/").pop())));
const memoryKey = "suth:table:AssetList:assets";

test("registry Detail default, direction and ties match the active header without changing source data", async ({ page }) => {
  const state = await registryFixture(page);
  await page.goto("/assets");
  const table = tableFor(page);
  const detail = table.getByRole("columnheader", { name: "ตำแหน่งที่ตั้ง", exact: true });
  await expect(detail).toHaveAttribute("aria-sort", "ascending");
  await expect.poll(() => rowIds(table)).toEqual([2, 4, 3, 10, 6, 7, 8, 9]);
  await expect(table.getByRole("link", { name: "S-10", exact: true }).first()).toHaveAttribute("href", "/assets/3");
  await detail.getByRole("button").click();
  await expect(detail).toHaveAttribute("aria-sort", "descending");
  await expect.poll(() => rowIds(table)).toEqual([7, 6, 10, 2, 4, 3, 8, 9]);
  await detail.getByRole("button").click();
  await expect(detail).toHaveAttribute("aria-sort", "ascending");
  await table.getByRole("button", { name: "Serial", exact: true }).click();
  await expect(table.getByRole("columnheader", { name: "Serial", exact: true })).toHaveAttribute("aria-sort", "ascending");
  await expect(detail).toHaveAttribute("aria-sort", "none");
  await table.getByRole("button", { name: "Serial", exact: true }).click();
  await table.getByRole("button", { name: "Serial", exact: true }).click();
  await expect(detail).toHaveAttribute("aria-sort", "ascending");
  expect(state.rows[3].location).toBe(" 2 อาคาร ");
  expect(state.writes).toEqual([]);
});

test("valid remembered contract sort wins and survives filtering and reload", async ({ page }) => {
  await page.addInitScript(key => {
    sessionStorage.setItem("suth:owner", JSON.stringify("1"));
    sessionStorage.setItem(key, JSON.stringify({ sortKey: "contract_no", sortDir: "desc", pageSize: 20, page: 1 }));
  }, memoryKey);
  await registryFixture(page);
  await page.goto("/assets");
  const table = tableFor(page);
  await expect(table.getByRole("columnheader", { name: "สัญญา", exact: true })).toHaveAttribute("aria-sort", "descending");
  await expect.poll(() => rowIds(table)).toEqual([10, 9, 8, 7, 6, 4, 3, 2]);
  await page.getByRole("textbox", { name: /ค้นหา/ }).first().fill("S-2");
  await expect.poll(() => rowIds(table)).toEqual([4, 2]);
  await page.reload();
  await expect.poll(() => rowIds(table)).toEqual([4, 2]);
  await expect(table.getByRole("columnheader", { name: "สัญญา", exact: true })).toHaveAttribute("aria-sort", "descending");
});

test("obsolete remembered sort resets to Detail ascending and first page", async ({ page }) => {
  await page.addInitScript(key => {
    sessionStorage.setItem("suth:owner", JSON.stringify("1"));
    sessionStorage.setItem(key, JSON.stringify({ sortKey: "removed-key", sortDir: "desc", page: 2, pageSize: 10 }));
  }, memoryKey);
  const state = await registryFixture(page);
  state.rows.push(...Array.from({ length: 15 }, (_, i) => ({ ...state.rows[0], id: 20 + i, serial_number: `Z-${i}`, location: `20 อาคาร ${i}` })));
  await page.goto("/assets");
  const table = tableFor(page);
  await expect(table.getByRole("columnheader", { name: "ตำแหน่งที่ตั้ง", exact: true })).toHaveAttribute("aria-sort", "ascending");
  await expect.poll(() => rowIds(table)).toEqual([2, 4, 3, 10, 20, 21, 22, 23, 24, 25]);
});

test("remembered valid Detail sort preserves its page, and filtering returns to page one", async ({ page }) => {
  await page.addInitScript(key => {
    sessionStorage.setItem("suth:owner", JSON.stringify("1"));
    sessionStorage.setItem(key, JSON.stringify({ sortKey: "location", sortDir: "desc", page: 2, pageSize: 10 }));
  }, memoryKey);
  const state = await assetFixture(page);
  await page.goto("/assets");
  const table = tableFor(page);
  await expect(table.getByRole("columnheader", { name: "ตำแหน่งที่ตั้ง", exact: true })).toHaveAttribute("aria-sort", "descending");
  await expect.poll(() => rowIds(table)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  await page.getByRole("textbox", { name: /ค้นหา/ }).first().fill("SUTH-001");
  await expect.poll(() => rowIds(table)).toEqual([1]);
  await table.getByRole("link", { name: "SUTH-001", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/assets\/1$/);
  expect(state.writes).toEqual([]);
});

test("moving a device follows its new sorted page and restores visible keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const state = await assetFixture(page);
  state.rows.push(...Array.from({ length: 25 }, (_, i) => ({ ...state.rows[0], id: 46 + i, serial_number: `SUTH-${String(46 + i).padStart(3, "0")}` })));
  await page.goto("/assets");
  const trigger = page.getByRole("button", { name: "การกระทำเพิ่มเติม SUTH-001", exact: true });
  await trigger.click();
  await page.getByRole("menuitem", { name: "ย้ายเครื่อง", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "ย้ายเครื่อง", exact: true });
  await drawer.getByRole("textbox", { name: "ตำแหน่งที่ตั้ง", exact: true }).fill("New counter");
  await drawer.getByRole("button", { name: "ย้ายเครื่อง", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "ย้ายเครื่อง", exact: true }).click();
  await expect(drawer.getByText("ย้ายเรียบร้อย — ประวัติด้านล่างอัปเดตแล้ว")).toBeVisible();
  await drawer.getByRole("button", { name: "ปิด", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  const box = await trigger.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(800);
  await expect(tableFor(page).getByRole("columnheader", { name: "ตำแหน่งที่ตั้ง", exact: true })).toHaveAttribute("aria-sort", "ascending");
  expect(state.writes[0]).toMatchObject({ path: "devices/1/move", body: { location: "New counter" } });
});

for (const theme of ["light", "dark"]) {
  for (const width of [1280, 1440]) {
    test(`registry active sort evidence ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
      await page.addInitScript(value => localStorage.setItem("suth-ui-mode", value), theme);
      await registryFixture(page);
      await page.goto("/assets");
      const table = tableFor(page);
      await expect(table.locator("tbody tr")).toHaveCount(8);
      await page.screenshot({ path: `output/desktop-tables/registry-${process.env.SUTH_DESKTOP_SNAPSHOT_STAGE || "after"}-${width}-${theme}.png`, fullPage: true });
      await expect(table.getByRole("columnheader", { name: "ตำแหน่งที่ตั้ง", exact: true })).toHaveAttribute("aria-sort", "ascending");
    });
  }
}
