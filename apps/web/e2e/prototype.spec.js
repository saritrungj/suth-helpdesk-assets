import { expect, test } from "@playwright/test";
import { prototypeFixture } from "./prototype-fixture.js";

async function paste(input, text) {
  await input.evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

test("paste preview follows sort and page with serial and previous/new values", async ({ page }) => {
  await prototypeFixture(page);
  await page.goto("/print-transactions");
  await expect(page.getByRole("textbox", { name: "ยอดพิมพ์ของ SUTH-001", exact: true })).toBeEnabled();
  const sort = page.getByRole("columnheader", { name: /Serial/ }).getByRole("button");
  await sort.click();
  await sort.click();
  await page.getByRole("button", { name: "หน้าถัดไป", exact: true }).click();
  const input = page.getByRole("textbox", { name: "ยอดพิมพ์ของ SUTH-025", exact: true });
  await paste(input, "250\ninvalid\n300");
  const preview = page.getByRole("dialog", { name: "ตัวอย่างก่อนวางตัวเลข", exact: true });
  await expect(preview.getByRole("row").nth(1)).toContainText("SUTH-025");
  await expect(preview.getByRole("row").nth(1)).toContainText("250");
  await expect(preview.getByRole("row").nth(2)).toContainText("SUTH-024");
  await expect(preview.getByRole("row").nth(2)).toContainText("ข้าม");
  await expect(input).toHaveValue("");
  await preview.getByRole("button", { name: "ยืนยันการวาง", exact: true }).click();
  await expect(input).toHaveValue("250");
  await expect(page.getByRole("textbox", { name: "ยอดพิมพ์ของ SUTH-023", exact: true })).toHaveValue("300");
});

test("annual paste can undo without saving", async ({ page }) => {
  const state = await prototypeFixture(page);
  await page.goto("/print-transactions");
  await page.getByRole("radio", { name: "ภาพรวมทั้งปี", exact: true }).click();
  await page.getByRole("button", { name: "กรอกยอด", exact: true }).first().click();
  const inputs = page.getByRole("dialog").getByRole("spinbutton");
  await expect(inputs.first()).toBeEnabled();
  await paste(inputs.first(), "125\t250\tinvalid\t375");
  await expect(inputs.first()).toHaveValue("125");
  await expect(inputs.nth(1)).toHaveValue("250");
  await expect(inputs.nth(2)).toHaveValue("");
  await page.getByRole("button", { name: "เลิกทำการวาง", exact: true }).click();
  await expect(inputs.first()).toHaveValue("");
  expect(state.writes).toEqual([]);
});

for (const density of ["compact", "default", "relaxed"]) {
  test(`entry remains usable at ${density} density with reduced motion`, async ({ page }) => {
    await page.addInitScript(density => localStorage.setItem("suth-ui-density", density), density);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 720 });
    await prototypeFixture(page);
    await page.goto("/print-transactions");
    const input = page.getByRole("textbox", { name: "ยอดพิมพ์ของ SUTH-001", exact: true });
    await expect(input).toBeInViewport();
    const box = await input.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    await input.fill("250");
    await page.getByRole("button", { name: "ขยายตาราง", exact: true }).click();
    await expect(page.getByRole("button", { name: "บันทึก 1 รายการ", exact: true })).toBeVisible();
    await expect(input).toHaveValue("250");
    await page.screenshot({ path: test.info().outputPath(`entry-${density}-dirty-fullscreen.png`) });
  });
}

test("staff opens the API's pending month after coverage arrives", async ({ page }) => {
  const state = await prototypeFixture(page);
  state.coverageDelay = 500;
  await page.goto("/print-transactions");
  await expect(page.getByRole("textbox", { name: "ยอดพิมพ์ของ SUTH-001", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "ยอดพิมพ์ของ SUTH-001", exact: true })).toHaveValue("100");
  await expect(page.getByRole("columnheader", { name: /ยอด ส\.ค\./ })).toBeVisible();
});

