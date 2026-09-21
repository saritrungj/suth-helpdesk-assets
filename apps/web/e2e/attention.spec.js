import { expect, test } from "@playwright/test";
import { prototypeFixture } from "./prototype-fixture.js";

/*
 * งานที่ต้องติดตาม: อยู่ในลิ้นชักแจ้งเตือนที่เดียว (#83)
 *
 * เดิมรายการชุดเดียวกันขึ้นทั้งบนแดชบอร์ดและในลิ้นชัก เทสนี้กันไม่ให้สำเนาที่สอง
 * กลับมาโดยไม่มีใครสังเกต — และกันไม่ให้ป้ายบนกระดิ่งลดเหลือ "จำนวน" เฉยๆ ซึ่งจะ
 * ทำให้เรื่องระดับต้องแก้ทันทีมองไม่ออกจากนอกลิ้นชัก
 */

const CRITICAL = "มี 1 เครื่องที่สัญญาไม่มีราคาครอบคลุม";
const CRITICAL_BADGE = "รวมเรื่องที่ต้องแก้ทันที";

const ATTENTION = [
  {
    code: "unpriced_missing_price_line",
    severity: "critical",
    title: CRITICAL,
    detail: "2 รายการ รวม 1,170 แผ่น ต้องเพิ่มช่วงราคาที่ครอบคลุมวันที่บันทึกยอด",
    count: 1,
    params: { readings: 2, pages: 1170 },
    action: { label: "ไปแก้ไขสัญญา", to: "/admin/contracts" },
  },
  {
    code: "unverified_installation",
    severity: "warning",
    title: "มี 1 เครื่องที่ยังไม่ได้ตรวจยืนยันสถานะการติดตั้ง",
    detail: "ยืนยันความครบถ้วนของยอดพิมพ์ไม่ได้จนกว่าจะตรวจครบ ระบบไม่เดาให้ว่าเครื่องเหล่านี้ติดตั้งแล้วหรือยัง",
    count: 1,
    action: { label: "ไปตรวจยืนยันการติดตั้ง", to: "/admin/installation-review" },
  },
  {
    code: "idle_devices",
    severity: "info",
    title: "มี 1 เครื่องที่ไม่มียอดพิมพ์เลยตลอดปีงบนี้",
    detail: "อาจย้ายไปหน่วยงานที่ต้องใช้ หรือพิจารณาไม่ต่อสัญญาในปีถัดไป",
    count: 1,
    action: { label: "ดูรายการเครื่อง", to: "/assets", query: { status: "active" } },
  },
];

/** overview ของตัวเองต้องลงทะเบียนทีหลัง prototypeFixture — route ที่มาทีหลังถูกเรียกก่อน */
async function attentionFixture(page, attention = ATTENTION, role = "admin") {
  await prototypeFixture(page, role);
  await page.route("**/api/dashboard/overview**", (route) => route.fulfill({
    json: {
      attention,
      coverage: { total_months: 12, annual_complete_months: 12, months: [], unreviewed_devices: 1, verifiable: true },
    },
  }));
}

const bellOf = (page) => page.getByRole("button", { name: "งานที่ต้องติดตาม", exact: true });

async function openAttentionDrawer(page) {
  await attentionFixture(page);
  await page.goto("/dashboard");
  await bellOf(page).click();
  return page.getByRole("dialog");
}

test("งานที่ต้องติดตามไม่ขึ้นซ้ำบนแดชบอร์ด", async ({ page }) => {
  await attentionFixture(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "ภาพรวมการพิมพ์", level: 1 })).toBeVisible();

  // ป้ายบนกระดิ่งขึ้นแล้ว = overview โหลดเสร็จแล้ว ถ้ารายการยังโผล่บนหน้า แปลว่า
  // สำเนาที่สองกลับมา ไม่ใช่แค่ยังโหลดไม่ทัน
  await expect(bellOf(page)).toContainText("3");
  await expect(page.getByText(CRITICAL)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "สิ่งที่ต้องจัดการ" })).toHaveCount(0);
});

