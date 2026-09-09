// Contract of the desktop shell introduced by Issue #47.
import { expect, test } from "@playwright/test";
import { reasonToSkip, signIn } from "./fixtures.js";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
});

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test("shell ใช้ขนาดกลางและเปิดหมวดงานประจำตาม contract", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator("#main-content")).toBeVisible();

  const sidebar = await page.getByRole("complementary", { name: "เมนูหลัก" }).boundingBox();
  const topbar = await page.locator("header[data-print='hide']").boundingBox();
  const mainPadding = await page.locator("#main-content").evaluate((el) => getComputedStyle(el).paddingTop);

  expect(sidebar.width).toBe(232);
  expect(topbar.height).toBe(56);
  expect(mainPadding).toBe("24px");
  await expect(page.getByRole("button", { name: "งานประจำ" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "ภาพรวม" })).toHaveAttribute("aria-expanded", "true");
});

test("direct link กางหมวดตั้งค่าและบอก active ได้มากกว่าสี", async ({ page }) => {
  await page.goto("/admin/contracts");

  await expect(page.getByRole("button", { name: "ตั้งค่าระบบ" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "สัญญา", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
});

/**
 * tooltip ของ rail ผูกข้อความเข้ากับรายการเมนูด้วย `aria-describedby` — ตรวจที่ความสัมพันธ์นั้น
 * ไม่ใช่ที่ `role="tooltip"` เพราะกล่องที่ตาเห็นเป็นภาพประกอบ ส่วนข้อความที่โปรแกรมอ่านหน้าจอ
 * อ่านจริงถูกซ่อนไว้แล้วอ้างถึงด้วย id การยึด role จึงผูกเทสไว้กับโครงของ component แทนที่จะ
 * เป็นสิ่งที่ผู้ใช้ได้รับจริง
 */
async function expectTooltip(page, trigger, text) {
  await expect(trigger).toHaveAttribute("aria-describedby", /.+/);
  const id = await trigger.getAttribute("aria-describedby");
  await expect(page.locator(`#${id}`)).toHaveText(text);
}

test("accordion, rail tooltip และ command search ใช้คีย์บอร์ดได้", async ({ page }) => {
  await page.goto("/dashboard");

  const routine = page.getByRole("button", { name: "งานประจำ" });
  await routine.focus();
  await page.keyboard.press("Enter");
  await expect(routine).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(routine).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: "พับเมนู" }).click();
  await expect(page.getByRole("complementary", { name: "เมนูหลัก" })).toHaveCSS("width", "64px");

  const entry = page.getByRole("link", { name: "บันทึกยอดพิมพ์" });
  await entry.hover();
  await expectTooltip(page, entry, "บันทึกยอดพิมพ์");
  await page.mouse.move(800, 700);
  await expect(entry).not.toHaveAttribute("aria-describedby", /.+/);

  await page.getByRole("link", { name: "แดชบอร์ด" }).focus();
  await page.keyboard.press("Tab");
  await expect(entry).toBeFocused();
  await expectTooltip(page, entry, "บันทึกยอดพิมพ์");

  await page.keyboard.press("Control+k");
  const search = page.getByPlaceholder("พิมพ์ชื่อหน้าที่ต้องการไป…");
  await expect(search).toBeFocused();
  await search.fill("ราคาต่อแผ่น");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/contracts$/);
  await expect(page.getByRole("complementary", { name: "เมนูหลัก" })).toHaveCSS("width", "64px");
  await expect(page.getByRole("link", { name: "สัญญา", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
});

test("role visibility และภาษาอังกฤษยังใช้กับสี่หมวดเดิม", async ({ context, page }) => {
  await signIn(context, "viewer");
  await page.addInitScript(() => localStorage.setItem("suth-language", "en"));
  await page.goto("/dashboard");

  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Daily work" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reports" })).toBeVisible();
  await expect(page.getByRole("button", { name: "System settings" })).toHaveCount(0);

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Type a page name…").fill("User management");
  await expect(page.getByText(/No pages match/)).toBeVisible();
});

/**
 * ความสูงแถวบรรทัดเดียวตาม contract ของ #46 — 44px ปกติ, 36px แน่น, 52px โปร่ง
 *
 * วัดจาก padding จริงบวกกล่องบรรทัดจริง ไม่ใช่จากความสูงของ `<tr>` ที่วัดได้ เพราะแถวจริง
 * มักมีปุ่มอยู่ในคอลัมน์การกระทำซึ่งดันแถวให้สูงกว่าข้อความอยู่แล้ว สิ่งที่ contract พูดถึงคือ
 * "ขั้นต่ำของแถวที่มีแต่ข้อความ" ซึ่งเป็นผลของ --row-h ล้วนๆ
 *
 * เคยพลาดมาแล้ว: ตั้ง --row-py: 0.6875rem แล้วเขียนคอมเมนต์ว่า "ประมาณ 44px" โดยลืมนับ
 * line-height ได้จริง 42.8px และไม่มีเทสจับ
 */
test("แถวบรรทัดเดียวสูงตาม contract ทุกระดับความหนาแน่น", async ({ page }) => {
  await page.goto("/admin/brands");
  await page.locator("table tbody tr td").first().waitFor();

  for (const [density, expected] of [
    [null, 44],
    ["compact", 36],
    ["relaxed", 52],
  ]) {
    await page.evaluate((value) => {
      if (value) document.documentElement.setAttribute("data-density", value);
      else document.documentElement.removeAttribute("data-density");
    }, density);

    const singleLineRow = await page.evaluate(() => {
      const cell = document.querySelector("table tbody tr td");
      const style = getComputedStyle(cell);
      return (
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.lineHeight)
      );
    });

    expect(Math.round(singleLineRow), `density=${density ?? "default"}`).toBe(expected);
  }
});

test("theme/density preference คงเดิมและที่ 200% ไม่ล้นทั้งหน้า", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("suth-ui-mode", "dark");
    localStorage.setItem("suth-ui-density", "compact");
  });
  await page.goto("/dashboard");

  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");

  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  const overflow = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
});
