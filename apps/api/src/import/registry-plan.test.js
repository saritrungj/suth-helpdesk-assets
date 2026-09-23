// apps/api/src/import/registry-plan.test.js — วางแผนนำเข้าทะเบียนเครื่อง (#132)

const test = require("node:test");
const assert = require("node:assert/strict");

const { planRegistryImport, likelyTypo } = require("./registry-plan");

const CATEGORIES = [
  { id: 1, code: "bw", name: "ขาวดำ", is_color: 0 },
  { id: 2, code: "a4-laser-bw", name: "A4 เลเซอร์ ขาวดำ", is_color: 0 },
  { id: 4, code: "a3-bw", name: "A3 ขาวดำ", is_color: 0 },
  { id: 5, code: "a3-color", name: "A3 สี", is_color: 1 },
];
const CONTRACT = { id: 10, contract_no: "TEST 9/2567", effective_from: "2024-09-29", category_ids: [2, 4] };

function row(overrides = {}) {
  return {
    sheet: "OKI", row: 4, serial_number: "TESTSN0001", brand: "OKI", model: "ES5112",
    building: "อาคาร ก (A)", floor: "5", division: "ฝ่าย ก", department: "งาน ก", location: "เคาน์เตอร์",
    contract_no: "TEST 9/2567", status: "active", installation: "installed", installed_on: null,
    meter_category: "", price_override: "", has_color_meter: false,
    ...overrides,
  };
}

function master({ buildings = [], buildingAliases = [], brands = [], divisions = [] } = {}) {
  return {
    brand: { names: brands, aliases: [] },
    building: { names: buildings, aliases: buildingAliases },
    division: { names: divisions, aliases: [] },
  };
}

function plan(rows, options = {}) {
  return planRegistryImport({
    rows,
    master: options.master ?? master(),
    floors: options.floors ?? [],
    departments: options.departments ?? [],
    contracts: options.contracts ?? [CONTRACT],
    categories: CATEGORIES,
    devices: options.devices ?? [],
    decisions: options.decisions,
    today: "2026-09-22",
  });
}

const allCreate = {
  names: {
    brand: { OKI: { action: "create" } },
    building: { "อาคาร ก (A)": { action: "create" } },
    division: { "ฝ่าย ก": { action: "create" } },
  },
  models: { "oki|es5112": { meter_category_id: 2 } },
};

test("ฐานว่าง: ชื่อที่ไม่รู้จักและหมวดของรุ่นต้องถูกตัดสินก่อน ไม่สร้างเอง", () => {
  const result = plan([row()]);
  assert.equal(result.valid, false);
  assert.deepEqual(result.blocking.map((b) => b.code), ["undecided_brand", "undecided_building", "undecided_division", "undecided_model"]);
  assert.equal(result.rows[0].action, "pending");
  assert.deepEqual(result.unresolved.building, [{ name: "อาคาร ก (A)", rows: 1, decision: null }]);
});

test("ตัดสินครบแล้วสร้างเครื่องได้ พร้อมชั้นและแผนกใหม่ใต้รายการที่สร้าง", () => {
  const result = plan([row()], { decisions: allCreate });
  assert.equal(result.valid, true);
  const [created] = result.rows;
  assert.equal(created.action, "create");
  assert.equal(created.values.building_id, "new:building:อาคาร ก (a)");
  assert.equal(created.values.meter_category_id, 2);
  // ไม่มีวันในไฟล์ = รู้แค่ว่าติดตั้งอยู่วันนี้ ยืนยันย้อนหลังไม่ได้ (ADR-0018 Q21)
  assert.equal(created.values.installed_on, "2026-09-22");
  assert.equal(created.values.installed_on_known, false);
  assert.deepEqual(result.new_floors.map((f) => f.name), ["5"]);
  assert.deepEqual(result.new_departments.map((d) => d.name), ["งาน ก"]);
});

test("ชื่อเรียกอื่นในระบบจับคู่ได้เองโดยไม่ต้องถาม", () => {
  const result = plan([row()], {
    master: master({
      brands: [{ id: 1, name: "OKI" }],
      buildings: [{ id: 3, name: "อาคาร ก" }],
      buildingAliases: [{ target_id: 3, alias: "อาคาร ก (A)" }],
      divisions: [{ id: 7, name: "ฝ่าย ก" }],
    }),
    floors: [{ id: 30, building_id: 3, name: "ชั้น 5" }],
    departments: [{ id: 70, division_id: 7, name: "งาน ก" }],
    decisions: { models: { "oki|es5112": { meter_category_id: 2 } } },
  });
  assert.equal(result.valid, true);
  const { values } = result.rows[0];
  assert.equal(values.building_id, 3);
  assert.equal(values.floor_id, 30); // "5" = "ชั้น 5"
  assert.equal(values.department_id, 70);
  assert.equal(result.new_floors.length, 0);
});

