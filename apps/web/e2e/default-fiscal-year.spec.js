// apps/web/e2e/default-fiscal-year.spec.js
//
// ผู้ดูแลเตรียมปีงบล่วงหน้าไว้หลายปี แล้วเปิดแอปใหม่ ต้องเจอปีงบที่ครอบวันนี้ (#176)
//
// เดิม store เลือกปีสุดท้ายของรายการ ทุกหน้าจึงเปิดมาที่ปีในอนาคต แดชบอร์ด 0 หน้า และหน้ารายละเอียด
// เครื่องบอก "ยังไม่มียอดพิมพ์ ไปกรอกยอด" ทั้งที่นำเข้ายอดไว้แล้ว

import { expect, test } from "@playwright/test";
import { currentMonth, fiscalYearOfMonth } from "@suth/domain";
import { apiFetch, reasonToSkip, signIn, writesAllowed } from "./fixtures.js";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
  test.skip(!writesAllowed(), "เทสนี้สร้างปีงบชั่วคราว — ตั้ง SUTH_E2E_ALLOW_WRITES=1 และชี้ API ไปที่ฐานทดสอบ");
});

test("มีปีงบล่วงหน้าหลายปี — แดชบอร์ดยังเปิดที่ปีงบปัจจุบัน", async ({ context, page }) => {
  const thisYear = fiscalYearOfMonth(currentMonth());
  const existing = await apiFetch("/fiscal-years");
  test.skip(!existing.some((fy) => Number(fy.year) === thisYear), `ฐานทดสอบต้องมีปีงบ ${thisYear}`);

  const created = [];
  try {
    for (const offset of [1, 2]) {
      const year = String(Math.max(...existing.map((fy) => Number(fy.year)), thisYear) + offset);
      created.push(await apiFetch("/fiscal-years", { method: "POST", body: JSON.stringify({ year }) }));
    }

    await signIn(context);
    await page.goto("/dashboard");

    await expect(page).toHaveURL(new RegExp(`fy=${existing.find((fy) => Number(fy.year) === thisYear).id}`));
    await expect(page.locator('header[data-print="hide"] button').filter({ hasText: "ปีงบ" })).toContainText(String(thisYear));
  } finally {
    for (const fy of created) await apiFetch(`/fiscal-years/${fy.id}`, { method: "DELETE" });
  }
});
