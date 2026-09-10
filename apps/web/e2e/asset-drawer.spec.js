import { expect, test } from "@playwright/test";
import { assetFixture } from "./asset-fixture.js";

test("selected building opens all choices, searches by label and reopens after saving", async ({ page }) => {
  const state = await assetFixture(page);
  await page.goto("/assets");
  await page.getByRole("button", { name: "แก้ไข SUTH-001", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "แก้ไขข้อมูลเครื่อง" });
  await drawer.getByText("อาคารผู้ป่วยนอก", { exact: true }).click();
  const search = page.getByRole("combobox", { name: "พิมพ์เพื่อค้นหา..." });
  await expect(search).toHaveValue("");
  await expect(page.getByRole("option", { name: "อาคารใหม่", exact: true })).toBeVisible();
  await search.fill("ใหม่");
  await expect(page.getByRole("option", { name: "อาคารผู้ป่วยนอก", exact: true })).not.toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(drawer.getByText("อาคารใหม่", { exact: true })).toBeVisible();
  await drawer.getByText("อาคารใหม่", { exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("option", { name: "อาคารผู้ป่วยนอก", exact: true })).toBeVisible();
  await search.press("Escape");
  await drawer.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(drawer).not.toBeVisible();
  expect(state.rows[0].building_id).toBe(2);
  await page.getByRole("button", { name: "แก้ไข SUTH-001", exact: true }).click();
  await drawer.getByText("อาคารใหม่", { exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("option", { name: "อาคารผู้ป่วยนอก", exact: true })).toBeVisible();
});

test("edit keeps search, sort and page; dirty Escape retains the draft", async ({ page }) => {
  const state = await assetFixture(page);
  await page.goto("/assets");
  await page.getByRole("textbox", { name: "ค้นหา Serial, รุ่น, ตำแหน่ง…" }).fill("SUTH");
  await expect(page.getByRole("button", { name: "Excel", exact: true })).toBeEnabled();
  await page.getByRole("columnheader", { name: "Serial" }).getByRole("button").click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  const edit = page.getByRole("button", { name: "แก้ไข SUTH-021", exact: true });
  await edit.scrollIntoViewIfNeeded();
  const scrollBox = page.getByRole("table").locator("..");
  const scroll = await scrollBox.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  await edit.click();
  const drawer = page.getByRole("dialog", { name: "แก้ไขข้อมูลเครื่อง" });
  await expect(drawer.getByRole("textbox", { name: "หมายเลข Serial" })).toHaveValue("SUTH-021");
  await drawer.getByRole("textbox", { name: "รุ่น", exact: true }).fill("Updated office");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("dirty.png") });
  await page.getByRole("alertdialog").getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(drawer.getByRole("textbox", { name: "รุ่น", exact: true })).toHaveValue("Updated office");
  await drawer.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect.poll(() => state.writes.length).toBe(2);
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole("button", { name: "2", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("row").filter({ hasText: "SUTH-021" }).first()).toContainText("Updated office");
  await expect(edit).toBeFocused();
  expect(await scrollBox.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }))).toEqual(scroll);
});

test("registry exports the complete searched set and its search context", async ({ page }) => {
  await assetFixture(page);
  await page.goto("/assets");
  await page.getByRole("textbox", { name: "ค้นหา Serial, รุ่น, ตำแหน่ง…" }).fill("SUTH");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  const download = await downloadPromise;
  const { readFile } = await import("node:fs/promises");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await readFile(await download.path()), { type: "buffer" });
  expect(XLSX.utils.sheet_to_json(workbook.Sheets["บริบทรายงาน"], { header: 1 })).toContainEqual(["ค้นหา", "SUTH"]);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }).slice(1);
  expect(rows).toHaveLength(45);
  expect(rows.every((row) => row.includes(0.45))).toBe(true);
});

