// apps/web/e2e/import-session.spec.js — ไฟล์ของผู้ให้เช่า → ฐานข้อมูล → รายงาน ผ่านหน้านำเข้า (#180, ชุด db)
//
// ใช้รายงานมิเตอร์สังเคราะห์ (vendor-workbook.js) รูปเดียวกับไฟล์จริง เริ่มจากสัญญาที่ยังไม่มีในระบบ แล้วทำตามที่หน้า
// บอกทีละข้อ: เลือกชื่อ เลือกหมวดของรุ่น สร้างสัญญาจากหัวไฟล์ (สร้างปีงบถ้ายังไม่มี) บันทึก แล้วไปดูตัวเลขที่หน้า
// ค่าใช้จ่าย — ต้องเท่ากับที่คำนวณจากไฟล์ตามกฎปัดเงินรายรายการราคา (ADR-0022)
//
// ไฟล์จริงสองไฟล์ตรวจที่ import-real-files.spec.js (รันเฉพาะเครื่องที่มีไฟล์)

import { expect, test } from "@playwright/test";
import { apiFetch, reasonToSkip, signIn, writesAllowed } from "./fixtures.js";
import { lastCompletedMonths, meterReportWorkbook } from "./vendor-workbook.js";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
  test.skip(!writesAllowed(), "เทสนี้เขียนข้อมูล — ตั้ง SUTH_E2E_ALLOW_WRITES=1 และชี้ API ไปที่ฐานทดสอบ");
});

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

const run = `${Date.now() % 100000}`;
const CATEGORY_OF = { "HL-L5210DN": "A4 เลเซอร์ ขาวดำ", "MFP E78635DN": "A3 ขาวดำ" };

function syntheticFile(tag) {
  const months = lastCompletedMonths(2);
  const common = { division: `ฝ่ายทดสอบ ${tag}`, department: "งานทดสอบ", building: `อาคารทดสอบ ${tag}`, floor: "2" };
  return {
    contractNo: `TEST${tag}/2569`,
    months,
    ...meterReportWorkbook({
      contractNo: `TEST${tag}/2569`,
      months,
      devices: [
        { serial: `TX9-${tag}-01`, model: "Brother HL-L5210DN", place: "เคาน์เตอร์ 1", ...common, price: 0.365, pages: [771, 157] },
        { serial: `TX9-${tag}-02`, model: "Brother HL-L5210DN", place: "เคาน์เตอร์ 2", ...common, price: 0.365, pages: [1505, 357] },
        { serial: `TX9-${tag}-03`, model: "HP MFP E78635DN", place: "ห้องถ่ายเอกสาร", ...common, price: 0.35, pages: [3000, 2500], color: { price: 3.9, pages: [120, 95] } },
        { serial: `TX9-${tag}-04`, model: "Brother HL-L5210DN", place: "เครื่องสำรอง", ...common, price: 0.365, pages: [0, 0], spare: true },
      ],
    }),
  };
}

async function upload(page, name, buffer) {
  await page.goto("/admin/import");
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await expect(page).toHaveURL(/\/admin\/import\/\d+$/, { timeout: 60000 });
  await expect(page.getByTestId("import-checklist")).toBeVisible();
  return Number(page.url().split("/").pop());
}

const item = (page, key) => page.locator(`[data-testid=checklist-item]`, { hasText: key });

