// apps/web/e2e/login.spec.js
//
// สัญญาของฟอร์มล็อกอิน — ตรวจตามเช็กลิสต์ที่เป็นมาตรฐานจริง ไม่ใช่ความเห็น
//
// ## ทำไมต้องมี
//
// ทุกข้อในนี้ **ผิดได้โดยไม่มีอะไรพัง** ฟอร์มยังล็อกอินได้ปกติ build ผ่าน
// ไม่มี error ในคอนโซล แต่โปรแกรมจัดการรหัสผ่านเติมรหัสให้ไม่ได้ หรือคนที่ใช้
// โปรแกรมอ่านหน้าจอไม่รู้ว่าปุ่มนั้นทำอะไร — และไม่มีใครรู้จนกว่าจะมีคนบ่น
//
// ตอนเขียนเทสชุดนี้ ฟอร์มตกอยู่ห้าข้อ: ไม่มี `name`, `id` เป็นเลขรันไทม์
// (`f-v-0`), ไม่มี `required`, ปุ่มดูรหัสผ่านมีพื้นที่กดแค่ 28×28 และคำอธิบาย
// ของปุ่มไม่ได้บอกว่ากดแล้วรหัสผ่านจะโผล่บนหน้าจอ
//
// ที่มาของเกณฑ์
//   - web.dev — Sign-in form best practices
//   - W3C WCAG 2.2 — Target Size (Minimum) 2.5.8 คือ 24×24 ส่วน 44×44 เป็น
//     ค่าที่ web.dev แนะนำสำหรับนิ้วมือจริง
//
// รัน: npm run test:e2e --workspace @suth/web

import { expect, test } from "@playwright/test";
import { reasonToSkip } from "./fixtures.js";

for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test(`ฟอร์มและปุ่มหลักอยู่ในจอตั้งแต่เปิดที่ ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.reload();
    const submit = page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true });
    await expect(submit).toBeVisible();
    const bounds = await submit.boundingBox();
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    for (const selector of ["#login-username", "#current-password"]) {
      const field = await page.locator(selector).boundingBox();
      expect(field.height).toBeGreaterThanOrEqual(44);
      expect(field.width).toBeGreaterThanOrEqual(200);
    }
    const size = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: document.documentElement.clientWidth,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
  });
}

test("เปิดความช่วยเหลือด้วยคีย์บอร์ดได้โดยไม่ต้องออกจากฟอร์ม", async ({ page }) => {
  const help = page.locator(".login__access");
  await expect(help).not.toHaveAttribute("open", "");
  await page.locator("#current-password").fill("synthetic-value");
  await help.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(help).toHaveAttribute("open", "");
  await expect(help.getByRole("heading", { level: 2 })).toBeVisible();
  await expect(page.locator("#current-password")).toHaveValue("synthetic-value");
  await page.keyboard.press("Enter");
  await expect(help).not.toHaveAttribute("open", "");
});

test("ส่งครั้งเดียวระหว่างรอ และกลับมากรอกต่อได้เมื่อเกิดข้อผิดพลาด", async ({ page }) => {
  let requests = 0;
  let respond;
  const pending = new Promise((resolve) => { respond = resolve; });
  // Synthetic credentials never reach the API or its login rate limiter.
  await page.route("**/auth/login", async (route) => {
    requests += 1;
    await pending;
    await route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({ title: "ระบบไม่พร้อมใช้งาน กรุณาลองใหม่", status: 503 }),
    });
  });
  await page.locator("#login-username").fill("synthetic-user");
  await page.locator("#current-password").fill("synthetic-value");
  await page.locator("#current-password").press("Enter");
  try {
    await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
    await expect(page.locator('form button[type="submit"]')).toBeDisabled();
    await expect(page.locator("#login-username")).toBeDisabled();
    await expect(page.getByRole("button", { name: /แสดงรหัสผ่าน/ })).toBeDisabled();
    await page.keyboard.press("Enter");
    expect(requests).toBe(1);
  } finally {
    respond();
  }
  await expect(page.getByRole("alert")).toContainText("ระบบไม่พร้อมใช้งาน");
  await expect(page.locator("#current-password")).toBeEnabled();
  await expect(page.locator("#current-password")).toHaveValue("synthetic-value");
});

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API ทำงานอยู่ — ${skip}`);
});

// **ห้าม signIn** ในไฟล์นี้ — ถ้าล็อกอินอยู่ router จะเด้งไป /dashboard ทันที
test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /เข้าสู่ระบบ/ })).toBeVisible({ timeout: 20000 });
});

