// apps/web/e2e/axe-pages.spec.js
//
// axe-core บนทุกหน้าใน PAGES (pages.js) — ชุดเดียวกับที่ wcag.spec.js ใช้ —
// เฟสสองของ #64
//
// เฟสแรก (axe-fixture.spec.js) รันเฉพาะสถานะที่ fixture คุมอยู่แล้ว เพราะตอนนั้น
// ยังไม่มีฐานข้อมูลจริงใน CI ตอนนี้ #63 เข้ามาแล้ว ไฟล์นี้จึงขยายไปครบทุกหน้า
// หลังล็อกอินตามที่ตั้งใจไว้ตั้งแต่แรก — ใช้กลไก baseline แบบเดียวกันทุกอย่าง
//
// ต้องมี API + ฐานข้อมูลจริง (เหมือน wcag.spec.js) จึงอยู่ใน DB_SPECS ของ
// playwright.config.js
//
// PAGES มาจาก ./pages.js ไม่ใช่ import จาก wcag.spec.js ตรงๆ — ดูเหตุผลในไฟล์นั้น
// (import จากไฟล์ .spec.js จะลากเทสทั้งไฟล์ติดมาโดยไม่ตั้งใจ เจอบั๊กนี้จริงตอน
// เขียนไฟล์นี้ครั้งแรก)
//
// ## แบ่งงานกับตัววัด contrast ที่เขียนเอง
//
// เหตุผลเดียวกับ axe-fixture.spec.js — ดู docs/reference/accessibility.md
// หัวข้อ "axe-core กับตัววัดที่เขียนเอง แบ่งงานกันอย่างไร" ไฟล์นี้ไม่แตะ
// contrast-helper.js
//
// ## baseline
//
// violation ที่มีอยู่ ณ วันเริ่มบันทึกไว้ใน axe-baseline-pages.json (แยกไฟล์จาก
// axe-baseline.json ของเฟสแรก เพราะคนละขอบเขต — หน้าเดียวกันอาจมีผลต่างกันได้
// ระหว่างข้อมูล fixture กับข้อมูลจริงจากฐาน CI) CI แดงเฉพาะตัวใหม่ที่ยังไม่เคย
// อยู่ในนั้น อัปเดตด้วย SUTH_AXE_UPDATE_BASELINE=1 เหมือนเฟสแรกทุกประการ

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { reasonToSkip, resolveAssetDetailUrl, signIn } from "./fixtures.js";
import { PAGES } from "./pages.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(HERE, "axe-baseline-pages.json");
const updating = process.env.SUTH_AXE_UPDATE_BASELINE === "1";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
});

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return {};
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

// เก็บผลทุกหน้าไว้ในโมดูลเดียวกัน แล้วเขียนไฟล์ครั้งเดียวตอน afterAll — เหตุผล
// เดียวกับ axe-fixture.spec.js (workers: 1, fullyParallel: false)
const collected = {};

for (const target of PAGES) {
  test(`axe: ${target.name}`, async ({ page }) => {
    await page.goto(await resolveAssetDetailUrl(target.url));
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.locator("#main-content")).toBeVisible({ timeout: 20000 });

    const results = await new AxeBuilder({ page }).analyze();
    const ids = results.violations.map((violation) => violation.id).sort();

    if (updating) {
      collected[target.name] = ids;
      return;
    }

    const baseline = loadBaseline()[target.name] || [];
    const newOnes = ids.filter((id) => !baseline.includes(id));
    expect(newOnes, `violation ใหม่ที่ยังไม่อยู่ใน baseline: ${JSON.stringify(newOnes)}`).toEqual([]);
  });
}

test.afterAll(() => {
  if (!updating) return;
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(collected, null, 2)}\n`);
});