test("ไฟล์รายงานมิเตอร์ → สร้างสัญญาจากหัวไฟล์ → บันทึก → หน้าค่าใช้จ่ายได้ยอดเท่าที่คำนวณจากไฟล์", async ({ page }) => {
  test.skip(process.env.SUTH_E2E_DISPOSABLE_DB !== "1", "สร้างสัญญาและเครื่องถาวร — รันเฉพาะฐานชั่วคราวของ verify:db");
  test.setTimeout(180000);
  const file = syntheticFile(`A${run}`);
  const id = await upload(page, "meter-report.xlsx", file.buffer);

  // 1) สัญญายังไม่มี → หน้าบอกเป็นข้อแรกที่ต้องทำ
  await expect(item(page, `ยังไม่มีสัญญา ${file.contractNo}`)).toHaveAttribute("data-state", "blocking");
  await expect(page.getByTestId("import-commit")).toBeDisabled();
  // ราคาของสัญญาที่เติมจากไฟล์ขึ้นกับหมวดของรุ่น — ยังไม่เลือกหมวด = ยังไม่ครบ และยังสร้างสัญญาไม่ได้
  // (เคยบอกว่า "หมวดครบแล้ว" ตั้งแต่อัปโหลด แล้วสัญญาถูกสร้างโดยไม่มีรายการราคา — พบกับไฟล์จริง)
  await expect(item(page, "ยังต้องเลือกหมวดมิเตอร์ของรุ่นใหม่")).toHaveAttribute("data-state", "blocking");
  await expect(page.getByTestId("create-contract")).toBeDisabled();

  // 2) ชื่อที่ไม่รู้จัก → สร้างใหม่ทั้งหมด (อาคาร/ฝ่ายของเทสนี้ไม่มีในฐาน)
  for (const kind of ["brand", "building", "division"]) {
    const section = page.getByTestId(`unresolved-${kind}`);
    if (await section.count()) await section.getByRole("button", { name: "สร้างใหม่ทุกชื่อที่ยังไม่เลือก" }).click();
  }
  // 3) หมวดมิเตอร์ของรุ่น — เครื่อง A3 มีสองแถวในไฟล์ ระบบรู้เองว่ามีมิเตอร์สี
  for (const [model, category] of Object.entries(CATEGORY_OF)) {
    const select = page.getByRole("combobox", { name: `หมวดมิเตอร์ของรุ่น ${model}` });
    if (await select.count()) await select.selectOption({ label: category });
  }
  await expect(item(page, "ชื่อยี่ห้อ อาคาร ฝ่าย ครบแล้ว")).toBeVisible({ timeout: 30000 });
  await expect(item(page, "หมวดมิเตอร์ของทุกรุ่นครบแล้ว")).toBeVisible({ timeout: 30000 });

  // 4) ฟอร์มสัญญาเติมจากหัวไฟล์: อายุ 36 งวดจากเลขงวด และราคาต่อหน้าจากคอลัมน์ Cost/Click
  await expect(page.getByRole("textbox", { name: "ราคาต่อหน้า A4 เลเซอร์ ขาวดำ" })).toHaveValue("0.365");
  await expect(page.getByRole("textbox", { name: "ราคาต่อหน้า A3 ขาวดำ" })).toHaveValue("0.35");
  await expect(page.getByRole("textbox", { name: "ราคาต่อหน้า A3 สี" })).toHaveValue("3.9");
  await page.getByTestId("create-contract").click();
  await expect(item(page, `สัญญา ${file.contractNo} ตรงกับไฟล์`)).toBeVisible({ timeout: 30000 });

  const fiscal = item(page, "ยังไม่มีปีงบ");
  if (await fiscal.count()) {
    await fiscal.getByRole("button", { name: "สร้างปีงบ" }).click();
    await expect(fiscal).toHaveCount(0, { timeout: 30000 });
  }

  // 5) ยอดตามใบแจ้งหนี้ของระบบเทียบท้ายแผ่นแล้วตรงทุกงวด (ต่างไม่เกิน 1 สตางค์)
  await expect(item(page, "ยอดตามใบแจ้งหนี้ตรงกับท้ายแผ่นทุกงวด")).toBeVisible();
  await expect(page.getByTestId("readings-new")).toHaveText(String(file.months.length * 4));

  // 6) บันทึก
  await expect(page.getByTestId("import-commit")).toBeEnabled();
  await page.getByTestId("import-commit").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByTestId("import-result")).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("import-status")).toHaveText("บันทึกแล้ว");

  // 7) ข้อมูลถึงฐานและต่อกันครบ: เครื่อง 4 เครื่อง (สำรอง 1) ผูกสัญญา มีที่มาเป็นงานนี้
  const devices = await apiFetch("/devices");
  const ours = (Array.isArray(devices) ? devices : devices.data ?? []).filter((d) => d.serial_number.startsWith(`TX9-A${run}-`));
  expect(ours).toHaveLength(4);
  const detail = await apiFetch(`/import-sessions/${id}`);
  expect(detail.result).toMatchObject({ devices_created: 4, readings_new: file.months.length * 4 });
  expect(detail.events.map((e) => e.event)).toEqual(expect.arrayContaining(["uploaded", "contract_created", "completed"]));

  // 8) ไปหน้าภาพรวมจากปุ่มในผลลัพธ์ แล้วหน้าค่าใช้จ่ายของปีงบเดียวกัน — ยอดของสัญญานี้เท่ากับที่คำนวณจากไฟล์
  await page.getByTestId("open-dashboard").click();
  await expect(page).toHaveURL(/\/dashboard\?.*fy=\d+/);
  const fy = new URL(page.url()).searchParams.get("fy");
  const expense = await apiFetch(`/expense/${fy}?month=${file.months.join(",")}`);
  const contract = expense.contracts.find((c) => c.contract_no === file.contractNo);
  const expected = file.months.reduce((sum, month) => sum + file.expected.costByMonth[month], 0);
  expect(Number(contract.total_cost)).toBeCloseTo(expected, 2);

  await page.goto(`/expense?fy=${fy}`);
  await expect(page.getByText(file.contractNo)).toBeVisible();
});

test("ออกจากหน้ากลางงานแล้วกลับมา — ไฟล์ ผลตรวจ และสิ่งที่เลือกไว้ยังอยู่ ทั้งกลับจากรายการงานค้างและรีเฟรช", async ({ page }) => {
  const file = syntheticFile(`B${run}`);
  const id = await upload(page, "meter-report-b.xlsx", file.buffer);
  const building = `อาคารทดสอบ B${run}`;
  try {
    await page.getByRole("combobox", { name: `ตัดสินชื่อ ${building}` }).selectOption({ label: "สร้างอาคารใหม่ชื่อนี้" });

    // ออกทันทีด้วยเมนู — หน้าส่งสิ่งที่เลือกเข้างานให้เสร็จก่อนออก
    await page.locator('aside a[href="/dashboard"]').first().click();
    await expect(page).toHaveURL(/\/dashboard/);
    const saved = await apiFetch(`/import-sessions/${id}`);
    expect(saved.decisions.names.building[building]).toEqual({ action: "create" });

    await page.locator('aside a[href="/admin/import"]').first().click();
    const row = page.getByTestId("import-session-row").filter({ hasText: "meter-report-b.xlsx" }).first();
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: "ทำต่อ" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/import/${id}$`));
    await expect(page.getByRole("combobox", { name: `ตัดสินชื่อ ${building}` })).toHaveValue("create");
    await expect(item(page, `ยังไม่มีสัญญา ${file.contractNo}`)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("combobox", { name: `ตัดสินชื่อ ${building}` })).toHaveValue("create");
  } finally {
    await apiFetch(`/import-sessions/${id}/abandon`, { method: "POST", body: JSON.stringify({ reason: "e2e cleanup" }) });
  }
});
