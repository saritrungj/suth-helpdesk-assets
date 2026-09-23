import { expect, test } from "@playwright/test";
import { prototypeFixture } from "./prototype-fixture.js";
import { importSessionFixture } from "./import-session-fixture.js";

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
  await expect(page.getByRole("textbox", { name: "จำนวนพิมพ์ของ SUTH-001", exact: true })).toBeEnabled();
  const sort = page.getByRole("columnheader", { name: /Serial/ }).getByRole("button");
  await sort.click();
  await sort.click();
  await page.getByRole("button", { name: "หน้าถัดไป", exact: true }).click();
  const input = page.getByRole("textbox", { name: "จำนวนพิมพ์ของ SUTH-025", exact: true });
  await paste(input, "250\ninvalid\n300");
  const preview = page.getByRole("dialog", { name: "ตัวอย่างก่อนวางตัวเลข", exact: true });
  await expect(preview.getByRole("row").nth(1)).toContainText("SUTH-025");
  await expect(preview.getByRole("row").nth(1)).toContainText("250");
  await expect(preview.getByRole("row").nth(2)).toContainText("SUTH-024");
  await expect(preview.getByRole("row").nth(2)).toContainText("ข้าม");
  await expect(input).toHaveValue("");
  await preview.getByRole("button", { name: "ยืนยันการวาง", exact: true }).click();
  await expect(input).toHaveValue("250");
  await expect(page.getByRole("textbox", { name: "จำนวนพิมพ์ของ SUTH-023", exact: true })).toHaveValue("300");
});

test("print usage import icon opens the guided vendor-file import", async ({ page }) => {
  await prototypeFixture(page, "admin");
  await importSessionFixture(page);
  await page.goto("/print-transactions");
  await page.getByRole("link", { name: "นำเข้าจำนวนพิมพ์", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/import$/);
  await expect(page.getByTestId("import-sessions")).toBeVisible();
});

// เดิมนำเข้าเสร็จแล้วตารางกรอกเดือนเดียวกันยังแสดงช่องว่างจนรีเฟรช เจ้าหน้าที่จึงกรอกทับยอดที่เพิ่ง
// นำเข้าได้ (#144) — หลังบันทึกงานนำเข้า (#180) กลับมาที่ตารางด้วยเมนูต้องเห็นยอดใหม่ทันที โดยไม่ต้องโหลดหน้าใหม่
test("print usage import refreshes the open month grid without a reload", async ({ page }) => {
  await prototypeFixture(page, "admin");
  const server = await importSessionFixture(page);
  await page.route(
    (url) => url.pathname.endsWith("/api/print-transactions") && url.searchParams.has("month"),
    (route) => route.fulfill({ json: server.commits ? [{ device_id: 1, pages: 777 }] : [] })
  );

  await page.goto("/print-transactions?month=2026-08");
  const cell = page.getByRole("textbox", { name: "จำนวนพิมพ์ของ SUTH-001", exact: true }).first();
  await expect(cell).toHaveValue("");

  await page.getByRole("link", { name: "นำเข้าจำนวนพิมพ์", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "meter-report.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("x") });
  await page.getByRole("combobox", { name: "ตัดสินชื่อ ศูนย์ ก (EMC)" }).selectOption({ label: "สร้างอาคารใหม่ชื่อนี้" });
  await page.getByRole("combobox", { name: "หมวดมิเตอร์ของรุ่น ES5112" }).selectOption({ label: "A4 เลเซอร์ ขาวดำ" });
  await expect.poll(() => server.puts.length).toBeGreaterThan(0);
  await page.getByTestId("create-contract").click();
  await expect(page.getByTestId("import-commit")).toBeEnabled();
  await page.getByTestId("import-commit").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByTestId("import-result")).toBeVisible();

  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/print-transactions/);
  await expect(cell).toHaveValue("777");
});

test("annual paste can undo without saving", async ({ page }) => {
  const state = await prototypeFixture(page);
  await page.goto("/print-transactions");
  await page.getByRole("radio", { name: "ภาพรวมทั้งปี", exact: true }).click();
  await page.getByRole("button", { name: "กรอก", exact: true }).first().click();
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
    const input = page.getByRole("textbox", { name: "จำนวนพิมพ์ของ SUTH-001", exact: true });
    await expect(input).toBeInViewport();
    const box = await input.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    await input.fill("250");
    await page.getByRole("button", { name: "ขยายตาราง", exact: true }).click();
    const save = page.getByRole("button", { name: "บันทึก 1 รายการ", exact: true });
    await expect(save).toBeVisible();
    await expect.poll(() => save.evaluate((el) => document.fullscreenElement?.contains(el) ?? false)).toBe(true);
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
  await expect(page.getByRole("textbox", { name: "จำนวนพิมพ์ของ SUTH-001", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "จำนวนพิมพ์ของ SUTH-001", exact: true })).toHaveValue("100");
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
  await expect(page.getByRole("textbox", { name: "จำนวนพิมพ์ของ SUTH-001", exact: true })).toBeEnabled();
});

test("viewer starts in overview and monthly readings remain read-only", async ({ page }) => {
  await prototypeFixture(page, "viewer");
  await page.goto("/print-transactions");
  await expect(page.getByRole("radio", { name: "ภาพรวมทั้งปี", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "กรอก", exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "กรอกรายเดือน", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "จำนวนพิมพ์ของ SUTH-001", exact: true })).toBeDisabled();
});

test("annual load failure cannot overwrite unknown readings and has retry", async ({ page }) => {
  const state = await prototypeFixture(page);
  state.failAnnual = true;
  await page.goto("/print-transactions");
  await page.getByRole("radio", { name: "ภาพรวมทั้งปี", exact: true }).click();
  await page.getByRole("button", { name: "กรอก", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "บันทึกทั้งปี", exact: true })).toBeDisabled();
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
  const input = page.getByRole("textbox", { name: "จำนวนพิมพ์ของ SUTH-001", exact: true });
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
  await page.getByRole("button", { name: "กรอก", exact: true }).first().click();
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
  await expect(page.getByText("ค่าพิมพ์", { exact: true })).not.toBeVisible();
  await expect(page.getByText("ยังไม่มีสัญญาในปีงบนี้", { exact: true })).not.toBeVisible();
  state.failExpense = false;
  await page.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await expect(page.getByText("ค่าพิมพ์", { exact: true })).toBeVisible();
  await expect(page.getByText("360.00", { exact: true }).first()).toBeVisible();
});