test("ชื่อเรียกอื่นของรายการที่กำลังสร้างในไฟล์เดียวกัน", () => {
  const result = plan([row(), row({ serial_number: "TESTSN0002", building: "อาคาร ก" })], {
    decisions: {
      ...allCreate,
      names: { ...allCreate.names, building: { "อาคาร ก": { action: "create" }, "อาคาร ก (A)": { action: "alias", target_new: "อาคาร ก" } } },
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.rows[0].values.building_id, result.rows[1].values.building_id);
  assert.equal(result.new_floors.length, 1); // ชั้น 5 ของอาคารเดียวกัน สร้างครั้งเดียว
});

test("ไฟล์ระบุสัญญาที่ยังไม่มีในระบบ = หยุด ให้สร้างสัญญาก่อน", () => {
  const result = plan([row()], { contracts: [], decisions: allCreate });
  assert.equal(result.valid, false);
  assert.deepEqual(result.blocking.find((b) => b.code === "missing_contract").contracts, ["TEST 9/2567"]);
  assert.equal(result.rows[0].action, "skip");
});

test("หมวดที่สัญญาไม่มีราคา = ข้ามแถว เพราะยอดพิมพ์จะหาราคาไม่ได้", () => {
  const result = plan([row()], { decisions: { ...allCreate, models: { "oki|es5112": { meter_category_id: 1 } } } });
  assert.equal(result.rows[0].action, "skip");
  assert.match(result.rows[0].reasons[0], /ไม่มีราคาหมวด "ขาวดำ"/);
});

test("เครื่องมีมิเตอร์สีแต่สัญญาไม่มีราคาสี = ข้ามแถว", () => {
  const result = plan([row({ has_color_meter: true })], { decisions: allCreate });
  assert.match(result.rows[0].reasons.join(), /มิเตอร์สี/);
});

test("รุ่นที่มีในระบบแล้วใช้หมวดเดิม ไม่ถามซ้ำ", () => {
  const result = plan([row({ serial_number: "TESTSN0009" })], {
    master: master({ brands: [{ id: 1, name: "OKI" }] }),
    devices: [{ id: 1, serial_number: "TESTSN0001", brand_id: 1, model: "ES5112", meter_category_id: 2, has_color_meter: 0 }],
    decisions: { names: allCreate.names },
  });
  assert.equal(result.models[0].source, "existing");
  assert.equal(result.rows[0].values.meter_category_id, 2);
});

test("เครื่องที่มีอยู่แล้ว: เติมที่ตั้งเมื่อในระบบยังว่าง ไม่เขียนทับเมื่อมีค่าแล้ว", () => {
  const known = master({ brands: [{ id: 1, name: "OKI" }], buildings: [{ id: 3, name: "อาคาร ก (A)" }], divisions: [{ id: 7, name: "ฝ่าย ก" }] });
  const empty = { id: 1, serial_number: "TESTSN0001", brand_id: 1, model: "ES5112", meter_category_id: 2, contract_id: 10 };
  const filled = plan([row()], { master: known, devices: [empty], decisions: allCreate });
  assert.equal(filled.rows[0].action, "fill");
  assert.ok(filled.rows[0].fill.includes("building_id"));

  const located = { ...empty, building_id: 99, location: "ที่อื่น" };
  const kept = plan([row()], { master: known, devices: [located], decisions: allCreate });
  assert.ok(!kept.rows[0].fill.includes("building_id"));
  assert.ok(!kept.rows[0].fill.includes("location"));
  assert.ok(kept.rows[0].fill.includes("division_id")); // ช่องที่ยังว่างยังเติมได้
  assert.match(kept.warnings[0].reason, /ไม่ย้ายเครื่องจากการนำเข้า/);

  const same = { ...empty, building_id: 3, location: "เคาน์เตอร์", division_id: 7, floor_id: 1, department_id: 1 };
  const nothing = plan([row({ floor: "", department: "" })], { master: known, devices: [same], decisions: allCreate });
  assert.equal(nothing.rows[0].action, "unchanged");
  assert.equal(nothing.warnings.length, 0);
});

test("เครื่องที่ลงจากรายงานมิเตอร์ (มีแค่ชื่อจุดติดตั้ง) ได้อาคารและฝ่ายจากไฟล์ทะเบียน", () => {
  const known = master({ brands: [{ id: 1, name: "OKI" }], buildings: [{ id: 3, name: "อาคาร ก (A)" }], divisions: [{ id: 7, name: "ฝ่าย ก" }] });
  const fromMeterReport = { id: 1, serial_number: "TESTSN0001", brand_id: 1, model: "ES5112", location: "หอ ก_เคาน์เตอร์", meter_category_id: 2, contract_id: 10 };
  const result = plan([row()], { master: known, devices: [fromMeterReport], decisions: allCreate });
  assert.equal(result.rows[0].action, "fill");
  assert.deepEqual(result.rows[0].fill.sort(), ["building_id", "department_id", "division_id", "floor_id"]);
  assert.equal(result.summary.fill, 1);
});

test("เตือนเลขซีเรียลที่สลับตัวอักษรกับเครื่องที่มีอยู่", () => {
  const result = plan([row({ serial_number: "BW1TEST538C0" })], {
    devices: [{ id: 1, serial_number: "WB1TEST538C0", model: "ES5112" }],
    decisions: allCreate,
  });
  assert.match(result.warnings.map((w) => w.reason).join(), /คล้าย "WB1TEST538C0" ที่มีในระบบแล้ว/);
});

test("likelyTypo: สลับตัวอักษรคือพิมพ์ผิด สลับหรือต่างตัวเลขคือคนละเครื่อง", () => {
  assert.equal(likelyTypo("WX9T000001Z0", "XW9T000001Z0"), true);
  assert.equal(likelyTypo("TEST-001", "TEST001"), true);
  assert.equal(likelyTypo("SN0O1", "SN001"), true);
  assert.equal(likelyTypo("TX90000057Q0", "TX90000075Q0"), false);
  assert.equal(likelyTypo("Q00000T0N706266", "Q00000T0N706269"), false);
});

test("แถวที่ข้อมูลใช้ไม่ได้ถูกข้ามพร้อมเหตุผล แถวอื่นยังบันทึกได้", () => {
  const result = plan([row(), row({ serial_number: "TESTSN0002", price_override: "abc" })], { decisions: allCreate });
  assert.equal(result.valid, true);
  assert.deepEqual(result.rows.map((r) => r.action), ["create", "skip"]);
  assert.equal(result.summary.skip, 1);
});

test("ค่าที่ยาวเกินคอลัมน์ถูกข้ามพร้อมบอกความยาวจริง ไม่ถูกตัดทิ้งเงียบๆ (#85)", () => {
  const { MAX_LENGTH } = require("@suth/domain");
  const serial = "P".repeat(MAX_LENGTH.serial_number + 1);
  const result = plan([
    row({ serial_number: serial }),
    row({ serial_number: "TESTSN0002", model: "M".repeat(MAX_LENGTH.model + 1) }),
    row({ serial_number: "TESTSN0003", location: "L".repeat(MAX_LENGTH.location + 1) }),
    row({ serial_number: "P".repeat(MAX_LENGTH.serial_number) }), // พอดีเพดานยังผ่าน
  ], { decisions: allCreate });
  assert.deepEqual(result.rows.map((r) => r.action), ["skip", "skip", "skip", "create"]);
  assert.match(result.rows[0].reasons[0], new RegExp(`${serial.length} ตัวอักษร เกิน ${MAX_LENGTH.serial_number}`));
  assert.match(result.rows[1].reasons[0], /ชื่อรุ่นยาว/);
  assert.match(result.rows[2].reasons[0], /ตำแหน่งยาว/);
});

test("สร้างด้วยชื่อทางการ: ชื่อในไฟล์กลายเป็นชื่อเรียกอื่น และชื่อทางการที่มีอยู่แล้วกลายเป็นการจับคู่", () => {
  const created = plan([row()], {
    decisions: { ...allCreate, names: { ...allCreate.names, building: { "อาคาร ก (A)": { action: "create", as: "อาคารกอไก่" } } } },
  });
  assert.deepEqual(created.unresolved.building[0].decision, { action: "create", as: "อาคารกอไก่" });
  assert.equal(created.valid, true);

  const existing = plan([row()], {
    master: master({ buildings: [{ id: 3, name: "อาคารกอไก่" }] }),
    decisions: { ...allCreate, names: { ...allCreate.names, building: { "อาคาร ก (A)": { action: "create", as: "อาคารกอไก่" } } } },
  });
  assert.deepEqual(existing.unresolved.building[0].decision, { action: "alias", target_id: 3 });
  assert.equal(existing.rows[0].values.building_id, 3);
});

test("สองชื่อในไฟล์ที่ตั้งชื่อทางการเดียวกันกลายเป็นรายการเดียว ไม่สร้างซ้ำ", () => {
  const result = plan([row(), row({ serial_number: "TESTSN0002", building: "อาคาร ก" })], {
    decisions: {
      ...allCreate,
      names: { ...allCreate.names, building: { "อาคาร ก (A)": { action: "create", as: "อาคารกอไก่" }, "อาคาร ก": { action: "create", as: "อาคารกอไก่" } } },
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.unresolved.building.filter((e) => e.decision.action === "create").length, 1);
  assert.equal(result.rows[0].values.building_id, result.rows[1].values.building_id);
});

test("ชื่อที่ถูกตั้งเป็นชื่อทางการของรายการใหม่ จับคู่ได้เองและไม่ถูกเพิ่มเป็นชื่อเรียกอื่นซ้ำ", () => {
  const result = plan([row(), row({ serial_number: "TESTSN0002", building: "อาคารกอไก่" })], {
    decisions: {
      ...allCreate,
      names: { ...allCreate.names, building: { "อาคาร ก (A)": { action: "create", as: "อาคารกอไก่" } } },
    },
  });
  assert.equal(result.valid, true); // "อาคารกอไก่" ไม่ต้องเลือกเอง
  const decisions = Object.fromEntries(result.unresolved.building.map((e) => [e.name, e.decision.action]));
  assert.deepEqual(decisions, { "อาคาร ก (A)": "create", "อาคารกอไก่": "same_as_new" });

  const both = plan([row(), row({ serial_number: "TESTSN0002", building: "อาคารกอไก่" })], {
    decisions: {
      ...allCreate,
      names: { ...allCreate.names, building: { "อาคาร ก (A)": { action: "create", as: "อาคารกอไก่" }, "อาคารกอไก่": { action: "create" } } },
    },
  });
  assert.deepEqual(Object.fromEntries(both.unresolved.building.map((e) => [e.name, e.decision.action])), { "อาคาร ก (A)": "create", "อาคารกอไก่": "same_as_new" });
});

test("ชื่อเรียกอื่นของชื่อที่ไม่ได้ถูกสร้าง = ยังไม่ตัดสิน ไม่ปล่อยให้ไปล้มตอนบันทึก", () => {
  const result = plan([row()], {
    decisions: { ...allCreate, names: { ...allCreate.names, building: { "อาคาร ก (A)": { action: "alias", target_new: "ไม่มีในไฟล์" } } } },
  });
  assert.equal(result.valid, false);
  assert.ok(result.blocking.some((b) => b.code === "undecided_building"));
});

test("ไม่เติมชั้นของอาคารอื่น หรือแผนกของฝ่ายอื่น ให้เครื่องที่มีอาคาร/ฝ่ายอยู่แล้ว", () => {
  const known = master({ brands: [{ id: 1, name: "OKI" }], buildings: [{ id: 3, name: "อาคาร ก (A)" }, { id: 4, name: "อาคารอื่น" }], divisions: [{ id: 7, name: "ฝ่าย ก" }, { id: 8, name: "ฝ่ายอื่น" }] });
  const device = { id: 1, serial_number: "TESTSN0001", brand_id: 1, model: "ES5112", building_id: 4, division_id: 8, meter_category_id: 2, contract_id: 10 };
  const result = plan([row()], { master: known, devices: [device], decisions: allCreate });
  assert.ok(!result.rows[0].fill.includes("floor_id"));
  assert.ok(!result.rows[0].fill.includes("department_id"));
  assert.match(result.warnings.map((w) => w.reason).join(), /ไม่ย้ายเครื่อง/);
});

test("เครื่องที่เคยย้ายแล้วไม่ถูกเติมที่ตั้งจากไฟล์", () => {
  const known = master({ brands: [{ id: 1, name: "OKI" }], buildings: [{ id: 3, name: "อาคาร ก (A)" }], divisions: [{ id: 7, name: "ฝ่าย ก" }] });
  const moved = { id: 1, serial_number: "TESTSN0001", brand_id: 1, model: "ES5112", meter_category_id: 2, contract_id: 10, history_rows: 2 };
  const result = plan([row()], { master: known, devices: [moved], decisions: allCreate });
  assert.equal(result.rows[0].action, "unchanged");
  assert.match(result.warnings[0].reason, /เคยย้ายแล้ว/);
});

test("วันติดตั้งที่ไฟล์ระบุยืนยันย้อนหลังได้ วันก่อนเดือนเริ่มสัญญาเริ่มนับที่วันเริ่มสัญญา", () => {
  const known = plan([row({ installed_on: "2024-10-05", installed_on_known: true })], { decisions: allCreate });
  assert.equal(known.rows[0].values.installed_on, "2024-10-05");
  assert.equal(known.rows[0].values.installed_on_known, true);

  const early = plan([row({ installed_on: "2024-08-15", installed_on_known: true })], { decisions: allCreate });
  assert.equal(early.rows[0].values.installed_on, "2024-09-29");
  assert.match(early.rows[0].notes.join(), /ก่อนเดือนเริ่มสัญญา/);
});

test("ตรวจเลขซีเรียลที่พิมพ์ผิดในไฟล์ใหญ่ได้เร็ว (ไม่เทียบทุกคู่)", () => {
  const rows = Array.from({ length: 20000 }, (_, i) => row({ serial_number: `Q00000T0N${String(700000 + i)}` }));
  const started = Date.now();
  const result = plan(rows, { decisions: allCreate });
  assert.ok(Date.now() - started < 5000, `ใช้เวลา ${Date.now() - started} ms`);
  assert.equal(result.warnings.length, 0); // เลขเรียงกันของล็อตเดียวกันไม่ใช่การพิมพ์ผิด
});

test("ชื่อชั้นที่ยาวเกินคอลัมน์ (50) ถูกข้ามตั้งแต่ตอนตรวจ ไม่ไปล้มตอนบันทึก", () => {
  const result = plan([row({ floor: "ช".repeat(51) })], { decisions: allCreate });
  assert.equal(result.rows[0].action, "skip");
  assert.match(result.rows[0].reasons[0], /ชื่อชั้นยาว 51/);
});

/*
 * เทสชุดนี้คุ้มกันช่องโหว่ Formula Injection (CWE-1236) ตาม Issue #134
 * ป้องกันการใส่สูตรคำนวณที่ขึ้นต้นด้วย =, +, -, @, \t, \r, \n, | ในช่องที่ผู้ใช้กรอก
 * ซึ่งอาจถูกรันเป็นโค้ดเมื่อดาวน์โหลดข้อมูลออกไปเปิดด้วยโปรแกรมตาราง (Excel)
 */

test("ปฏิเสธเลขซีเรียลที่ขึ้นต้นด้วยอักขระสูตรคำนวณ (=, +, -, @) แม้มีช่องว่างหรือ \\t, \\r นำหน้า เพื่อป้องกัน Formula Injection (#134)", () => {
  for (const sn of ["=cmd|' /C calc'!A0", "@SUM(1,1)", "+12345", "-12345", "\t+12345", "\r=cmd"]) {
    const result = plan([row({ serial_number: sn })], { decisions: allCreate });
    assert.equal(result.rows[0].action, "skip");
    assert.match(result.rows[0].reasons[0], /เลขซีเรียลขึ้นต้นด้วยอักขระสูตรคำนวณ/);
  }
});

test("ปฏิเสธชื่อรุ่นและตำแหน่งที่ขึ้นต้นด้วยอักขระสูตรคำนวณ (#134)", () => {
  const result = plan([row({ serial_number: "PRN-001", model: "=1+1", location: "@LOCATION" })], { decisions: allCreate });
  assert.equal(result.rows[0].action, "skip");
  assert.ok(result.rows[0].reasons.some((r) => /ชื่อรุ่นขึ้นต้นด้วยอักขระสูตรคำนวณ/.test(r)));
  assert.ok(result.rows[0].reasons.some((r) => /ตำแหน่งขึ้นต้นด้วยอักขระสูตรคำนวณ/.test(r)));
});

test("เครื่องหมาย - ตัวเดียวหรือข้อความตัวแทนในตำแหน่งหรือชื่อรุ่นไม่ถือว่าเป็นสูตร (#134)", () => {
  for (const placeholder of ["-", "--", "---", "-ไม่มี-", "-ไม่ระบุ-", "- ว่าง -"]) {
    const result = plan([row({ serial_number: "PRN-001", model: placeholder, location: placeholder })], { decisions: allCreate });
    assert.ok(!result.rows[0].reasons.some((r) => /ขึ้นต้นด้วยอักขระสูตรคำนวณ/.test(r)));
  }
});

test("ข้อความตัวแทนที่มีสูตรซ่อนอยู่ข้างหลังต้องถูกปฏิเสธ ไม่ให้หลุดรอด (#134)", () => {
  const r1 = plan([row({ serial_number: "PRN-001", model: "-ว่าง+cmd|x!A0" })], { decisions: allCreate });
  assert.equal(r1.rows[0].action, "skip");
  assert.match(r1.rows[0].reasons[0], /ชื่อรุ่นขึ้นต้นด้วยอักขระสูตรคำนวณ/);

  const r2 = plan([row({ serial_number: "PRN-001", location: "- ไม่มี=1+1" })], { decisions: allCreate });
  assert.equal(r2.rows[0].action, "skip");
  assert.match(r2.rows[0].reasons[0], /ตำแหน่งขึ้นต้นด้วยอักขระสูตรคำนวณ/);

  const r3 = plan([row({ serial_number: "PRN-001", model: "-ไม่มี-123" })], { decisions: allCreate });
  assert.equal(r3.rows[0].action, "skip");
  assert.match(r3.rows[0].reasons[0], /ชื่อรุ่นขึ้นต้นด้วยอักขระสูตรคำนวณ/);
});

test("เลขซีเรียลที่เป็นขีดกลางล้วน (-, --, ---) หรือ zero-width ล้วน ต้องรายงานว่า 'ไม่มีเลขซีเรียล' (#134)", () => {
  for (const sn of ["-", "--", "---", " - ", "\u200B", "\u200B\u200C"]) {
    const result = plan([row({ serial_number: sn })], { decisions: allCreate });
    assert.equal(result.rows[0].action, "skip");
    assert.ok(result.rows[0].reasons.includes("ไม่มีเลขซีเรียล"));
  }
});

test("ดักจับการหลบเลี่ยงด้วย Zero-width space, ช่องว่างนำหน้า, หรือตัวอักษรแบบ Full-width (#134)", () => {
  for (const sn of ["\u200B=cmd|' /C calc'!A0", "  @SUM(1,1)", "＝1+1", "|cmd"]) {
    const result = plan([row({ serial_number: sn })], { decisions: allCreate });
    assert.equal(result.rows[0].action, "skip");
    assert.match(result.rows[0].reasons[0], /เลขซีเรียลขึ้นต้นด้วยอักขระสูตรคำนวณ/);
  }
});

test("เลขซีเรียลปกติที่มีขีดกลางข้างใน (เช่น PRN-OPD-001) ต้องผ่านได้ปกติ", () => {
  const result = plan([row({ serial_number: "PRN-OPD-001", model: "LaserJet-Pro", location: "ห้องตรวจ-1" })], {
    decisions: {
      ...allCreate,
      models: { ...allCreate.models, "oki|laserjet-pro": { meter_category_id: 2 } },
    },
  });
  assert.equal(result.rows[0].action, "create");
  assert.equal(result.rows[0].reasons.length, 0);
});

// เครื่องที่มีอยู่แล้วแต่ยังไม่ผูกสัญญา: ไฟล์ระบุสัญญาแต่การนำเข้าไม่ผูกให้ (ต้องระบุวันเริ่มคิดเงินที่หน้าทะเบียน)
// เดิมแผนตอบ "unchanged" เงียบๆ เครื่องจึงยังคิดเงินไม่ได้โดยไม่มีใครรู้ (#155)
test("เครื่องเดิมที่ยังไม่ผูกสัญญา แต่ไฟล์ระบุสัญญา ต้องมีคำเตือน", () => {
  const existing = {
    id: 5, serial_number: "TESTSN0001", brand_id: null, model: null, building_id: null, floor_id: null,
    location: null, division_id: null, department_id: null, contract_id: null,
    meter_category_id: 2, has_color_meter: false, history_rows: 1,
  };
  const result = plan([row()], {
    devices: [existing],
    decisions: allCreate,
  });
  const warning = result.warnings.find((w) => w.serial_number === "TESTSN0001" && /สัญญา/.test(w.reason));
  assert.ok(warning, `ต้องเตือนเรื่องสัญญา (ได้ ${JSON.stringify(result.warnings)})`);
  assert.match(warning.reason, /TEST 9\/2567/);
  assert.match(warning.reason, /หน้าทะเบียน/);
});
