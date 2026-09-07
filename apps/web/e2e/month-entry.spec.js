// apps/web/e2e/month-entry.spec.js
//
// เทสเส้นทางการทำงานจริงของ "กรอกยอดพิมพ์รายเดือน"
//
// สิ่งที่เทสชุดนี้ตรวจ ไม่มีอันไหนที่ build ผ่านหรือ endpoint ตอบ 200 จะพิสูจน์ได้
//
//   - พิมพ์แล้วแถบบันทึกโผล่พร้อมจำนวนที่ถูกต้อง
//   - พิมพ์กลับเป็นค่าเดิมแล้วแถบต้องหายไป (ไม่ใช่ค้างบอกว่ามีของแก้)
//   - กดบันทึกแล้วค่าเข้าฐานข้อมูลจริง
//   - มีของแก้ค้างแล้วเปลี่ยนหน้า ต้องถามก่อน
//   - วางคอลัมน์ตัวเลขแล้วต้องเห็นตัวอย่างก่อน ไม่ลงค่าให้ทันที
//
// **เทสนี้เขียนข้อมูลลงฐานจริงของเครื่องพัฒนา** และคืนค่าเดิมทุกครั้งใน afterEach

import { expect, test } from "@playwright/test";
import { formatMonthTH } from "@suth/domain";
import {
  activeFiscalYear,
  apiFetch,
  reasonToSkip,
  restoreMonth,
  signIn,
  snapshotMonth,
  writesAllowed,
} from "./fixtures.js";

/** เดือนที่ใช้ทดสอบ และรายการเครื่องที่จะถูกแตะ — เก็บไว้คืนค่าทีหลัง */
let month = "";
let touchedDeviceIds = [];
let snapshot = [];

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);

  // เทสไฟล์นี้ **เขียนข้อมูลจริง** จึงต้องเปิดใช้เองเสมอ ไม่ใช่ค่าเริ่มต้น
  // เพราะฐานบนเครื่องพัฒนาคือฐานเดียวกับที่คนเปิดดูรายงานจริง
  test.skip(
    !writesAllowed(),
    "เทสชุดนี้เขียนข้อมูลลงฐานจริง — ตั้ง SUTH_E2E_ALLOW_WRITES=1 และชี้ API ไปที่ฐานทดสอบก่อนรัน"
  );
});

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test.afterEach(async () => {
  // คืนค่าเดิมเสมอ แม้เทสจะล้ม — ไม่ทิ้งตัวเลขปลอมไว้ในรายงานที่คนใช้จริง
  if (month && snapshot.length) await restoreMonth(month, snapshot);
  month = "";
  snapshot = [];
  touchedDeviceIds = [];
});

/** เข้าโหมดกรอกรายเดือนแล้วรอจนตารางพร้อม */
async function openMonthEntry(page) {
  await page.goto("/print-transactions");
  await page.getByRole("radio", { name: "กรอกรายเดือน" }).click();

  const inputs = page.locator('input[aria-label^="ยอดพิมพ์ของ"]');
  await expect(inputs.first()).toBeVisible({ timeout: 15000 });
  return inputs;
}

/**
 * เดือนที่หน้าเว็บเปิดให้กรอกจริง
 *
 * ⚠️ ต้องคำนวณจาก **ปีงบเดียวกับที่หน้าเว็บเลือก** ไม่ใช่ `fiscal_year_id=1`
 * ที่ hardcode ไว้ ถ้าคนละปี เทสจะ snapshot เดือนของปีหนึ่งแล้วหน้าเว็บไปแก้เดือน
 * ของอีกปีหนึ่ง ตอนคืนค่าจึงคืนผิดเดือน = ทิ้งข้อมูลทดสอบไว้ในฐานและลบของจริงทิ้ง
 *
 * อ่านซ้ำจากหัวคอลัมน์บนหน้าจอด้วย เพื่อยืนยันว่าตรงกันจริง ไม่ใช่แค่เชื่อ API
 */
async function activeMonth() {
  const fy = await activeFiscalYear();
  const coverage = await apiFetch(`/print-transactions/coverage?fiscal_year_id=${fy.id}`);
  return coverage.next_incomplete_month || coverage.months.at(-1).month;
}

