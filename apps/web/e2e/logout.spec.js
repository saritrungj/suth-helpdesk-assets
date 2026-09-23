// apps/web/e2e/logout.spec.js
//
// ออกจากระบบแล้วต้องออกจริง (#175)
//
// เดิมเว็บส่ง body เป็น JSON `null` API ตอบ 500 ก่อนถึง route cookie ของ session จึงค้างใน
// เบราว์เซอร์ เว็บกลืน error แล้วพาไปหน้าเข้าสู่ระบบ — ดูเหมือนออกแล้ว แต่เปิดหน้าใหม่ก็เข้าระบบได้
// ทันทีโดยไม่ต้องใส่รหัส ซึ่งอันตรายกับเครื่องที่ใช้ร่วมกันในโรงพยาบาล

import { expect, test } from "@playwright/test";
import { reasonToSkip, signIn } from "./fixtures.js";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
});

test("กดออกจากระบบแล้วเปิดหน้าเดิมอีกครั้ง ต้องกลับไปหน้าเข้าสู่ระบบ", async ({ context, page }) => {
  await signIn(context);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);

  const logout = page.waitForResponse((res) => res.url().includes("/auth/logout"));
  await page.getByRole("button", { name: /admin/ }).first().click();
  await page.getByRole("menuitem", { name: /ออกจากระบบ/ }).click();
  expect((await logout).status()).toBe(200);
  await expect(page).toHaveURL(/\/login/);

  expect((await context.cookies()).some((cookie) => cookie.name === "suth_session")).toBe(false);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
