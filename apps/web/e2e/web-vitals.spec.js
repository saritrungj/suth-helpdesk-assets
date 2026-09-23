// apps/web/e2e/web-vitals.spec.js
//
// วัด Core Web Vitals จากผู้ใช้จริง (#171) ต้องไปถึง API จริงข้ามโดเมน
//
// จุดที่ unit test พิสูจน์ไม่ได้: sendBeacon ข้ามโดเมน (เว็บ → API คนละพอร์ต) ต้องไม่ถูก CORS บล็อก
// body text/plain ต้องผ่าน API จริง และต้องส่งตอนหน้าถูกซ่อน/ปิด จึงรันกับ API + ฐานข้อมูลจริง
// เบราว์เซอร์ของ Playwright ตั้ง navigator.webdriver = true ซึ่งแอปข้ามการวัดไว้ เทสนี้จึงปิดค่านั้นเอง

import { expect, test } from "@playwright/test";
import { reasonToSkip } from "./fixtures.js";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
});

test("หน้าเข้าสู่ระบบส่ง LCP/FCP/TTFB ไปที่ API จริงตอนหน้าถูกซ่อน และ API รับ (204)", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
    // Playwright อ่าน body แบบ Blob ของ beacon ไม่ได้ — จดข้อความไว้ในหน้า แล้วส่งต่อตามเดิม
    window.__beaconBodies = [];
    const send = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      if (data instanceof Blob) data.text().then((text) => window.__beaconBodies.push(text));
      return send(url, data);
    };
  });
  const blocked = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /BLOCKED_BY_RESPONSE/.test(message.text())) blocked.push(message.text());
  });

  await page.goto("/login");
  await expect(page.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeVisible();
  // LCP สรุปผลเมื่อผู้ใช้เริ่มโต้ตอบ — คลิกช่องชื่อผู้ใช้เหมือนคนจริง
  await page.getByLabel("ชื่อผู้ใช้").click();
  // รอให้ไลบรารีโหลดและรายงานค่าแรกเข้าคิว
  await page.waitForTimeout(500);

  const beacon = page.waitForResponse((res) => res.url().endsWith("/metrics/web-vitals") && res.request().method() === "POST");
  // ซ่อนหน้าแบบที่เบราว์เซอร์ทำตอนสลับแท็บ — แอปส่งชุดค่าตอนนี้
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  const response = await beacon;
  expect(response.status()).toBe(204);
  const request = response.request();
  expect(request.headers()["content-type"]).toMatch(/^text\/plain/);
  const bodies = await page.evaluate(() => window.__beaconBodies);
  expect(bodies).toHaveLength(1);
  const batch = JSON.parse(bodies[0]);
  const names = batch.map((m) => m.name);
  for (const name of ["LCP", "FCP", "TTFB"]) expect(names).toContain(name);
  // คำตอบของ beacon ต้องไม่ถูกบล็อก (Cross-Origin-Resource-Policy) จนขึ้น error ใน console ผู้ใช้
  expect(blocked).toEqual([]);
  for (const metric of batch) {
    expect(metric.page).toBe("/login");
    expect(["good", "needs-improvement", "poor"]).toContain(metric.rating);
  }
});
