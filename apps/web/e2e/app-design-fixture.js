import { prototypeFixture } from "./prototype-fixture.js";
import { accessibilityPageFixture } from "./accessibility-page-fixture.js";

// Reuse HTTP fixtures at their existing boundary; never use component internals
// or permit synthetic data to reach the business API.
export async function appDesignFixture(page, target) {
  if (target.fixture) return accessibilityPageFixture(page, target, "data", "admin");
  const state = await prototypeFixture(page, "admin");
  await page.route(/\/api\/users(?:\?.*)?$/, route => route.fulfill({ json: [
    { id: 2, username: "synthetic-viewer", role: "viewer", full_name: "ผู้ใช้ทดสอบระบบ", created_at: "2026-10-01T00:00:00Z" },
  ] }));
  await page.route(/\/api\/devices\/installation-review(?:\?.*)?$/, route => route.fulfill({ json: { devices: [
    { id: 1, serial_number: "SUTH-001", model: "Office 400", building_name: "อาคารผู้ป่วยนอก", department_name: "หน่วยบริการผู้ป่วยนอกและประสานงานการรักษาต่อเนื่อง", reading_count: 1, first_month: "2026-08", last_month: "2026-08" },
  ] } }));
  await page.goto(target.url.replace(":fixture", "1"));
  return state;
}