test("ลิ้นชักจัดรายการเป็นกลุ่มตามความด่วน และไม่ตั้งชื่อตัวเองซ้ำ", async ({ page }) => {
  const drawer = await openAttentionDrawer(page);
  await expect(drawer).toBeVisible();

  // ชื่อเดียวต่อของหนึ่งสิ่ง — หัวลิ้นชักตั้งชื่อไว้แล้ว แผงข้างในไม่ตั้งซ้ำ
  await expect(drawer.getByRole("heading", { name: "สิ่งที่ต้องจัดการ" })).toHaveCount(0);

  const groups = drawer.getByRole("heading", { level: 3 });
  await expect(groups).toHaveCount(3);
  await expect(groups.nth(0)).toContainText("ต้องแก้ทันที");
  await expect(groups.nth(0)).toContainText("1");
  await expect(groups.nth(1)).toContainText("มีงานค้าง");
  await expect(groups.nth(2)).toContainText("น่าตรวจสอบ");

  // เรื่องด่วนที่สุดอยู่ในกลุ่มแรก พร้อมปุ่มเดียวที่พาไปแก้เรื่องนั้นจริง
  const urgent = drawer.getByRole("region", { name: /ต้องแก้ทันที/ });
  await expect(urgent.getByText(CRITICAL)).toBeVisible();
  await expect(urgent.getByRole("link")).toHaveCount(1);
  await expect(urgent.getByRole("link", { name: /ไปแก้ไขสัญญา/ }))
    .toHaveAttribute("href", /admin\/contracts/);
});

test("กดรายการสัญญาที่ราคาไม่ครอบคลุมแล้วไปยังหน้าแก้ไขสัญญา", async ({ page }) => {
  const drawer = await openAttentionDrawer(page);
  const urgentItem = drawer.getByText(CRITICAL).locator("xpath=ancestor::li");
  await urgentItem.getByText(CRITICAL).click();

  await expect(page).toHaveURL(/\/admin\/contracts$/);
});

test("กดเครื่องที่ยังไม่ผูกสัญญาแล้วเปิดฟอร์มเครื่องนั้นในทะเบียนที่กรองไว้", async ({ page }) => {
  // พาไปแค่รายการเครื่องแล้วผู้ใช้ไม่รู้ว่าต้องทำอะไรต่อ งานค้างจึงดูเหมือนกดแล้วไม่หาย (#96)
  const item = {
    code: "unassigned_unbilled_devices",
    severity: "critical",
    title: "มี 1 เครื่องที่ยังไม่ได้ผูกสัญญา",
    detail: "11 รายการ รวม 38,003 แผ่น ยังไม่ถูกนับในยอดเงิน",
    count: 1,
    params: { readings: 11, pages: 38003 },
    action: {
      label: "ไปผูกสัญญาให้เครื่อง",
      to: "/assets",
      query: { unassigned: "true", edit: "1", billing_from: "2025-10-01" },
    },
  };
  await attentionFixture(page, [item]);
  await page.goto("/dashboard");
  await bellOf(page).click();
  await page.getByText(item.title).click();

  await expect(page).toHaveURL(/\/assets\?unassigned=true&edit=1&billing_from=2025-10-01$/);
  await expect(page.getByLabel("เริ่มคิดเงินตามสัญญานี้ตั้งแต่วันที่")).toHaveValue("2025-10-01");

  // ปิดฟอร์มแล้วยังอยู่ในรายการที่กรองเครื่องที่ยังไม่ผูกสัญญาไว้
  await page.getByRole("button", { name: "ยกเลิก" }).click();
  // เจาะจงที่ชิปตัวกรอง — ช่องเลือกสัญญาเองก็มีชื่อขึ้นต้นด้วยป้าย "สัญญา" แล้วเช่นกัน
  await expect(page.getByRole("button", { name: /^สัญญา: ยังไม่ผูกสัญญา/ })).toBeVisible();
});

test("กดประวัติสัญญาที่ขาดแล้วเปิดเครื่องพร้อมวันที่เริ่มแก้ย้อนหลัง", async ({ page }) => {
  const item = {
    code: "unpriced_contract_history",
    severity: "critical",
    title: "มี 2 เครื่องที่ประวัติสัญญาไม่ครอบคลุมยอดพิมพ์",
    detail: "3 รายการ รวม 900 แผ่น ต้องตรวจวันที่เริ่มคิดเงินของเครื่อง",
    count: 2,
    params: { readings: 3, pages: 900 },
    action: {
      label: "ไปตรวจประวัติสัญญาของเครื่อง",
      to: "/assets",
      query: { edit: "1", billing_from: "2025-10-01" },
    },
  };
  await attentionFixture(page, [item]);
  await page.goto("/dashboard");
  await bellOf(page).click();
  await page.getByText(item.title).click();

  await expect(page).toHaveURL(/\/assets\?edit=1&billing_from=2025-10-01$/);
  const billingFrom = page.getByLabel("เริ่มคิดเงินตามสัญญานี้ตั้งแต่วันที่");
  await expect(billingFrom).toBeVisible();
  await expect(billingFrom).toHaveValue("2025-10-01");

  const savedRequest = page.waitForRequest((request) =>
    request.method() === "PUT" && /\/api\/devices\/1$/.test(request.url())
  );
  await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  expect((await savedRequest).postDataJSON().billing_from).toBe("2025-10-01");

  await expect(page.getByRole("button", { name: "บันทึกการแก้ไข" })).toHaveCount(0);
  await page.getByRole("button", { name: /^แก้ไข / }).nth(1).click();
  await expect(page.getByLabel("เริ่มคิดเงินตามสัญญานี้ตั้งแต่วันที่")).toHaveValue("");
});