test("ใช้ element ที่ถูกต้อง — form, label ที่ผูกกับ input, ปุ่ม submit", async ({ page }) => {
  await expect(page.locator("form")).toHaveCount(1);
  await expect(page.locator('form button[type="submit"]')).toHaveCount(1);

  for (const id of ["login-username", "current-password"]) {
    const input = page.locator(`#${id}`);
    await expect(input, `ไม่มีช่อง #${id}`).toHaveCount(1);
    await expect(
      page.locator(`label[for="${id}"]`),
      `#${id} ไม่มี <label for> ผูกอยู่ — คลิกที่ป้ายแล้วโฟกัสไม่เข้าช่อง และโปรแกรมอ่านหน้าจอไม่รู้ว่าช่องนี้คืออะไร`
    ).toHaveCount(1);
  }
});

test("โปรแกรมจัดการรหัสผ่านต้องอ่านฟอร์มนี้ออก", async ({ page }) => {
  const username = page.locator("#login-username");
  const password = page.locator("#current-password");

  // autocomplete บอกเบราว์เซอร์ว่าช่องไหนคือชื่อผู้ใช้ ช่องไหนคือรหัสผ่านเดิม
  // (ไม่ใช่รหัสใหม่) — ถ้าผิด มันจะเสนอให้ "บันทึกรหัสใหม่" แทนที่จะเติมรหัสเดิม
  await expect(username).toHaveAttribute("autocomplete", "username");
  await expect(password).toHaveAttribute("autocomplete", "current-password");

  // name คือสิ่งที่โปรแกรมจัดการรหัสผ่านส่วนใหญ่ใช้จำช่อง ขาดไม่ได้
  await expect(username, "ช่องชื่อผู้ใช้ไม่มี name").toHaveAttribute("name", "username");
  await expect(password, "ช่องรหัสผ่านไม่มี name").toHaveAttribute("name", "password");

  await expect(password).toHaveAttribute("type", "password");
});

test("id ต้องคงที่ ไม่ใช่เลขที่เปลี่ยนทุกครั้งที่โหลด", async ({ page }) => {
  // id ที่มาจากตัวนับตอนรัน (เช่น f-v-0) เปลี่ยนได้เมื่อลำดับการสร้าง component
  // เปลี่ยน ทำให้โปรแกรมจัดการรหัสผ่านเติมรหัสให้ได้บ้างไม่ได้บ้าง
  const ids = await page.locator("form input").evaluateAll((els) => els.map((el) => el.id));
  expect(ids).toEqual(["login-username", "current-password"]);

  for (const id of ids) {
    expect(id, `id "${id}" ดูเหมือนเลขที่ระบบสร้างให้ตอนรัน ไม่ใช่ค่าคงที่`).not.toMatch(/^f-v-\d+$/);
  }
});

test("ฟอร์มว่างต้องส่งไม่ได้ — กันการยิงคำขอที่รู้อยู่แล้วว่าจะล้ม", async ({ page }) => {
  await expect(page.locator("#login-username")).toHaveJSProperty("required", true);
  await expect(page.locator("#current-password")).toHaveJSProperty("required", true);

  const formValid = await page.locator("form").evaluate((form) => form.checkValidity());
  expect(formValid, "ฟอร์มเปล่าผ่านการตรวจของเบราว์เซอร์ แปลว่าไม่ได้ตั้ง required").toBe(false);
});

