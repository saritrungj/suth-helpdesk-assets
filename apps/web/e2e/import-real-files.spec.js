// apps/web/e2e/import-real-files.spec.js — ไฟล์จริงของผู้ให้เช่า ผ่านงานนำเข้าแบบ session (#180, ชุด db)
//
// รันเฉพาะเครื่องที่มีไฟล์จริง (ไม่อยู่ใน repo เพราะมีเลขเครื่องและชื่อหน่วยงานจริง) และเฉพาะฐานชั่วคราว:
//
//   SUTH_REAL_FILES_DIR=D:\suth-data\raw            ไฟล์ .xls/.xlsx ของผู้ให้เช่า
//   SUTH_REAL_IMPORT_PLAN=D:\suth-data\master-data\vendor-load.json   (ไม่บังคับ) categoryByModel: [{ pattern, category }]
//
// ทุกไฟล์เริ่มจากระบบที่ยังไม่มีสัญญา: สร้างสัญญาจากหัวไฟล์ สร้างชื่อใหม่ทั้งหมด เลือกหมวดตามแผน สร้างปีงบที่ขาด
// แล้วต้อง (1) ยอดตามใบแจ้งหนี้ของระบบตรงกับท้ายแผ่นทุกงวด (ต่างไม่เกิน 1 สตางค์ — ADR-0022) (2) บันทึกสำเร็จ
// (3) หน้าผลลัพธ์พาไปภาพรวมของปีงบได้ ตัวเลขทั้งหมดมาจากไฟล์ ไม่มีค่าจริงตายตัวในเทส

import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { apiFetch, issueToken, reasonToSkip, signIn } from "./fixtures.js";

const API_URL = process.env.SUTH_API_URL || "http://localhost:3000/api";
const DIR = process.env.SUTH_REAL_FILES_DIR;
const PLAN = process.env.SUTH_REAL_IMPORT_PLAN ? JSON.parse(fs.readFileSync(process.env.SUTH_REAL_IMPORT_PLAN, "utf8")) : { categoryByModel: [] };

test.beforeAll(async () => {
  test.skip(!DIR || !fs.existsSync(DIR), "ตั้ง SUTH_REAL_FILES_DIR ให้ชี้โฟลเดอร์ไฟล์จริงของผู้ให้เช่า");
  test.skip(process.env.SUTH_E2E_DISPOSABLE_DB !== "1", "สร้างสัญญาและเครื่องถาวร — รันเฉพาะฐานชั่วคราว");
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
});

async function call(method, url, body) {
  const res = await fetch(`${API_URL}${url}`, {
    method,
    headers: { Cookie: `suth_session=${issueToken()}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

test("ไฟล์จริงทุกไฟล์: สัญญาจากหัวไฟล์ → บันทึก → ยอดตรงกับท้ายแผ่นทุกงวด", async ({ context, page }) => {
  test.setTimeout(600000);
  const categories = await apiFetch("/contracts/meter-categories");
  const categoryId = (code) => categories.find((c) => c.code === code)?.id;
  const files = fs.readdirSync(DIR).filter((name) => /\.xlsx?$/i.test(name)).sort();
  expect(files.length).toBeGreaterThan(0);

  const completed = [];
  for (const name of files) {
    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(path.join(DIR, name))]), name);
    let detail = await call("POST", "/import-sessions", form);
    if (detail.status === "failed") continue; // ไฟล์ที่ไม่ใช่รูปแบบที่รับ (เช่นไฟล์ตัวอย่างเก่า) — ไม่ใช่เป้าของเทสนี้

    const registry = detail.validation.registry;
    const decisions = { names: {}, models: {} };
    for (const kind of ["brand", "building", "division"]) {
      for (const entry of registry?.unresolved?.[kind] ?? []) if (!entry.decision) (decisions.names[kind] ??= {})[entry.name] = { action: "create" };
    }
    for (const model of registry?.models ?? []) {
      if (model.meter_category_id) continue;
      const rule = PLAN.categoryByModel.find((r) => new RegExp(r.pattern, "i").test(model.model));
      if (rule) decisions.models[model.key] = { meter_category_id: categoryId(rule.category), has_color_meter: model.has_color_meter };
    }
    detail = await call("PUT", `/import-sessions/${detail.id}/decisions`, { decisions });

    for (const contract of detail.validation.contracts.filter((c) => c.state === "missing")) {
      const p = contract.prefill;
      detail = await call("POST", `/import-sessions/${detail.id}/contracts`, {
        contract_no: p.contract_no, effective_from: p.effective_from, effective_to: p.effective_to,
        monthly_rental: p.monthly_rental, vat_rate: p.vat_rate,
        price_lines: p.price_lines.map((l) => ({ category_id: l.category_id, price_per_page: l.price_per_page })),
      });
    }
    const fiscal = detail.validation.checklist.find((c) => c.key === "fiscal_years");
    if (fiscal) detail = await call("POST", `/import-sessions/${detail.id}/fiscal-years`, { years: fiscal.action.years });

    expect(detail.can_commit, `${name}: ${JSON.stringify(detail.validation.checklist.filter((c) => c.state !== "ok"))}`).toBe(true);
    const off = (detail.validation.reconciliation ?? []).filter((line) => !line.matches);
    expect(off, `${name}: ยอดตามใบแจ้งหนี้ต่างจากท้ายแผ่น`).toEqual([]);

    detail = await call("POST", `/import-sessions/${detail.id}/commit`);
    expect(detail.status, `${name}: ${JSON.stringify(detail.error ?? detail.validation?.notice)}`).toBe("completed");
    // จำนวนเท่านั้น ไม่พิมพ์เลขเครื่องจริง — รอบมิเตอร์ที่อ่านได้และเครื่องที่ถูกเปลี่ยน (#221)
    console.log(`[real-import] ${name}: เครื่องใหม่ ${detail.result.devices_created} · ยอดใหม่ ${detail.result.readings_new}`
      + ` · รอบมิเตอร์ ${JSON.stringify((detail.result.meter_cycles ?? []).map((c) => c.cycle_day))}`
      + ` · เปลี่ยนเครื่อง ${(detail.result.replaced_devices ?? []).length}`);
    completed.push(detail);
  }
  expect(completed.length).toBeGreaterThan(0);

  // หน้าผลลัพธ์ของงานที่มียอดพาไปภาพรวมของปีงบในไฟล์ได้
  const withReadings = completed.find((d) => d.result.readings_new > 0);
  if (withReadings) {
    await signIn(context);
    await page.goto(`/admin/import/${withReadings.id}`);
    await page.getByTestId("open-dashboard").click();
    await expect(page).toHaveURL(/\/dashboard\?.*fy=\d+/);
  }
});
