// apps/web/e2e/page-structure.spec.js
//
// ตรวจโครงของทุกหน้า — เรื่องที่ build ผ่านและ endpoint ตอบ 200 ไม่เคยจับได้
//
// ## ทำไมต้องมี
//
// หน้า `/expense` เคย **ไม่มี `<h1>` เลย** เพราะมันเริ่มด้วยแท็บทันที เรื่องนี้
// ไม่ทำให้อะไรพัง ไม่มี error ไม่มีหน้าขาว build ก็ผ่าน แต่
//
//   - คนที่ใช้โปรแกรมอ่านหน้าจอใช้ "รายการหัวเรื่อง" เป็นสารบัญหลักในการนำทาง
//     หน้าที่ไม่มีหัวเรื่องเลยจึงเหมือนหน้าที่ไม่มีชื่อ
//   - มันเป็นหน้าเดียวที่หน้าตาไม่เข้าชุดกับหน้าอื่น ซึ่งไม่มีใครสังเกตจนกว่าจะ
//     เอาภาพทุกหน้ามาวางเรียงกัน
//
// เทสชุดนี้จับข้อผิดพลาดประเภท "ไม่มีอะไรพัง แต่ผิด" ที่เหลืออยู่ในทุกหน้า
//
// รัน: npm run test:e2e --workspace @suth/web

import { expect, test } from "@playwright/test";
import { apiFetch, reasonToSkip, signIn } from "./fixtures.js";

/**
 * ทุกหน้าหลังล็อกอิน — ต้องเพิ่มที่นี่ทุกครั้งที่เพิ่มหน้าใหม่
 *
 * `/assets/:fixture` แปลว่าให้เลือกเครื่องที่มีจริงจาก API ตอนรัน (ดูฟังก์ชัน
 * `resolveUrl` ด้านล่าง) — ห้ามตรึง id เครื่องไว้ตรงๆ (เช่น `/assets/17`) เพราะ
 * ฐานที่ใช้รันเทสแต่ละครั้งมีจำนวนเครื่องไม่เท่ากัน (ฐาน CI ของ #63 มีแค่ไม่กี่
 * เครื่อง) id ที่ตรึงไว้จะชี้ไปยังเครื่องที่ไม่มีอยู่แล้วรายงานเป็นบั๊กปลอม
 */
const PAGES = [
  { name: "แดชบอร์ด", url: "/dashboard" },
  { name: "บันทึกยอดพิมพ์", url: "/print-transactions" },
  { name: "ทะเบียนทรัพย์สิน", url: "/assets" },
  { name: "รายละเอียดเครื่อง", url: "/assets/:fixture" },
  { name: "ค่าใช้จ่าย", url: "/expense" },
  { name: "เปรียบเทียบรายเดือน", url: "/compare" },
  { name: "รายงานสรุป", url: "/report" },
  { name: "สัญญา", url: "/admin/contracts" },
  { name: "จัดการผู้ใช้งาน", url: "/admin/users" },
];

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
});

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

/** แปลง `/assets/:fixture` เป็น id เครื่องที่มีจริงในฐานที่กำลังรันเทสอยู่ */
async function resolveUrl(url) {
  if (url !== "/assets/:fixture") return url;
  const devices = await apiFetch("/devices?per_page=1");
  test.skip(!devices.length, "ไม่มีเครื่องสำหรับตรวจหน้ารายละเอียด — ไม่สร้างข้อมูลในฐานจริง");
  return `/assets/${devices[0].id}`;
}

for (const target of PAGES) {
  test(`โครงหน้า · ${target.name}`, async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto(await resolveUrl(target.url));
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.locator("#main-content")).toBeVisible({ timeout: 20000 });

    // 1) ทุกหน้าต้องมีหัวเรื่องระดับ 1 เพียงอันเดียว
    const h1 = page.locator("#main-content h1");
    await expect(h1, `${target.name}: ไม่มี <h1> — โปรแกรมอ่านหน้าจอจะไม่รู้ว่าหน้านี้คือหน้าอะไร`).toHaveCount(1);
    await expect(h1).not.toBeEmpty();

    // 2) ต้องมี landmark หลักครบ เพื่อให้ข้ามไปเนื้อหาได้ด้วยคีย์บอร์ด
    await expect(page.locator("main#main-content")).toHaveCount(1);
    await expect(page.getByRole("complementary", { name: "เมนูหลัก" })).toHaveCount(1);

    // 3) ทุกปุ่มต้องมีชื่อที่อ่านออก — ปุ่มไอคอนล้วนที่ลืมใส่ label
    //    จะถูกอ่านว่า "ปุ่ม" เฉยๆ ซึ่งไม่บอกอะไรเลย
    const unnamed = await page.locator("#main-content button:visible").evaluateAll((buttons) =>
      buttons
        .filter((b) => {
          const text = (b.innerText || "").trim();
          const label = b.getAttribute("aria-label") || b.getAttribute("title") || "";
          return !text && !label.trim();
        })
        .map((b) => b.outerHTML.slice(0, 120))
    );
    expect(unnamed, `${target.name}: มีปุ่มที่ไม่มีชื่อให้โปรแกรมอ่านหน้าจออ่าน`).toEqual([]);

    // 4) ห้ามมี error ใน console ตอนเปิดหน้า
    //    (401 ระหว่างกู้ session เป็นเรื่องปกติของแอปนี้ จึงยกเว้นให้)
    const real = consoleErrors.filter((line) => !/401|Unauthorized/.test(line));
    expect(real, `${target.name}: มี error ใน console`).toEqual([]);
  });
}
