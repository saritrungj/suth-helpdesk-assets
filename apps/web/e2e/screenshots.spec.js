// apps/web/e2e/screenshots.spec.js
//
// เก็บภาพหน้าจอเป็นไฟล์ที่ตรวจซ้ำได้ ตามขนาดจอและธีมที่แผนกำหนด
//
// ## ทำไมต้องเป็นไฟล์ ไม่ใช่ภาพในหน้าต่างแชท
//
// ภาพที่ถ่ายด้วยมือครั้งเดียวพิสูจน์ได้แค่ว่า "ตอนนั้นมันเป็นแบบนี้" ไฟล์ที่สั่ง
// สร้างใหม่ได้ด้วยคำสั่งเดียวทำให้เทียบก่อน/หลังได้จริง และคนอื่นตรวจซ้ำได้เอง
//
// ## รัน
//
//   npm run test:e2e:shots --workspace @suth/web
//
// ภาพออกที่ `apps/web/e2e/screens/<ภาษา>/<ธีม>/<ขนาด>/<ชื่อหน้า>.png`
//
// ## ข้อจำกัดที่ต้องรู้
//
// นี่ **ไม่ใช่** visual regression test — ไม่มีการเทียบพิกเซลกับภาพอ้างอิง
// เพราะข้อมูลในฐานเปลี่ยนได้ตลอด (ยอดพิมพ์ เดือนปัจจุบัน) ภาพชุดนี้มีไว้ให้ "คนดู"
// ไม่ใช่ให้เครื่องตัดสิน การเปลี่ยนเป็น visual regression ต้องมีฐานข้อมูลทดสอบ
// ที่ตรึงค่าไว้ก่อน ซึ่งยังไม่มี

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { reasonToSkip, signIn } from "./fixtures.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "screens");

/** ขนาดจอที่แผนกำหนดให้รับรอง */
const SIZES = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

const THEMES = ["light", "dark"];

/**
 * สองภาษาที่ระบบรับรอง — ภาษาอังกฤษต้องมีภาพด้วย ไม่ใช่ตรวจแค่ชื่อเมนูในเทส
 * เพราะความยาวคำต่างกันมากพอที่จะดันโครงหน้าเพี้ยนได้ และนั่นเห็นได้จากภาพเท่านั้น
 */
const LANGUAGES = [
  { code: "th", locale: "th-TH", signInLabel: "เข้าสู่ระบบ" },
  { code: "en", locale: "en-US", signInLabel: "Sign in" },
];

/** ระบบอ่านธีมและภาษาจาก localStorage ก่อน CSS วาดครั้งแรก จึงต้องหว่านค่าไว้ล่วงหน้า */
function seedPreferences(context, theme, language) {
  return context.addInitScript(
    ([mode, lang]) => {
      try {
        localStorage.setItem("suth-ui-mode", mode);
        localStorage.setItem("suth-language", lang);
      } catch {
        // โหมดส่วนตัวเขียน localStorage ไม่ได้ — ปล่อยให้ใช้ค่าเริ่มต้น
      }
    },
    [theme, language]
  );
}

/** หน้าที่ต้องเก็บภาพ — ครอบทุกกลุ่มหน้า ไม่ใช่เฉพาะแดชบอร์ด */
const PAGES = [
  { name: "02-dashboard", url: "/dashboard" },
  { name: "03-print-transactions", url: "/print-transactions" },
  { name: "04-assets", url: "/assets" },
  { name: "05-asset-detail", url: "/assets/17" },
  { name: "06-expense", url: "/expense" },
  { name: "07-compare", url: "/compare" },
  { name: "08-report", url: "/report" },
  { name: "09-admin-contracts", url: "/admin/contracts" },
  { name: "10-admin-users", url: "/admin/users" },
];

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
});

for (const language of LANGUAGES) {
 for (const theme of THEMES) {
  for (const size of SIZES) {
    test(`ภาพหน้าจอ · ${language.code} · ${theme} · ${size.name}`, async ({ browser }) => {
      test.setTimeout(120_000);

      const dir = path.join(OUT, language.code, theme, size.name);
      fs.mkdirSync(dir, { recursive: true });

      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        colorScheme: theme,
        locale: language.locale,
        timezoneId: "Asia/Bangkok",
        // ปิดการเคลื่อนไหวทั้งหมด ไม่งั้นภาพจะจับกลางอนิเมชันแล้วต่างกันทุกรอบ
        reducedMotion: "reduce",
      });

      await seedPreferences(context, theme, language.code);
      await signIn(context);
      const page = await context.newPage();

      /**
       * หน้าล็อกอินต้องถ่ายจาก context ที่ **ยังไม่ได้ล็อกอิน**
       *
       * ถ้าถ่ายจาก context ที่ล็อกอินแล้ว router จะเด้งไป /dashboard ทันที
       * (ดู router.beforeEach) แล้วไฟล์ที่ได้จะเป็นภาพแดชบอร์ดที่ตั้งชื่อว่า
       * "login" — ภาพที่โกหกแย่กว่าไม่มีภาพ
       */
      const guestContext = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        colorScheme: theme,
        locale: language.locale,
        timezoneId: "Asia/Bangkok",
        reducedMotion: "reduce",
      });
      await seedPreferences(guestContext, theme, language.code);

      const guestPage = await guestContext.newPage();
      await guestPage.goto("/login");
      await expect(
        guestPage.getByRole("button", { name: new RegExp(language.signInLabel) })
      ).toBeVisible({ timeout: 20000 });
      await guestPage.screenshot({ path: path.join(dir, "01-login.png") });
      await guestContext.close();

      for (const target of PAGES) {
        await page.goto(target.url);

        // รอจนหน้าจอนิ่งจริง ไม่ใช่แค่ DOM พร้อม — หน้าเหล่านี้โหลดข้อมูลหลายชุด
        await page.waitForLoadState("networkidle").catch(() => {});

        // รอให้เนื้อหาหลักโผล่ก่อนถ่าย ไม่งั้นได้ภาพโครงร่างเปล่า
        // ใช้ <main> ที่มีเนื้อหาแทนการหา <h1> เพราะบางหน้าเป็นแท็บที่หัวเรื่อง
        // อยู่คนละที่กัน — และการผูกกับ <h1> ทำให้เทสภาพพังเพราะเหตุผลด้านโครง
        // ของหน้า ซึ่งไม่ใช่เรื่องที่เทสชุดนี้ควรตัดสิน
        await expect(page.locator("#main-content")).toBeVisible({ timeout: 20000 });
        await page.waitForFunction(
          () => (document.querySelector("#main-content")?.innerText ?? "").trim().length > 40,
          null,
          { timeout: 20000 }
        );

        await page.screenshot({
          path: path.join(dir, `${target.name}.png`),
          fullPage: false,
        });
      }

      await context.close();
    });
  }
 }
}
