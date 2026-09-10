// apps/web/e2e/wcag.spec.js
//
// ทุกหน้าหลังล็อกอินกับ WCAG 2.2 ระดับ AA — วัดจากหน้าจริง ไม่ใช่ไล่เช็กลิสต์ด้วยตา
//
// เป็นฉบับ "ทั้งระบบ" ของ login-wcag.spec.js ซึ่งลงลึกเฉพาะหน้าล็อกอิน
// เอกสารประกอบและรายการที่ยังต้องใช้คนตรวจอยู่ใน
// docs/reference/accessibility.md
//
// ## สิ่งที่ไฟล์นี้เคยจับได้ (ตอนเขียนครั้งแรก ทั้งหมดคือของจริง ไม่ใช่ของสมมติ)
//
//   1.4.10  กราฟบนแดชบอร์ดไม่ยอมย่อเมื่อจอเล็กลง หน้ากว้าง 754px บนจอ 320px
//   1.4.3   --ink-mute ตกเกณฑ์บนพื้นอ่อนหกแบบ (ต่ำสุด 4.20 จากที่ต้องการ 4.5)
//   1.4.3   --ink-faint (3.32:1 สำหรับ placeholder) ถูกใช้กับข้อความจริง 18 ที่
//   2.5.8   ลิงก์ Serial ในทะเบียน 20 อัน สูงแค่ 17px
//   3.3.2   ช่องค้นหาในตารางไม่มีป้ายกำกับ มีแต่ placeholder (กระทบ 4 หน้า)
//   1.3.1   /expense ข้ามจาก h1 ไป h3
//
// ## ข้อควรรู้เรื่องเทสข้อ 1.4.10
//
// เทส reflow ที่นี่ **ย่อจอหลังจากโหลดหน้าเสร็จแล้ว** ไม่ใช่เปิดหน้าที่ 320px
// ตั้งแต่แรก ตั้งใจให้เป็นแบบนั้น เพราะบั๊กของกราฟข้างบนโผล่เฉพาะตอนย่อ —
// เปิดที่ 320px ตั้งแต่ต้นไม่เจอ และนั่นคือเหตุผลที่มันรอดมาตลอด
// คนที่ซูม 400% เจอเส้นทางเดียวกับที่เทสนี้เดิน
//
// รัน: npm run test:e2e --workspace @suth/web

import { expect, test } from "@playwright/test";
import { reasonToSkip, resolveAssetDetailUrl, signIn } from "./fixtures.js";
import { CONTRAST_HELPERS } from "./contrast-helper.js";
import { PAGES } from "./pages.js";

/** ค่าขั้นต่ำตาม WCAG 2.2 ระดับ AA */
const AA_TEXT = 4.5;
const AA_LARGE_TEXT = 3;
const AA_NON_TEXT = 3;
const AA_TARGET = 24;

/**
 * ชุดฟังก์ชันคำนวณสีที่ถูกฉีดเข้าไปทำงานในหน้าเว็บ
 *
 * ต้องทำในหน้าเว็บ ไม่ใช่ใน Node เพราะสีทั้งหมดเขียนด้วย oklch และคนที่แปลง
 * oklch เป็น sRGB ได้ตรงกับที่ผู้ใช้เห็นที่สุดคือเบราว์เซอร์ที่กำลังแสดงผลอยู่
 */