/** ยืนยันว่าเดือนที่เทสคิดไว้ ตรงกับเดือนที่ตารางกำลังให้กรอกอยู่จริง */
async function assertMonthMatchesPage(page, expected) {
  const label = formatMonthTH(expected);
  const header = page.locator("th", { hasText: label });
  await expect(
    header.first(),
    `เดือนที่เทสจะ snapshot (${expected}) ไม่ตรงกับหัวคอลัมน์บนหน้าจอ — ` +
      "ถ้าปล่อยไว้ เทสจะคืนค่าผิดเดือนแล้วทิ้งข้อมูลทดสอบไว้ในฐาน"
  ).toBeVisible({ timeout: 10000 });
}

test("พิมพ์แล้วแถบบันทึกขึ้น บอกจำนวนถูกต้อง และหายไปเมื่อพิมพ์กลับเป็นค่าเดิม", async ({ page }) => {
  const inputs = await openMonthEntry(page);
  month = await activeMonth();

  const first = inputs.nth(0);
  const second = inputs.nth(1);
  const originalFirst = await first.inputValue();

  // ยังไม่แก้อะไร แถบบันทึกต้องไม่มี
  await expect(page.getByRole("button", { name: /^บันทึก \d+ รายการ$/ })).toHaveCount(0);

  await first.fill("1234");
  await expect(page.getByRole("button", { name: "บันทึก 1 รายการ" })).toBeVisible();

  await second.fill("5678");
  await expect(page.getByRole("button", { name: "บันทึก 2 รายการ" })).toBeVisible();

  // พิมพ์กลับเป็นค่าเดิม -> ต้องเหลือ 1 ไม่ใช่ค้างที่ 2
  await first.fill(originalFirst);
  await expect(page.getByRole("button", { name: "บันทึก 1 รายการ" })).toBeVisible();

  // ทิ้งที่แก้ไว้ -> แถบต้องหายทั้งแถบ
  await page.getByRole("button", { name: "ทิ้งที่แก้ไว้" }).click();
  await expect(page.getByRole("button", { name: /^บันทึก \d+ รายการ$/ })).toHaveCount(0);
});

test("กดบันทึกแล้วค่าเข้าฐานข้อมูลจริง", async ({ page }) => {
  const inputs = await openMonthEntry(page);
  month = await activeMonth();

  // จับคู่ช่องกรอกกับ device id จาก aria-label ที่มี serial อยู่
  const serial = (await inputs.nth(0).getAttribute("aria-label")).replace("ยอดพิมพ์ของ ", "");
  const devices = await apiFetch("/devices?per_page=200");
  const rows = Array.isArray(devices) ? devices : devices.data;
  const device = rows.find((d) => d.serial_number === serial);
  expect(device, `หาเครื่อง ${serial} ในทะเบียนไม่เจอ`).toBeTruthy();

  // ยืนยันก่อนแตะข้อมูลว่าเดือนที่จะ snapshot ตรงกับที่หน้าจอกำลังแก้จริง
  await assertMonthMatchesPage(page, month);

  touchedDeviceIds = [device.id];
  snapshot = await snapshotMonth(month, touchedDeviceIds);

  const target = 4321;
  await inputs.nth(0).fill(String(target));
  await page.getByRole("button", { name: "บันทึก 1 รายการ" }).click();

  // แถบต้องหายไปหลังบันทึกสำเร็จ (ไม่ใช่ค้างไว้ให้กดซ้ำ)
  await expect(page.getByRole("button", { name: /^บันทึก \d+ รายการ$/ })).toHaveCount(0, {
    timeout: 15000,
  });

  // ตรวจจากฐานข้อมูลจริง ไม่ใช่จากหน้าจอ
  const saved = await apiFetch(`/print-transactions?month=${encodeURIComponent(month)}`);
  const row = saved.find((r) => r.device_id === device.id);
  expect(Number(row?.pages)).toBe(target);
});

