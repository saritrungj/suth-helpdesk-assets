// apps/web/e2e/master-data-draft.spec.js
//
// ฟอร์มข้อมูลอ้างอิงที่กรอกค้างไว้ต้องไม่หายเงียบๆ เมื่อปิดหน้าต่าง (#278) และหน้าต่างซ้อน
// ต้องไม่อ้าง aria-describedby ไปยัง element ที่ไม่มีอยู่ (#279)

import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { assetFixture } from "./asset-fixture.js";

const ASK = "ยังมีข้อมูลที่ยังไม่ได้บันทึก";

/** เส้นเขียนของ /brands — ลงทะเบียนหลัง assetFixture จึงชนะ route กลางของ fixture */
async function brandWrites(page) {
  const writes = { calls: [], fail: false, delay: 0 };
  await page.route(/\/api\/brands(?:\/\d+)?$/, async (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fallback();
    writes.calls.push({ method, body: route.request().postDataJSON() });
    if (writes.delay) await new Promise((resolve) => setTimeout(resolve, writes.delay));
    if (writes.fail) return route.fulfill({ status: 500, json: { title: "บันทึกไม่สำเร็จ", code: "internal_error" } });
    return route.fulfill({ status: 200, json: { success: true } });
  });
  return writes;
}

async function openBrands(page) {
  await assetFixture(page);
  const writes = await brandWrites(page);
  await page.goto("/admin/brands");
  await expect(page.getByRole("cell", { name: "SUTH Printer" }).first()).toBeVisible();
  return writes;
}

async function openCreate(page) {
  await page.getByRole("button", { name: "เพิ่มยี่ห้อ", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "เพิ่มยี่ห้อ" });
  await expect(dialog).toBeVisible();
  return { dialog, name: dialog.getByRole("textbox", { name: "ชื่อยี่ห้อ" }) };
}

const CLOSE_ROUTES = {
  Escape: (page) => page.keyboard.press("Escape"),
  "ปุ่มยกเลิก": (page, dialog) => dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click(),
  "ปุ่มปิดหน้าต่าง": (page, dialog) => dialog.getByRole("button", { name: "ปิดหน้าต่าง" }).click(),
  "คลิกพื้นหลัง": (page) => page.mouse.click(8, 8),
};

for (const [route, close] of Object.entries(CLOSE_ROUTES)) {
  test(`ฟอร์มที่กรอกค้างถามก่อนปิดทาง ${route} และแก้ไขต่อได้โดยค่าไม่หาย`, async ({ page }) => {
    await openBrands(page);
    const { dialog, name } = await openCreate(page);
    await name.fill("ยี่ห้อที่กรอกค้าง");

    await close(page, dialog);
    const ask = page.getByRole("alertdialog", { name: ASK });
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "แก้ไขต่อ", exact: true }).click();

    await expect(ask).toBeHidden();
    await expect(dialog).toBeVisible();
    await expect(name).toHaveValue("ยี่ห้อที่กรอกค้าง");
    await expect(dialog.locator(":focus")).toHaveCount(1);

    await close(page, dialog);
    await page.getByRole("alertdialog", { name: ASK }).getByRole("button", { name: "ทิ้งการแก้ไข", exact: true }).click();
    await expect(dialog).toBeHidden();

    const reopened = await openCreate(page);
    await expect(reopened.name).toHaveValue("");
  });
}

