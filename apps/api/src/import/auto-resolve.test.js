const test = require("node:test");
const assert = require("node:assert/strict");
const { looseKey, autoNameDecisions, autoModelDecisions, contractFromPrefill, autoCommitBlockers } = require("./auto-resolve");
const { categoryCodeOf } = require("./model-catalog");

const emptyMaster = { brand: { names: [], aliases: [] }, building: { names: [], aliases: [] }, division: { names: [], aliases: [] } };
const categories = [
  { id: 1, code: "bw", is_color: 0 },
  { id: 2, code: "a4-laser-bw", is_color: 0 },
  { id: 3, code: "a4-mfp-bw", is_color: 0 },
  { id: 4, code: "a3-bw", is_color: 0 },
  { id: 5, code: "a3-color", is_color: 1 },
];

test("คีย์หลวมไม่สนช่องว่าง ตัวพิมพ์ และคำนำหน้า", () => {
  assert.equal(looseKey("อาคารพยาธิ"), looseKey("อาคาร พยาธิ"));
  assert.equal(looseKey("อาคารพยาธิ"), looseKey("พยาธิ"));
  assert.equal(looseKey("The mall"), looseKey("THE  MALL"));
  assert.notEqual(looseKey("อาคารพยาธิ"), looseKey("อาคารรังสี"));
  // ชื่อที่เหลือแต่คำนำหน้าไม่กลายเป็นคีย์ว่าง
  assert.equal(looseKey("อาคาร"), "อาคาร");
});

test("ระบบว่าง: ทุกชื่อที่ไม่รู้จักถูกสร้างใหม่ ไม่มีอะไรต้องถาม", () => {
  const unresolved = {
    brand: [{ name: "Brother", rows: 262, decision: null }, { name: "HP", rows: 6, decision: null }],
    building: [{ name: "อาคารพยาธิ", rows: 7, decision: null }],
    division: [{ name: "ฝ่ายการพยาบาล", rows: 124, decision: null }],
  };
  const { decided, made, questions } = autoNameDecisions({ unresolved, master: emptyMaster });
  assert.deepEqual(questions, []);
  assert.equal(made.length, 4);
  assert.deepEqual(decided.brand, { Brother: { action: "create" }, HP: { action: "create" } });
  assert.deepEqual(decided.division["ฝ่ายการพยาบาล"], { action: "create" });
});

test("ชื่อในไฟล์ที่เขียนต่างกันเล็กน้อยรวมเป็นรายการเดียว — ชื่อที่มีแถวมากกว่าเป็นชื่อหลัก", () => {
  const unresolved = { building: [{ name: "อาคาร พยาธิ", rows: 2, decision: null }, { name: "อาคารพยาธิ", rows: 7, decision: null }] };
  const { decided, questions } = autoNameDecisions({ unresolved, master: emptyMaster });
  assert.deepEqual(questions, []);
  assert.deepEqual(decided.building["อาคารพยาธิ"], { action: "create" });
  assert.deepEqual(decided.building["อาคาร พยาธิ"], { action: "alias", target_new: "อาคารพยาธิ" });
});

test("ชื่อที่คล้ายของเดิมในระบบ → ถาม ไม่สร้างซ้ำ ส่วนชื่ออื่นยังตัดสินให้", () => {
  const master = {
    ...emptyMaster,
    building: { names: [{ id: 9, name: "อาคารรัตนเวชพัฒน์" }], aliases: [] },
    division: { names: [{ id: 4, name: "ฝ่ายเภสัชกรรม" }], aliases: [{ alias: "เภสัช", target_id: 4 }] },
  };
  const unresolved = {
    building: [{ name: "อาคาร รัตนเวชพัฒน์", rows: 99, decision: null }, { name: "The mall", rows: 7, decision: null }],
    division: [{ name: "ฝ่าย เภสัช", rows: 3, decision: null }],
  };
  const { decided, questions } = autoNameDecisions({ unresolved, master });
  assert.deepEqual(questions.map((q) => [q.kind, q.name, q.similar_to.id]), [
    ["building", "อาคาร รัตนเวชพัฒน์", 9],
    ["division", "ฝ่าย เภสัช", 4],
  ]);
  assert.deepEqual(decided.building, { "The mall": { action: "create" } });
  assert.equal(decided.division, undefined);
});

test("ไม่ทับการตัดสินที่คนเลือกไว้แล้ว", () => {
  const unresolved = { brand: [{ name: "HP", rows: 6, decision: null }] };
  const { made } = autoNameDecisions({ unresolved, master: emptyMaster, chosen: { brand: { HP: { action: "alias", target_id: 1 } } } });
  assert.deepEqual(made, []);
});