test("มีของแก้ค้างแล้วเปลี่ยนหน้า ต้องถามก่อนเสมอ", async ({ page }) => {
  const inputs = await openMonthEntry(page);
  month = await activeMonth();

  await inputs.nth(0).fill("999");
  await expect(page.getByRole("button", { name: "บันทึก 1 รายการ" })).toBeVisible();

  // พยายามออกไปหน้าอื่น
  await page.getByRole("link", { name: "ทะเบียนทรัพย์สิน" }).click();

  // ต้องมีกล่องยืนยันขึ้นมา และ **ยังอยู่หน้าเดิม**
  await expect(page.getByText("ยังมีข้อมูลที่ยังไม่ได้บันทึก")).toBeVisible();
  expect(page.url()).toContain("/print-transactions");

  // กดยกเลิก -> ยังอยู่หน้าเดิม และค่าที่กรอกไว้ยังอยู่
  await page.getByRole("button", { name: "ยกเลิก" }).click();
  expect(page.url()).toContain("/print-transactions");
  await expect(inputs.nth(0)).toHaveValue("999");
});

test("วางคอลัมน์ตัวเลขต้องขึ้นตัวอย่างก่อน ไม่ลงค่าให้ทันที", async ({ page }) => {
  const inputs = await openMonthEntry(page);
  month = await activeMonth();

  const before = await inputs.nth(0).inputValue();

  // วางค่าหลายบรรทัด พร้อมบรรทัดที่อ่านไม่ออกปนมาด้วย (เหมือนหัวตารางที่ติดมา)
  await inputs.nth(0).focus();
  await page.evaluate(() => {
    const el = document.activeElement;
    const data = new DataTransfer();
    data.setData("text", "1,200\n2 300\nไม่มีข้อมูล\n4400");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });

  // ต้องเห็นตัวอย่างก่อน และช่องกรอกต้อง **ยังไม่เปลี่ยน**
  await expect(page.getByText(/จะวาง \d+ ค่า เริ่มจากแถวที่ 1/)).toBeVisible();
  await expect(inputs.nth(0)).toHaveValue(before);

  // ตัวอย่างต้องบอกด้วยว่าข้ามค่าที่อ่านไม่ออกกี่ค่า
  await expect(page.getByText(/ข้าม 1 ค่าที่ไม่ใช่ตัวเลข/)).toBeVisible();

  // ยกเลิกแล้วต้องไม่มีอะไรเปลี่ยน
  await page.getByRole("button", { name: "ยกเลิก" }).click();
  await expect(inputs.nth(0)).toHaveValue(before);
  await expect(page.getByRole("button", { name: /^บันทึก \d+ รายการ$/ })).toHaveCount(0);
});

test("เปลี่ยนเดือนทั้งที่ยังมีของแก้ค้าง ต้องถามก่อน และยกเลิกแล้วค่าต้องยังอยู่", async ({ page }) => {
  const inputs = await openMonthEntry(page);
  month = await activeMonth();

  await inputs.nth(0).fill("777");
  await expect(page.getByRole("button", { name: "บันทึก 1 รายการ" })).toBeVisible();

  // เปลี่ยนเดือนจากช่อง "ดูยอดของเดือน" — เลือกด้วย **value** ไม่ใช่ label
  // เพราะ label ในตัวเลือกเป็นเดือนแบบเต็ม ("เมษายน 2569") ส่วน formatMonthTH
  // แบบสั้นคือ "เม.ย. 2569" การเทียบด้วย label จึงพลาดแล้วไปเลือก "ทั้งปีงบ"
  const monthSelect = page.getByLabel("ดูยอดของเดือน");
  const values = await monthSelect.locator("option").evaluateAll((els) =>
    els.map((el) => el.value).filter(Boolean)
  );
  const other = values.find((value) => value !== month);
  expect(other, "ต้องมีเดือนอื่นให้เลือกอย่างน้อยหนึ่งเดือน").toBeTruthy();
  await monthSelect.selectOption(other);

  // ต้องถามก่อน
  await expect(page.getByText("ยังมีข้อมูลที่ยังไม่ได้บันทึก")).toBeVisible();

  // กดยกเลิก -> เดือนต้องเด้งกลับ และค่าที่กรอกไว้ต้องยังอยู่ครบ
  await page.getByRole("button", { name: "ยกเลิก" }).click();
  await expect(page.getByRole("button", { name: "บันทึก 1 รายการ" })).toBeVisible();
  await expect(inputs.nth(0)).toHaveValue("777");
});

