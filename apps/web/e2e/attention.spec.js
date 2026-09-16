import { expect, test } from "@playwright/test";
import { prototypeFixture } from "./prototype-fixture.js";

/*
 * งานที่ต้องติดตาม: อยู่ในลิ้นชักแจ้งเตือนที่เดียว (#83)
 *
 * เดิมรายการชุดเดียวกันขึ้นทั้งบนแดชบอร์ดและในลิ้นชัก เทสนี้กันไม่ให้สำเนาที่สอง
 * กลับมาโดยไม่มีใครสังเกต — และกันไม่ให้ป้ายบนกระดิ่งลดเหลือ "จำนวน" เฉยๆ ซึ่งจะ
 * ทำให้เรื่องระดับต้องแก้ทันทีมองไม่ออกจากนอกลิ้นชัก
 */

const CRITICAL = "มี 1 เครื่องที่ยังยืนยันราคาไม่ได้";
const CRITICAL_BADGE = "รวมเรื่องที่ต้องแก้ทันที";

const ATTENTION = [
  {
    code: "unbilled_devices",
    severity: "critical",
    title: CRITICAL,
    detail: "2 รายการ รวม 1,170 แผ่น ยังไม่ถูกนับในยอดเงิน เพราะยังหาราคาที่มีผลกับเดือนนั้นไม่ได้",
    count: 1,
    params: { readings: 2, pages: 1170 },
    action: { label: "ไปยืนยันช่วงที่สัญญามีผล", to: "/admin/contract-prices" },
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
async function attentionFixture(page, attention = ATTENTION) {
  await prototypeFixture(page, "admin");
  await page.route("**/api/dashboard/overview**", (route) => route.fulfill({
    json: {
      attention,
      coverage: { total_months: 12, annual_complete_months: 12, months: [], unreviewed_devices: 1, verifiable: true },
    },
  }));
}

const bellOf = (page) => page.getByRole("button", { name: "งานที่ต้องติดตาม", exact: true });

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
  await attentionFixture(page);
  await page.goto("/dashboard");
  await bellOf(page).click();

  const drawer = page.getByRole("dialog");
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
  await expect(urgent.getByRole("link", { name: "ไปยืนยันช่วงที่สัญญามีผล", exact: true }))
    .toHaveAttribute("href", /contract-prices/);
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
