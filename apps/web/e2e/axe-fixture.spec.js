// apps/web/e2e/axe-fixture.spec.js
//
// axe-core บนสถานะที่ fixture คุมอยู่แล้ว (ไม่ต้องมี API/ฐานข้อมูล) — เฟสแรกของ #64
//
// เฟสสอง (ทุกหน้าใน PAGES ของ wcag.spec.js ที่ต้องล็อกอินจริง) รอฐานข้อมูลของ CI
// (#63) กลไก baseline ด้านล่างเขียนไว้ให้ขยายได้ตรงๆ — เพิ่ม state ใหม่ในลิสต์
// ด้านล่าง หรือทำสคริปต์เดียวกันนี้ชี้ไปที่ PAGES แทน ไม่ต้องออกแบบใหม่
//
// ## แบ่งงานกับตัววัด contrast ที่เขียนเอง
//
// axe จับ rule ที่เครื่องตรวจได้ทั่วไป (ARIA ผิด, ป้ายกำกับหาย, role/name ที่ขาด
// ฯลฯ) ตัววัดใน contrast-helper.js จับ contrast จาก CSS ที่ compose แล้วจริง
// รวม oklch/alpha/การซ้อนหลายชั้น ซึ่ง axe ทำได้ไม่ดีเท่า (ดู
// docs/reference/accessibility.md หัวข้อ "วิธีวัด contrast") สองอย่างนี้จึงรัน
// คู่กัน ไม่ใช่แทนกัน — ไฟล์นี้ไม่แตะ contrast-helper.js
//
// ## baseline
//
// violation ที่มีอยู่ ณ วันเริ่มถูกบันทึกไว้ใน axe-baseline.json — CI แดงเฉพาะ
// ตัวใหม่ที่ยังไม่เคยอยู่ในนั้น ไล่เก็บของเดิมทีละตัวได้โดยไม่ต้องรอแก้ให้หมด
// ทีเดียว แก้แล้วให้รันซ้ำด้วย SUTH_AXE_UPDATE_BASELINE=1 เพื่อเขียนไฟล์ใหม่
// (บันทึกเฉพาะตัวที่ยังเหลือ ไม่ใช่ตัวที่เพิ่งแก้)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { assetFixture } from "./asset-fixture.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(HERE, "axe-baseline.json");
const updating = process.env.SUTH_AXE_UPDATE_BASELINE === "1";

/** สถานะที่ fixture คุมอยู่แล้ว — ยืมมาจาก asset-drawer.spec.js / asset-evidence.spec.js */
const STATES = [
  {
    name: "ทะเบียนทรัพย์สิน",
    async setup(page) {
      await assetFixture(page);
      await page.goto("/assets");
      await expect(page.getByRole("table")).toBeVisible();
    },
  },
  {
    name: "แผงแก้ไขเครื่อง",
    async setup(page) {
      await assetFixture(page);
      await page.goto("/assets");
      await page.getByRole("button", { name: "แก้ไข SUTH-001", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "แก้ไขข้อมูลเครื่อง" })).toBeVisible();
    },
  },
  {
    name: "แผงย้ายเครื่อง",
    async setup(page) {
      await assetFixture(page);
      await page.goto("/assets");
      await page.getByRole("button", { name: "การกระทำเพิ่มเติม SUTH-001", exact: true }).click();
      await page.getByRole("menuitem", { name: "ย้ายเครื่อง", exact: true }).click();
      await expect(page.getByRole("dialog").getByRole("textbox")).toBeVisible();
    },
  },
];

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return {};
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

// เก็บผลของทุก state ไว้ในโมดูลเดียวกัน แล้วเขียนไฟล์ครั้งเดียวตอน afterAll —
// workers: 1 และ fullyParallel: false ของ playwright.config.js ทำให้ทุกเทสในไฟล์
// นี้รันเรียงกันในโปรเซสเดียว ตัวแปรนี้จึงไม่มีทาง race กันเอง
const collected = {};

for (const state of STATES) {
  test(`axe: ${state.name}`, async ({ page }) => {
    await state.setup(page);
    const results = await new AxeBuilder({ page }).analyze();
    const ids = results.violations.map((violation) => violation.id).sort();

    if (updating) {
      collected[state.name] = ids;
      return;
    }

    const baseline = loadBaseline()[state.name] || [];
    const newOnes = ids.filter((id) => !baseline.includes(id));
    expect(newOnes, `violation ใหม่ที่ยังไม่อยู่ใน baseline: ${JSON.stringify(newOnes)}`).toEqual([]);
  });
}

test.afterAll(() => {
  if (!updating) return;
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(collected, null, 2)}\n`);
});
