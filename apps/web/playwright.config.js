import { defineConfig, devices } from "@playwright/test";

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
 * ไม่ได้เปิดฐานข้อมูลไม่ใช่ความผิดของโค้ด
 *
 * ## เรื่องข้อมูล
 *
 * เทสเหล่านี้เขียนลงฐานข้อมูลจริงของเครื่องพัฒนา (กรอกยอดพิมพ์แล้วบันทึก)
 * จึงมีกฎว่า **ต้องคืนค่าเดิมกลับทุกครั้ง** ในขั้นตอนสุดท้ายของแต่ละเทส
 * ห้ามทิ้งข้อมูลขยะไว้ในฐาน (ดู e2e/fixtures.js)
 */
const webUrl = process.env.SUTH_WEB_URL || "http://localhost:5173";
const webPort = new URL(webUrl).port || "5173";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts",

  /* บนเครื่องคนมักเปิด dev server ค้างไว้อยู่แล้ว `reuseExistingServer` จึงทำให้
     ทุกอย่างเหมือนเดิมทุกประการ ส่วนบน CI ที่ไม่มีใครเปิดอะไรไว้ Playwright จะ
     สตาร์ตเอง และตั้งใจใช้ผลของ `vite build` ผ่าน preview ไม่ใช่ dev server
     เพราะสิ่งที่ต้องทดสอบคือ bundle ที่จะถูกส่งมอบจริง */
  webServer: {
    command: `npm run preview -- --port ${webPort} --strictPort`,
    url: webUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

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
    {
      name: "desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
