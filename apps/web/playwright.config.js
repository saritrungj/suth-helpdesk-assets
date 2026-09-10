import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * playwright.config.js — เทสที่รันบนเบราว์เซอร์จริง
 *
 * ## ขอบเขต
 *
 * เทสชุดนี้ตรวจ **เส้นทางการทำงานจริง** ที่ unit test ตรวจไม่ได้ — การกรอกข้อมูล
 * แล้วบันทึก, การเตือนตอนออกจากหน้าทั้งที่ยังไม่บันทึก, การวางตัวเลขจากตาราง
 * คำนวณ, และการเก็บภาพหน้าจอไว้เทียบข้ามรอบ
 *
 * ## ต้องมีอะไรก่อนรัน
 *
 * ทั้ง API (พอร์ต 3000) และเว็บ (5173) ต้องทำงานอยู่ พร้อมฐานข้อมูลจริง
 * เทสจะ **ข้ามทั้งชุด** ถ้าต่อไม่ได้ ไม่ใช่ล้มเหลว — เพราะการที่เครื่องใครสักคน
 * ไม่ได้เปิดฐานข้อมูลไม่ใช่ความผิดของโค้ด (ยกเว้นตั้ง `SUTH_E2E_REQUIRE_SERVICES=1`
 * ให้กลายเป็นล้มเหลวแทน — ใช้บนงาน CI ที่ต้องมีฐานข้อมูลจริงเสมอ ดู e2e/fixtures.js)
 *
 * บนเครื่องคนมักเปิด API ค้างไว้เองอยู่แล้ว (`npm run dev:api`) ตั้ง
 * `SUTH_E2E_START_API=1` ให้ Playwright สตาร์ต API เองแทนเฉพาะตอนไม่มีใครเปิดไว้
 * (เช่นบน CI)
 *
 * ## เรื่องข้อมูล
 *
 * เทสเหล่านี้เขียนลงฐานข้อมูลจริงของเครื่องพัฒนา (กรอกยอดพิมพ์แล้วบันทึก)
 * จึงมีกฎว่า **ต้องคืนค่าเดิมกลับทุกครั้ง** ในขั้นตอนสุดท้ายของแต่ละเทส
 * ห้ามทิ้งข้อมูลขยะไว้ในฐาน (ดู e2e/fixtures.js)
 */
const webUrl = process.env.SUTH_WEB_URL || "http://localhost:5173";
const webPort = new URL(webUrl).port || "5173";
const apiUrl = process.env.SUTH_API_URL || "http://localhost:3000/api";

/*
 * spec แบ่งเป็นสามโปรเจกต์ตาม "ต้องมีอะไรถึงจะรันได้" — ตัดสินที่นี่ที่เดียว
 * ไม่มีรายชื่อไฟล์ซ้ำใน package.json หรือ workflow
 *
 *   fixture — ทุก spec ที่ไม่ได้อยู่ในสองรายการข้างล่าง intercept /api/* เอง
 *             จึงไม่ต้องมี API/ฐานข้อมูล (`npm run verify` และ pre-push)
 *   db      — DB_SPECS ต้องมี API + ฐานข้อมูลจริง (`test:e2e:db`)
 *   manual  — MANUAL_SPECS รันเองเมื่อต้องการเท่านั้น
 *
 * spec ใหม่ตกอยู่ใน fixture เองโดยไม่ต้องจำไปเพิ่มชื่อที่ไหน — ถ้ามันต้องใช้ฐาน
 * ข้อมูลแต่ลืมเพิ่มใน DB_SPECS reasonToSkip() จะโยน error บอกให้เพิ่ม (ดู
 * e2e/fixtures.js) แทนที่จะหลุดจากชุดตรวจไปเงียบๆ แบบที่รายชื่อเขียนมือใน
 * package.json เคยทำกับ prototype.spec.js
 */