test("expense keeps search and expanded detail across tabs and browser back", async ({ page }) => {
  const state = await prototypeFixture(page);
  state.unassigned = [{ id: 99, serial_number: "UNASSIGNED-001", total_cost: 0 }];
  await page.goto("/expense");
  await expect(page.getByText("เครื่องที่ยังไม่ได้ผูกสัญญา", { exact: true })).toBeVisible();
  const search = page.getByRole("textbox", { name: "ค้นหาสัญญาหรือเครื่อง", exact: true });
  await search.fill("SUTH-001");
  await page.getByRole("button", { name: "กางทั้งหมด", exact: true }).click();
  await page.getByRole("button", { name: /SUTH Printer Office 400/ }).click();
  await page.getByRole("tab", { name: "ตามฝ่าย / แผนก", exact: true }).click();
  await page.getByRole("tab", { name: "ตามสัญญา", exact: true }).click();
  await expect(search).toHaveValue("SUTH-001");
  await page.getByRole("link", { name: /เปิดรายละเอียดเครื่อง.*SUTH-001/ }).click();
  await expect(page).toHaveURL(/\/assets\/1/);
  state.expenseTotal = 720;
  state.unassigned = [];
  await page.goBack();
  await expect(search).toHaveValue("SUTH-001");
  await expect(page.getByRole("link", { name: /เปิดรายละเอียดเครื่อง.*SUTH-001/ })).toBeVisible();
  await expect(page.getByText("720.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("เครื่องที่ยังไม่ได้ผูกสัญญา", { exact: true })).not.toBeVisible();
});

test("a different period never presents the previous period's financial details", async ({ page }) => {
  const state = await prototypeFixture(page);
  await page.goto("/expense");
  await page.getByRole("button", { name: "กางทั้งหมด", exact: true }).click();
  await expect(page.getByRole("button", { name: /SUTH Printer Office 400/ })).toBeVisible();
  state.expenseDelay = 1500;
  await page.getByRole("button", { name: /ทั้งปีงบ/ }).first().click();
  await page.getByRole("option", { name: /เดือนล่าสุดที่มีข้อมูล/ }).click();
  await expect(page.getByRole("button", { name: /SUTH Printer Office 400/ })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Excel", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Excel", exact: true })).toBeEnabled();
});

test("coverage failure offers retry without overwriting a manually chosen month", async ({ page }) => {
  const state = await prototypeFixture(page);
  state.failCoverage = true;
  await page.goto("/print-transactions");
  await expect(page.getByText("โหลดเดือนที่ค้างไม่สำเร็จ เลือกเดือนเองหรือลองใหม่", { exact: true })).toBeVisible();
  state.failCoverage = false;
  await page.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "ยอดพิมพ์ของ SUTH-001", exact: true })).toBeEnabled();
});

test("viewer starts in overview and monthly readings remain read-only", async ({ page }) => {
  await prototypeFixture(page, "viewer");
  await page.goto("/print-transactions");
  await expect(page.getByRole("radio", { name: "ภาพรวมทั้งปี", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "กรอกยอด", exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "กรอกรายเดือน", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "ยอดพิมพ์ของ SUTH-001", exact: true })).toBeDisabled();
});