test("ยอดนอกช่วงสัญญาเป็นงานค้างที่พาไปดูสัญญา", async ({ page }) => {
  const item = {
    code: "unpriced_outside_term",
    severity: "warning",
    title: "มี 44 เครื่องที่มียอดพิมพ์อยู่นอกช่วงสัญญา",
    detail: "1,100 รายการ รวม 3,081,887 แผ่น ต้องแก้ช่วงวันที่ของสัญญาหรือผูกสัญญาที่ถูกต้อง",
    count: 44,
    params: { readings: 1100, pages: 3081887 },
    action: { label: "ไปแก้ไขสัญญา", to: "/admin/contracts" },
  };
  await attentionFixture(page, [item]);
  await page.goto("/dashboard");
  await bellOf(page).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("region", { name: /ต้องแก้ทันที/ })).toHaveCount(0);
  await drawer.getByText(item.title).click();
  await expect(page).toHaveURL(/\/admin\/contracts$/);
});

test("ป้ายบนกระดิ่งบอกได้ว่ามีเรื่องต้องแก้ทันทีหรือไม่", async ({ page }) => {
  // ป้ายนี้เป็นสัญญาณเดียวที่เหลือบนหน้าจอหลังรายการย้ายเข้าลิ้นชัก ถ้ามันบอกแต่จำนวน
  // เรื่องระดับต้องแก้ทันทีกับเรื่องที่แค่น่าตรวจสอบจะหน้าตาเหมือนกันจนกว่าจะมีคนเปิดดู
  await attentionFixture(page, ATTENTION.filter((item) => item.severity !== "critical"));
  await page.goto("/dashboard");
  await expect(bellOf(page)).toContainText("2");
  await expect(bellOf(page)).not.toContainText(CRITICAL_BADGE);

  await attentionFixture(page);
  await page.goto("/assets");
  await page.goto("/dashboard");
  await expect(bellOf(page)).toContainText("3");
  await expect(bellOf(page)).toContainText(CRITICAL_BADGE);
});

test("viewer เห็นบริบทงานค้างแต่ไม่เห็น action ที่ต้องใช้สิทธิ์ admin", async ({ page }) => {
  await attentionFixture(page, ATTENTION, "viewer");
  await page.goto("/dashboard");
  await bellOf(page).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText(CRITICAL)).toBeVisible();
  await expect(drawer.getByRole("link", { name: /ตรวจช่วงที่สัญญามีผล/ })).toHaveCount(0);
  await expect(drawer.getByRole("link", { name: /ตรวจยืนยันการติดตั้ง/ })).toHaveCount(0);
  await expect(drawer.getByRole("link", { name: /ดูรายการเครื่อง/ })).toHaveAttribute("href", /\/assets/);
});

test("viewer ไม่ได้ CTA ไปหน้า admin เมื่อยังไม่มีปีงบหรือสัญญา", async ({ page }) => {
  await prototypeFixture(page, "viewer");
  await page.route(/\/api\/fiscal-years$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/expense\/\d+\b/, (route) => route.fulfill({ json: { contracts: [] } }));

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "ปีงบ ยังไม่มี" }).click();
  await expect(page.getByRole("link", { name: "ไปสร้างปีงบใหม่" })).toHaveCount(0);
  await expect(page.getByText("ติดต่อผู้ดูแลระบบเพื่อสร้างปีงบ")).toBeVisible();

  await page.goto("/expense");
  await expect(page.getByText("ยังไม่มีสัญญาในปีงบนี้")).toBeVisible();
  await expect(page.getByRole("link", { name: "ไปหน้าจัดการสัญญา" })).toHaveCount(0);
});