const DB_SPECS = [
  "axe-pages.spec.js",
  "login-wcag.spec.js",
  "login.spec.js",
  "month-entry.spec.js",
  "page-structure.spec.js",
  "report-workflow.spec.js",
  "shell.spec.js",
  "wcag.spec.js",
];

const MANUAL_SPECS = [
  // ถ่ายภาพไว้ให้คนดู ไม่ได้เทียบกับอะไร — `npm run test:e2e:shots`
  "screenshots.spec.js",
  // ใช้ฐาน QA แยกบนเครื่องผ่าน scripts/qa48 (ADR-0016)
  "asset-qa48.spec.js",
];

const anyFolder = (files) => files.map((file) => `**/${file}`);

const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };

/* บนเครื่องคนมักเปิด dev server ค้างไว้อยู่แล้ว `reuseExistingServer` จึงทำให้
   ทุกอย่างเหมือนเดิมทุกประการ ส่วนบน CI ที่ไม่มีใครเปิดอะไรไว้ Playwright จะ
   สตาร์ตเอง และตั้งใจใช้ผลของ `vite build` ผ่าน preview ไม่ใช่ dev server
   เพราะสิ่งที่ต้องทดสอบคือ bundle ที่จะถูกส่งมอบจริง */
// SUTH_WEB_DIST ให้ preview เสิร์ฟ build ที่แยกไว้ต่างหาก — scripts/verify-db.cjs ใช้
// build ที่ฝังที่อยู่ API ของตัวเอง โดยไม่ทับ dist ปกติ
const webDist = process.env.SUTH_WEB_DIST ? ` --outDir ${process.env.SUTH_WEB_DIST}` : "";

const webServers = [
  {
    command: `npm run preview -- --port ${webPort} --strictPort${webDist}`,
    url: webUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
];

/*
 * ชุดที่ต้องมีฐานข้อมูลจริง (#63) ต้องมี API ทำงานอยู่ด้วย ซึ่งบนเครื่องคนมักเปิด
 * ไว้เองแล้ว (`npm run dev:api`) แต่บน CI ไม่มีใครเปิดอะไรไว้ ตั้ง
 * `SUTH_E2E_START_API=1` ให้ Playwright สตาร์ต API เองอีกตัว — ปิดเป็นค่าเริ่มต้น
 * เพื่อไม่ให้ชนพอร์ตกับ API ที่เปิดอยู่แล้วตอนรันบนเครื่องปกติ
 *
 * env ที่ API ต้องการ (DB_*, JWT_SECRET, ...) รับผ่าน process.env ตรงๆ อยู่แล้ว —
 * ผู้เรียก (workflow หรือคนบนเครื่อง) ต้องตั้งไว้ก่อนรัน playwright ไม่ใช่ที่นี่
 */
if (process.env.SUTH_E2E_START_API === "1") {
  webServers.push({
    command: "npm start",
    cwd: path.resolve(HERE, "../api"),
    url: `${apiUrl}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  });
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts",

  webServer: webServers,

  // เทสที่เขียนข้อมูลลงฐานเดียวกันห้ามรันพร้อมกัน ไม่งั้นจะแย่งกันแก้แถวเดียวกัน
  workers: 1,
  fullyParallel: false,

  // บน CI เก็บ HTML report ไว้เป็น artifact ด้วย เพราะ log อย่างเดียวไล่ไม่ออกว่าพังตรงไหน
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: webUrl,
    // เก็บ trace ไว้เฉพาะตอนล้ม เพื่อให้ไล่ดูได้ว่าพังตรงไหนโดยไม่ต้องรันซ้ำ
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
  },

  projects: [
    { name: "fixture", use: desktop, testIgnore: anyFolder([...DB_SPECS, ...MANUAL_SPECS]) },
    { name: "db", use: desktop, testMatch: anyFolder(DB_SPECS) },
    { name: "manual", use: desktop, testMatch: anyFolder(MANUAL_SPECS) },
  ],
});