test("ปุ่มดูรหัสผ่าน — พื้นที่กดพอสำหรับนิ้ว และบอกผลของการกดให้ครบ", async ({ page }) => {
  const toggle = page.getByRole("button", { name: /แสดงรหัสผ่าน/ });

  const box = await toggle.boundingBox();
  expect(box.width, "พื้นที่กดแคบเกินไปสำหรับนิ้วมือ").toBeGreaterThanOrEqual(44);
  expect(box.height, "พื้นที่กดเตี้ยเกินไปสำหรับนิ้วมือ").toBeGreaterThanOrEqual(44);

  // ต้องเตือนว่ารหัสผ่านจะโผล่บนจอ — คนที่ฟังเสียงอ่านหน้าจอมองไม่เห็นว่ารอบตัวมีใคร
  await expect(toggle).toHaveAttribute("aria-label", /รหัสผ่านจะปรากฏบนหน้าจอ/);

  // กดแล้วต้องสลับชนิดช่องจริง และสถานะต้องอ่านออกจาก aria-pressed
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(page.locator("#current-password")).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "ซ่อนรหัสผ่าน" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("วางรหัสผ่านจากโปรแกรมจัดการรหัสผ่านได้", async ({ page }) => {
  // การบล็อกการวางเป็นรูปแบบที่เจอบ่อยและทำให้คนที่ใช้รหัสผ่านยาวๆ ใช้งานไม่ได้เลย
  const password = page.locator("#current-password");
  await password.focus();
  await page.evaluate(() => {
    const el = document.querySelector("#current-password");
    const data = new DataTransfer();
    data.setData("text", "PastedSecret123");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });

  const blocked = await page.evaluate(() => {
    const el = document.querySelector("#current-password");
    const data = new DataTransfer();
    data.setData("text", "x");
    const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
    return !el.dispatchEvent(event); // true = มีคนเรียก preventDefault
  });

  expect(blocked, "หน้านี้บล็อกการวางในช่องรหัสผ่าน").toBe(false);
});

test("โฟกัสอยู่ที่ช่องแรกตั้งแต่เปิดหน้า", async ({ page }) => {
  // คนที่เปิดหน้านี้มาทำอย่างเดียวคือพิมพ์ชื่อผู้ใช้ ไม่ควรต้องกดเมาส์ก่อน
  await expect(page.locator("#login-username")).toBeFocused();
});

test("กรอกผิดต้องได้ข้อความที่อ่านรู้เรื่อง และไม่บอกว่าชื่อผู้ใช้มีอยู่จริงหรือไม่", async ({ page }) => {
  await page.locator("#login-username").fill("ไม่มีบัญชีนี้จริง");
  await page.locator("#current-password").fill("รหัสผ่านมั่วๆ");
  await page.getByRole("button", { name: /เข้าสู่ระบบ/ }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible({ timeout: 15000 });

  const text = (await alert.textContent()).trim();

  // ต้องเป็นภาษาไทยที่ API ตั้งใจส่งมา ไม่ใช่ข้อความของ axios
  expect(text, "ข้อความผิดพลาดเป็นภาษาอังกฤษของ axios ไม่ใช่ข้อความจริงจาก API").not.toMatch(
    /Request failed|Network Error|status code/i
  );
  expect(text.length).toBeGreaterThan(5);

  // ห้ามแยกว่า "ไม่พบผู้ใช้" กับ "รหัสผ่านผิด" — การแยกบอกคนนอกว่าชื่อไหนมีอยู่จริง
  expect(text, "ข้อความบอกได้ว่าชื่อผู้ใช้นี้มีอยู่จริงหรือไม่").not.toMatch(
    /ไม่พบผู้ใช้|ไม่มีผู้ใช้|user not found/i
  );

  // ยังอยู่หน้าล็อกอิน และรหัสผ่านที่พิมพ์ไว้ไม่ถูกล้างทิ้ง
  expect(page.url()).toContain("/login");
});

test("ปุ่มดูรหัสผ่านต้องอยู่ *ใน* ช่องรหัสผ่าน ไม่ใช่ลอยอยู่ข้างๆ", async ({ page }) => {
  // เคยพลาดมาแล้ว: การเขียน class="pr-12" บน <UiInput> ส่ง class ไปที่กล่องหุ้ม
  // ไม่ใช่ที่ <input> ผลคือช่องรหัสผ่านสั้นลง 48px และปุ่มไปลอยอยู่นอกช่อง
  // ซึ่ง build ผ่าน เทสอื่นผ่าน และไม่มี error ใดๆ — เห็นได้จากภาพหน้าจอเท่านั้น
  const username = await page.locator("#login-username").boundingBox();
  const password = await page.locator("#current-password").boundingBox();
  const toggle = await page.getByRole("button", { name: /แสดงรหัสผ่าน/ }).boundingBox();

  expect(
    Math.round(password.width),
    "ช่องรหัสผ่านกว้างไม่เท่าช่องชื่อผู้ใช้ แปลว่าที่เว้นให้ปุ่มไปบีบตัวช่องแทน"
  ).toBe(Math.round(username.width));

  expect(toggle.x, "ปุ่มอยู่ทางซ้ายของขอบซ้ายช่องรหัสผ่าน").toBeGreaterThanOrEqual(password.x);
  expect(
    toggle.x + toggle.width,
    "ปุ่มล้นออกไปนอกขอบขวาของช่องรหัสผ่าน"
  ).toBeLessThanOrEqual(password.x + password.width + 1);
});
