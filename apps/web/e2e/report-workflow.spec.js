import { test, expect } from "@playwright/test";
import { sumSatang, toSatang } from "@suth/domain";
import { signIn, reasonToSkip, apiFetch } from "./fixtures.js";

test.beforeEach(async ({ context }) => {
  test.skip(await reasonToSkip());
  await signIn(context);
});

for (const language of ["th", "en"]) {
  test(`reports render and tables expand (${language})`, async ({ page }, testInfo) => {
    await page.addInitScript((value) => localStorage.setItem("suth-language", value), language);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("/api/") && response.status() >= 500) errors.push(`API ${response.status()}: ${response.url()}`);
    });
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText(language === "en" ? "Print overview" : "ภาพรวมการพิมพ์");
    // ความครบถ้วนของปีงบยังมีให้ดูใต้กราฟหลัก และแปลตามภาษาที่เลือก
    await expect(page.getByText(language === "en" ? "Complete months" : "เดือนที่บันทึกครบ")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${language}.png`), fullPage: true });
    await page.goto("/compare");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText(language === "en" ? "Comparison table" : "ตารางเปรียบเทียบ", { exact: true })).toBeVisible();
    await page.goto("/assets");
    const searchName = language === "en" ? "Search serial, model, location…" : "ค้นหา Serial, รุ่น, ตำแหน่ง…";
    const search = page.getByRole("textbox", { name: searchName }).first();
    await expect(search).toBeVisible();
    await search.fill("HP");
    await page.getByRole("button", { name: language === "en" ? "Expand table" : "ขยายตาราง", exact: true }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    const fullscreenSearch = page.locator(":fullscreen").getByRole("textbox", { name: searchName });
    await expect(fullscreenSearch).toHaveValue("HP");
    await page.getByRole("button", { name: language === "en" ? "Columns" : "คอลัมน์" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect.poll(() => page.getByRole("menu").evaluate((el) => document.fullscreenElement.contains(el))).toBe(true);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: language === "en" ? "Exit full screen" : "ย่อตาราง", exact: true }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await expect(search).toHaveValue("HP");
    for (const route of ["/expense", "/expense?tab=department", "/report", "/print-transactions", "/admin/users"]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test("overview exposes annual and overdue coverage separately", async () => {
  const years = await apiFetch("/fiscal-years");
  test.skip(!years.length, "No fiscal year available");
  const overview = await apiFetch(`/dashboard/overview?fiscal_year_id=${years[0].id}`);
  expect(overview.coverage.total_months).toBe(12);
  expect(overview.coverage.months).toHaveLength(12);
  expect(overview.coverage.annual_complete_months).toBeLessThanOrEqual(12);

  // ทั้งห้าสถานะต้องแบ่ง 12 เดือนออกจากกันพอดี ไม่ซ้อนและไม่เหลือ
  //
  // เดิมยืนยันแค่สามตัวแรกบวกกันได้ 12 ซึ่งจริงตอนที่ยังไม่มีสถานะ "ยืนยันไม่ได้"
  // ถ้าปล่อยไว้แบบเดิม เดือนที่ยืนยันไม่ได้จะหายไปจากสมการเงียบๆ แล้วเทสจะแดงด้วย
  // เหตุผลที่ไม่เกี่ยวกับสิ่งที่มันตั้งใจตรวจ — ดู ADR-0018
  const { coverage } = overview;
  expect(
    coverage.annual_complete_months +
      coverage.incomplete_months +
      coverage.not_due_months +
      coverage.indeterminate_months +
      coverage.not_applicable_months
  ).toBe(12);

  // เดือนที่ยังมีเครื่องซึ่งไม่รู้ว่าต้องกรอกหรือไม่ ห้ามถูกประกาศว่า "ครบ" หรือ "ค้าง"
  //
  // เขียนเป็นกฎรายเดือน ไม่ใช่กฎรวมทั้งปี เพราะการยืนยันเป็นรายเครื่องและรายช่วง
  // ผู้ดูแลที่ยืนยันย้อนหลังได้ถึงเดือนมกราคม ทำให้เดือนหลังจากนั้นสรุปได้ตามปกติ
  // ขณะที่เดือนก่อนหน้ายังยืนยันไม่ได้ — ทั้งสองอย่างอยู่ในปีเดียวกันได้
  const wronglyConcluded = coverage.months.filter(
    (month) => month.unverified_devices > 0 && ["complete", "overdue"].includes(month.status)
  );
  expect(wronglyConcluded).toEqual([]);
});

test("report table uses the remaining viewport when expanded", async ({ page }) => {
  await page.goto("/report");
  await expect(page.getByRole("heading", { name: "ยอดพิมพ์รายเดือนตามเครื่อง", exact: true })).toBeVisible();

  const tableScroll = page.locator("div.relative.overflow-auto").first();
  await expect(tableScroll).toBeVisible();
  const before = await tableScroll.boundingBox();
  await page.getByRole("button", { name: "ขยายตาราง", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);

  const after = await tableScroll.boundingBox();
  expect(after.height).toBeGreaterThan(before.height + 100);
  await expect(page.getByText(/แสดง\s+1–20\s+จาก/)).toBeVisible();

  await page.getByRole("button", { name: "ย่อตาราง", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
});

test("fullscreen is limited to long data tables", async ({ page }) => {
  for (const route of ["/expense", "/compare", "/admin/users", "/admin/brands"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("button", { name: "ขยายตาราง", exact: true })).toHaveCount(0);
  }

  for (const route of ["/assets", "/report", "/print-transactions", "/expense?tab=department"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    const expand = page.getByRole("button", { name: "ขยายตาราง", exact: true });
    await expect(expand).toHaveCount(1);
    await expand.click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    const layout = await page.evaluate(() => {
      const root = document.fullscreenElement;
      const scroll = root.querySelector("div.relative.overflow-auto");
      const footer = root.querySelector('[aria-live="polite"]')?.parentElement;
      return {
        rootHeight: root.getBoundingClientRect().height,
        viewportHeight: window.innerHeight,
        tableInside: Boolean(root.querySelector("table")),
        scrollHeight: scroll?.getBoundingClientRect().height ?? 0,
        footerGap: footer ? window.innerHeight - footer.getBoundingClientRect().bottom : null,
      };
    });
    expect(layout.tableInside).toBe(true);
    expect(layout.rootHeight).toBeCloseTo(layout.viewportHeight, 0);
    expect(layout.scrollHeight).toBeGreaterThan(100);
    expect(layout.footerGap).toBeGreaterThanOrEqual(0);
    expect(layout.footerGap).toBeLessThanOrEqual(24);
    await page.getByRole("button", { name: "ย่อตาราง", exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/report");
  await expect(page.getByRole("button", { name: "ขยายตาราง", exact: true })).toBeHidden();
});

test("graph selection retains the filter and follow-up links retain their scope", async ({ page }) => {
  await page.goto("/dashboard");
  // หัวข้อการ์ดเปลี่ยนตามสถานะราคาโดยตั้งใจ — เป็น "ค่าใช้จ่ายที่ยืนยันแล้วรายเดือน"
  // เมื่อยังมีรายการที่ยืนยันราคาไม่ได้ (ADR-0019 Q27) จับด้วยรูปแบบ ไม่ใช่ข้อความตรงตัว
  // ไม่งั้นเทสจะแดงเพราะข้อมูลในฐานเปลี่ยนสถานะ ไม่ใช่เพราะพฤติกรรมที่มันตรวจพัง
  const trend = page.locator("section").filter({ has: page.getByRole("heading", { name: /รายเดือน$/ }) });
  await trend.getByRole("radio", { name: "ตาราง", exact: true }).click();
  const months = trend.locator("tbody button");
  await expect(trend.locator("canvas")).toHaveCount(1);
  const count = await months.count();
  const filterUrl = page.url();
  if (count) {
    await months.first().click();

    // คลิกเดือนบนกราฟ = เปิดแผงรายละเอียดของเดือนนั้น ไม่ใช่เปลี่ยนตัวกรองของทั้งหน้า
    // ความต่างนี้สำคัญ: ตัวกรองที่เปลี่ยนเองตอนกดดูรายละเอียด ทำให้ตัวเลขทุกใบบน
    // หน้าขยับตามโดยที่ผู้ใช้ไม่ได้สั่ง แล้วภาพรวมที่กำลังอ่านอยู่ก็หายไป
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveURL(filterUrl);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(months).toHaveCount(count);
  }
  await page.getByRole("button", { name: "งานที่ต้องติดตาม", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const overdue = page.getByRole("link", { name: "ไปกรอกยอดพิมพ์", exact: true });
  if (await overdue.count()) {
    await overdue.click();
    await expect(page).toHaveURL(/fill=empty/);
    await expect(page.getByRole("heading", { name: "บันทึกยอดพิมพ์รายเดือน" })).toBeVisible();
  }
});

test("unavailable comparison month explains missing data", async ({ page }) => {
  await page.route("**/api/dashboard/monthly-kpi?**", (route) => route.fulfill({ json: [] }));
  await page.goto("/compare?months=2026-09");
  await expect(page.getByText("ยังไม่มีข้อมูลในช่วงที่เลือก", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/months=2026-09/);
});

test("cancel language change retains unsaved device form", async ({ page }) => {
  await page.goto("/admin/add-asset");
  const serial = page.getByRole("textbox", { name: /^หมายเลข Serial/ });
  await serial.fill("UNSAVED-LANGUAGE-CHECK");
  await page.getByRole("button", { name: /บัญชีของ/ }).click();
  await page.getByRole("radio", { name: "English", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "กลับไปทำงานต่อ", exact: true }).click();
  await page.keyboard.press("Escape"); // Close the account menu after cancelling its dialog.
  await expect(serial).toHaveValue("UNSAVED-LANGUAGE-CHECK");
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
});


test("language preference survives a reload", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /บัญชีของ/ }).click();
  await page.getByRole("radio", { name: "English", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "เปลี่ยนภาษา", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("h1")).toContainText("Print overview");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});


test("report APIs return locations without breaking totals", async () => {
  const years = await apiFetch("/fiscal-years");
  test.skip(!years.length, "No fiscal year available");
  const highlights = await apiFetch(`/dashboard/highlights?fiscal_year_id=${years[0].id}`);
  for (const device of highlights.top_devices) {
    expect(Array.isArray(device.locations)).toBe(true);
    expect(device.locations.length).toBeGreaterThan(0);
    expect(device.locations[0]).toHaveProperty("building_name");
    expect(device.locations[0]).toHaveProperty("location");
  }
  await apiFetch(`/dashboard/by-department?fiscal_year_id=${years[0].id}`);
  const expense = await apiFetch(`/expense/${years[0].id}`);
  expect(Number.isFinite(Number(expense.total_cost_satang))).toBe(true);
  await apiFetch("/expense/unassigned-devices");
});

test("historical report views preserve row counts and financial totals", async () => {
  const [monthly, comparison, buildings, stats] = await Promise.all([
    apiFetch("/dashboard/monthly-kpi"),
    apiFetch("/dashboard/compare"),
    apiFetch("/dashboard/summary-by-building"),
    apiFetch("/dashboard/stats"),
  ]);

  expect(comparison).toHaveLength(monthly.length);
  expect(sumSatang(monthly.map((row) => toSatang(row.total_cost)))).toBe(
    sumSatang(comparison.map((row) => toSatang(row.total_cost)))
  );
  expect(sumSatang(monthly.map((row) => toSatang(row.total_cost)))).toBe(
    sumSatang(buildings.map((row) => toSatang(row.total_building_cost)))
  );
  expect(Number(stats.total_transactions)).toBe(monthly.length);
});

test("report device rows link to the complete asset detail", async ({ page }) => {
  /* เดิมเช็ก detailLink.count() ทันทีหลัง goto แล้วข้ามถ้าได้ศูนย์ — ตารางยังไม่ทันเรนเดอร์
     เคสจึงข้ามตัวเองเพราะจังหวะ ไม่ใช่เพราะไม่มีเครื่องจริง แล้วรายงานผลออกมาเป็น "skip"
     ให้คนอ่านเข้าใจว่าตรวจแล้ว (ผลตรวจของ Codex รอบ #51 จับได้ว่า flow นี้ไม่เคยถูกยืนยัน)
     ตัดสินใจข้ามจากข้อมูลของ API แบบเดียวกับเคสอื่นในไฟล์นี้ — สองเงื่อนไขที่หน้านี้ต้องมี
     คือปีงบ (loadReport คืนค่าเปล่าถ้าไม่มี) และเครื่องในทะเบียน ถ้าครบทั้งคู่ต้อง assert
     ไม่ใช่ข้าม */
  const [years, devices] = await Promise.all([apiFetch("/fiscal-years"), apiFetch("/devices")]);
  test.skip(!years.length || !devices.length, "No fiscal year or device in the database under test");
  await page.goto("/report");
  const detailLink = page.locator('a[href^="/assets/"]').first();
  await expect(detailLink).toHaveAttribute("href", /^\/assets\/\d+$/);
});


test("filtered Excel export carries the search context", async ({ page }) => {
  /* คำค้นต้องมาจากข้อมูลจริงของฐานที่กำลังทดสอบ ค่าคงที่อย่าง "HP" ทำให้เทสนี้
     ล้มบนฐาน QA ที่มี serial คนละชุด ทั้งที่ปุ่ม export ถูก disable อย่างถูกต้อง
     เพราะไม่มีแถวตรงเงื่อนไข — อาการที่ได้คือ timeout ของ event download */
  const devices = await apiFetch("/devices");
  const sample = devices.find((device) => (device.serial_number || "").length >= 4);
  test.skip(!sample, "No device with a serial number to filter by");
  const term = sample.serial_number.slice(0, 4);

  await page.goto("/assets");
  await page.getByRole("textbox", { name: "ค้นหา Serial, รุ่น, ตำแหน่ง…" }).fill(term);
  const exportButton = page.getByRole("button", { name: /Excel/ });
  await expect(exportButton).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  const { readFile } = await import("node:fs/promises");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await readFile(await download.path()), { type: "buffer" });
  const context = XLSX.utils.sheet_to_json(workbook.Sheets["บริบทรายงาน"], { header: 1 });
  expect(context).toContainEqual(["ค้นหา", term]);
  expect(context).toContainEqual(["สกุลเงิน", "THB"]);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }).slice(1);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((row) => row.some((value) => String(value).toUpperCase().includes(term.toUpperCase())))).toBe(true);
});