const HELPERS = `
  ${CONTRAST_HELPERS}
  const _c = document.createElement("canvas");
  _c.width = _c.height = 1;
  const _ctx = _c.getContext("2d");

  // ระบายสีทีละชั้นลงบน canvas 1x1 แล้วอ่านค่าพิกเซลกลับมา
  // ได้ผลของการซ้อนสีโปร่งแสงที่ตรงกับที่เบราว์เซอร์วาดจริง
  function composite(layers) {
    _ctx.clearRect(0, 0, 1, 1);
    for (const layer of layers) { _ctx.fillStyle = layer; _ctx.fillRect(0, 0, 1, 1); }
    const d = _ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }

  // ความสว่างสัมพัทธ์ตามนิยามใน WCAG (ไม่ใช่ค่า L ของ oklch)
  function luminance([r, g, b]) {
    const ch = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  }

  function ratio(fg, bg) {
    const a = luminance(fg), b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  function alphaOf(color) {
    return contrast.rgba(color)[3];
  }

  // หาสีพื้นจริงใต้ element โดยไล่ขึ้นไปหาบรรพบุรุษที่ทึบ แล้วซ้อนกลับลงมา
  // คืน null เมื่อเจอ background-image (gradient/รูป) ซึ่งวัดด้วยวิธีนี้ไม่ได้
  // และการเดาแทนการวัดแย่กว่าการบอกว่าวัดไม่ได้
  function backdropOf(el) {
    const stack = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== "none") return null;
      if (alphaOf(s.backgroundColor) > 0) stack.unshift(s.backgroundColor);
      if (alphaOf(s.backgroundColor) >= 1) return composite(stack);
      node = node.parentElement;
    }
    return composite(["rgb(255,255,255)", ...stack]);
  }

  function isVisible(el) {
    return contrast.isVisible(el);
  }
`;

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
});

/**
 * เปิดหน้าในโหมดสีที่ระบุ
 *
 * ต้องตั้งค่าก่อนหน้าโหลด เพราะ index.html อ่าน localStorage แล้วตั้ง data-mode
 * ตั้งแต่ก่อน CSS จะ paint ครั้งแรก การสลับทีหลังได้ค่าที่ต่างจากที่ผู้ใช้เห็นจริง
 */
async function open(page, url, mode = "light") {
  url = await resolveAssetDetailUrl(url);
  await page.addInitScript((m) => {
    try {
      localStorage.setItem("suth-ui-mode", m);
    } catch {
      /* โหมดส่วนตัวบางเบราว์เซอร์ห้ามเขียน */
    }
  }, mode);
  await page.goto(url);
  await expect(page).toHaveURL(new RegExp(url.split("?")[0] + "(?:\\?|$)"));
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
  // รอให้กราฟและตารางวาดเสร็จก่อนวัด ไม่งั้นจะวัดตอนที่ยังเป็นโครงร่าง
  await page.waitForTimeout(700);
}

