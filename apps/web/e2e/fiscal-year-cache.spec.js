// Regression for browser CORS preflight when a fiscal-year collection is revalidated.
import { expect, test } from "@playwright/test";
import { apiFetch, reasonToSkip, signIn, writesAllowed } from "./fixtures.js";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
  test.skip(
    !writesAllowed() || process.env.SUTH_E2E_DISPOSABLE_DB !== "1",
    "เทสนี้เขียนและเก็บกวาดฐานข้อมูล ต้องเปิด SUTH_E2E_ALLOW_WRITES=1 และรันผ่านฐานชั่วคราวจาก verify:db"
  );
});

test("หลังแก้และลบปีงบ รายการและตัวเลือกปีงบบนแถบบนเป็นข้อมูลล่าสุด", async ({ context, page }) => {
  let created;
  let newYear;
  let createOutcomeUnknown = false;
  let originalIds = new Set();
  try {
    const existingYears = await apiFetch("/fiscal-years");
    originalIds = new Set(existingYears.map((fy) => String(fy.id)));
    const fallbackYear = String(existingYears.at(-1)?.year);
    const nextYear = Math.max(...existingYears.map((fy) => Number(fy.year))) + 1;
    newYear = String(nextYear);
    try {
      created = await apiFetch("/fiscal-years", {
        method: "POST",
        body: JSON.stringify({ year: newYear }),
      });
    } catch (error) {
      // ถ้าได้ HTTP 4xx ชัดเจน route ปฏิเสธก่อนสร้างข้อมูล ส่วน network/parse error
      // อาจเกิดหลัง INSERT สำเร็จ จึงต้องค้นหาปีที่จองไว้ตอน cleanup ด้วย
      createOutcomeUnknown = !/ตอบสถานะ 4\d\d:/.test(error.message);
      throw error;
    }
    const updatedYear = String(nextYear + 1);

    const revalidationRequests = [];
    const corsErrors = [];

    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.endsWith("/fiscal-years") && request.method() === "GET") {
        if (request.headers()["cache-control"] === "no-cache") revalidationRequests.push(request.url());
      }
    });
    page.on("console", (message) => {
      if (/CORS|Access-Control-Allow-Headers|cross-origin/i.test(message.text())) corsErrors.push(message.text());
    });

    await signIn(context);
    await page.goto("/admin/fiscal-years");

    const initialRow = page.getByRole("row").filter({ hasText: String(nextYear) });
    await expect(initialRow).toBeVisible();
    await initialRow.getByRole("button", { name: `แก้ไข ${nextYear}` }).click();

    const editDialog = page.getByRole("dialog");
    await editDialog.getByLabel("ปีงบประมาณ").fill(updatedYear);
    await editDialog.getByRole("button", { name: "บันทึกการแก้ไข" }).click();

    const updatedRow = page.getByRole("row").filter({ hasText: updatedYear });
    try {
      await expect(updatedRow).toBeVisible({ timeout: 8000 });
    } catch (error) {
      throw new Error(
        `${error.message}\nBrowser sent no-cache: ${revalidationRequests.length > 0}; ` +
          `CORS errors: ${corsErrors.join(" | ") || "none captured"}`
      );
    }

    // ปีที่แก้เป็นปีในอนาคต — แถบบนยังเปิดที่ปีงบที่ครอบวันนี้ (#176) สิ่งที่ต้องสดคือรายการในเมนู
    const fiscalYearButton = page.locator('header[data-print="hide"] button').filter({ hasText: "ปีงบ" });
    await expect(fiscalYearButton).toContainText(fallbackYear);
    await fiscalYearButton.click();
    await expect(page.getByRole("menuitem").filter({ hasText: updatedYear })).toBeVisible();
    await page.keyboard.press("Escape");

    await updatedRow.getByRole("button", { name: `ลบ ${updatedYear}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ลบปีงบประมาณ" }).click();

    await expect(updatedRow).toHaveCount(0);
    await expect(fiscalYearButton).toContainText(fallbackYear);
    await fiscalYearButton.click();
    await expect(page.getByRole("menuitem").filter({ hasText: fallbackYear })).toBeVisible();
    await expect(page.getByRole("menuitem").filter({ hasText: updatedYear })).toHaveCount(0);

    expect(revalidationRequests.length).toBeGreaterThan(0);
    const apiUrl = process.env.SUTH_API_URL || "http://localhost:3000/api";
    const webOrigin = process.env.SUTH_WEB_URL || "http://localhost:5173";
    const preflight = await fetch(`${apiUrl}/fiscal-years`, {
      method: "OPTIONS",
      headers: {
        Origin: webOrigin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "cache-control,content-type",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(webOrigin);
    expect(preflight.headers.get("access-control-allow-credentials")).toBe("true");
    const allowedHeaders = preflight.headers.get("access-control-allow-headers") ?? "";
    expect(allowedHeaders.toLowerCase().split(/,\s*/)).toContain("cache-control");
    expect(corsErrors).toEqual([]);
  } finally {
    if (created || createOutcomeUnknown) {
      const currentYears = await apiFetch("/fiscal-years");
      const createdRows = currentYears.filter((fy) => {
        if (created) return String(fy.id) === String(created.id);
        return (
          !originalIds.has(String(fy.id)) &&
          String(fy.year) === newYear
        );
      });
      for (const fy of createdRows) {
        await apiFetch(`/fiscal-years/${fy.id}`, { method: "DELETE" });
      }
    }
  }
});
