// apps/web/e2e/import-session-fixture.js — /api/import-sessions จำลองที่จำสถานะ (#180)
//
// งานนำเข้าอยู่ "บนเซิร์ฟเวอร์" ของ fixture นี้ การตัดสินใจที่หน้าเว็บส่งมาถูกเก็บ และ GET ครั้งถัดไปคืนผลตรวจ
// ตามการตัดสินใจนั้น — จึงทดสอบได้ว่าออกจากหน้าแล้วกลับมา หน้าได้สิ่งที่เลือกไว้คืนจากเซิร์ฟเวอร์ ไม่ใช่จากความจำของหน้า
// เส้นทางเขียนฐานจริงอยู่ที่ import-session.spec.js (ชุด db)

const BUILDING = "ศูนย์ ก (EMC)";
const MODEL_KEY = "oki|es5112";

function validationFor(decisions, { contractCreated }) {
  const building = decisions?.names?.building?.[BUILDING] ?? null;
  const model = decisions?.models?.[MODEL_KEY] ?? null;
  const decided = Boolean(building && model && contractCreated);
  const checklist = [
    { key: "file", state: "ok", title: "อ่านไฟล์ได้: รายงานมิเตอร์ 1 แผ่น", detail: "งวด 2026-08 ถึง 2026-08", action: null },
    contractCreated
      ? { key: "contract:TEST1/2569", state: "ok", title: "สัญญา TEST1/2569 ตรงกับไฟล์", detail: null, action: null }
      : { key: "contract:TEST1/2569", state: "blocking", title: "ยังไม่มีสัญญา TEST1/2569 ในระบบ", detail: "สร้างจากหัวไฟล์ได้เลย", action: { type: "create_contract", contract_key: "TEST1/2569" } },
    building
      ? { key: "names", state: "ok", title: "ชื่อยี่ห้อ อาคาร ฝ่าย ครบแล้ว", detail: null, action: null }
      : { key: "names", state: "blocking", title: "ยังต้องเลือกชื่อยี่ห้อ/อาคาร/ฝ่ายที่ไม่รู้จัก 1 ชื่อ", detail: null, action: { type: "decide_names" } },
    model
      ? { key: "models", state: "ok", title: "หมวดมิเตอร์ของทุกรุ่นครบแล้ว", detail: null, action: null }
      : { key: "models", state: "blocking", title: "ยังต้องเลือกหมวดมิเตอร์ของรุ่นใหม่ 1 รุ่น", detail: null, action: { type: "decide_models" } },
    decided
      ? { key: "readings", state: "ok", title: "ยอดมิเตอร์: ใหม่ 2 · เขียนทับ 0 · ไม่เปลี่ยน 0", detail: null, action: null }
      : { key: "readings", state: "waiting", title: "ยอดมิเตอร์: รอให้ข้อมูลเครื่องพร้อมก่อน", detail: null, action: null },
  ];
  return {
    validated_at: new Date().toISOString(),
    kind: "meter_report",
    can_commit: decided,
    checklist,
    registry: {
      sheets: [{ sheet: "งวด 8", kind: "meter_report", contract_no: "TEST1/2569", rows: 2, notes: [] }],
      errors: [],
      summary: { create: decided ? 2 : 0, fill: 0, unchanged: 0, skip: 0, pending: decided ? 0 : 2, installed: decided ? 2 : 0, not_installed: 0, unverified: 0 },
      blocking: [],
      unresolved: { brand: [], building: [{ name: BUILDING, rows: 2, decision: building }], division: [] },
      models: [{ key: MODEL_KEY, brand: "OKI", model: "ES5112", rows: 2, meter_category_id: model?.meter_category_id ?? null, has_color_meter: false, source: model ? "decision" : null, required: true }],
      contracts: [{ contract_no: "TEST1/2569", contract_id: contractCreated ? 7 : null, rows: 2 }],
      new_floors: [],
      new_departments: [],
      warning_count: 0,
      warnings: [],
      row_count: 2,
      attention_rows: [],
      choices: {
        brand: [{ id: 1, name: "OKI" }],
        building: [{ id: 1, name: "อาคารผู้ป่วยนอก" }],
        division: [{ id: 1, name: "ฝ่ายการพยาบาล" }],
        meter_categories: [{ id: 2, code: "a4-laser-bw", name: "A4 เลเซอร์ ขาวดำ" }],
      },
    },
    readings: decided
      ? { status: "checked", format: "vendor", months: ["2026-08"], counts: { new: 2, overwrite: 0, unchanged: 0 }, overwrite_rows: [], error_count: 0, errors: [], warning_count: 0, warnings: [], invoice: [] }
      : { status: "waiting" },
    contracts: contractCreated
      ? [{ key: "TEST1/2569", contract_no: "TEST1/2569", state: "ok", file: null, system: { id: 7, contract_no: "TEST1/2569", effective_from: "2026-02-24", effective_to: "2029-02-23", monthly_rental: null, vat_rate: null }, prefill: null, issues: [] }]
      : [{
          key: "TEST1/2569",
          contract_no: "TEST1/2569",
          state: "missing",
          file: null,
          system: null,
          prefill: {
            contract_no: "TEST1/2569", effective_from: "2026-02-24", effective_to: "2029-02-23", monthly_rental: null, vat_rate: null,
            price_lines: model ? [{ category_id: 2, category_name: "A4 เลเซอร์ ขาวดำ", price_per_page: "0.41" }] : [],
            unmapped_models: model ? [] : ["OKI ES5112"], term_source: "installments",
          },
          issues: [],
        }],
    reconciliation: [],
    fiscal_years: { months: ["2026-08"], needed: ["2569"], missing: [] },
  };
}

