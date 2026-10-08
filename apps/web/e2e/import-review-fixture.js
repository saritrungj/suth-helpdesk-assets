import { assetFixture } from "./asset-fixture.js";

// Dedicated HTTP boundary: real preview shape and preserved processing/failure states.
export async function importReviewFixture(page, { role = "admin", status = "ready" } = {}) {
  await assetFixture(page, role);
  const state = { status, revision: 1, building: { action: "create" }, puts: [], commits: [], delay: 0, failDecisions: false, commitDelay: 0, outcome: "completed", owner: { id: 99, username: "other-admin" } };
  const detail = () => {
    const decided = Boolean(state.building);
    const preview = { writes: state.building?.action === "alias" ? 4 : 5, devices: { create: 2, fill: 0 }, readings: { new: 2, overwrite: 0 }, names: { building: state.building?.action === "create" ? 1 : 0 }, contracts: [], fiscal_years: [], months: ["2026-08"] };
    return {
      id: 41, status: state.status, fingerprint: `review-${state.revision}`,
      file: { name: "review-meter.xlsx", size: 1024, kind: "meter_report" }, owner: state.owner,
      created_at: "2026-09-23T07:00:00.000Z", duplicates: [], events: [],
      can_commit: state.status === "ready" && decided,
      decisions: { names: { building: { "Review building": state.building } } },
      validation: {
        preview, checklist: Array.from({ length: 24 }, (_, n) => ({ key: `check-${n}`, state: decided ? "ok" : "blocking", title: `ตรวจรายการ ${n + 1}`, detail: "รายละเอียดการตรวจไฟล์นำเข้า", action: null })),
        notice: state.outcome === "data_changed" ? { code: "data_changed", message: "ข้อมูลในระบบเปลี่ยน — ตรวจสรุปใหม่ก่อนยืนยัน" } : null,
        contracts: [], registry: {
          summary: { create: 2, fill: 0, unchanged: 0, skip: 1, installed: 2, not_installed: 0, unverified: 0 },
          unresolved: { brand: [], building: [{ name: "Review building", rows: 2, decision: state.building }], division: [] },
          models: [], choices: { brand: [], building: [{ id: 1, name: "อาคารเดิม" }], division: [], meter_categories: [] },
          new_floors: [], new_departments: [], warnings: [], attention_rows: [],
        }, readings: { status: "checked", counts: { new: 2, overwrite: 0, unchanged: 3 }, months: ["2026-08"], invoice: [], errors: [], warnings: [], overwrite_rows: [] },
      },
      error: state.status === "failed" ? { message: "บันทึกไม่สำเร็จ ไม่มีข้อมูลถูกเขียน" } : null,
      completed_at: state.status === "completed" ? "2026-09-23T07:10:00.000Z" : null,
      result: state.status === "completed" ? { devices_created: 2, devices_filled: 0, readings_new: 2, readings_overwritten: 0, months: ["2026-08"] } : null,
    };
  };
  await page.route(/\/api\/import-sessions\/41(?:\/.*)?(?:\?.*)?$/, async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (data, status = 200) => route.fulfill({ status, json: data });
    if (method === "GET") return json(detail());
    const body = route.request().postDataJSON() ?? {};
    if (path.endsWith("/decisions")) {
      state.puts.push(body);
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      if (state.failDecisions) return json({ title: "ตรวจตัวเลือกไม่สำเร็จ" }, 503);
      if (body.fingerprint !== `review-${state.revision}`) return json({ code: "import_session_changed", title: "งานนำเข้าถูกแก้จากหน้าอื่นแล้ว" }, 409);
      state.building = body.decisions.names?.building?.["Review building"] ?? null;
      state.revision++;
      state.status = state.building ? "ready" : "draft";
      return json(detail());
    }
    if (path.endsWith("/commit")) {
      state.commits.push(body);
      if (state.commitDelay) await new Promise(resolve => setTimeout(resolve, state.commitDelay));
      if (body.fingerprint !== `review-${state.revision}`) return json({ code: "import_session_changed", title: "งานนำเข้าถูกแก้จากหน้าอื่นแล้ว" }, 409);
      if (state.outcome === "503") return json({ title: "บันทึกไม่สำเร็จ กรุณาตรวจอีกครั้ง" }, 503);
      state.status = state.outcome === "data_changed" ? "ready" : state.outcome;
      state.revision++;
      return json(detail());
    }
    if (path.endsWith("/validate")) { state.status = "ready"; state.outcome = "completed"; state.revision++; return json(detail()); }
    return json({ title: "not mocked" }, 404);
  });
  return state;
}
