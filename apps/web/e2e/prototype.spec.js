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

test("print usage import checks the file before the user confirms a write", async ({ page }) => {
  await prototypeFixture(page, "admin");
  const modes = [];
  await page.route("**/api/print-transactions/import", async (route) => {
    const body = route.request().postData() || "";
    const mode = body.includes("\r\n\r\ncommit\r\n") ? "commit" : "preview";
    modes.push(mode);
    if (mode === "preview") {
      return route.fulfill({ json: {
        valid: true,
        preview_token: "checked-file",
        months_found: ["2025-10"],
        new_rows: [{ device_id: 1, serial_number: "SUTH-001", month: "2025-10", pages: 0 }],
        overwrite_rows: [{ device_id: 2, serial_number: "SUTH-002", month: "2025-10", previous_pages: 100, pages: 120 }],
        unchanged_rows: [],
        errors: [],
      } });
    }
    return route.fulfill({ json: { rows_upserted: 2, months_found: ["2025-10"] } });
  });

  await page.goto("/print-transactions");
  await page.getByRole("button", { name: "นำเข้ายอดพิมพ์", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "นำเข้ายอดพิมพ์", exact: true });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "usage.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("SN.,meter 10/68\nSUTH-001,0"),
  });
  await dialog.getByRole("button", { name: "ตรวจไฟล์", exact: true }).click();
  await expect(dialog.getByText("จะเขียนทับข้อมูลเดิม", { exact: true })).toBeVisible();
  await expect(dialog.getByText("SUTH-002", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "ยืนยันบันทึก", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(modes).toEqual(["preview", "commit"]);
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
    const save = page.getByRole("button", { name: "บันทึก 1 รายการ", exact: true });
    await expect(save).toBeVisible();
    await expect.poll(() => save.evaluate((el) => document.fullscreenElement.contains(el))).toBe(true);
    await expect(page.getByText(/ช่วงเวลา: .*2569/)).toBeVisible();
    await expect(page.locator(":fullscreen")).not.toContainText("month: 2026-");
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

test("expense keeps search and expanded detail across browser back", async ({ page }) => {
  const state = await prototypeFixture(page);
  state.unassigned = [{ id: 99, serial_number: "UNASSIGNED-001", total_cost: 0 }];
  await page.goto("/expense");
  await expect(page.getByText("เครื่องที่ยังไม่ได้ผูกสัญญา", { exact: true })).toBeVisible();
  const search = page.getByRole("textbox", { name: "ค้นหาสัญญาหรือเครื่อง", exact: true });
  await search.fill("SUTH-001");
  await page.getByRole("button", { name: "กางทั้งหมด", exact: true }).click();
  await page.getByRole("button", { name: /SUTH Printer Office 400/ }).click();
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
  await expect(page.getByText("ค่าใช้จ่ายสุทธิ", { exact: true })).not.toBeVisible();
  await expect(page.getByText("ยังไม่มีสัญญาในปีงบนี้", { exact: true })).not.toBeVisible();
  state.failExpense = false;
  await page.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await expect(page.getByText("ค่าใช้จ่ายสุทธิ", { exact: true })).toBeVisible();
  await expect(page.getByText("360.00", { exact: true }).first()).toBeVisible();
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
  await expect(page.getByText("ค่าใช้จ่ายสุทธิ", { exact: true })).toBeVisible();
  const unassigned = page.getByRole("status").filter({ hasText: "โหลดรายการเครื่องที่ยังไม่ผูกสัญญาไม่สำเร็จ" });
  const months = page.getByRole("status").filter({ hasText: "โหลดรายการเดือนที่มีข้อมูลไม่สำเร็จ" });
  await expect(unassigned).toBeVisible();
  await expect(months).toBeVisible();
  state.failUnassigned = false;
  state.unassigned = [{ id: 99, serial_number: "UNASSIGNED-001", total_cost: 0 }];
  await unassigned.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await expect(unassigned).not.toBeVisible();
  await expect(page.getByText("เครื่องที่ยังไม่ได้ผูกสัญญา", { exact: true })).toBeVisible();
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
  expect(header).toContain("ค่าใช้จ่ายสุทธิ (หัก 2%)");
  expect(rows).toHaveLength(1);
  expect([rows[0][0], rows[0][1], rows[0][4], rows[0][7], rows[0][8]]).toEqual(["SUTH-2569", 0.45, "SUTH-001", 1000, 360]);
});

test("expense price, discount and unit copy is translated while the amounts stay the same", async ({ page }) => {
  await prototypeFixture(page);
  await page.addInitScript(() => localStorage.setItem("suth-language", "en"));
  await page.goto("/expense");
  // ป้ายยอดรวมใช้คำตามพจนานุกรมโดเมน (CONTEXT.md) แล้ว — "ค่าใช้จ่ายสุทธิ"
  // และจะเปลี่ยนเป็น "ค่าใช้จ่ายที่ยืนยันแล้ว" เมื่อมีรายการที่ยังยืนยันราคาไม่ได้
  await expect(page.getByText("Net cost", { exact: true })).toBeVisible();
  // ช่วงเวลาอยู่ในตัวเลือกช่วงเวลาแล้ว ใต้ตัวเลขสรุปจึงเหลือแค่ส่วนลด (รอบที่ 3 ของ #51)
  // ยอดรวมของหน้านี้เป็นยอดของสัญญาที่ขึ้นทะเบียนกับปีงบนี้เท่านั้น ป้ายจึงต้องบอก
  // ขอบเขตของตัวเองด้วย ไม่งั้นไปชนกับป้ายชื่อเดียวกันบนแดชบอร์ดที่คิดคนละขอบเขต
  await expect(page.getByText(/After 2% deduction/)).toBeVisible();
  await expect(page.getByText(/Contracts registered to this fiscal year only/)).toBeVisible();
  await expect(page.getByText(/0\.45\s+THB\/page/)).toBeVisible();
  await expect(page.getByText("360.00", { exact: true }).first()).toBeVisible();
});

/*
 * ปีงบที่กำลังดูอยู่บนแถบบนตลอดเวลา หน้าจึงไม่พิมพ์เลขปีซ้ำบนจอปกติ (รอบที่ 3 ของ #51)
 * แต่แถบบนหายไปสองกรณี — ตอนสั่งพิมพ์ และตอนขยายตารางเต็มจอ (fullscreen root คือกล่อง
 * ของหน้า ไม่ได้ครอบแถบบน) ถ้าไม่มีป้ายสำรอง คนจะอ่านยอดรวมโดยไม่รู้ว่าเป็นปีงบไหน
 */
test("ค่าใช้จ่ายที่พิมพ์ออกกระดาษยังมีปีงบกำกับยอดรวม", async ({ page }) => {
  await prototypeFixture(page);
  await page.goto("/expense");
  await expect(page.getByText("ค่าใช้จ่ายสุทธิ", { exact: true })).toBeVisible();
  const year = page.getByText("ปีงบ 2569", { exact: true });
  await expect(year).toBeHidden();
  await page.emulateMedia({ media: "print" });
  await expect(year).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await expect(year).toBeHidden();
});

test("บันทึกยอดที่ขยายเต็มจอยังบอกว่ากำลังดูปีงบไหน", async ({ page }) => {
  await prototypeFixture(page, "viewer");
  await page.goto("/print-transactions?fill=empty");
  await expect(page.getByRole("radio", { name: "ภาพรวมทั้งปี", exact: true })).toHaveAttribute("aria-checked", "true");
  const year = page.getByText("ปีงบ 2569", { exact: true });
  await expect(year).toBeHidden();
  await page.getByRole("button", { name: "ขยายตาราง", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ภาพรวมทั้งปี", exact: true })).toBeVisible();
  await expect(page.getByText(/ปีงบประมาณ: 2569/)).toBeVisible();
  await expect(page.locator(":fullscreen")).toContainText("ช่วงเวลา: ทั้งปีงบ");
  await expect(page.locator(":fullscreen")).not.toContainText("active");
  await expect(page.locator(":fullscreen")).not.toContainText("none");
  await expect(page.locator(":fullscreen")).toContainText("สถานะการกรอก: ยังไม่กรอก");
  await expect(page.locator(":fullscreen")).toContainText("สถานะเครื่อง: ใช้งานอยู่");
  const fullscreenSearch = page.locator(":fullscreen").getByRole("textbox", { name: "ค้นหาในตาราง...", exact: true });
  await fullscreenSearch.fill("SUTH-045");
  await expect(page.locator(":fullscreen").getByRole("table").getByText("SUTH-045", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ย่อตาราง", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "ค้นหา", exact: true })).toHaveValue("SUTH-045");
  await expect(year).toBeHidden();
});
