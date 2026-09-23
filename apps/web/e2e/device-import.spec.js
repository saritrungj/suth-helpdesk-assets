import { expect, test } from "@playwright/test";
import { assetFixture } from "./asset-fixture.js";

// นำเข้าทะเบียนเครื่องจากไฟล์ดิบ (#132): ตรวจก่อน ผู้ดูแลตัดสินชื่อที่ไม่รู้จักและหมวดของรุ่น
// หน้าตรวจใหม่ตามสิ่งที่เลือก แล้วบันทึกได้เมื่อ API บอกว่าครบเท่านั้น

function planFor(decisions) {
  const building = decisions?.names?.building?.["ศูนย์ ก (EMC)"];
  const model = decisions?.models?.["oki|es5112"];
  const decided = Boolean(building && model);
  return {
    mode: "preview",
    valid: decided,
    blocking: [
      ...(building ? [] : [{ code: "undecided_building", count: 1 }]),
      ...(model ? [] : [{ code: "undecided_model", count: 1 }]),
    ],
    sheets: [{ sheet: "OKI", kind: "registry", header_row: 3, contract_no: "SUTH-2569", rows: 2, notes: ["คอลัมน์ฝ่ายไม่มีหัวตาราง"] }],
    errors: [],
    warnings: [{ sheet: "OKI", row: 5, serial_number: "TEST-WB1", reason: 'เลขซีเรียลคล้าย "TEST-BW1" ที่มีในระบบแล้ว — ตรวจว่าพิมพ์ผิดหรือไม่' }],
    summary: { create: decided ? 2 : 0, fill: 0, unchanged: 0, skip: 0, pending: decided ? 0 : 2, installed: decided ? 2 : 0, not_installed: 0, unverified: 0 },
    unresolved: { brand: [], building: [{ name: "ศูนย์ ก (EMC)", rows: 2, decision: building ?? null }], division: [] },
    models: [{ key: "oki|es5112", brand: "OKI", model: "ES5112", rows: 2, meter_category_id: model?.meter_category_id ?? null, has_color_meter: false, source: model ? "decision" : null, required: true }],
    contracts: [{ contract_no: "SUTH-2569", contract_id: 1, rows: 2 }],
    new_floors: [], new_departments: [],
    rows: [
      { sheet: "OKI", row: 4, serial_number: "TEST-001", action: decided ? "create" : "pending", reasons: [], notes: [], waiting: [], fill: [], installation: "installed", building: "ศูนย์ ก (EMC)", division: "ฝ่ายการพยาบาล" },
      { sheet: "OKI", row: 5, serial_number: "TEST-WB1", action: decided ? "create" : "pending", reasons: [], notes: ["มีชั้นแต่ไม่มีอาคาร — ไม่บันทึกชั้น"], waiting: [], fill: [], installation: "installed", building: "ศูนย์ ก (EMC)", division: "ฝ่ายการพยาบาล" },
    ],
    choices: {
      brand: [{ id: 1, name: "SUTH Printer" }],
      building: [{ id: 1, name: "อาคารผู้ป่วยนอก" }],
      division: [{ id: 1, name: "ฝ่ายการพยาบาล" }],
      meter_categories: [{ id: 2, code: "a4-laser-bw", name: "A4 เลเซอร์ ขาวดำ" }],
    },
  };
}

/** ช่อง multipart ชื่อหนึ่งจาก body ของคำขอ */
function field(body, name) {
  const match = body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`));
  return match ? match[1] : "";
}

test("registry import asks for unknown names and model category, re-checks, then saves", async ({ page }) => {
  await assetFixture(page, "admin");
  const requests = [];
  await page.route("**/api/devices/import", async (route) => {
    const body = route.request().postData() || "";
    const mode = field(body, "mode");
    const decisions = JSON.parse(field(body, "decisions") || "{}");
    requests.push({ mode, decisions });
    if (mode === "commit") return route.fulfill({ json: { ...planFor(decisions), mode, created: 2, filled: 0 } });
    return route.fulfill({ json: planFor(decisions) });
  });

  await page.goto("/admin/add-asset?tab=import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "registry.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("placeholder"),
  });
  await page.getByRole("button", { name: "ตรวจไฟล์", exact: true }).click();

  await expect(page.getByTestId("registry-sheet")).toContainText("OKI");
  await expect(page.getByTestId("registry-blocking")).toBeVisible();
  await expect(page.getByTestId("registry-warnings")).toContainText("TEST-BW1");
  const save = page.getByTestId("registry-commit");
  await expect(save).toBeDisabled();

  // ตัดสิน: สร้างอาคารใหม่ด้วยชื่อทางการ และเลือกหมวดของรุ่น
  await page.getByRole("combobox", { name: "ตัดสินชื่อ ศูนย์ ก (EMC)" }).selectOption("create");
  const officialName = page.getByRole("textbox", { name: "ชื่อที่จะใช้ในระบบสำหรับ ศูนย์ ก (EMC)" });
  await expect(officialName).toHaveValue("ศูนย์ ก (EMC)");
  await officialName.fill("อาคารศูนย์ ก");
  await page.getByRole("combobox", { name: "หมวดมิเตอร์ของรุ่น ES5112" }).selectOption("2");

  // หน้าตรวจใหม่เองหลังเลือก แล้วปุ่มบันทึกเปิด
  await expect(page.getByTestId("registry-blocking")).toBeHidden();
  await expect(page.getByTestId("summary-create")).toHaveText("2");
  await expect(save).toBeEnabled();
  await save.click();

  await expect(page.getByTestId("registry-import-result")).toContainText("2");
  const commit = requests.find((r) => r.mode === "commit");
  expect(commit.decisions).toEqual({
    names: { building: { "ศูนย์ ก (EMC)": { action: "create", as: "อาคารศูนย์ ก" } } },
    models: { "oki|es5112": { meter_category_id: 2, has_color_meter: false } },
  });
  expect(requests[0]).toEqual({ mode: "preview", decisions: { names: {}, models: {} } });
});
