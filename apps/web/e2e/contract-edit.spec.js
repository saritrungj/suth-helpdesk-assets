// apps/web/e2e/contract-edit.spec.js
//
// แก้ราคาในสัญญาแล้ว รายการสัญญาและฟอร์มเครื่องต้องเห็นราคาใหม่ทันที (#152)
//
// /contracts ตอบ Cache-Control: max-age=60 เดิมหน้าสัญญาโหลดรายการใหม่หลังบันทึกโดยไม่ล้างแคช
// เบราว์เซอร์จึงคืนรายการเดิม (ราคาเก่า) ให้หน้าเดียวกันและหน้าอื่นที่อ่าน /contracts ต่อในหนึ่งนาที
// ต้องใช้ API จริง เพราะ page.route ของ Playwright ปิด HTTP cache ของเบราว์เซอร์ จึงจำลองบั๊กนี้ไม่ได้
//
// เทสนี้สร้างสัญญาและเครื่องของตัวเอง แล้วลบทิ้งเมื่อจบ

import { expect, test } from "@playwright/test";
import { activeFiscalYear, apiFetch, reasonToSkip, signIn, writesAllowed } from "./fixtures.js";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
  test.skip(!writesAllowed(), "เทสนี้สร้างและลบสัญญาหนึ่งฉบับกับเครื่องหนึ่งเครื่องในฐานทดสอบแยก");
});

test("บันทึกราคาใหม่แล้วรายการสัญญาและคำแนะนำราคาในฟอร์มเครื่องเป็นราคาใหม่", async ({ page, context }) => {
  const [fy, categories, devices] = await Promise.all([
    activeFiscalYear(),
    apiFetch("/contracts/meter-categories"),
    apiFetch("/devices"),
  ]);
  const monochrome = categories.find((category) => category.code === "bw");
  const template = devices.find((row) => row.brand_id);
  const [endYear, endMonth] = fy.end_month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).toISOString().slice(0, 10);
  const stamp = Date.now();
  const contractNo = `E2E-PRICE-${stamp}`;
  let contractId = null;
  let deviceId = null;

  try {
    const contract = await apiFetch("/contracts", {
      method: "POST",
      body: JSON.stringify({
        contract_no: contractNo,
        effective_from: `${fy.start_month}-01`,
        effective_to: lastDay,
        price_lines: [{ category_id: monochrome.id, price_per_page: "0.40" }],
      }),
    });
    contractId = contract.id;
    const device = await apiFetch("/devices", {
      method: "POST",
      body: JSON.stringify({
        serial_number: `E2E-PRICE-${stamp}`,
        brand_id: template.brand_id,
        contract_id: contractId,
        meter_category_id: monochrome.id,
        status: "active",
        installation_status: "installed",
        installed_on: `${fy.start_month}-01`,
      }),
    });
    deviceId = device.id;

    await signIn(context);
    await page.goto("/admin/contracts");
    const row = page.locator("tr", { hasText: contractNo });
    await expect(row).toContainText("0.40");

    await row.getByRole("button", { name: "แก้ไข" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("บาท/หน้า").first().fill("0.45");
    await dialog.getByRole("button", { name: "ดูผลกระทบ" }).click();
    const save = dialog.getByRole("button", { name: "บันทึก", exact: true });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(dialog).toBeHidden();

    await expect(page.locator("tr", { hasText: contractNo })).toContainText("0.45");

    // ฟอร์มเครื่องอ่าน /contracts ด้วย — ภายในหนึ่งนาทีหลังบันทึกต้องไม่ได้ราคาเก่าจากแคชของเบราว์เซอร์
    await page.goto(`/assets?edit=${deviceId}`);
    await expect(page.getByText(/ใช้ราคาตามสัญญา 0\.45 บาท\/หน้า/)).toBeVisible();
  } finally {
    if (deviceId) await apiFetch(`/devices/${deviceId}`, { method: "DELETE" });
    if (contractId) await apiFetch(`/contracts/${contractId}`, { method: "DELETE" });
  }
});