test("explicit month survives late coverage and yearly detail keeps the draft", async ({ page }) => {
  const state = await prototypeFixture(page);
  state.coverageDelay = 700;
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/print-transactions?month=2026-09");
  const input = page.getByRole("textbox", { name: "จำนวนพิมพ์ของ SUTH-001", exact: true });
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
  await expect(page.getByText("ค่าพิมพ์", { exact: true })).toBeVisible();
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
  expect(header).toContain("ค่าใช้จ่าย (หัก 2%)");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toEqual(["SUTH-2569", "0.45", "ราคาตามสัญญา", "SUTH-001", "SUTH Printer", "Office 400", 1000, 360]);
});

test("expense price, discount and unit copy is translated while the amounts stay the same", async ({ page }) => {
  await prototypeFixture(page);
  await page.addInitScript(() => localStorage.setItem("suth-language", "en"));
  await page.goto("/expense");
  await expect(page.getByText("Print cost", { exact: true })).toBeVisible();
  // ช่วงเวลาอยู่ในตัวเลือกช่วงเวลาแล้ว ใต้ตัวเลขสรุปจึงเหลือคำอธิบายส่วนลด
  await expect(page.getByText(/After 2% deduction/)).toBeVisible();
  // ราคาต่อหน้าอยู่ในแถวเครื่อง ไม่ได้อยู่ที่หัวสัญญา จึงต้องกางสัญญาก่อน
  await page.getByRole("button", { name: "Expand all", exact: true }).click();
  await expect(page.getByText(/Effective price\s+0\.45\s+THB\/page/)).toBeVisible();
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
  await expect(page.getByText("ค่าพิมพ์", { exact: true })).toBeVisible();
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
