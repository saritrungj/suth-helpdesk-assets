// Login accessibility checks measure the rendered solid surfaces in both themes.
// Screen-reader and other unmeasured coverage: docs/reference/accessibility.md.
import { expect, test } from "@playwright/test";
import { reasonToSkip } from "./fixtures.js";
import { CONTRAST_HELPERS } from "./contrast-helper.js";

/** ค่าขั้นต่ำตาม WCAG 2.2 ระดับ AA */
const AA_NON_TEXT = 3; // 1.4.11 ขอบช่องกรอก ไอคอนที่สื่อความหมาย
const AA_TARGET = 24; // 2.5.8 พื้นที่กดขั้นต่ำ (CSS px)

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API ทำงานอยู่ — ${skip}`);
});

/**
 * เปิดหน้าล็อกอินในโหมดสีที่ระบุ
 *
 * ต้องตั้งค่าก่อนหน้าโหลด ไม่ใช่หลัง เพราะ index.html อ่าน localStorage แล้ว
 * ตั้ง data-mode ตั้งแต่ก่อน CSS จะ paint ครั้งแรก การสลับทีหลังจะได้ค่าที่
 * ต่างจากที่ผู้ใช้จริงเห็นตอนเปิดหน้า
 *
 * ห้าม signIn — ถ้าล็อกอินอยู่ router จะเด้งไป /dashboard ทันที
 */
async function openLogin(page, mode = "light") {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("suth-ui-mode", value);
    } catch {
      /* โหมดส่วนตัวบางเบราว์เซอร์ห้ามเขียน — ปล่อยให้ใช้ค่าเริ่มต้น */
    }
  }, mode);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /เข้าสู่ระบบ/ })).toBeVisible({ timeout: 20000 });
  await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
}

test.beforeEach(async ({ page }) => {
  await openLogin(page);
});

/**
 * ชุดฟังก์ชันคำนวณสีที่ถูกฉีดเข้าไปทำงานในหน้าเว็บ
 *
 * ต้องทำในหน้าเว็บ ไม่ใช่ใน Node เพราะสีทั้งหมดเขียนด้วย oklch และคนที่แปลง
 * oklch เป็น sRGB ได้ถูกต้องที่สุดคือเบราว์เซอร์ที่กำลังแสดงผลอยู่ — การเขียน
 * สูตรแปลงเองมีโอกาสคลาดจากสิ่งที่ผู้ใช้เห็นจริง
 */
const COLOR_HELPERS = `
  // ระบายสีทีละชั้นลงบน canvas 1x1 แล้วอ่านค่าพิกเซลกลับมา
  // ได้ผลลัพธ์ของการซ้อนสีโปร่งแสงที่ตรงกับที่เบราว์เซอร์วาดจริง
  function composite(layers) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    for (const layer of layers) {
      ctx.fillStyle = layer;
      ctx.fillRect(0, 0, 1, 1);
    }
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  }

  // ความสว่างสัมพัทธ์ตามนิยามใน WCAG (ไม่ใช่ค่า L ของ oklch)
  function luminance([r, g, b]) {
    const channel = (value) => {
      const v = value / 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  function ratio(fg, bg) {
    const a = luminance(fg);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
`;

/* ==========================================================================
   1.4.3 Contrast (Minimum) — AA
   ========================================================================== */

// ทั้งสามข้อนี้ต้องตรวจ **ทั้งสองโหมดสี** เพราะค่า token คนละชุดกัน
// การผ่านในโหมดสว่างไม่ได้บอกอะไรเลยเกี่ยวกับโหมดมืด
for (const mode of ["light", "dark"]) {
test(`1.4.3 [${mode}] ฟอร์มรวม placeholder และค่าที่กรอก`, async ({ page }) => {
  await openLogin(page, mode);
  // Measure the settled form, not one arbitrary frame of its entrance fade.
  await page.locator(".login__form").evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
  const audit = async () => {
    const report = await page.evaluate(`${CONTRAST_HELPERS} contrast.auditText('.login__form');`);
    expect(report.measured).toBeGreaterThan(0);
    expect(report.unsupported, "พื้นฟอร์มต้องเป็นพื้นทึบที่วัดได้").toEqual([]);
    expect(report.failures, JSON.stringify(report.failures, null, 2)).toEqual([]);
  };
  await audit();
  await page.locator("#login-username").fill("contrast-test");
  await page.locator("#current-password").fill("synthetic-value");
  await audit(); // Never submits or authenticates these synthetic values.
});

test(`1.4.3 [${mode}] ทั้งหน้ารวมส่วนช่วยเหลือที่เปิดแล้ว`, async ({ page }) => {
  await openLogin(page, mode);
  // DashboardHero uses --surface with --aurora-1..3, not the always-dark page palette.
  const palette = await page.evaluate(() => {
    const probe = document.createElement("div");
    document.body.append(probe);
    try {
      probe.style.backgroundColor = "var(--surface)";
      const groundMatches = getComputedStyle(document.querySelector(".login")).backgroundColor
        === getComputedStyle(probe).backgroundColor;
      const layersMatch = [1, 2, 3].map((layer) => {
        probe.style.backgroundImage = layer === 3
          ? "radial-gradient(ellipse, var(--aurora-3) 0%, transparent 68%)"
          : `radial-gradient(circle, var(--aurora-${layer}) 0%, transparent 70%)`;
        return getComputedStyle(document.querySelector(`.aurora__layer--${layer}`)).backgroundImage
          === getComputedStyle(probe).backgroundImage;
      });
      return { groundMatches, layersMatch };
    } finally {
      probe.remove();
    }
  });
  expect(palette).toEqual({ groundMatches: true, layersMatch: [true, true, true] });
  await page.screenshot({ path: `e2e/screens/login-${mode}.png`, fullPage: true });
  await page.locator(".login__access summary").click();
  await expect(page.getByRole("heading", { name: /ติดต่อฝ่าย/ })).toBeVisible();
  const report = await page.evaluate(`${CONTRAST_HELPERS} contrast.auditText();`);
  expect(report.measured).toBeGreaterThanOrEqual(9);
  expect(report.unsupported, "หน้าล็อกอินใช้พื้นทึบที่วัดได้ทั้งหมด").toEqual([]);
  expect(report.failures, JSON.stringify(report.failures, null, 2)).toEqual([]);
});

/* ==========================================================================
   1.4.11 Non-text Contrast — AA
   ========================================================================== */

test(`1.4.11 [${mode}] ขอบช่องกรอกต่างจากพื้นมากพอที่จะรู้ว่าตรงไหนคือช่องกรอก`, async ({ page }) => {
  await openLogin(page, mode);
  const items = await page.evaluate(`(() => {
    ${COLOR_HELPERS}

    return ["#login-username", "#current-password"].map((selector) => {
      const el = document.querySelector(selector);
      const style = getComputedStyle(el);
      // พื้นหลังที่ขอบวางอยู่บนคือพื้นของแผงฟอร์ม ไม่ใช่พื้นของตัว input เอง
      const panel = composite([getComputedStyle(document.querySelector(".login__panel")).backgroundColor]);
      return {
        selector,
        width: style.borderTopWidth,
        ratio: Number(ratio(composite(["rgb(" + panel.join(",") + ")", style.borderTopColor]), panel).toFixed(2)),
      };
    });
  })()`);

  for (const item of items) {
    console.log(`  ${item.selector} — ขอบ ${item.width}, ${item.ratio}:1`);
    expect(item.ratio, `ขอบของ ${item.selector} จางเกินไป มองไม่ออกว่าเป็นช่องกรอก`).toBeGreaterThanOrEqual(
      AA_NON_TEXT
    );
  }
});
}

/* ==========================================================================
   2.5.8 Target Size (Minimum) — AA
   ========================================================================== */

test("2.5.8 ทุกอย่างที่กดได้มีพื้นที่กดอย่างน้อย 24x24", async ({ page }) => {
  const targets = await page.evaluate(() => {
    const nodes = document.querySelectorAll("a[href], button, input, select, textarea, summary, [tabindex]");
    return Array.from(nodes)
      .filter((el) => el.offsetParent !== null || el === document.activeElement)
      .map((el) => {
        const box = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 24),
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      });
  });

  expect(targets.length, "ไม่เจอ element ที่กดได้เลย").toBeGreaterThan(2);

  for (const target of targets) {
    console.log(`  ${target.tag} "${target.id}" — ${target.width}x${target.height}`);
    expect(
      Math.min(target.width, target.height),
      `${target.tag} "${target.id}" เล็กกว่า ${AA_TARGET}x${AA_TARGET}`
    ).toBeGreaterThanOrEqual(AA_TARGET);
  }
});

/* ==========================================================================
   2.4.7 Focus Visible (AA) + 2.4.11 Focus Not Obscured (AA, ใหม่ใน 2.2)
   ========================================================================== */

test("2.4.7 + 2.4.11 กด Tab ไล่ทั้งหน้า ต้องเห็นกรอบโฟกัส และไม่มีอะไรมาบัง", async ({ page }) => {
  await page.locator("#login-username").focus();

  const seen = [];

  for (let step = 0; step < 8; step += 1) {
    const state = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;

      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();

      // 2.4.11 — จุดกึ่งกลางของสิ่งที่โฟกัสอยู่ต้องยังเป็นตัวมันเอง
      // ถ้ามี element อื่น (แถบติดหนึบ, cookie banner, ปุ่มลอย) วางทับอยู่
      // elementFromPoint จะคืน element นั้นแทน
      const atCentre = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);

      // 2.4.7 — "มีกรอบให้เห็น" ไม่ได้แปลว่า outline-width มากกว่าศูนย์
      //
      // เมื่อ CSS เขียน `outline: none` เบราว์เซอร์ยังรายงาน outlineWidth เป็น
      // 3px (ค่า medium) อยู่ดี เพราะสิ่งที่ถูกปิดคือ style ไม่ใช่ width
      // การเช็กแค่ width จึงปล่อยหน้าที่ไม่มีกรอบโฟกัสเลยให้ผ่านได้
      //
      // ระบบนี้ใช้ตัวบอกโฟกัสสองแบบ: ปุ่มใช้ outline ส่วนช่องกรอกใช้ขอบเปลี่ยนสี
      // พร้อมวงแหวนเรืองรอบ (box-shadow) ทั้งสองแบบนับว่าเห็นได้ แต่ต้องมีจริง
      const hasOutline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
      const hasRing = style.boxShadow !== "none" && style.boxShadow !== "";

      return {
        id: el.id || el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 24),
        indicator: hasOutline ? `outline ${style.outlineWidth} ${style.outlineColor}` : hasRing ? `ring ${style.boxShadow.slice(0, 40)}` : "ไม่มี",
        hasIndicator: hasOutline || hasRing,
        inViewport:
          box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth,
        covered: atCentre ? !(el.contains(atCentre) || atCentre.contains(el)) : true,
      };
    });

    if (!state) break;
    seen.push(state);

    console.log(
      `  โฟกัส "${state.id}" — ${state.indicator}, ` +
        `อยู่ในจอ: ${state.inViewport}, ถูกบัง: ${state.covered}`
    );

    expect(state.inViewport, `"${state.id}" โฟกัสแล้วอยู่นอกจอ (2.4.11)`).toBe(true);
    expect(state.covered, `"${state.id}" โฟกัสแล้วมีอย่างอื่นวางทับ (2.4.11)`).toBe(false);
    expect(
      state.hasIndicator,
      `"${state.id}" โฟกัสแล้วไม่มีอะไรบอกว่าคีย์บอร์ดอยู่ตรงไหน (2.4.7)`
    ).toBe(true);

    await page.keyboard.press("Tab");
  }

  expect(seen.length, "ไล่ Tab แล้วไม่เจออะไรเลย").toBeGreaterThanOrEqual(3);
});

/* ==========================================================================
   1.4.10 Reflow — AA
   ========================================================================== */

test("1.4.10 ที่ 320px (เท่ากับซูม 400% บนจอ 1280) ต้องไม่มีแถบเลื่อนแนวนอน", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 512 });
  await page.waitForTimeout(150); // ให้ layout ปรับตัวก่อนวัด

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    // หา element ที่ล้นออกไปจริงๆ เพื่อให้เทสบอกได้ว่าตัวไหนผิด
    culprits: Array.from(document.querySelectorAll("*"))
      .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 5)
      .map((el) => el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : "")),
  }));

  console.log(`  320px — scrollWidth ${overflow.scrollWidth} / clientWidth ${overflow.clientWidth}`);

  expect(
    overflow.scrollWidth,
    `มีเนื้อหาล้นออกด้านข้าง: ${overflow.culprits.join(", ") || "ไม่ระบุ"}`
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);

  // และฟอร์มต้องยังใช้งานได้ ไม่ใช่แค่ไม่ล้น
  await expect(page.locator("#login-username")).toBeVisible();
  await expect(page.getByRole("button", { name: /เข้าสู่ระบบ/ })).toBeVisible();
});

/* ==========================================================================
   1.4.12 Text Spacing — AA
   ========================================================================== */

test("1.4.12 เพิ่มระยะห่างตัวอักษรตามที่มาตรฐานกำหนดแล้วต้องไม่มีอะไรหาย", async ({ page }) => {
  // ค่าชุดนี้คือค่าที่ระบุไว้ในตัวข้อกำหนดเอง ไม่ใช่ค่าที่เลือกเอง
  await page.addStyleTag({
    content: `* {
      line-height: 1.5 !important;
      letter-spacing: 0.12em !important;
      word-spacing: 0.16em !important;
    }
    p { margin-bottom: 2em !important; }`,
  });
  await page.waitForTimeout(150);

  const result = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    // ตัวหนังสือที่ถูกตัดหายเพราะกล่องไม่ยืดตาม
    clipped: Array.from(document.querySelectorAll("h1, h2, h3, p, label, strong, span"))
      .filter((el) => {
        const style = getComputedStyle(el);
        if (style.overflow === "visible" || !el.textContent.trim()) return false;
        return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
      })
      .slice(0, 5)
      .map((el) => el.tagName.toLowerCase() + ": " + el.textContent.trim().slice(0, 30)),
  }));

  expect(result.horizontalOverflow, "เพิ่มระยะห่างแล้วเนื้อหาล้นออกด้านข้าง").toBe(false);
  expect(result.clipped, "เพิ่มระยะห่างแล้วมีข้อความถูกตัดหาย").toEqual([]);
});

/* ==========================================================================
   3.3.8 Accessible Authentication (Minimum) — AA
   ========================================================================== */

test("3.3.8 ต้องมีทางให้โปรแกรมจัดการรหัสผ่านกรอกแทนคนได้", async ({ page }) => {
  // ข้อนี้บอกว่า "การจำรหัสผ่าน" เป็น cognitive function test ซึ่งห้ามบังคับ
  // เว้นแต่จะมีข้อยกเว้นรองรับ ระบบนี้ใช้ข้อยกเว้น "Mechanism" คือปล่อยให้
  // โปรแกรมจัดการรหัสผ่านกรอกให้ ซึ่งจะทำได้ก็ต่อเมื่อครบทั้งสามอย่างข้างล่าง
  const state = await page.evaluate(() => {
    const password = document.querySelectorAll('input[type="password"], input[name="password"]');
    const field = document.querySelector("#current-password");
    return {
      // ไม่แตกเป็นหลายช่อง (รูปแบบ OTP สี่ช่อง คือสิ่งที่ข้อนี้ห้าม)
      passwordFieldCount: password.length,
      autocomplete: field.getAttribute("autocomplete"),
      name: field.getAttribute("name"),
      id: field.id,
      readOnly: field.readOnly,
      maxLength: field.maxLength,
    };
  });

  expect(state.passwordFieldCount, "ช่องรหัสผ่านถูกแตกเป็นหลายช่อง").toBe(1);
  expect(state.autocomplete).toBe("current-password");
  expect(state.name).toBe("password");
  expect(state.id).toBeTruthy();
  expect(state.readOnly, "ช่องรหัสผ่านเป็น readonly ทำให้ตัวเติมอัตโนมัติทำงานไม่ได้").toBe(false);
  // maxLength = -1 คือไม่จำกัด ถ้าจำกัดสั้นๆ รหัสผ่านจากโปรแกรมจัดการจะถูกตัด
  expect(state.maxLength === -1 || state.maxLength >= 64, "จำกัดความยาวรหัสผ่านสั้นเกินไป").toBe(true);

  // และการวางต้องไม่ถูกบล็อก — นี่คือสิ่งที่ข้อกำหนดระบุไว้ตรงๆ
  const pasteBlocked = await page.evaluate(() => {
    const el = document.querySelector("#current-password");
    const data = new DataTransfer();
    data.setData("text", "x");
    return !el.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true })
    );
  });
  expect(pasteBlocked, "หน้านี้บล็อกการวางในช่องรหัสผ่าน ซึ่งขัดกับข้อ 3.3.8 โดยตรง").toBe(false);
});

/* ==========================================================================
   1.3.1 / 2.4.6 โครงหัวข้อ · 3.1.1 ภาษา · 2.4.2 ชื่อหน้า · 1.1.1 ภาพ
   ========================================================================== */

test("1.3.1 ลำดับหัวข้อไล่ทีละขั้น ไม่ข้ามระดับ", async ({ page }) => {
  const levels = await page.locator("h1, h2, h3, h4, h5, h6").evaluateAll((els) =>
    els.map((el) => ({ level: Number(el.tagName[1]), text: el.textContent.trim() }))
  );

  console.log("  หัวข้อ:", levels.map((h) => `h${h.level} ${h.text}`).join(" / "));

  expect(levels.length, "หน้านี้ไม่มีหัวข้อเลย").toBeGreaterThan(0);
  expect(levels[0].level, "หัวข้อแรกของหน้าต้องเป็น h1").toBe(1);
  expect(levels.filter((h) => h.level === 1).length, "มี h1 มากกว่าหนึ่งอัน").toBe(1);

  for (let i = 1; i < levels.length; i += 1) {
    expect(
      levels[i].level - levels[i - 1].level,
      `ข้ามจาก h${levels[i - 1].level} ไป h${levels[i].level} ที่ "${levels[i].text}"`
    ).toBeLessThanOrEqual(1);
  }
});

test("3.1.1 + 2.4.2 + 1.1.1 ภาษาของหน้า ชื่อหน้า และคำบรรยายภาพ", async ({ page }) => {
  // 3.1.1 — โปรแกรมอ่านหน้าจอใช้ค่านี้เลือกเสียงอ่าน ผิดแล้วอ่านไทยด้วยเสียงอังกฤษ
  await expect(page.locator("html")).toHaveAttribute("lang", "th");

  // 2.4.2 — ชื่อหน้าต้องบอกได้ว่านี่คือหน้าอะไรของระบบไหน
  expect((await page.title()).length).toBeGreaterThan(5);

  // 1.1.1 — ภาพที่สื่อความหมายต้องมี alt, ภาพประดับต้องถูกซ่อนจากโปรแกรมอ่านหน้าจอ
  const images = await page.locator("img").evaluateAll((els) =>
    els.map((el) => ({ src: el.getAttribute("src"), alt: el.getAttribute("alt") }))
  );

  for (const image of images) {
    expect(image.alt, `<img src="${image.src}"> ไม่มี alt`).not.toBeNull();
  }

  // Shared Dashboard artwork is decorative and cannot intercept form clicks.
  await expect(page.locator(".aurora--hero")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".aurora--hero")).toHaveCSS("pointer-events", "none");
  await expect(page.locator(".aurora__layer").first()).toHaveCSS("animation-name", "none");
  await expect(page.locator("canvas")).toHaveCount(0);
  const logo = await page.locator(".login__logo").boundingBox();
  const panel = await page.locator(".login__panel").boundingBox();
  expect(Math.abs(logo.x + logo.width / 2 - panel.x - panel.width / 2)).toBeLessThan(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("เข้าสู่ระบบ");
});

/* ==========================================================================
   3.3.2 Labels or Instructions — A
   ========================================================================== */

test("3.3.2 ทุกช่องกรอกมีชื่อที่โปรแกรมอ่านหน้าจออ่านได้ ไม่ใช่แค่ placeholder", async ({ page }) => {
  const fields = await page.locator("form input").evaluateAll((els) =>
    els.map((el) => {
      const label = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      return {
        id: el.id,
        label: label ? label.textContent.trim() : null,
        ariaLabel: el.getAttribute("aria-label"),
        placeholder: el.getAttribute("placeholder"),
      };
    })
  );

  expect(fields.length).toBeGreaterThan(0);

  for (const field of fields) {
    // placeholder หายไปทันทีที่เริ่มพิมพ์ จึงใช้แทนป้ายกำกับไม่ได้
    expect(
      field.label || field.ariaLabel,
      `#${field.id} มีแต่ placeholder "${field.placeholder}" ไม่มีป้ายกำกับจริง`
    ).toBeTruthy();
  }
});

/* ==========================================================================
   4.1.3 Status Messages — AA
   ========================================================================== */

test("4.1.3 ข้อความผิดพลาดต้องถูกประกาศเองโดยไม่ต้องเลื่อนไปหา", async ({ page }) => {
  await page.locator("#login-username").fill("ไม่มีบัญชีนี้จริง");
  await page.locator("#current-password").fill("รหัสผ่านมั่วๆ");
  await page.getByRole("button", { name: /เข้าสู่ระบบ/ }).click();

  // role="alert" คือ live region ที่ประกาศทันที — ต่างจากข้อความธรรมดาที่คนตา
  // บอดจะไม่มีทางรู้ว่ามันโผล่ขึ้นมา
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible({ timeout: 15000 });
  await expect(alert).toHaveText(/\S/);
});