test.describe("WCAG 2.2 AA — ทุกหน้าหลังล็อกอิน", () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  /* ======================================================================
     1.4.3 Contrast (Minimum) — ไล่ตัวหนังสือทุกตัวในหน้า ทั้งสองโหมดสี
     ====================================================================== */
  for (const mode of ["light", "dark"]) {
    for (const target of PAGES) {
      test(`1.4.3 [${mode}] ${target.name}`, async ({ page }) => {
        await open(page, target.url, mode);

        const report = await page.evaluate(`${CONTRAST_HELPERS} contrast.auditText();`);
        await test.info().attach("contrast-report", {
          body: JSON.stringify(report, null, 2), contentType: "application/json",
        });
        if (report.unsupported.length) test.info().annotations.push({
          type: "unmeasured",
          description: `${report.unsupported.length} text samples require separate visual measurement; see contrast-report`,
        });
        expect(report.measured, "ต้องวัดข้อความจริงได้ ไม่ใช่ผ่านจากชุดว่าง").toBeGreaterThan(0);
        expect(report.failures, JSON.stringify(report.failures, null, 2)).toEqual([]);
      });
    }
  }

  /* ======================================================================
     ข้อที่เหลือ — วัดในโหมดสว่างพอ เพราะเป็นเรื่องโครงและขนาด ไม่ใช่เรื่องสี
     ยกเว้น 1.4.11 ที่วัดสีของขอบ จึงตรวจทั้งสองโหมด
     ====================================================================== */
  for (const target of PAGES) {
    test(`โครงและขนาด · ${target.name}`, async ({ page }) => {
      await open(page, target.url);

      const report = await page.evaluate(`(() => {
        ${HELPERS}
        const out = { target: [], img: [], label: [], headings: [] };

        // ---- 2.5.8 Target Size (Minimum) ----
        for (const el of document.querySelectorAll(
          "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=checkbox], [role=switch]"
        )) {
          if (!isVisible(el)) continue;

          // ข้อยกเว้น "inline" ของข้อกำหนด — ลิงก์ที่แทรกอยู่ในประโยคไม่นับ
          // เพราะขยายไม่ได้โดยไม่ทำให้บรรทัดเสีย ลิงก์ที่อยู่เดี่ยวๆ ในช่องตาราง
          // ไม่เข้าข้อยกเว้นนี้
          const own = (el.textContent || "").trim();
          const around = el.parentElement ? el.parentElement.textContent.trim() : "";
          if (el.tagName === "A" && around.length > own.length + 3) continue;

          const b = el.getBoundingClientRect();
          if (Math.min(b.width, b.height) < ${AA_TARGET}) {
            out.target.push({
              tag: el.tagName.toLowerCase(),
              name: (el.getAttribute("aria-label") || own).slice(0, 26),
              size: Math.round(b.width) + "x" + Math.round(b.height),
              cls: String(el.className).slice(0, 40),
            });
          }
        }

        // ---- 1.1.1 Non-text Content ----
        for (const el of document.querySelectorAll("img")) {
          if (el.getAttribute("alt") === null) out.img.push(el.getAttribute("src"));
        }

        // ---- 3.3.2 Labels or Instructions ----
        // placeholder หายไปทันทีที่เริ่มพิมพ์ จึงใช้แทนป้ายกำกับไม่ได้
        for (const el of document.querySelectorAll("input:not([type=hidden]), select, textarea")) {
          if (!isVisible(el)) continue;
          const byFor = el.id ? document.querySelector('label[for="' + el.id + '"]') : null;
          if (byFor || el.closest("label")) continue;
          if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) continue;
          out.label.push({
            tag: el.tagName.toLowerCase(),
            placeholder: el.getAttribute("placeholder"),
            cls: String(el.className).slice(0, 34),
          });
        }

        // ---- 1.3.1 ลำดับหัวข้อ ----
        out.headings = Array.from(
          document.querySelectorAll("#main-content :is(h1,h2,h3,h4,h5,h6)")
        ).map((h) => ({ level: Number(h.tagName[1]), text: h.textContent.trim().slice(0, 30) }));

        return out;
      })()`);

      expect(
        report.target,
        `พื้นที่กดเล็กกว่า ${AA_TARGET}x${AA_TARGET} (2.5.8):\n` +
          report.target.map((t) => `  ${t.tag} ${t.size} "${t.name}" [${t.cls}]`).join("\n")
      ).toEqual([]);

      expect(report.img, "รูปที่ไม่มี alt (1.1.1)").toEqual([]);

      expect(
        report.label,
        `ช่องกรอกที่ไม่มีป้ายกำกับ มีแต่ placeholder (3.3.2):\n` +
          report.label.map((l) => `  ${l.tag} "${l.placeholder}" [${l.cls}]`).join("\n")
      ).toEqual([]);

      // 1.3.1 — หัวข้อต้องเริ่มที่ h1 อันเดียว และไล่ทีละขั้น
      const levels = report.headings;
      expect(levels.length, `${target.name} ไม่มีหัวข้อเลย`).toBeGreaterThan(0);
      expect(levels[0].level, "หัวข้อแรกในเนื้อหาต้องเป็น h1").toBe(1);
      expect(levels.filter((h) => h.level === 1).length, "มี h1 มากกว่าหนึ่งอัน").toBe(1);
      for (let i = 1; i < levels.length; i += 1) {
        expect(
          levels[i].level - levels[i - 1].level,
          `ข้ามจาก h${levels[i - 1].level} ไป h${levels[i].level} ที่ "${levels[i].text}"`
        ).toBeLessThanOrEqual(1);
      }
    });

    /* ====================================================================
       1.4.10 Reflow — ย่อจอ *หลัง* โหลดเสร็จ (ดูหมายเหตุหัวไฟล์)
       ==================================================================== */
    test(`1.4.10 ย่อจอเหลือ 320px · ${target.name}`, async ({ page }) => {
      await open(page, target.url);

      await page.setViewportSize({ width: 320, height: 640 });
      // ให้เวลามากพอที่ ResizeObserver และการวาดกราฟใหม่จะเสร็จ
      await page.waitForTimeout(1500);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        culprits: Array.from(document.querySelectorAll("#main-content *, header *"))
          .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 2)
          .slice(0, 5)
          .map((el) => {
            const b = el.getBoundingClientRect();
            return `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} กว้าง ${Math.round(b.width)}`;
          }),
      }));

      expect(
        overflow.scrollWidth,
        `เนื้อหาล้นออกด้านข้างที่ 320px — ต้องเลื่อนซ้ายขวาเพื่ออ่านทุกบรรทัด\n` +
          `  ${overflow.scrollWidth} / ${overflow.clientWidth}\n  ${overflow.culprits.join("\n  ")}`
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  }

  /* ======================================================================
     1.4.11 Non-text Contrast — ขอบของ control ทุกตัว ทั้งสองโหมด
     ====================================================================== */
  for (const mode of ["light", "dark"]) {
    test(`1.4.11 [${mode}] ขอบของช่องกรอกและปุ่ม`, async ({ page }) => {
      // หน้าทะเบียนมีทั้งช่องค้นหา ช่องเลือก และปุ่ม จึงครอบ control ได้ครบที่สุด
      await open(page, "/assets", mode);

      const bad = await page.evaluate(`(() => {
        ${HELPERS}
        const found = [];
        const seen = new Set();
        for (const el of document.querySelectorAll("input, select, textarea, [role=combobox]")) {
          if (!isVisible(el)) continue;
          const s = getComputedStyle(el);
          if (parseFloat(s.borderTopWidth) === 0) continue;
          const bg = backdropOf(el.parentElement);
          if (!bg) continue;
          const r = ratio(composite(["rgb(" + bg.join(",") + ")", s.borderTopColor]), bg);
          const key = s.borderTopColor + "|" + bg.join(",");
          if (r < ${AA_NON_TEXT} && !seen.has(key)) {
            seen.add(key);
            found.push({ tag: el.tagName.toLowerCase(), ratio: Number(r.toFixed(2)), color: s.borderTopColor });
          }
        }
        return found;
      })()`);

      expect(
        bad,
        `ขอบของ control ที่จางเกินไป มองไม่ออกว่าเป็นช่องกรอก (1.4.11):\n` +
          bad.map((b) => `  ${b.tag} ${b.ratio}:1 ${b.color}`).join("\n")
      ).toEqual([]);
    });
  }

  /* ======================================================================
     2.4.7 Focus Visible + 2.4.11 Focus Not Obscured

     ตรวจบนหน้าบันทึกยอดพิมพ์ เพราะเป็นหน้าเดียวที่มีแถบบันทึกติดหนึบอยู่ล่างจอ
     ซึ่งเป็นรูปแบบที่ข้อ 2.4.11 ถูกเขียนขึ้นมาเพื่อจับโดยเฉพาะ
     ====================================================================== */
  test("2.4.7 + 2.4.11 ไล่ Tab แล้วต้องเห็นโฟกัสและไม่มีอะไรมาบัง", async ({ page }) => {
    // This test changes only an in-memory draft. Guard the network as well, so
    // an accidental save in future edits cannot write to the real database.
    const attemptedWrites = [];
    await page.route("**/api/**", async (route) => {
      if (["GET", "HEAD", "OPTIONS"].includes(route.request().method())) return route.continue();
      attemptedWrites.push(route.request().url());
      return route.abort("blockedbyclient");
    });
    await open(page, "/print-transactions");
    await page.getByRole("radio", { name: "กรอกรายเดือน", exact: true }).click();
    const inputs = page.locator('input[aria-label^="ยอดพิมพ์ของ"]');
    await expect(inputs.first()).toBeVisible();
    const original = await inputs.first().inputValue();
    await inputs.first().fill(original === "1" ? "2" : "1");
    const save = page.getByRole("button", { name: "บันทึก 1 รายการ", exact: true });
    await expect(save).toBeVisible();
    await inputs.first().focus();
    let reachedSave = false;
    let checked = 0;

    for (let step = 0; step < 200; step += 1) {
      await page.keyboard.press("Tab");

      const state = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();

        // `outline: none` ยังรายงาน outlineWidth เป็น 3px (ค่า medium) อยู่ดี
        // การเช็กแค่ width จึงปล่อยหน้าที่ไม่มีกรอบโฟกัสเลยให้ผ่านได้
        const hasOutline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
        const hasRing = style.boxShadow !== "none" && style.boxShadow !== "";

        const atCentre = document.elementFromPoint(
          Math.min(Math.max(box.x + box.width / 2, 1), innerWidth - 1),
          Math.min(Math.max(box.y + box.height / 2, 1), innerHeight - 1)
        );

        return {
          id: el.id || el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 26) || el.tagName,
          hasIndicator: hasOutline || hasRing,
          inViewport: box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth,
          covered: atCentre ? !(el.contains(atCentre) || atCentre.contains(el)) : true,
        };
      });

      if (!state) break;

      expect(state.hasIndicator, `"${state.id}" โฟกัสแล้วไม่มีอะไรบอกว่าคีย์บอร์ดอยู่ตรงไหน (2.4.7)`).toBe(true);
      expect(state.inViewport, `"${state.id}" โฟกัสแล้วอยู่นอกจอ (2.4.11)`).toBe(true);
      expect(state.covered, `"${state.id}" โฟกัสแล้วมีอย่างอื่นวางทับ (2.4.11)`).toBe(false);
      checked += 1;
      if (await save.evaluate((el) => el === document.activeElement)) {
        reachedSave = true;
        break;
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(reachedSave, "ต้องตรวจจน Tab ถึงปุ่มบันทึกขณะแถบ sticky ปรากฏจริง").toBe(true);
    await page.getByRole("button", { name: "ทิ้งที่แก้ไว้", exact: true }).click();
    await expect(save).toHaveCount(0);
    expect(attemptedWrites, "เทสโฟกัสห้ามเขียน API").toEqual([]);
  });

  /* ======================================================================
     1.4.12 Text Spacing — ค่าชุดนี้ระบุอยู่ในตัวข้อกำหนดเอง ไม่ได้เลือกเอง
     ====================================================================== */
  test("1.4.12 เพิ่มระยะห่างตัวอักษรแล้วต้องไม่มีข้อความหาย", async ({ page }) => {
    await open(page, "/dashboard");

    /* ข้อกำหนดถามว่า "การเพิ่มระยะห่าง" ทำให้เนื้อหาหายหรือไม่ จึงต้องวัดสองครั้ง
       แล้วเทียบส่วนต่าง ไม่ใช่วัดครั้งเดียวหลังใส่สไตล์ การวัดครั้งเดียวจะจับ
       `truncate` ที่ repo นี้อนุญาตไว้กับ "ชื่อ" ด้วย (docs/reference/accessibility.md)
       ผลคือเทสเปลี่ยนสถานะตามความยาวชื่อในฐานข้อมูล ไม่ได้ตามโค้ด — ดัชนีของ element
       ถูกใส่ไว้ในคีย์เพื่อให้เทียบตัวเดียวกันได้ เพราะ DOM ไม่เปลี่ยนระหว่างสองครั้ง
       ข้อจำกัด: element ที่ถูกตัดอยู่ก่อนแล้วและถูกตัดมากขึ้นหลังเพิ่มระยะห่าง
       จะไม่ถูกจับ เพราะเทียบเป็น boolean ไม่ได้เทียบระยะที่ล้น */
    const clippedNow = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("#main-content :is(h1,h2,h3,p,label,strong)"))
          .map((el, index) => {
            const s = getComputedStyle(el);
            if (s.overflow === "visible" || !el.textContent.trim()) return null;
            if (el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1) return null;
            return index + " " + el.tagName.toLowerCase() + ': "' + el.textContent.trim().slice(0, 30) + '"';
          })
          .filter(Boolean)
      );

    const before = await clippedNow();
    await page.addStyleTag({
      content: `#main-content * {
        line-height: 1.5 !important;
        letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important;
      }
      #main-content p { margin-bottom: 2em !important; }`,
    });
    await page.waitForTimeout(400);

    const clipped = (await clippedNow()).filter((entry) => !before.includes(entry)).slice(0, 6);

    expect(clipped, "เพิ่มระยะห่างแล้วมีข้อความถูกตัดหาย").toEqual([]);
  });
});
