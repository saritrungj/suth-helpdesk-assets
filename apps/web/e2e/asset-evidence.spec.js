import { expect, test } from "@playwright/test";
import { assetFixture } from "./asset-fixture.js";

// ค่าเริ่มต้นรันแค่สองชุดที่ต่างกันมากที่สุด (ไทย-สว่าง กับ อังกฤษ-มืด ที่ 1440)
// เพราะไฟล์นี้อยู่ใน `npm run verify` ของทุก push ชุดเต็ม 12 แบบ (สองภาษา × สองธีม × สาม
// ขนาด) ใช้ตอนตรวจรับต้นแบบเท่านั้น เปิดด้วย SUTH_EVIDENCE_FULL=1
// (ดู docs/how-to/review-asset-prototype.md)
const COMBINATIONS = process.env.SUTH_EVIDENCE_FULL === "1"
  ? ["th", "en"].flatMap((language) => ["light", "dark"].flatMap((theme) =>
    [[1280, 720], [1440, 900], [1920, 1080]].map(([width, height]) => ({ language, theme, width, height }))))
  : [
    { language: "th", theme: "light", width: 1440, height: 900 },
    { language: "en", theme: "dark", width: 1440, height: 900 },
  ];

for (const { language, theme, width, height } of COMBINATIONS) {
  test(`registry evidence ${language} ${theme} ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
    await page.addInitScript(({ language, theme }) => {
      localStorage.setItem("suth-language", language);
      localStorage.setItem("suth-ui-mode", theme);
    }, { language, theme });
    await assetFixture(page);
    await page.goto("/assets");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("link", { name: "SUTH-001", exact: true }).first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const phase = process.env.SUTH_EVIDENCE_PHASE || "after";
    const dir = test.info().outputPath(phase, language, theme, `${width}x${height}`);
    await page.screenshot({ path: `${dir}/registry.png` });
    await page.getByRole("button", { name: language === "th" ? "แก้ไข SUTH-001" : "Edit SUTH-001", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: `${dir}/edit.png` });
    if (phase === "after") {
      await page.getByRole("dialog").getByRole("button", { name: language === "th" ? "ยกเลิก" : "Cancel", exact: true }).click();
      await page.getByRole("button", { name: language === "th" ? "การกระทำเพิ่มเติม SUTH-001" : "More actions for SUTH-001", exact: true }).click();
      await page.getByRole("menuitem", { name: language === "th" ? "ย้ายเครื่อง" : "Move device", exact: true }).click();
      await expect(page.getByRole("dialog").getByRole("textbox")).toBeVisible();
      await page.screenshot({ path: `${dir}/move.png` });
    }
  });
}
