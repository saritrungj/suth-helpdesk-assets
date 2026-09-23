// apps/web/e2e/add-device-draft.spec.js
//
// งานที่กรอกค้างในหน้าเพิ่มเครื่องต้องไม่หาย (#177)
//
// เดิมกดเมนูออกไป สลับไปแท็บนำเข้า หรือรีเฟรช แล้วกลับมา ฟอร์มว่างโดยไม่มีคำเตือน (audit 2026-09-23 P5)

import { expect, test } from "@playwright/test";
import { apiFetch, reasonToSkip, signIn, writesAllowed } from "./fixtures.js";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
});

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

const serialField = (page) => page.getByPlaceholder("เช่น SN2446179");
const modelField = (page) => page.getByPlaceholder("เช่น LaserJet M404dn");

/** เลือกตัวเลือกแรกของช่องเลือกที่ชื่อขึ้นต้นด้วย label แล้วคืนข้อความของตัวเลือกนั้น */
async function pickFirst(page, label) {
  const trigger = page.locator("main").getByRole("button", { name: new RegExp(`^${label} `) }).first();
  await trigger.click();
  const option = page.getByRole("listbox").getByRole("option").filter({ hasNotText: "ยังไม่ระบุ" }).first();
  const text = (await option.innerText()).trim();
  await option.click();
  return { trigger, text };
}

async function openAddDevice(page) {
  await page.goto("/admin/add-asset");
  await expect(serialField(page)).toBeVisible({ timeout: 15000 });
}

test("ออกจากหน้าด้วยเมนูแล้วกลับมา ได้ค่าที่กรอกค้างไว้ครบ รวมอาคารและชั้น", async ({ page }) => {
  await openAddDevice(page);
  await serialField(page).fill("E2E-DRAFT-001");
  await modelField(page).fill("Draft model");
  const building = await pickFirst(page, "อาคาร");
  const floor = await pickFirst(page, "ชั้น");

  await page.locator('aside a[href="/assets"]').first().click();
  await expect(page).toHaveURL(/\/assets(\?|$)/);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await page.goBack();
  await expect(serialField(page)).toHaveValue("E2E-DRAFT-001");
  await expect(modelField(page)).toHaveValue("Draft model");
  await expect(building.trigger).toContainText(building.text);
  await expect(floor.trigger).toContainText(floor.text);
  await expect(page.getByTestId("draft-restored")).toBeVisible();
});

test("สลับไปแท็บนำเข้าแล้วกลับมา และรีเฟรชหน้า ค่ายังอยู่", async ({ page }) => {
  await openAddDevice(page);
  await serialField(page).fill("E2E-DRAFT-002");

  await page.getByRole("tab", { name: "นำเข้าจากไฟล์" }).click();
  await page.getByRole("tab", { name: "เพิ่มทีละเครื่อง" }).click();
  await expect(serialField(page)).toHaveValue("E2E-DRAFT-002");

  await page.reload();
  await expect(serialField(page)).toHaveValue("E2E-DRAFT-002");
});

test("ล้างแล้วเริ่มใหม่ ทิ้งร่างจริง — กลับมาอีกครั้งฟอร์มว่าง", async ({ page }) => {
  await openAddDevice(page);
  await serialField(page).fill("E2E-DRAFT-003");
  await page.reload();
  await page.getByRole("button", { name: "ล้างแล้วเริ่มใหม่" }).click();
  await expect(serialField(page)).toHaveValue("");
  await expect(page.getByTestId("draft-restored")).toHaveCount(0);

  await page.reload();
  await expect(serialField(page)).toHaveValue("");
});

test("บันทึกเครื่องแล้วร่างถูกล้าง — เปิดหน้าใหม่ไม่ได้ค่าของเครื่องที่บันทึกไปแล้ว", async ({ page }) => {
  test.skip(!writesAllowed(), "เทสนี้สร้างเครื่องในฐาน — ตั้ง SUTH_E2E_ALLOW_WRITES=1 และชี้ API ไปที่ฐานทดสอบ");
  const serial = `E2E-DRAFT-SAVE-${Date.now()}`;
  try {
    await openAddDevice(page);
    await serialField(page).fill(serial);
    await pickFirst(page, "ยี่ห้อ");
    await page.getByRole("radio", { name: "ติดตั้งแล้ว" }).click();
    await page.getByRole("button", { name: "บันทึกแล้วเพิ่มเครื่องถัดไป" }).click();
    await expect(serialField(page)).toHaveValue("", { timeout: 15000 });

    await page.reload();
    await expect(serialField(page)).toHaveValue("");
    await expect(page.getByTestId("draft-restored")).toHaveCount(0);
  } finally {
    const devices = await apiFetch("/devices");
    const list = Array.isArray(devices) ? devices : devices.data ?? [];
    for (const device of list.filter((d) => d.serial_number === serial)) {
      await apiFetch(`/devices/${device.id}`, { method: "DELETE" });
    }
  }
});
