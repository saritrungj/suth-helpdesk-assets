import { expect, test } from "@playwright/test";

// Explicit opt-in for the provisioned, synthetic QA48 database only. No bootstrap
// or password rotation here. Disable traces/screenshots containing login secrets.
test.use({ trace: "off", screenshot: "off", video: "off", actionTimeout: 10000 });
test("QA48 real edit, reload, duplicate retry and repeated building moves preserve totals and permissions", async ({ page, request }) => {
  test.skip(process.env.SUTH_QA48_ALLOW_WRITES !== "1", "Requires explicit isolated QA48 write approval");
  test.setTimeout(90000);
  expect(process.env.SUTH_WEB_URL).toBe("http://localhost:5174");
  expect(process.env.SUTH_API_URL).toBe("http://localhost:3001/api");
  expect(process.env.QA48_PASSWORD).toBeTruthy();
  const api = "http://localhost:3001/api";
  const password = process.env.QA48_PASSWORD;
  await page.route("**/api/**", (route) => {
    const target = new URL(route.request().url());
    return !target.pathname.startsWith("/api/") || target.origin === "http://localhost:3001" ? route.continue() : route.abort();
  });
  const login = await request.post(`${api}/auth/login`, { data: { username: "qa48-admin", password }, maxRedirects: 0 });
  expect(login.status()).toBe(200);
  async function get(endpoint) {
    const response = await request.get(`${api}${endpoint}`, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    return response.json();
  }
  const rows = await get("/devices");
  expect(rows).toHaveLength(25);
  expect(rows.every(row => /^QA48-\d{3}$/.test(row.serial_number))).toBe(true);
  const moved = rows.find(row => row.serial_number === "QA48-001");
  const historyBefore = (await get(`/devices/${moved.id}/history`)).history;
  await page.goto("/login");
  await page.locator("#login-username").fill("qa48-admin");
  await page.locator("#current-password").fill(password);
  await page.getByRole("button", { name: /เข้าสู่ระบบ/ }).click();
  await page.waitForURL("**/dashboard");
  await page.goto("/assets");
  const search = page.getByRole("textbox", { name: "ค้นหา Serial, รุ่น, ตำแหน่ง…" });
  await search.fill("QA48");
  await page.getByRole("columnheader", { name: "Serial" }).getByRole("button").click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  const edit = page.getByRole("button", { name: "แก้ไข QA48-021", exact: true });
  await edit.click();
  let drawer = page.getByRole("dialog");
  const serial = drawer.getByRole("textbox", { name: "หมายเลข Serial" });
  const model = `QA48 verified ${Date.now()}`;
  await serial.fill("QA48-022");
  await drawer.getByRole("textbox", { name: "รุ่น", exact: true }).fill(model);
  await drawer.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(drawer.getByRole("alert")).toBeVisible();
  await expect(drawer.getByRole("textbox", { name: "รุ่น", exact: true })).toHaveValue(model);
  await serial.fill("QA48-021");
  await drawer.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole("button", { name: "2", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(edit).toBeFocused();
  await page.reload();
  await search.fill("QA48-021");
  await expect(page.getByRole("row").filter({ hasText: "QA48-021" })).toContainText(model);

  for (const destination of ["QA48 Origin", "QA48 Destination"]) {
    const current = await get(`/devices/${moved.id}`);
    await search.fill("QA48-001");
    await page.getByRole("button", { name: "การกระทำเพิ่มเติม QA48-001", exact: true }).click();
    await page.getByRole("menuitem", { name: "ย้ายเครื่อง", exact: true }).click();
    drawer = page.getByRole("dialog");
    await drawer.getByText(current.building_name, { exact: true }).click();
    const picker = page.getByRole("combobox", { name: "พิมพ์เพื่อค้นหา..." });
    await expect(picker).toHaveValue("");
    await page.getByRole("option", { name: destination, exact: true }).click();
    await drawer.getByRole("textbox", { name: "ตำแหน่งที่ตั้ง", exact: true }).fill(`QA48 verified ${destination}`);
    await drawer.getByRole("button", { name: "ย้ายเครื่อง", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ย้ายเครื่อง", exact: true }).click();
    await expect(drawer.getByText("ย้ายเรียบร้อย — ประวัติด้านล่างอัปเดตแล้ว")).toBeVisible();
    await drawer.getByRole("button", { name: "ปิดหน้าต่าง", exact: true }).click();
    await expect(drawer).not.toBeVisible();
    const usage = (await get(`/devices/${moved.id}/current-usage`)).usage;
    expect(usage.building_name).toBe(destination);
    expect(usage.total_pages).toBe(800);
    expect(usage.total_cost).toBe(360);
  }
  const history = (await get(`/devices/${moved.id}/history`)).history;
  expect(history).toHaveLength(historyBefore.length + 2);
  expect(history.filter(row => row.effective_to === null)).toHaveLength(1);
  const summary = await get("/dashboard/summary-by-building");
  expect(summary.reduce((sum, row) => sum + Number(row.total_building_cost), 0)).toBe(360);
  const beforeDenied = await get(`/devices/${moved.id}`);
  for (const role of ["staff", "viewer"]) {
    expect((await request.post(`${api}/auth/login`, { data: { username: `qa48-${role}`, password }, maxRedirects: 0 })).status()).toBe(200);
    expect((await request.put(`${api}/devices/${moved.id}/move`, { data: { location: "FORBIDDEN" }, maxRedirects: 0 })).status()).toBe(403);
  }
  expect((await get(`/devices/${moved.id}`)).location).toBe(beforeDenied.location);
  await page.screenshot({ path: test.info().outputPath("verified-registry.png"), fullPage: true });
});