test("แคตตาล็อกรุ่น: รู้จักเฉพาะรุ่นที่ตรวจสเปกแล้ว", () => {
  assert.equal(categoryCodeOf("Brother", "HL-L5210DN"), "a4-laser-bw");
  assert.equal(categoryCodeOf("Brother", "MFC-L5915DW"), "a4-mfp-bw");
  assert.equal(categoryCodeOf("HP", "MFP E73135DN"), "a3-bw");
  assert.equal(categoryCodeOf("HP-MFP", "E78635DN"), "a3-bw");
  assert.equal(categoryCodeOf("Canon", "iR-ADV C5840i"), null);
});

test("หมวดของรุ่น: รุ่นในแคตตาล็อกเลือกให้ รุ่นอื่นถาม รุ่นที่มีหมวดแล้วไม่แตะ", () => {
  const models = [
    { key: "brother|hl-l5210dn", brand: "Brother", model: "HL-L5210DN", meter_category_id: null, required: true, has_color_meter: false },
    { key: "hp|mfp e78635dn", brand: "HP", model: "MFP E78635DN", meter_category_id: null, required: true, has_color_meter: true },
    { key: "canon|x", brand: "Canon", model: "X", meter_category_id: null, required: true },
    { key: "oki|es5112", brand: "OKI", model: "ES5112", meter_category_id: 2, required: true },
  ];
  const { decided, questions } = autoModelDecisions({ models, categories });
  assert.deepEqual(decided, {
    "brother|hl-l5210dn": { meter_category_id: 2, has_color_meter: false },
    "hp|mfp e78635dn": { meter_category_id: 4, has_color_meter: true },
  });
  assert.deepEqual(questions.map((q) => q.name), ["Canon X"]);
});

const missing = (prefill, file = { contract_no: "C1" }) => ({ contract_no: "C1", state: "missing", file, prefill: { contract_no: "C1", unmapped_models: [], ...prefill } });

test("สัญญาจากหัวไฟล์: สร้างเองได้เมื่อวันที่และราคาครบและไม่ขัดกัน", () => {
  const { body, reason } = contractFromPrefill(missing({
    effective_from: "2026-02-24", effective_to: "2029-02-23", monthly_rental: null, vat_rate: null,
    price_lines: [{ category_id: 2, category_name: "A4", price_per_page: "0.365" }, { category_id: 5, category_name: "สี", price_per_page: "3.9" }],
  }));
  assert.equal(reason, null);
  assert.deepEqual(body.price_lines, [{ category_id: 2, price_per_page: "0.365" }, { category_id: 5, price_per_page: "3.9" }]);
});

test("สัญญาจากหัวไฟล์: หยุดเมื่อวันที่ไม่ครบ ราคาขัดกัน หรือยังไม่รู้หมวดของรุ่น", () => {
  const base = { effective_from: "2026-02-24", effective_to: "2029-02-23", price_lines: [{ category_id: 2, price_per_page: "0.35" }] };
  assert.match(contractFromPrefill(missing({ ...base, effective_to: "" })).reason, /วันเริ่มหรือวันสิ้นสุด/);
  assert.match(contractFromPrefill(missing({ ...base, price_lines: [{ category_id: 2, category_name: "A4", price_per_page: "0.35", conflicting_prices: ["0.35", "0.365"] }] })).reason, /หลายราคา/);
  assert.match(contractFromPrefill(missing({ ...base, unmapped_models: ["Canon X"] })).reason, /Canon X/);
  assert.match(contractFromPrefill(missing(base, null)).reason, /ไม่มีหัวรายงาน/);
  assert.match(contractFromPrefill(missing({ ...base, price_lines: [] })).reason, /ไม่มีราคา/);
});

test("บันทึกเองได้เมื่อไม่มีอะไรเสี่ยง — แถวที่ข้ามไม่หยุด แต่เขียนทับ สัญญาไม่ตรง ยอดไม่ตรง และซีเรียลคล้ายหยุด", () => {
  const clean = {
    checklist: [{ key: "devices", state: "warning", title: "เครื่อง: ข้าม 3" }, { key: "file", state: "ok", title: "อ่านได้" }],
    readings: { counts: { new: 10, overwrite: 0, unchanged: 0 } },
    contracts: [{ contract_no: "C1", state: "ok", issues: [] }],
    reconciliation: [{ matches: true }],
    registry: { look_alike_count: 0 },
  };
  assert.deepEqual(autoCommitBlockers(clean), []);
  assert.equal(autoCommitBlockers({ ...clean, readings: { counts: { overwrite: 4 } } }).length, 1);
  assert.equal(autoCommitBlockers({ ...clean, contracts: [{ contract_no: "C1", state: "mismatch", issues: [{ message: "VAT ต่าง" }] }] }).length, 1);
  assert.equal(autoCommitBlockers({ ...clean, reconciliation: [{ matches: false }] }).length, 1);
  assert.equal(autoCommitBlockers({ ...clean, registry: { look_alike_count: 2 } }).length, 1);
  assert.deepEqual(autoCommitBlockers({ ...clean, checklist: [{ key: "names", state: "blocking", title: "ยังต้องเลือกชื่อ" }] }), ["ยังต้องเลือกชื่อ"]);
});