test("ฟอร์มที่ไม่ได้แก้ปิดได้ทันทีโดยไม่ถาม ทั้งตอนเพิ่มและตอนแก้ไข", async ({ page }) => {
  await openBrands(page);
  const created = await openCreate(page);
  await page.keyboard.press("Escape");
  await expect(created.dialog).toBeHidden();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await page.getByRole("button", { name: "แก้ไข SUTH Printer", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "แก้ไขยี่ห้อ" });
  await expect(edit.getByRole("textbox", { name: "ชื่อยี่ห้อ" })).toHaveValue("SUTH Printer");
  await edit.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("แก้ไขรายการเดิมด้วยคีย์บอร์ดแล้วกด Esc ถามก่อนและคืนค่าที่แก้ไว้", async ({ page }) => {
  const writes = await openBrands(page);
  await page.getByRole("button", { name: "แก้ไข SUTH Printer", exact: true }).focus();
  await page.keyboard.press("Enter");
  const edit = page.getByRole("dialog", { name: "แก้ไขยี่ห้อ" });
  const name = edit.getByRole("textbox", { name: "ชื่อยี่ห้อ" });
  await name.fill("SUTH Printer รุ่นใหม่");

  await page.keyboard.press("Escape");
  const ask = page.getByRole("alertdialog", { name: ASK });
  await expect(ask).toBeVisible();
  // โฟกัสเริ่มที่ปุ่มที่ไม่ทำลายข้อมูล — Enter จึงกลับไปแก้ต่อ
  await expect(ask.getByRole("button", { name: "แก้ไขต่อ", exact: true })).toBeFocused();
  // ปล่อย Enter หลังโฟกัสกลับถึงช่องกรอกแล้ว — การปล่อยปุ่มต้องไม่กลายเป็นการบันทึก
  await page.keyboard.down("Enter");
  await expect(ask).toBeHidden();
  await expect(name).toBeFocused();
  await page.keyboard.up("Enter");
  await expect(name).toHaveValue("SUTH Printer รุ่นใหม่");
  await expect(edit).toBeVisible();
  expect(writes.calls).toEqual([]);
});

test("ระหว่างบันทึกปิดหน้าต่างไม่ได้และไม่ส่งคำขอซ้ำ", async ({ page }) => {
  const writes = await openBrands(page);
  writes.delay = 800;
  const { dialog, name } = await openCreate(page);
  await name.fill("ยี่ห้อใหม่");
  await name.press("Enter");
  await name.press("Enter");
  await page.keyboard.press("Escape");
  await page.mouse.click(8, 8);

  await expect(dialog).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(dialog).toBeHidden();
  expect(writes.calls).toHaveLength(1);
});

test("บันทึกล้มเหลวคงค่าที่กรอกและข้อความผิดพลาด บันทึกสำเร็จแล้วเปิดใหม่เป็นฟอร์มสะอาด", async ({ page }) => {
  const writes = await openBrands(page);
  writes.fail = true;
  const { dialog, name } = await openCreate(page);
  await name.fill("ยี่ห้อใหม่");
  await dialog.getByRole("button", { name: "เพิ่มยี่ห้อ", exact: true }).click();
  await expect(dialog.getByText("บันทึกไม่สำเร็จ", { exact: false })).toBeVisible();
  await expect(name).toHaveValue("ยี่ห้อใหม่");

  await page.keyboard.press("Escape");
  const ask = page.getByRole("alertdialog", { name: ASK });
  await ask.getByRole("button", { name: "แก้ไขต่อ", exact: true }).click();
  await expect(name).toHaveValue("ยี่ห้อใหม่");

  writes.fail = false;
  await dialog.getByRole("button", { name: "เพิ่มยี่ห้อ", exact: true }).click();
  await expect(dialog).toBeHidden();

  const reopened = await openCreate(page);
  await expect(reopened.name).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(reopened.dialog).toBeHidden();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

/** ทุก id ที่ aria-describedby อ้างถึงต้องมี element จริง และ accessible name ต้องมาจากหัวข้อ */
async function describedBy(page, dialog) {
  return dialog.evaluate((el) => {
    const raw = el.getAttribute("aria-describedby");
    const ids = raw === null ? [] : raw.split(/\s+/).filter(Boolean);
    return {
      raw,
      missing: ids.filter((id) => !document.getElementById(id)),
      text: ids.map((id) => document.getElementById(id)?.textContent.trim() ?? "").join(" "),
      duplicates: ids.filter((id) => document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length !== 1),
      labelled: Boolean(document.getElementById(el.getAttribute("aria-labelledby") ?? "")),
    };
  });
}

test("หน้าต่างที่ไม่มีคำอธิบายไม่ส่ง aria-describedby และผ่าน axe รวมถึงตอนถามทิ้งการแก้ไข", async ({ page }) => {
  await openBrands(page);
  const { dialog, name } = await openCreate(page);

  const plain = await describedBy(page, dialog);
  expect(plain.raw).toBeNull();
  expect(plain.labelled).toBe(true);
  await expect(dialog.locator(":focus")).toHaveCount(1);
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations.map((v) => v.id)).toEqual([]);

  await name.fill("ยี่ห้อที่กรอกค้าง");
  await page.keyboard.press("Escape");
  const ask = page.getByRole("alertdialog", { name: ASK });
  await expect(ask).toBeVisible();
  const asked = await describedBy(page, ask);
  expect(asked.missing).toEqual([]);
  expect(asked.text).not.toBe("");
  expect((await new AxeBuilder({ page }).include('[role="alertdialog"]').analyze()).violations.map((v) => v.id)).toEqual([]);
});

test("หน้าต่างที่มีคำอธิบายอ้าง id ที่มีอยู่จริงและไม่ซ้ำ ข้อความตรงกับที่แสดง และคืนโฟกัสเมื่อปิด", async ({ page }) => {
  await assetFixture(page);
  await page.goto("/assets");
  const account = page.getByRole("button", { name: /^บัญชีของ/ });
  await account.click();
  await page.getByRole("menuitem", { name: "เปลี่ยนรหัสผ่านของฉัน" }).click();
  const dialog = page.getByRole("dialog", { name: "เปลี่ยนรหัสผ่านของฉัน" });
  await expect(dialog).toBeVisible();

  const described = await describedBy(page, dialog);
  expect(described.raw).not.toBeNull();
  expect(described.missing).toEqual([]);
  expect(described.duplicates).toEqual([]);
  expect(described.text).toBe("เปลี่ยนแล้วใช้รหัสใหม่ในการเข้าสู่ระบบครั้งถัดไป");
  expect(described.labelled).toBe(true);
  await expect(dialog.locator(":focus")).toHaveCount(1);
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations.map((v) => v.id)).toEqual([]);
});
