// apps/web/e2e/user-switch.spec.js
//
// เครื่องที่ใช้ร่วมกัน: คนก่อนออกจากระบบแล้ว คนถัดไปต้องไม่ได้คำค้นของคนก่อน และต้องไม่ถูกพาไปหน้าที่คนก่อน
// เปิดค้างไว้ (#241) — เดิมคำค้นในทะเบียนค้างอยู่ และหน้าล็อกอินมี ?redirect= ของคนก่อน

import { expect, test } from "@playwright/test";
import { assetFixture } from "./asset-fixture.js";

const SEARCH = "ค้นหา Serial, รุ่น, ตำแหน่ง…";

async function signOut(page) {
  await page.getByRole("button", { name: /^บัญชีของ/ }).click();
  await page.getByRole("menuitem", { name: /ออกจากระบบ/ }).click();
}

async function signInAs(page, state, user) {
  state.nextUser = user;
  await page.getByLabel("ชื่อผู้ใช้").fill(user.username);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill("fixture-only");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("ออกจากระบบแล้วคนถัดไปไม่ได้คำค้นและหน้าที่เปิดค้างของคนก่อน", async ({ page }) => {
  const state = await assetFixture(page, "admin");
  await page.goto("/assets");
  await page.getByRole("textbox", { name: SEARCH }).fill("SUTH-007");
  await expect(page.getByRole("link", { name: "SUTH-007", exact: true })).toBeVisible();

  await signOut(page);
  await expect(page).toHaveURL(/\/login$/);

  await signInAs(page, state, { id: 2, username: "viewer", role: "viewer" });
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/assets");
  await expect(page.getByRole("textbox", { name: SEARCH })).toHaveValue("");
});

test("คนเดิมที่ session หมดอายุแล้วล็อกอินกลับมา ยังได้คำค้นเดิมและกลับหน้าเดิม", async ({ page }) => {
  const state = await assetFixture(page, "admin");
  await page.goto("/assets");
  await page.getByRole("textbox", { name: SEARCH }).fill("SUTH-007");
  await expect(page.getByRole("link", { name: "SUTH-007", exact: true })).toBeVisible();

  // session หาย (ไม่ได้กดออก) แล้วเปิดหน้าเดิมอีกครั้ง
  state.user = null;
  await page.goto("/assets");
  await expect(page).toHaveURL(/\/login\?redirect=/);

  await signInAs(page, state, { id: 1, username: "admin", role: "admin" });
  await expect(page).toHaveURL(/\/assets/);
  await expect(page.getByRole("textbox", { name: SEARCH })).toHaveValue("SUTH-007");
});

test("คนละคนล็อกอินในแท็บเดิมหลัง session ของคนก่อนหาย — ไม่ได้คำค้นของคนก่อน", async ({ page }) => {
  const state = await assetFixture(page, "admin");
  await page.goto("/assets");
  await page.getByRole("textbox", { name: SEARCH }).fill("SUTH-007");
  await expect(page.getByRole("link", { name: "SUTH-007", exact: true })).toBeVisible();

  state.user = null;
  await page.goto("/assets");
  await signInAs(page, state, { id: 2, username: "staff", role: "staff" });
  await page.goto("/assets");
  await expect(page.getByRole("textbox", { name: SEARCH })).toHaveValue("");
});

// จากหน้ารายละเอียดเครื่อง การออกจากระบบเคยค้างอยู่หน้าเดิม: การล้างปีงบยกเลิกการนำทางไปหน้าล็อกอิน
// แล้วคำขอที่ได้ 401 พาไปล็อกอินแทน พร้อม ?redirect= ของหน้าที่เปิดค้างและข้อความ "เซสชันหมดอายุ"
test("ออกจากระบบจากหน้ารายละเอียดเครื่องไปหน้าล็อกอินตรงๆ ไม่มี redirect และไม่ขึ้นว่าเซสชันหมดอายุ", async ({ page }) => {
  await assetFixture(page, "admin");
  await page.goto("/assets/1");
  await expect(page.getByRole("button", { name: /^บัญชีของ/ })).toBeVisible();

  await signOut(page);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("เซสชันหมดอายุ", { exact: false })).toHaveCount(0);
});