test("annual load failure cannot overwrite unknown readings and has retry", async ({ page }) => {
  const state = await prototypeFixture(page);
  state.failAnnual = true;
  await page.goto("/print-transactions");
  await page.getByRole("radio", { name: "ภาพรวมทั้งปี", exact: true }).click();
  await page.getByRole("button", { name: "กรอกยอด", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "บันทึกยอดทั้งปี", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("spinbutton").first()).toBeDisabled();
  state.failAnnual = false;
  await dialog.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await expect(dialog.getByRole("spinbutton").first()).toBeEnabled();
  expect(state.writes).toEqual([]);
});

test("monthly failure preserves draft for retry and canceled mode navigation", async ({ page }) => {
  const state = await prototypeFixture(page);
  state.failSave = true;
  await page.goto("/print-transactions");
  const input = page.getByRole("textbox", { name: "ยอดพิมพ์ของ SUTH-001", exact: true });
  await input.fill("250");
  await page.getByRole("button", { name: "บันทึก 1 รายการ", exact: true }).click();
  await expect(page.getByRole("button", { name: "ลองบันทึกใหม่", exact: true })).toBeVisible();
  await expect(input).toHaveValue("250");
  await page.getByRole("radio", { name: "ภาพรวมทั้งปี", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(input).toHaveValue("250");
  expect(state.writes).toEqual([{ month: "2026-08", items: [{ device_id: 1, pages: 250 }] }]);
});

test("expense retains each tab's scroll position", async ({ page }) => {
  await prototypeFixture(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/expense?tab=department");
  await expect(page.getByText("เครื่องที่ใช้งานหนักที่สุด", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 420));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(420);
  // Dispatch activation without the test runner scrolling the tab into view first.
  await page.getByRole("tab", { name: "ตามสัญญา", exact: true }).dispatchEvent("mousedown", { button: 0, ctrlKey: false });
  await expect(page.getByRole("tab", { name: "ตามสัญญา", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "ตามฝ่าย / แผนก", exact: true }).dispatchEvent("mousedown", { button: 0, ctrlKey: false });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(420);
});

test("annual draft survives canceling close", async ({ page }) => {
  await prototypeFixture(page);
  await page.goto("/print-transactions");
  await page.getByRole("radio", { name: "ภาพรวมทั้งปี", exact: true }).click();
  await page.getByRole("button", { name: "กรอกยอด", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("spinbutton").first()).toBeVisible();
  await dialog.getByRole("spinbutton").first().fill("250");
  await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(dialog.getByRole("spinbutton").first()).toHaveValue("250");
});

test("expense failures do not claim zero totals or empty data", async ({ page }) => {
  const state = await prototypeFixture(page);
  state.failExpense = true;
  await page.goto("/expense");
  await expect(page.getByText("โหลดข้อมูลค่าใช้จ่ายไม่สำเร็จ", { exact: true })).toBeVisible();
  await expect(page.getByText("ค่าใช้จ่ายสุทธิรวม", { exact: true })).not.toBeVisible();
  await expect(page.getByText("ยังไม่มีสัญญาในปีงบนี้", { exact: true })).not.toBeVisible();
  state.failExpense = false;
  await page.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await expect(page.getByText("ค่าใช้จ่ายสุทธิรวม", { exact: true })).toBeVisible();
  await expect(page.getByText("360.00", { exact: true }).first()).toBeVisible();
  state.failExpense = true;
  await page.getByRole("tab", { name: "ตามฝ่าย / แผนก", exact: true }).click();
  await expect(page.getByText("โหลดข้อมูลแยกตามฝ่าย/แผนกไม่สำเร็จ", { exact: true })).toBeVisible();
  await expect(page.getByText("ค่าใช้จ่ายสุทธิรวม", { exact: true })).not.toBeVisible();
  await expect(page.getByText("ยังไม่มีข้อมูลฝ่าย/แผนก", { exact: true })).not.toBeVisible();
});

test("explicit month survives late coverage and yearly detail keeps the draft", async ({ page }) => {
  const state = await prototypeFixture(page);
  state.coverageDelay = 700;
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/print-transactions?month=2026-09");
  const input = page.getByRole("textbox", { name: "ยอดพิมพ์ของ SUTH-001", exact: true });
  await expect(input).toBeEnabled();
  await expect(input).toBeInViewport();
  await input.fill("250");
  const toggle = page.getByRole("button", { name: "รายละเอียดความคืบหน้าปี", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(input).toHaveValue("250");
  await expect(page.getByRole("columnheader", { name: /ยอด ก\.ย\./ })).toBeVisible();
});

test("expense side data that fails to load is reported instead of silently disappearing", async ({ page }) => {
  const state = await prototypeFixture(page);
  state.failUnassigned = true;
  state.failMonths = true;
  await page.goto("/expense");
  await expect(page.getByText("ค่าใช้จ่ายสุทธิรวม", { exact: true })).toBeVisible();
  const unassigned = page.getByRole("status").filter({ hasText: "โหลดรายการเครื่องที่ยังไม่ผูกสัญญาไม่สำเร็จ" });
  const months = page.getByRole("status").filter({ hasText: "โหลดรายการเดือนที่มีข้อมูลไม่สำเร็จ" });
  await expect(unassigned).toBeVisible();
  await expect(months).toBeVisible();
  state.failUnassigned = false;
  state.unassigned = [{ id: 99, serial_number: "UNASSIGNED-001", total_cost: 0 }];
  await unassigned.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await expect(unassigned).not.toBeVisible();
  await expect(page.getByText("เครื่องที่ยังไม่ได้ผูกสัญญา", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "ตามฝ่าย / แผนก", exact: true }).click();
  await expect(months).toBeVisible();
  state.failMonths = false;
  await months.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await expect(months).not.toBeVisible();
});

test("expense Excel export carries the search context and the on-screen amounts", async ({ page }) => {
  await prototypeFixture(page);
  await page.goto("/expense");
  await page.getByRole("textbox", { name: "ค้นหาสัญญาหรือเครื่อง", exact: true }).fill("SUTH-001");
  const exportButton = page.getByRole("button", { name: "Excel", exact: true });
  await expect(exportButton).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  const { readFile } = await import("node:fs/promises");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await readFile(await download.path()), { type: "buffer" });
  const context = XLSX.utils.sheet_to_json(workbook.Sheets["บริบทรายงาน"], { header: 1 });
  expect(context).toContainEqual(["ค้นหา", "SUTH-001"]);
  const [header, ...rows] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
  expect(header).toContain("ค่าใช้จ่ายสุทธิ (หัก 20%)");
  expect(rows).toHaveLength(1);
  expect([rows[0][0], rows[0][1], rows[0][2], rows[0][5], rows[0][6]]).toEqual(["SUTH-2569", 0.45, "SUTH-001", 1000, 360]);
});

test("department chart table adds up to the same totals as the division tree", async ({ page }) => {
  const state = await prototypeFixture(page);
  // สองเครื่อง สองเดือน สองแผนก — ให้กราฟต้องรวมข้ามเครื่องจริง ไม่ใช่คัดลอกยอดเครื่องเดียว
  const device = (id, serial, monthly) => ({ id, serial_number: serial, brand_name: "SUTH Printer", model: "Office 400", monthly,
    total_cost: monthly.reduce((sum, row) => sum + row.total_cost, 0), total_pages: monthly.reduce((sum, row) => sum + row.net_pages, 0) });
  const first = device(1, "SUTH-001", [{ month: "2026-08", net_pages: 500, total_cost: 225.25 }, { month: "2026-09", net_pages: 300, total_cost: 135.1 }]);
  const second = device(2, "SUTH-002", [{ month: "2026-09", net_pages: 200, total_cost: 90.05 }]);
  state.byDepartment = { unassignedDevices: [], divisions: [{ id: 1, name: "ฝ่ายการพยาบาล", total_cost: 450.4, total_cost_satang: 45040, total_pages: 1000, departments: [
    { id: 1, name: "หน่วยบริการผู้ป่วยนอก", total_cost: 360.35, total_pages: 800, devices: [first] },
    { id: 2, name: "หน่วยไตเทียม", total_cost: 90.05, total_pages: 200, devices: [second] },
  ] }] };
  await page.goto("/expense?tab=department");
  await expect(page.getByText("450.40", { exact: true }).first()).toBeVisible();
  // trigger ของ UiCombobox ยังไม่มีชื่อที่ผูกกับ label (ปัญหา a11y ของ shared UI อยู่ใน #58)
  // จึงกดจากข้อความ placeholder แทน getByLabel
  await page.getByText("เลือกฝ่าย", { exact: true }).click();
  await page.getByRole("option", { name: "ฝ่ายการพยาบาล" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("radio", { name: "ตาราง", exact: true }).first().click();
  const table = page.getByRole("table", { name: "ค่าตัวเลขของกราฟด้านบน" });
  // 225.25 + (135.10 + 90.05) = 450.40 ตรงกับยอดฝ่ายในต้นไม้และการ์ดยอดรวม
  await expect(table.getByRole("row", { name: /ส\.ค\..*225\.25/ })).toBeVisible();
  await expect(table.getByRole("row", { name: /ก\.ย\..*225\.15/ })).toBeVisible();
});

test("department tab keeps its search and expanded device after returning from detail", async ({ page }) => {
  await prototypeFixture(page);
  await page.goto("/expense?tab=department");
  const search = page.getByRole("textbox", { name: "ค้นหาฝ่าย แผนก หรือเครื่อง", exact: true });
  await search.fill("SUTH-001");
  // กางทีละชั้นด้วยการคลิกเอง ไม่ใช้ "กางทั้งหมด" — แถวในแท็บนี้เคยคลิกกางไม่ติดเลย
  // ตั้งแต่ #22 เพราะเทมเพลตส่ง Set ที่ถูกแกะจาก ref เข้า toggle() (#50)
  for (const name of [/^ฝ่ายการพยาบาล/, /^หน่วยบริการผู้ป่วยนอก/, /SUTH-001/]) {
    const row = page.getByRole("button", { name }).first();
    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
  }
  await page.getByRole("link", { name: /เปิดรายละเอียดเครื่อง.*SUTH-001/ }).click();
  await expect(page).toHaveURL(/\/assets\/1/);
  await page.goBack();
  await expect(page).toHaveURL(/tab=department/);
  await expect(search).toHaveValue("SUTH-001");
  await expect(page.getByRole("link", { name: /เปิดรายละเอียดเครื่อง.*SUTH-001/ })).toBeVisible();
});

test("expense price, discount and unit copy is translated while the amounts stay the same", async ({ page }) => {
  await prototypeFixture(page);
  await page.addInitScript(() => localStorage.setItem("suth-language", "en"));
  await page.goto("/expense");
  await expect(page.getByText("Total net cost", { exact: true })).toBeVisible();
  // ช่วงเวลาอยู่ในตัวเลือกช่วงเวลาแล้ว ใต้ตัวเลขสรุปจึงเหลือแค่ส่วนลด (รอบที่ 3 ของ #51)
  await expect(page.getByText("After 20% discount", { exact: true })).toBeVisible();
  await expect(page.getByText(/0\.45\s+THB\/page/)).toBeVisible();
  await expect(page.getByText("360.00", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "By division / department", exact: true }).click();
  // แท็บสัญญายังอยู่ใน DOM แบบซ่อน จึงต้องหาเฉพาะในแผงของแท็บที่เลือกอยู่
  const department = page.getByRole("tabpanel", { name: "By division / department" });
  await expect(department.getByText("Total net cost", { exact: true })).toBeVisible();
  await expect(department.getByText("360.00", { exact: true }).first()).toBeVisible();
});
