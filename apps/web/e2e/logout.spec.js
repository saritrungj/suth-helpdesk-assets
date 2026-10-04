// apps/web/e2e/logout.spec.js
//
// ออกจากระบบแล้วต้องออกจริง (#175)
//
// เดิมเว็บส่ง body เป็น JSON `null` API ตอบ 500 ก่อนถึง route cookie ของ session จึงค้างใน
// เบราว์เซอร์ เว็บกลืน error แล้วพาไปหน้าเข้าสู่ระบบ — ดูเหมือนออกแล้ว แต่เปิดหน้าใหม่ก็เข้าระบบได้
// ทันทีโดยไม่ต้องใส่รหัส ซึ่งอันตรายกับเครื่องที่ใช้ร่วมกันในโรงพยาบาล

import { expect, test } from "@playwright/test";
import { API_URL, reasonToSkip, signIn } from "./fixtures.js";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
  // SUTH_E2E_TOKEN คือ token ใบเดียวที่ทุกเทสใช้ร่วมกัน — ออกจากระบบจะเพิกถอนมัน แล้วเทสที่เหลือได้ 401 (ADR-0038)
  test.skip(Boolean(process.env.SUTH_E2E_TOKEN), "เทสนี้เพิกถอน token ของตัวเอง — รันกับ token ที่เซ็นเองจาก JWT_SECRET เท่านั้น");
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

// ลบ cookie อย่างเดียวไม่พอ: สำเนาของ token ที่คัดลอกไว้ก่อนออกจากระบบต้องใช้ไม่ได้ด้วย (#240, ADR-0038)
test("ออกจากระบบแล้ว token เดิมที่คัดลอกไว้ใช้เรียก API ไม่ได้", async ({ context, page, request }) => {
  await signIn(context);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  const copied = (await context.cookies()).find((cookie) => cookie.name === "suth_session").value;
  const me = () => request.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${copied}` } });
  expect((await me()).status()).toBe(200);

  const logout = page.waitForResponse((res) => res.url().includes("/auth/logout"));
  await page.getByRole("button", { name: /admin/ }).first().click();
  await page.getByRole("menuitem", { name: /ออกจากระบบ/ }).click();
  await logout;
  await expect(page).toHaveURL(/\/login/);

  const after = await me();
  expect(after.status()).toBe(401);
  expect((await after.json()).code).toBe("signed_out");
});
