// apps/web/e2e/audit-log.spec.js — ประวัติการแก้ไขและกันกรอกยอดทับกัน (audit 2026-09-24 F05, F06, ADR-0035)
//
// ยอดพิมพ์คือฐานของทุกบาท: การแก้ยอดต้องบอกได้ว่าใครแก้ เมื่อไร จากค่าอะไรเป็นค่าอะไร
// และคนที่เปิดหน้าไว้ก่อนแล้วกดบันทึกทีหลัง ต้องไม่ทับค่าที่อีกคนเพิ่งแก้ไปเงียบๆ

import { expect, test } from "@playwright/test";
import { apiFetch, issueToken, reasonToSkip, signIn, writesAllowed } from "./fixtures.js";

const API_URL = process.env.SUTH_API_URL || "http://localhost:3000/api";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
  test.skip(!writesAllowed(), "เทสนี้แก้ยอดพิมพ์ในฐานทดสอบแยก แล้วคืนค่าเดิม");
});

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

/** POST แบบไม่โยน error — ต้องดูสถานะ 409 ได้ */
async function post(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `suth_session=${issueToken()}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test("แก้ยอดพิมพ์แล้วประวัติบอกผู้ทำและค่าเดิม→ใหม่ และคนที่เห็นค่าเก่าบันทึกทับไม่ได้", async ({ page }) => {
  const [reading] = await apiFetch("/print-transactions");
  test.skip(!reading, "ฐานทดสอบยังไม่มียอดพิมพ์");
  const original = Number(reading.pages);
  const changed = original + 7;

  const saved = await post("/print-transactions", { device_id: reading.device_id, month: reading.month, pages: changed, previous: original });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);

  // คนที่เปิดหน้าไว้ก่อน (ยังเห็นค่าเดิม) กดบันทึก → 409 ไม่ทับ
  const stale = await post("/print-transactions", { device_id: reading.device_id, month: reading.month, pages: original + 99, previous: original });
  expect(stale.status).toBe(409);
  expect(stale.body.code).toBe("reading_changed");
  expect(stale.body.conflicts[0]).toMatchObject({ device_id: reading.device_id, month: reading.month, current: changed, yours: original });

  const log = await apiFetch(`/audit-log?device_id=${reading.device_id}&per_page=5`);
  const entry = log.rows.find((row) => row.entity === "print_reading" && row.entity_key === reading.month);
  expect(entry).toMatchObject({ action: "update", username: "admin", before: { pages: original }, after: { pages: changed } });

  // หน้าประวัติการแก้ไขแสดงรายการเดียวกัน
  await page.goto("/admin/audit-log");
  await expect(page.getByRole("heading", { level: 1, name: "ประวัติการแก้ไข" })).toBeVisible();
  await expect(page.getByTestId("audit-log-table")).toContainText(`เดือน ${reading.month}: ${original.toLocaleString("th-TH")} → ${changed.toLocaleString("th-TH")}`);

  // หน้ารายละเอียดเครื่องมีประวัติของเครื่องนั้น
  await page.goto(`/assets/${reading.device_id}`);
  await expect(page.getByTestId("device-audit")).toContainText(`เดือน ${reading.month}`);

  // คืนค่าเดิม
  const restored = await post("/print-transactions", { device_id: reading.device_id, month: reading.month, pages: original, previous: changed });
  expect(restored.status).toBe(200);
});

test("ผู้ใช้ที่ไม่ใช่ผู้ดูแลดูประวัติการแก้ไขไม่ได้", async () => {
  const res = await fetch(`${API_URL}/audit-log`, { headers: { Cookie: `suth_session=${issueToken("staff")}` } });
  expect(res.status).toBe(403);
});