export async function importSessionFixture(page) {
  const state = {
    decisions: {},
    contractCreated: false,
    status: "draft",
    puts: [],
    contractBodies: [],
    commits: 0,
    uploaded: false,
  };
  const detail = () => {
    const validation = validationFor(state.decisions, state);
    if (state.status !== "completed") state.status = validation.can_commit ? "ready" : "draft";
    return {
      id: 41,
      status: state.status,
      file: { name: "meter-report.xlsx", size: 1024, sha256: "x", kind: "meter_report" },
      owner: { id: 1, username: "admin" },
      created_at: "2026-09-23T07:00:00.000Z",
      last_activity_at: "2026-09-23T07:05:00.000Z",
      last_activity_by: { id: 1, username: "admin" },
      completed_at: state.status === "completed" ? "2026-09-23T07:10:00.000Z" : null,
      decisions: state.decisions,
      validation,
      can_commit: state.status === "ready",
      result: state.status === "completed" ? { devices_created: 2, devices_filled: 0, readings_new: 2, readings_overwritten: 0, months: ["2026-08"] } : null,
      error: null,
      duplicates: [],
      events: [{ id: 1, event: "uploaded", detail: { file_name: "meter-report.xlsx" }, created_at: "2026-09-23T07:00:00.000Z", actor_username: "admin" }],
    };
  };

  await page.route(/\/api\/import-sessions(?:\/.*)?(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/import-sessions\/?/, "");
    const method = route.request().method();
    const json = (data, status = 200) => route.fulfill({ status, json: data });

    if (path === "" && method === "GET") {
      return json(state.uploaded ? [{
        id: 41, status: state.status, file_name: "meter-report.xlsx", file_kind: "meter_report",
        owner: { id: 1, username: "admin" }, created_at: "2026-09-23T07:00:00.000Z",
        last_activity_at: "2026-09-23T07:05:00.000Z", last_activity_by: { id: 1, username: "admin" },
        completed_at: null, headline: { devices_create: 0, devices_fill: 0, readings_new: 0, readings_overwrite: 0 }, blocking: 2,
      }] : []);
    }
    if (path === "" && method === "POST") {
      state.uploaded = true;
      return json(detail(), 201);
    }
    if (path === "41" && method === "GET") return json(detail());
    if (path === "41/decisions" && method === "PUT") {
      state.decisions = route.request().postDataJSON().decisions;
      state.puts.push(state.decisions);
      return json(detail());
    }
    if (path === "41/contracts" && method === "POST") {
      state.contractBodies.push(route.request().postDataJSON());
      state.contractCreated = true;
      return json(detail());
    }
    if (path === "41/validate" && method === "POST") return json(detail());
    if (path === "41/commit" && method === "POST") {
      state.commits += 1;
      state.status = "completed";
      return json(detail());
    }
    return json({ title: "not mocked", code: "not_found" }, 404);
  });
  return state;
}
