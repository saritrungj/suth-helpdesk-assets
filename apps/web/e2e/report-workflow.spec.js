import { test, expect } from "@playwright/test";
import { fiscalYearMonths, sumSatang, toSatang } from "@suth/domain";
import {
  signIn,
  reasonToSkip,
  apiFetch,
  restoreMonth,
  snapshotMonth,
  writesAllowed,
  activeFiscalYear,
} from "./fixtures.js";

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
    // ภาพรวมมีกราฟรายเดือนสองกราฟ ส่วนพื้นที่เปรียบเทียบและตารางรายละเอียดอยู่หน้าเปรียบเทียบ (ADR-0033)
    // ทั้งสองภาษา ส่วนกฎ coverage ถูกตรวจแยกด้วย API ด้านล่าง
    await expect(page.getByRole("region", {
      name: language === "en" ? "Monthly trend" : "แนวโน้มรายเดือน",
    })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${language}.png`), fullPage: true });
    await page.goto("/compare");
    await expect(page.getByRole("region", {
      name: language === "en" ? "Comparison area" : "พื้นที่เปรียบเทียบ",
    })).toBeVisible();
    await expect(page.getByRole("heading", {
      name: language === "en" ? "Detail table" : "ตารางรายละเอียด",
      exact: true,
    })).toBeVisible();
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
    for (const route of ["/expense", "/dashboard", "/report", "/print-transactions", "/admin/users"]) {
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
  await expect(page.getByRole("heading", { name: "รายงานสรุปการพิมพ์", exact: true })).toBeVisible();

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
  for (const route of ["/expense", "/dashboard", "/admin/users", "/admin/brands"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("button", { name: "ขยายตาราง", exact: true })).toHaveCount(0);
  }

  for (const route of ["/assets", "/report", "/print-transactions"]) {
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
  const trend = page.getByTestId("overview-trend-pages");
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
  const overdue = page.getByRole("link", { name: "ไปกรอกจำนวนพิมพ์", exact: true });
  if (await overdue.count()) {
    await overdue.click();
    await expect(page).toHaveURL(/fill=empty/);
    await expect(page.getByRole("heading", { name: "บันทึกจำนวนพิมพ์รายเดือน" })).toBeVisible();
  }
});

test("unavailable comparison month explains missing data", async ({ page }) => {
  await page.route("**/api/dashboard/monthly-kpi?**", (route) => route.fulfill({ json: [] }));
  await page.goto("/dashboard?months=2026-09");
  // ทั้งกราฟค่าใช้จ่ายและกราฟยอดพิมพ์บอกเหตุผลเดียวกัน (#206)
  await expect(page.getByText("ยังไม่มีการพิมพ์ในขอบเขตที่เลือก", { exact: true })).toHaveCount(2);
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

test("backdating a billing contract lets a previously rejected reading be saved", async () => {
  test.skip(!writesAllowed(), "This regression creates and removes one device in an isolated test database");
  const [contracts, devices] = await Promise.all([apiFetch("/contracts"), apiFetch("/devices")]);
  const contract = contracts.find((row) => {
    if (!row.effective_from || !row.effective_to || !row.price_lines?.length) return false;
    return row.effective_from.slice(0, 7) < row.effective_to.slice(0, 7);
  });
  const template = devices.find((row) => row.brand_id);
  test.skip(!contract || !template, "No priced multi-month contract or device template");

  // เดือนแรกที่สัญญาคิดเงินได้ — งวดนับเป็นเดือนที่งวดสิ้นสุด (ADR-0023) สัญญาที่เริ่มหลังวันที่ 1
  // เช่น 24 มิ.ย. จึงเริ่มคิดเงินเดือน ก.ค. เดือนที่เริ่มสัญญาอยู่นอกอายุสัญญาในทางคิดเงิน (#140)
  const [fromYear, fromMonth, fromDay] = contract.effective_from.split("-").map(Number);
  const readingMonth = new Date(Date.UTC(fromYear, fromMonth - 1 + (fromDay > 1 ? 1 : 0), 1)).toISOString().slice(0, 7);
  const [year, month] = readingMonth.split("-").map(Number);
  const laterBillingFrom = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const reviewedBillingFrom = `${readingMonth}-01`;
  // ช่วง "ยังไม่ผูกสัญญา" เริ่มหลังวันที่ที่ตรวจแล้ว จึงชนะช่วงที่ขยายกลับตามกติกา
  // ช่วงที่เริ่มทีหลังชนะ ถ้าการบันทึกไม่แทนที่ช่วงนั้น ยอดเดือนนี้จะยังไม่มีราคา
  const installedMidMonth = `${readingMonth}-02`;
  const serial = `E2E-HISTORY-${Date.now()}`;
  let deviceId = null;

  try {
    const created = await apiFetch("/devices", {
      method: "POST",
      body: JSON.stringify({
        serial_number: serial,
        brand_id: template.brand_id,
        contract_id: null,
        meter_category_id: contract.price_lines[0].category_id,
        price_override: null,
        status: "active",
        installation_status: "installed",
        installed_on: installedMidMonth,
      }),
    });
    deviceId = created.id;

    await apiFetch(`/devices/${deviceId}`, {
      method: "PUT",
      body: JSON.stringify({
        serial_number: serial,
        brand_id: template.brand_id,
        model: null,
        contract_id: contract.id,
        meter_category_id: contract.price_lines[0].category_id,
        price_override: null,
        status: "active",
        billing_from: laterBillingFrom,
      }),
    });
    await expect(apiFetch("/print-transactions", {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, month: readingMonth, pages: 100 }),
    })).rejects.toThrow(/หาราคาไม่ได้/);
    await apiFetch(`/devices/${deviceId}`, {
      method: "PUT",
      body: JSON.stringify({
        serial_number: serial,
        brand_id: template.brand_id,
        model: null,
        contract_id: contract.id,
        meter_category_id: contract.price_lines[0].category_id,
        price_override: null,
        status: "active",
        billing_from: reviewedBillingFrom,
      }),
    });

    await apiFetch("/print-transactions", {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, month: readingMonth, pages: 100 }),
    });

    const after = await apiFetch(
      `/dashboard/monthly-kpi?month=${readingMonth}&contract_id=${contract.id}`
    );
    expect(after.find((row) => row.device_id === deviceId)?.total_cost).not.toBeNull();
  } finally {
    if (deviceId) {
      // FK ป้องกันการลบเครื่องที่ยังมียอดอยู่ จึงคืนเดือนเป็น null ก่อนลบเครื่องจำลอง
      await restoreMonth(readingMonth, [{ device_id: deviceId, pages: null }]);
      await apiFetch(`/devices/${deviceId}`, { method: "DELETE" });
    }
  }
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


test("monthly comparison keeps historical contracts after a device switches", async () => {
  test.skip(!writesAllowed(), "Creates disposable contracts and a device in the isolated test database");
  const [fy, devices, categories] = await Promise.all([activeFiscalYear(), apiFetch("/devices"), apiFetch("/contracts/meter-categories")]);
  const template = devices.find((row) => row.brand_id);
  const category = categories.find((row) => !row.is_color);
  test.skip(!template || !category, "No brand or monochrome meter category available");
  const months = [fy.start_month, fy.end_month];
  const label = `E2E-COMPARE-${Date.now()}`;
  const contracts = [];
  let deviceId;
  try {
    for (const suffix of ["A", "B"]) {
      const created = await apiFetch("/contracts", {
        method: "POST",
        body: JSON.stringify({
          contract_no: `${label}-${suffix}`,
          effective_from: `${fy.start_month}-01`,
          effective_to: new Date(Date.UTC(Number(fy.end_month.slice(0, 4)), Number(fy.end_month.slice(5, 7)), 0)).toISOString().slice(0, 10),
          price_lines: [{ category_id: category.id, price_per_page: 0.5 }],
        }),
      });
      contracts.push(created.id);
    }
    const device = { serial_number: label, brand_id: template.brand_id, model: null,
      contract_id: contracts[0], price_override: 0.5, status: "active",
      meter_category_id: category.id, installation_status: "installed", installed_on: `${months[0]}-01`, billing_from: `${months[0]}-01` };
    ({ id: deviceId } = await apiFetch("/devices", { method: "POST", body: JSON.stringify(device) }));
    await apiFetch(`/devices/${deviceId}`, {
      method: "PUT",
      body: JSON.stringify({ ...device, contract_id: contracts[1], billing_from: `${months[1]}-01` }),
    });
    for (const month of months) {
      await apiFetch("/print-transactions", {
        method: "POST", body: JSON.stringify({ device_id: deviceId, month, pages: 100 }),
      });
    }
    const rows = (await apiFetch("/dashboard/monthly-kpi")).filter((row) => row.device_id === deviceId);
    expect(rows).toHaveLength(2);
    const before = rows.find((row) => row.month === months[0]);
    const after = rows.find((row) => row.month === months[1]);
    expect(before.billing_contract_id).toBe(contracts[0]);
    expect(before.billing_contract_no).toBe(`${label}-A`);
    expect(after.billing_contract_id).toBe(contracts[1]);
    expect(after.billing_contract_no).toBe(`${label}-B`);
    expect(Number(before.total_cost)).toBe(49);
    expect(Number(after.total_cost)).toBe(49);
  } finally {
    if (deviceId) {
      for (const month of months) await restoreMonth(month, [{ device_id: deviceId, pages: null }]);
      await apiFetch(`/devices/${deviceId}`, { method: "DELETE" });
    }
    for (const id of contracts.reverse()) await apiFetch(`/contracts/${id}`, { method: "DELETE" });
  }
});


/** ส่งออกตารางหน้ารายงานเป็น Excel แล้วคืนหัวตารางกับแถวข้อมูลของแผ่นแรก */
async function exportReportSheet(page) {
  const exportButton = page.getByRole("button", { name: /Excel/ });
  await expect(exportButton).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;

  const { readFile } = await import("node:fs/promises");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await readFile(await download.path()), { type: "buffer" });
  const [header, ...body] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
  return { header, body };
}

/** ยอดรวมของแต่ละค่าในคอลัมน์ `keyOf` — ช่องยอดรวมที่ว่าง (ยังไม่มียอด) ไม่นับ */
function totalsBy({ header, body }, keyOf) {
  const totalColumn = header.length - 1;
  const totals = {};
  for (const row of body) {
    if (row[totalColumn] === undefined || row[totalColumn] === "") continue;
    const key = keyOf(row, header);
    totals[key] = (totals[key] ?? 0) + Number(row[totalColumn]);
  }
  return totals;
}

async function fiscalYearReadings() {
  const year = await activeFiscalYear();
  const months = fiscalYearMonths({ startMonth: year.start_month, endMonth: year.end_month });
  return apiFetch(`/dashboard/monthly-kpi?month=${months.join(",")}`);
}

test("report Excel reconciles each building with the API allocation (#104)", async ({ page }) => {
  /* ยอดหนึ่งเครื่องหนึ่งเดือนต้องอยู่แถวเดียว และอยู่ที่อาคารเดียวกับที่ API จัดให้
     เทียบผ่านไฟล์ Excel เพราะไฟล์ส่งออกทุกแถวที่กรองไว้ ไม่ตัดตามหน้าของตาราง
     ยอดรวมที่เกิน = นับซ้ำ ยอดที่ขาด = เดือนตกหล่นจากแถวของช่วงประวัติ */
  const [devices, readings] = await Promise.all([apiFetch("/devices"), fiscalYearReadings()]);
  const known = new Set(devices.map((device) => device.id));
  const expected = {};
  for (const row of readings) {
    if (!known.has(row.device_id)) continue;
    const building = row.building_name || "—";
    expected[building] = (expected[building] ?? 0) + Number(row.pages_printed || 0);
  }
  test.skip(!Object.keys(expected).length, "No readings in the active fiscal year");

  await page.goto("/report");
  const sheet = await exportReportSheet(page);
  const buildingColumn = sheet.header.indexOf("อาคาร / ชั้น");
  expect(buildingColumn).toBeGreaterThanOrEqual(0);
  expect(totalsBy(sheet, (row) => String(row[buildingColumn]).split(" / ")[0])).toEqual(expected);
});

test("report division filter follows the division of each month (#104)", async ({ page }) => {
  /* สองเคสที่ reconciliation รวมทั้งอาคารจับไม่ได้ครบ ต้องกรองจริงผ่านหน้าจอ:
       CI-SN-031 ย้ายฝ่ายต้นเดือนนี้ — กรองฝ่ายเดิมต้องยังเห็นยอดเดือนก่อน
       CI-SN-032 ประวัติซ้อน — ยอดอยู่กับช่วงที่เริ่มทีหลังเท่านั้น ไม่ถูกนับสองฝ่าย
     ค่าที่คาดหวังมาจาก API ไม่ได้ตรึงตัวเลขจาก seed เพื่อให้เทสยืนยันว่าหน้ากับ API
     ตรงกัน ไม่ใช่ยืนยันว่า seed ยังเหมือนเดิม */
  const [devices, readings] = await Promise.all([apiFetch("/devices"), fiscalYearReadings()]);
  const serials = ["CI-SN-031", "CI-SN-032"];
  const cases = serials.map((serial) => devices.find((device) => device.serial_number === serial));
  test.skip(cases.some((device) => !device), "Needs devices 31/32 from database/seed_ci.sql");

  const pagesOf = (device, division) =>
    readings
      .filter((row) => row.device_id === device.id && row.division_name === division)
      .reduce((sum, row) => sum + Number(row.pages_printed || 0), 0);
  const [moved, overlapping] = cases;
  // ยืนยันว่า seed ยังเป็นรูปที่เทสนี้ต้องการ ก่อนสรุปอะไรจากหน้าจอ
  expect(pagesOf(moved, "ฝ่ายการพยาบาล")).toBeGreaterThan(0);
  expect(pagesOf(moved, "ฝ่ายเภสัชกรรม")).toBeGreaterThan(0);
  expect(pagesOf(overlapping, "ฝ่ายการพยาบาล")).toBe(0);
  expect(pagesOf(overlapping, "ฝ่ายเภสัชกรรม")).toBeGreaterThan(0);

  await page.goto("/report");
  const toggle = page.getByRole("button", { name: /^ตัวกรอง/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();

  for (const division of ["ฝ่ายการพยาบาล", "ฝ่ายเภสัชกรรม"]) {
    await page.getByRole("button", { name: /^ฝ่าย (ทุกฝ่าย|ฝ่าย)/ }).click();
    await page.getByRole("option", { name: division, exact: true }).click();

    const sheet = await exportReportSheet(page);
    const serialColumn = sheet.header.indexOf("Serial");
    const totals = totalsBy(sheet, (row) => row[serialColumn]);
    expect(totals["CI-SN-031"] ?? 0, `CI-SN-031 ใน${division}`).toBe(pagesOf(moved, division));
    expect(totals["CI-SN-032"] ?? 0, `CI-SN-032 ใน${division}`).toBe(pagesOf(overlapping, division));
  }
});


test("monthly KPI exposes the month-effective location IDs (#107)", async () => {
  const [devices, readings] = await Promise.all([apiFetch("/devices"), fiscalYearReadings()]);
  const moved = devices.find((device) => device.serial_number === "CI-SN-031");
  expect(moved, "CI-SN-031 from the isolated CI seed").toBeTruthy();
  const rows = readings.filter((row) => row.device_id === moved.id).sort((a, b) => a.month.localeCompare(b.month));
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ building_id: 1, floor_id: 1, division_id: 1, department_id: 2, brand_id: 1 });
  expect(rows[1]).toMatchObject({ building_id: 2, floor_id: 2, division_id: 2, department_id: 3, brand_id: 1 });
});

/*
 * ADR-0022 — ยอดเงินปัดครั้งเดียวที่ระดับรายการราคาต่องวด แล้วกระจายสตางค์ลงมิเตอร์แบบ
 * largest remainder ตรวจกับ view ตัวจริง ไม่ใช่สูตรที่เขียนซ้ำในเทส
 *
 * สามเครื่อง 1 หน้าเท่ากัน ราคา 0.365: แต่ละเครื่อง 0.98 × 0.365 = 0.3577 บาท
 *   ปัดรายเครื่องแบบเดิม = 0.36 × 3 = 1.08 — เกินใบแจ้งหนี้ 1 สตางค์
 *   ใบแจ้งหนี้ = ROUND(0.365 × 2.94, 2) = ROUND(1.0731) = 1.07
 *   ตัดทุกส่วนเหลือ 0.35 (รวม 1.05) สตางค์ที่เหลือ 2 สตางค์ เศษเท่ากันทุกเครื่อง
 *   จึงตัดสินด้วยรหัสมิเตอร์ — สองมิเตอร์แรกได้ 0.36 มิเตอร์สุดท้ายได้ 0.35
 */
test("invoice line rounds once and hands the leftover cents out by largest remainder (ADR-0022)", async () => {
  test.skip(!writesAllowed(), "This regression creates and removes one contract and three devices in an isolated test database");
  const [fy, categories, devices] = await Promise.all([
    activeFiscalYear(),
    apiFetch("/contracts/meter-categories"),
    apiFetch("/devices"),
  ]);
  const monochrome = categories.find((category) => !category.is_color);
  const template = devices.find((row) => row.brand_id);
  test.skip(!monochrome || !template, "No monochrome meter category or device template");

  const [endYear, endMonth] = fy.end_month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).toISOString().slice(0, 10);
  const month = fy.start_month;
  const stamp = Date.now();
  let contractId = null;
  const deviceIds = [];

  try {
    const contract = await apiFetch("/contracts", {
      method: "POST",
      body: JSON.stringify({
        contract_no: `E2E-INVOICE-${stamp}`,
        effective_from: `${fy.start_month}-01`,
        effective_to: lastDay,
        price_lines: [{ category_id: monochrome.id, price_per_page: "0.365" }],
      }),
    });
    contractId = contract.id;

    for (const suffix of ["A", "B", "C"]) {
      const created = await apiFetch("/devices", {
        method: "POST",
        body: JSON.stringify({
          serial_number: `E2E-INVOICE-${stamp}-${suffix}`,
          brand_id: template.brand_id,
          contract_id: contractId,
          meter_category_id: monochrome.id,
          price_override: null,
          status: "active",
          installation_status: "installed",
          installed_on: `${fy.start_month}-01`,
        }),
      });
      deviceIds.push(created.id);
    }

    await apiFetch("/print-transactions/bulk", {
      method: "POST",
      body: JSON.stringify({ month, items: deviceIds.map((device_id) => ({ device_id, pages: 1 })) }),
    });

    const rows = (await apiFetch(`/dashboard/monthly-kpi?month=${month}`))
      .filter((row) => deviceIds.includes(row.device_id))
      .sort((a, b) => a.meter_id - b.meter_id);
    expect(rows.map((row) => Number(row.total_cost))).toEqual([0.36, 0.36, 0.35]);
    expect(sumSatang(rows.map((row) => toSatang(row.total_cost)))).toBe(107);
  } finally {
    if (deviceIds.length) {
      await restoreMonth(month, deviceIds.map((device_id) => ({ device_id, pages: null })));
      for (const id of deviceIds) await apiFetch(`/devices/${id}`, { method: "DELETE" });
    }
    if (contractId) await apiFetch(`/contracts/${contractId}`, { method: "DELETE" });
  }
});
