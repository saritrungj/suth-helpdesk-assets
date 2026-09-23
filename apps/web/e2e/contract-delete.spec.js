// apps/web/e2e/contract-delete.spec.js
// ลบได้เฉพาะสัญญาที่ยังไม่ถูกใช้ และการยืนยันต้องอธิบายผลของการลบให้ชัดเจน

import { expect, test } from "@playwright/test";
import { apiFetch, reasonToSkip, signIn, writesAllowed } from "./fixtures.js";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
  test.skip(!writesAllowed(), "เทสนี้สร้างและลบสัญญาในฐานทดสอบแยก");
});

function monthAt(offset) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function monthEnd(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

async function createContract(contractNo, startMonth, rental) {
  const categories = await apiFetch("/contracts/meter-categories");
  const bw = categories.find((category) => category.code === "bw");
  const endMonth = monthAt(startMonth === "past" ? 1 : 2);
  const effectiveFrom = monthAt(startMonth === "past" ? -1 : 1);
  return apiFetch("/contracts", {
    method: "POST",
    body: JSON.stringify({
      contract_no: contractNo,
      effective_from: formatDate(effectiveFrom),
      effective_to: formatDate(monthEnd(endMonth)),
      price_lines: [{ category_id: bw.id, price_per_page: "0.40" }],
      monthly_rental: rental,
    }),
  });
}

test("ยืนยันลบสัญญาที่ยังไม่ถูกใช้งานแล้วลบแถวและปิดหน้าต่าง", async ({ page, context }) => {
  const contractNo = `E2E-DELETE-${Date.now()}`;
  const contract = await createContract(contractNo, "future", "1000.00");
  try {
    await signIn(context);
    await page.goto("/admin/contracts");
    const row = page.locator("tr", { hasText: contractNo });
    await row.getByRole("button", { name: "แก้ไข" }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog.getByRole("button", { name: "ลบสัญญา" }).click();

    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toContainText(contractNo);
    await expect(confirmation).toContainText("รายการราคาทั้งหมด");
    await confirmation.getByRole("button", { name: "ยกเลิก" }).click();
    await expect(confirmation).toBeHidden();
    await expect(row).toBeVisible();

    await editDialog.getByRole("button", { name: "ลบสัญญา" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ลบสัญญา" }).click();
    await expect(editDialog).toBeHidden();
    await expect(page.locator("tr", { hasText: contractNo })).toHaveCount(0);
  } finally {
    // ถ้าเทสล้มก่อนยืนยัน จะลบสัญญาเปล่าที่สร้างไว้ให้
    const rows = await apiFetch("/contracts");
    if (rows.some((row) => row.id === contract.id)) {
      await apiFetch(`/contracts/${contract.id}`, { method: "DELETE" });
    }
  }
});

test("งวดค่าเช่าที่ผ่านไปแล้วแสดงเหตุผล 409 และคงสัญญาไว้", async ({ page, context }) => {
  const contractNo = `E2E-DELETE-RENT-${Date.now()}`;
  const contract = await createContract(contractNo, "past", "1000.00");
  try {
    await signIn(context);
    await page.goto("/admin/contracts");
    const row = page.locator("tr", { hasText: contractNo });
    await row.getByRole("button", { name: "แก้ไข" }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog.getByRole("button", { name: "ลบสัญญา" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ลบสัญญา" }).click();

    await expect(editDialog).toContainText("มีงวดค่าเช่าที่เกิดขึ้นแล้ว");
    await expect(row).toBeVisible();
    await expect(editDialog).toBeVisible();
  } finally {
    // fixture นี้จำลองรายงานย้อนหลัง จึงคืนค่าก่อนลบเพื่อไม่ให้ทิ้งข้อมูลในฐานทดสอบ
    const rows = await apiFetch("/contracts");
    if (rows.some((row) => row.id === contract.id)) {
      await apiFetch(`/contracts/${contract.id}`, {
        method: "PUT",
        body: JSON.stringify({
          contract_no: contract.contract_no,
          effective_from: contract.effective_from,
          effective_to: contract.effective_to,
          monthly_rental: null,
          vat_rate: contract.vat_rate,
          price_lines: contract.price_lines.map((line) => ({
            category_id: line.category_id,
            price_per_page: String(Number(line.price_per_page)),
          })),
        }),
      });
      await apiFetch(`/contracts/${contract.id}`, { method: "DELETE" });
    }
  }
});