for (const close of ["button", "backdrop", "route"]) {
  test(`dirty edit can cancel ${close} and keeps values`, async ({ page }) => {
    await assetFixture(page);
    await page.goto("/assets");
    if (close === "route") {
      await page.getByRole("link", { name: "SUTH-001", exact: true }).click();
      await page.locator('aside a[href="/assets"]').click();
    }
    await page.getByRole("button", { name: "แก้ไข SUTH-001", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("textbox", { name: "รุ่น", exact: true }).fill("Unsaved");
    if (close === "button") await drawer.getByRole("button", { name: "ปิดหน้าต่าง" }).click();
    if (close === "backdrop") await page.mouse.click(600, 200);
    if (close === "route") await page.goBack();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "ยกเลิก", exact: true }).click();
    await expect(drawer.getByRole("textbox", { name: "รุ่น", exact: true })).toHaveValue("Unsaved");
    await drawer.getByRole("button", { name: "ยกเลิก", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ทำต่อโดยไม่บันทึก" }).click();
    await expect(drawer).not.toBeVisible();
  });
}

test("failed edit retains draft, retry blocks dismissal and duplicate submissions", async ({ page }) => {
  const state = await assetFixture(page);
  state.failSave = true;
  await page.goto("/assets");
  await page.getByRole("button", { name: "แก้ไข SUTH-001", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("textbox", { name: "รุ่น", exact: true }).fill("Retry this");
  const save = drawer.getByRole("button", { name: "บันทึกการแก้ไข" });
  await save.click();
  await expect(drawer.getByRole("alert")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("failure.png") });
  await expect(drawer.getByRole("textbox", { name: "รุ่น", exact: true })).toHaveValue("Retry this");
  state.failSave = false;
  state.delay = 900;
  await save.click();
  await expect(save).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath("pending.png") });
  await page.keyboard.press("Escape");
  await page.mouse.click(600, 200);
  await expect(drawer).toBeVisible();
  await expect(page.getByRole("alertdialog")).not.toBeVisible();
  await expect(drawer).not.toBeVisible();
  expect(state.writes).toHaveLength(3);
});

test("saving a filtered-out device clamps the last page and explains the change", async ({ page }) => {
  const state = await assetFixture(page);
  state.rows = state.rows.slice(0, 21);
  await page.goto("/assets?status=active");
  await page.getByRole("button", { name: "ขยายตาราง", exact: true }).click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await page.getByRole("button", { name: "แก้ไข SUTH-021", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("radio", { name: "ปลดระวาง", exact: true }).click();
  await drawer.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByText("บันทึกแล้ว เครื่องนี้ไม่ตรงกับคำค้นหาหรือตัวกรองปัจจุบัน")).toBeVisible();
  await expect.poll(() => page.getByText("บันทึกแล้ว เครื่องนี้ไม่ตรงกับคำค้นหาหรือตัวกรองปัจจุบัน").evaluate((el) => document.fullscreenElement.contains(el))).toBe(true);
  await expect(page.getByRole("link", { name: "SUTH-001", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "ค้นหา Serial, รุ่น, ตำแหน่ง…" })).toBeFocused();
});

test("the filtered-out notice clears once the search changes", async ({ page }) => {
  await assetFixture(page);
  await page.goto("/assets?status=active");
  await page.getByRole("button", { name: "แก้ไข SUTH-001", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("radio", { name: "ปลดระวาง", exact: true }).click();
  await drawer.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(drawer).not.toBeVisible();
  const notice = page.getByText("บันทึกแล้ว เครื่องนี้ไม่ตรงกับคำค้นหาหรือตัวกรองปัจจุบัน");
  await expect(notice).toBeVisible();

  // คำอธิบายผูกกับผลของการบันทึกครั้งนั้น พอผู้ใช้เปลี่ยนคำค้นเองก็ไม่ใช่เรื่องเดิมแล้ว
  await page.getByRole("textbox", { name: "ค้นหา Serial, รุ่น, ตำแหน่ง…" }).fill("SUTH-002");
  await expect(notice).toHaveCount(0);
});

test("save keeps the page scrolled where the reader left it", async ({ page }) => {
  const state = await assetFixture(page);
  await page.goto("/assets");
  await page.evaluate(() => window.scrollTo(0, 200));
  const anchorRow = page.getByRole("link", { name: "SUTH-004", exact: true });
  await expect(anchorRow).toBeVisible();
  const before = await anchorRow.evaluate((el) => el.getBoundingClientRect().top);

  const edit = page.getByRole("button", { name: "แก้ไข SUTH-004", exact: true });
  await edit.click();
  const drawer = page.getByRole("dialog", { name: "แก้ไขข้อมูลเครื่อง" });
  await drawer.getByRole("textbox", { name: "รุ่น", exact: true }).fill("Updated in place");
  await drawer.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect.poll(() => state.writes.length).toBe(2);
  await expect(drawer).not.toBeVisible();

  /* เทสข้างบนคุม scroll ภายในกล่องตารางแล้ว อันนี้คุมของหน้าต่าง เพราะแถบสถานะ
     "กำลังโหลด" ระหว่าง refresh ถูกวางเหนือตาราง ถ้ามันค้างไว้แถวจะเลื่อนใต้สายตา */
  await expect(page.getByRole("row").filter({ hasText: "SUTH-004" }).first()).toContainText("Updated in place");
  const after = await anchorRow.evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
});

test("move shows origin, destination and server date; failure retains location for retry", async ({ page }) => {
  const state = await assetFixture(page);
  state.failSave = true;
  await page.goto("/assets");
  const trigger = page.getByRole("button", { name: "การกระทำเพิ่มเติม SUTH-001" });
  await trigger.click();
  await page.getByRole("menuitem", { name: "ย้ายเครื่อง", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "ย้ายเครื่อง", exact: true });
  await expect(drawer.getByText("ต้นทาง", { exact: true })).toBeVisible();
  await expect(drawer.getByText("วันที่บันทึกตามเซิร์ฟเวอร์", { exact: false })).toBeVisible();
  await drawer.getByRole("textbox", { name: "ตำแหน่งที่ตั้ง", exact: true }).fill("New counter");
  await drawer.getByRole("button", { name: "ย้ายเครื่อง", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "ย้ายเครื่อง", exact: true }).click();
  await expect(drawer.getByRole("alert")).toBeVisible();
  await expect(drawer.getByRole("textbox", { name: "ตำแหน่งที่ตั้ง", exact: true })).toHaveValue("New counter");
  state.failSave = false;
  await drawer.getByRole("button", { name: "ย้ายเครื่อง", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "ย้ายเครื่อง", exact: true }).click();
  await expect(drawer.getByText("ย้ายเรียบร้อย — ประวัติด้านล่างอัปเดตแล้ว")).toBeVisible();
  await drawer.getByRole("button", { name: "ปิด", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(state.writes[1].body).toEqual({ building_id: 1, floor_id: 1, location: "New counter", division_id: 1, department_id: 1 });
});

test("move filtered out by search restores focus when the drawer closes", async ({ page }) => {
  await assetFixture(page);
  await page.goto("/assets");
  const search = page.getByRole("textbox", { name: "ค้นหา Serial, รุ่น, ตำแหน่ง…" });
  await search.fill("เคาน์เตอร์พยาบาล");
  await page.getByRole("button", { name: "การกระทำเพิ่มเติม SUTH-001", exact: true }).click();
  await page.getByRole("menuitem", { name: "ย้ายเครื่อง", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("textbox", { name: "ตำแหน่งที่ตั้ง", exact: true }).fill("New counter");
  await drawer.getByRole("button", { name: "ย้ายเครื่อง", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "ย้ายเครื่อง", exact: true }).click();
  await expect(drawer.getByText("ย้ายเรียบร้อย — ประวัติด้านล่างอัปเดตแล้ว")).toBeVisible();
  await drawer.getByRole("button", { name: "ปิด", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(search).toBeFocused();
});

for (const role of ["staff", "viewer"]) test(`${role} can search but cannot edit, move or add`, async ({ page }) => {
  await assetFixture(page, role);
  await page.goto("/assets?edit=1");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: /^แก้ไข SUTH/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "เพิ่มเครื่อง", exact: true })).toHaveCount(0);
});

test("list failure has retry, empty and filtered empty have different recovery", async ({ page }) => {
  const state = await assetFixture(page);
  state.failList = true;
  await page.goto("/assets");
  await expect(page.getByText("โหลดทะเบียนทรัพย์สินไม่สำเร็จ")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("list-error.png") });
  await expect(page.getByText("ยังไม่มีเครื่องในทะเบียน", { exact: true }).first()).not.toBeVisible();
  state.failList = false;
  await page.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await page.getByRole("textbox", { name: "ค้นหา Serial, รุ่น, ตำแหน่ง…" }).fill("no-match");
  await expect(page.getByText("ไม่มีเครื่องที่ตรงกับเงื่อนไข", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("filtered-empty.png") });
  await page.getByRole("button", { name: "ล้างตัวกรองทั้งหมด", exact: true }).click();
  await expect(page.getByRole("link", { name: "SUTH-001", exact: true })).toBeVisible();
  state.rows = [];
  await page.reload();
  await expect(page.getByText("ยังไม่มีเครื่องในทะเบียน", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("empty.png") });
});

for (const density of ["compact", "default", "relaxed"]) test(`registry ${density} supports 200% zoom and reduced motion`, async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem("suth-ui-density", value), density);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await assetFixture(page);
  await page.goto("/assets");
  await expect(page.getByRole("table")).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.getByRole("button", { name: "แก้ไข SUTH-001", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("textbox", { name: "หมายเลข Serial" })).toHaveValue("SUTH-001");
  await expect(drawer.getByRole("button", { name: "บันทึกการแก้ไข" })).toBeInViewport();
  await drawer.getByRole("button", { name: "ยกเลิก", exact: true }).click();
});

test("move options failure retries; dirty Escape and pending preserve values", async ({ page }) => {
  const state = await assetFixture(page);
  state.failOptions = true;
  await page.goto("/assets?move=1");
  const drawer = page.getByRole("dialog", { name: "ย้ายเครื่อง", exact: true });
  await expect(drawer.getByRole("button", { name: "ย้ายเครื่อง", exact: true })).toBeDisabled();
  state.failOptions = false;
  await drawer.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await drawer.getByRole("textbox", { name: "ตำแหน่งที่ตั้ง", exact: true }).fill("Move draft");
  await page.keyboard.press("Escape");
  await page.getByRole("alertdialog").getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(drawer.getByRole("textbox", { name: "ตำแหน่งที่ตั้ง", exact: true })).toHaveValue("Move draft");
  state.delay = 900;
  await drawer.getByRole("button", { name: "ย้ายเครื่อง", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "ย้ายเครื่อง", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.mouse.click(600, 200);
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("ย้ายเรียบร้อย — ประวัติด้านล่างอัปเดตแล้ว")).toBeVisible();
  expect(state.writes).toHaveLength(1);
});

test("drawer in fullscreen traps focus and returns to the row without losing scroll", async ({ page }) => {
  await assetFixture(page);
  await page.goto("/assets");
  await page.getByRole("button", { name: "ขยายตาราง", exact: true }).click();
  const search = page.getByRole("textbox", { name: "ค้นหา Serial, รุ่น, ตำแหน่ง…" });
  await expect.poll(() => search.evaluate((el) => document.fullscreenElement.contains(el))).toBe(true);
  await expect.poll(() => page.getByRole("radio", { name: "ใช้งานอยู่", exact: true }).evaluate((el) => document.fullscreenElement.contains(el))).toBe(true);
  await search.fill("SUTH");
  await expect(page.getByRole("button", { name: "Excel", exact: true })).toBeEnabled();
  const edit = page.getByRole("button", { name: "แก้ไข SUTH-005", exact: true });
  await edit.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("textbox", { name: "หมายเลข Serial" })).toHaveValue("SUTH-005");
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    await expect.poll(() => drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await drawer.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(edit).toBeFocused();
  await page.getByRole("button", { name: "ย่อตาราง", exact: true }).click();
});
