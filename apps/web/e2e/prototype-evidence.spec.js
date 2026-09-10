import { expect, test } from "@playwright/test";
import { prototypeFixture } from "./prototype-fixture.js";

// ค่าเริ่มต้นรันแค่สองชุดที่ต่างกันมากที่สุด (ไทย-สว่าง กับ อังกฤษ-มืด ที่ 1440)
// เพราะไฟล์นี้อยู่ใน `npm run verify` ของทุก push ชุดเต็ม 12 แบบ (สองภาษา × สองธีม
// × สามขนาด) ใช้ตอนตรวจรับต้นแบบเท่านั้น เปิดด้วย SUTH_EVIDENCE_FULL=1
// (ดู docs/how-to/review-three-page-prototype.md)
const COMBINATIONS = process.env.SUTH_EVIDENCE_FULL === "1"
  ? ["th", "en"].flatMap((language) => ["light", "dark"].flatMap((theme) =>
    [[1280, 720], [1440, 900], [1920, 1080]].map(([width, height]) => ({ language, theme, width, height }))))
  : [
    { language: "th", theme: "light", width: 1440, height: 900 },
    { language: "en", theme: "dark", width: 1440, height: 900 },
  ];

for (const { language, theme, width, height } of COMBINATIONS) {
  test(`prototype evidence ${language} ${theme} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
    await page.addInitScript(({ language, theme }) => {
      localStorage.setItem("suth-language", language);
      localStorage.setItem("suth-ui-mode", theme);
    }, { language, theme });
    await prototypeFixture(page);
    for (const [name, url] of [["entry", "/print-transactions"], ["expense", "/expense"], ["department", "/by-department"]]) {
      await page.goto(url);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.getByRole("button", { name: /Excel/ }).first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: test.info().outputPath(process.env.SUTH_EVIDENCE_PHASE || "after", `${name}.png`) });
    }
  });
}