test("สลับโหมดทั้งที่ยังมีของแก้ค้าง ต้องถามก่อน", async ({ page }) => {
  const inputs = await openMonthEntry(page);
  month = await activeMonth();

  await inputs.nth(0).fill("888");
  await expect(page.getByRole("button", { name: "บันทึก 1 รายการ" })).toBeVisible();

  await page.getByRole("radio", { name: "ภาพรวมทั้งปี" }).click();

  // ต้องถามก่อน และยังอยู่ในโหมดกรอก
  await expect(page.getByText("ยังมีข้อมูลที่ยังไม่ได้บันทึก")).toBeVisible();
  await page.getByRole("button", { name: "ยกเลิก" }).click();

  await expect(inputs.nth(0)).toHaveValue("888");
  await expect(page.getByRole("button", { name: "บันทึก 1 รายการ" })).toBeVisible();
});

test("แก้ค่าเพิ่มระหว่างรอบันทึก ค่าที่แก้ใหม่ต้องไม่หาย", async ({ page }) => {
  const inputs = await openMonthEntry(page);
  month = await activeMonth();
  await assertMonthMatchesPage(page, month);

  const serial = (await inputs.nth(0).getAttribute("aria-label")).replace("ยอดพิมพ์ของ ", "");
  const devices = await apiFetch("/devices?per_page=200");
  const rows = Array.isArray(devices) ? devices : devices.data;
  const device = rows.find((d) => d.serial_number === serial);

  touchedDeviceIds = [device.id];
  snapshot = await snapshotMonth(month, touchedDeviceIds);

  // หน่วงคำขอบันทึกไว้ เพื่อให้มีช่วงเวลาที่ผู้ใช้พิมพ์เพิ่มได้ระหว่างรอ
  await page.route("**/api/print-transactions/bulk", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await inputs.nth(0).fill("200");
  await page.getByRole("button", { name: "บันทึก 1 รายการ" }).click();

  // ระหว่างที่ยังบันทึกไม่เสร็จ ผู้ใช้แก้เป็น 300
  await inputs.nth(0).fill("300");

  // รอจนคำขอกลับมา
  await page.waitForTimeout(3000);

  // ค่าที่แก้ใหม่ต้องยังอยู่ และแถบบันทึกต้องยังโชว์ว่ามีของค้าง 1 รายการ
  await expect(inputs.nth(0)).toHaveValue("300");
  await expect(
    page.getByRole("button", { name: "บันทึก 1 รายการ" }),
    "ค่าที่แก้เพิ่มระหว่างรอบันทึกถูกลบทิ้ง — ผู้ใช้เห็น 'บันทึกสำเร็จ' แล้วเลขที่เพิ่งพิมพ์หายไป"
  ).toBeVisible();
});

test('เลือก "ทั้งปีงบ" ทั้งที่ยังมีของแก้ค้าง ต้องถามก่อน (ตารางจะถูกถอดออกจากหน้าจอ)', async ({ page }) => {
  const inputs = await openMonthEntry(page);
  month = await activeMonth();

  await inputs.nth(0).fill("555");
  await expect(page.getByRole("button", { name: "บันทึก 1 รายการ" })).toBeVisible();

  // "ทั้งปีงบ" มี value เป็นค่าว่าง ซึ่งทำให้ v-if ของตารางเป็นเท็จและถอดตารางทิ้ง
  // ถ้าไม่มีการ์ดที่หน้าแม่ ค่าที่กรอกไว้จะหายเงียบๆ โดยไม่มีอะไรเตือน
  await page.getByLabel("ดูยอดของเดือน").selectOption("");

  await expect(page.getByText("ยังมีข้อมูลที่ยังไม่ได้บันทึก")).toBeVisible();

  await page.getByRole("button", { name: "ยกเลิก" }).click();
  await expect(inputs.nth(0)).toHaveValue("555");
  await expect(page.getByRole("button", { name: "บันทึก 1 รายการ" })).toBeVisible();
});

test("เปลี่ยนเดือนเร็วๆ ยอดของเดือนเก่าต้องไม่มาโผล่ใต้เดือนใหม่", async ({ page }) => {
  const inputs = await openMonthEntry(page);
  month = await activeMonth();

  const monthSelect = page.getByLabel("ดูยอดของเดือน");
  const values = await monthSelect.locator("option").evaluateAll((els) =>
    els.map((el) => el.value).filter(Boolean)
  );

  // หาเดือนที่ "มีข้อมูลอยู่แล้ว" มาหนึ่งเดือน เพื่อให้เห็นความต่างได้ชัด
  const filled = [];
  for (const value of values) {
    const rows = await apiFetch(`/print-transactions?month=${encodeURIComponent(value)}`);
    if (rows.length) filled.push({ month: value, total: rows.length });
    if (filled.length >= 1) break;
  }
  test.skip(filled.length === 0, "ชุดข้อมูลนี้ไม่มีเดือนที่กรอกไว้แล้ว จึงเทียบความต่างไม่ได้");

  const slow = filled[0].month;
  const empty = values.find((v) => v !== slow && v !== month);

  // หน่วงคำขอของเดือนที่มีข้อมูลไว้ ให้กลับมาช้ากว่าเดือนที่เลือกทีหลัง
  await page.route(`**/api/print-transactions?month=${encodeURIComponent(slow)}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });

  await monthSelect.selectOption(slow);
  await page.waitForTimeout(200);
  await monthSelect.selectOption(empty);

  // รอจนคำตอบของเดือนที่ถูกหน่วงกลับมาแน่ๆ
  await page.waitForTimeout(4000);

  // หัวคอลัมน์ต้องเป็นเดือนที่เลือกล่าสุด
  await assertMonthMatchesPage(page, empty);

  // และยอดที่แสดงต้องเป็นของเดือนนั้น ไม่ใช่ของเดือนที่มาช้า
  const expected = await apiFetch(`/print-transactions?month=${encodeURIComponent(empty)}`);
  const byDevice = new Map(expected.map((r) => [r.device_id, String(r.pages)]));

  const shown = await page.locator('input[aria-label^="ยอดพิมพ์ของ"]').evaluateAll((els) =>
    els.map((el) => ({ label: el.getAttribute("aria-label"), value: el.value }))
  );

  const devices = await apiFetch("/devices?per_page=200");
  const rows = Array.isArray(devices) ? devices : devices.data;
  const bySerial = new Map(rows.map((d) => [d.serial_number, d.id]));

  for (const cell of shown.slice(0, 5)) {
    const serial = cell.label.replace("ยอดพิมพ์ของ ", "");
    const id = bySerial.get(serial);
    const want = byDevice.get(id) ?? "";
    expect(
      cell.value,
      `${serial}: ยอดที่แสดงไม่ใช่ของเดือน ${empty} — คำตอบของเดือนที่มาช้ากว่าทับเดือนที่เลือกอยู่`
    ).toBe(want);
  }
});

test("โหลดยอดของเดือนไม่สำเร็จ ต้องบอกผู้ใช้และห้ามกรอกทับ", async ({ page }) => {
  await page.goto("/print-transactions");

  // ทำให้คำขอยอดรายเดือนล้มทุกครั้ง
  await page.route("**/api/print-transactions?month=*", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: '{"title":"พัง"}' })
  );

  await page.getByRole("radio", { name: "กรอกรายเดือน" }).click();

  // ต้องมีข้อความบอก ไม่ใช่ตารางว่างเปล่าที่ดูเหมือน "ยังไม่มีใครกรอก"
  await expect(page.getByText(/โหลดยอดพิมพ์ของเดือนนี้ไม่สำเร็จ|พัง/)).toBeVisible({ timeout: 15000 });

  // และช่องกรอกต้องถูกล็อก ไม่ให้กรอกทับข้อมูลที่ยังไม่รู้ว่ามีอะไรอยู่
  const inputs = page.locator('input[aria-label^="ยอดพิมพ์ของ"]');
  if ((await inputs.count()) > 0) {
    await expect(inputs.first()).toBeDisabled();
  }
});
