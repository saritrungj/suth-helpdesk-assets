// apps/web/e2e/change-password.spec.js
//
// ผู้ใช้เปลี่ยนรหัสผ่านของตัวเองจากเมนูบัญชี — เดิมมีแต่ผู้ดูแลตั้งรหัสให้ ผู้ใช้ที่สงสัยว่ารหัสหลุดทำอะไรเองไม่ได้
// เส้นทาง HTTP จำลอง ส่วนการเปลี่ยนจริงกับฐานตรวจด้วยการยิง API (ดู PR)

import { expect, test } from "@playwright/test";
import { assetFixture } from "./asset-fixture.js";

async function openDialog(page) {
  await page.goto("/assets");
  await page.getByRole("button", { name: /^บัญชีของ/ }).click();
  await page.getByRole("menuitem", { name: "เปลี่ยนรหัสผ่านของฉัน" }).click();
  const dialog = page.getByRole("dialog", { name: "เปลี่ยนรหัสผ่านของฉัน" });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const role of ["admin", "staff", "viewer"]) {
  test(`${role} เปลี่ยนรหัสผ่านของตัวเองได้`, async ({ page }) => {
    const state = await assetFixture(page, role);
    const dialog = await openDialog(page);

    await dialog.getByLabel("รหัสผ่านปัจจุบัน").fill("current-fixture-pw");
    await dialog.getByLabel(/^รหัสผ่านใหม่/).fill("new-fixture-pw");
    await dialog.getByLabel("ยืนยันรหัสผ่านใหม่").fill("new-fixture-pw");
    await dialog.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("เปลี่ยนรหัสผ่านแล้ว", { exact: false })).toBeVisible();
    expect(state.passwordRequests).toEqual([{ current_password: "current-fixture-pw", new_password: "new-fixture-pw" }]);
  });
}

test("ตรวจก่อนส่ง: รหัสใหม่สั้นเกินหรือสองช่องไม่ตรงกัน ไม่ยิง API", async ({ page }) => {
  const state = await assetFixture(page);
  const dialog = await openDialog(page);

  await dialog.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }).click();
  await expect(dialog.getByText("กรอกรหัสผ่านปัจจุบัน", { exact: true })).toBeVisible();
  await expect(dialog.getByText("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร")).toBeVisible();

  await dialog.getByLabel("รหัสผ่านปัจจุบัน").fill("current-fixture-pw");
  await dialog.getByLabel(/^รหัสผ่านใหม่/).fill("new-fixture-pw");
  await dialog.getByLabel("ยืนยันรหัสผ่านใหม่").fill("different-pw");
  await dialog.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }).click();
  await expect(dialog.getByText("รหัสผ่านใหม่สองช่องไม่ตรงกัน")).toBeVisible();
  expect(state.passwordRequests).toHaveLength(0);
});

test("รหัสปัจจุบันผิด: ข้อความอยู่ใต้ช่องนั้น ค่าที่กรอกไม่หาย และเปิดใหม่แล้วช่องว่าง", async ({ page }) => {
  await assetFixture(page);
  const dialog = await openDialog(page);

  await dialog.getByLabel("รหัสผ่านปัจจุบัน").fill("wrong-pw");
  await dialog.getByLabel(/^รหัสผ่านใหม่/).fill("new-fixture-pw");
  await dialog.getByLabel("ยืนยันรหัสผ่านใหม่").fill("new-fixture-pw");
  await dialog.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }).click();

  await expect(dialog.getByText("รหัสผ่านปัจจุบันไม่ถูกต้อง")).toHaveCount(1);
  await expect(dialog.getByLabel(/^รหัสผ่านใหม่/)).toHaveValue("new-fixture-pw");

  await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const reopened = await openDialog(page);
  await expect(reopened.getByLabel("รหัสผ่านปัจจุบัน")).toHaveValue("");
  await expect(reopened.getByLabel(/^รหัสผ่านใหม่/)).toHaveValue("");
});
