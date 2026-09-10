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

/* บนเครื่องคนมักเปิด dev server ค้างไว้อยู่แล้ว `reuseExistingServer` จึงทำให้
   ทุกอย่างเหมือนเดิมทุกประการ ส่วนบน CI ที่ไม่มีใครเปิดอะไรไว้ Playwright จะ
   สตาร์ตเอง และตั้งใจใช้ผลของ `vite build` ผ่าน preview ไม่ใช่ dev server
   เพราะสิ่งที่ต้องทดสอบคือ bundle ที่จะถูกส่งมอบจริง */
const webServers = [
  {
    command: `npm run preview -- --port ${webPort} --strictPort`,
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
  // junit เพิ่มเฉพาะบน CI ให้ dorny/test-reporter (#65) อ่านไปขึ้น Checks พร้อม
  // annotation ที่บรรทัดที่ล้ม — ไม่กระทบเทอร์มินัลตอนรันบนเครื่อง (ดู test-results/
  // ใน .gitignore)
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["junit", { outputFile: "test-results/e2e-junit.xml" }]]
    : [["list"]],

  use: {
    baseURL: webUrl,
    // เก็บ trace ไว้เฉพาะตอนล้ม เพื่อให้ไล่ดูได้ว่าพังตรงไหนโดยไม่ต้องรันซ้ำ
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
  },

  projects: [
    {
      name: "desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
