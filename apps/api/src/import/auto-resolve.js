// apps/api/src/import/auto-resolve.js
//
// นำเข้าอัตโนมัติ (#190, ADR-0030) — ตัดสินแทนผู้ดูแลเฉพาะสิ่งที่ไม่มีทางเลือกอื่นที่สมเหตุสมผล
// และบอกว่าทำไมหยุด เมื่อการเดาอาจทำข้อมูลเสีย ฟังก์ชันในไฟล์นี้ไม่แตะฐาน
//
//   ชื่อยี่ห้อ/อาคาร/ฝ่ายที่ไม่รู้จัก → สร้างใหม่ ยกเว้นคล้ายชื่อที่มีในระบบ (สร้างเองจะได้รายการซ้ำ)
//   ชื่อในไฟล์ที่คล้ายกันเอง (เว้นวรรค คำนำหน้าต่างกัน) → รวมเป็นรายการเดียว
//   หมวดมิเตอร์ของรุ่นใหม่ → จากแคตตาล็อกรุ่นที่ตรวจสเปกแล้ว (model-catalog.js) รุ่นอื่นถาม
//   สัญญาที่ยังไม่มี → สร้างจากหัวไฟล์เมื่อข้อมูลครบและราคาในไฟล์ไม่ขัดกัน

const { nameKey } = require("../master-data/names");
const { categoryCodeOf } = require("./model-catalog");

const KINDS = ["brand", "building", "division"];
const KIND_LABEL = { brand: "ยี่ห้อ", building: "อาคาร", division: "ฝ่าย" };

// คำนำหน้าที่คนเขียนบ้างไม่เขียนบ้าง — "อาคารพยาธิ" กับ "พยาธิ" น่าจะเป็นที่เดียวกัน
const PREFIX = /^(อาคาร|ตึก|กลุ่มงาน|ฝ่าย|งาน|หน่วย|แผนก|ศูนย์)/;

/** คีย์หลวมสำหรับหาชื่อที่ "น่าจะเป็นอันเดียวกัน": ตัดช่องว่าง เครื่องหมาย และคำนำหน้า */
function looseKey(text) {
  const key = nameKey(text).replace(/[\s.,\-_/()'"]+/g, "");
  const stripped = key.replace(PREFIX, "");
  return stripped || key;
}

/**
 * ชื่อที่ยังไม่ได้ตัดสิน → การตัดสินที่ระบบเลือกให้ และชื่อที่ต้องถาม
 *
 * @param {object} input.unresolved validation.registry.unresolved — { brand: [{ name, rows, decision }], … }
 * @param {object} input.master context.master — { brand: { names: [{ id, name }], aliases: [{ alias, target_id }] }, … }
 * @param {object} input.chosen decisions.names ที่มีอยู่ (ไม่ทับของที่คนเลือกแล้ว)
 */
function autoNameDecisions({ unresolved, master, chosen = {} }) {
  const decided = {};
  const made = [];
  const questions = [];

  for (const kind of KINDS) {
    const open = (unresolved?.[kind] ?? []).filter((entry) => !entry.decision && !chosen[kind]?.[entry.name]);
    if (!open.length) continue;

    const existing = new Map();
    for (const row of master?.[kind]?.names ?? []) existing.set(looseKey(row.name), { id: row.id, name: row.name });
    for (const row of master?.[kind]?.aliases ?? []) {
      const target = (master[kind].names ?? []).find((n) => n.id === row.target_id);
      if (!existing.has(looseKey(row.alias))) existing.set(looseKey(row.alias), { id: row.target_id, name: target?.name ?? row.alias });
    }

    // ชื่อที่มีแถวมากที่สุดเป็นชื่อหลักของกลุ่ม ชื่ออื่นในกลุ่มเป็นชื่อเรียกอื่นของมัน
    const groups = new Map();
    for (const entry of [...open].sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name, "th"))) {
      const key = looseKey(entry.name);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }

    for (const [key, entries] of groups) {
      const similar = existing.get(key);
      if (similar) {
        for (const entry of entries) {
          questions.push({
            kind,
            name: entry.name,
            similar_to: similar,
            reason: `${KIND_LABEL[kind]} "${entry.name}" คล้าย "${similar.name}" ที่มีในระบบ — เลือกเองว่าเป็นที่เดียวกันหรือไม่`,
          });
        }
        continue;
      }
      const [first, ...others] = entries;
      (decided[kind] ??= {})[first.name] = { action: "create" };
      made.push({ kind, name: first.name, decision: "create", rows: first.rows });
      for (const other of others) {
        decided[kind][other.name] = { action: "alias", target_new: first.name };
        made.push({ kind, name: other.name, decision: "alias", target: first.name, rows: other.rows });
      }
    }
  }
  return { decided, made, questions };
}

/**
 * หมวดมิเตอร์ของรุ่นที่ยังไม่มีหมวด จากแคตตาล็อก
 *
 * @param {object[]} input.models validation.registry.models
 * @param {object[]} input.categories meter_category ทั้งหมด [{ id, code, is_color }]
 */
function autoModelDecisions({ models, categories, chosen = {} }) {
  const byCode = new Map(categories.map((c) => [c.code, c]));
  const decided = {};
  const made = [];
  const questions = [];
  for (const model of models ?? []) {
    if (model.meter_category_id || chosen[model.key]) continue;
    const code = categoryCodeOf(model.brand, model.model);
    const category = code ? byCode.get(code) : null;
    if (!category || category.is_color) {
      // รุ่นที่ไม่ผูกสัญญาใช้หมวดทั่วไปของระบบได้ ไม่ต้องถาม (registry-plan.js ตัดสินเอง)
      if (model.required !== false) {
        questions.push({ kind: "model", name: `${model.brand} ${model.model}`.trim(), reason: `ไม่รู้หมวดมิเตอร์ของรุ่น ${model.brand} ${model.model} — หมวดกำหนดราคาต่อหน้า จึงต้องเลือกเอง` });
      }
      continue;
    }
    decided[model.key] = { meter_category_id: category.id, has_color_meter: Boolean(model.has_color_meter) };
    made.push({ kind: "model", name: `${model.brand} ${model.model}`.trim(), category: category.code });
  }
  return { decided, made, questions };
}

/**
 * ข้อมูลสัญญาจากหัวไฟล์พอจะสร้างเองได้ไหม — ได้ = body ของ POST สัญญา, ไม่ได้ = เหตุผล
 * @param {object} contract validation.contracts[i] ที่ state === "missing"
 */
function contractFromPrefill(contract) {
  const p = contract.prefill;
  const why = [];
  if (!contract.file) why.push("ไฟล์ไม่มีหัวรายงานของสัญญานี้");
  if (!p?.effective_from || !p?.effective_to) why.push("อ่านวันเริ่มหรือวันสิ้นสุดสัญญาจากไฟล์ไม่ได้");
  if (!p?.price_lines?.length) why.push("ไฟล์ไม่มีราคาต่อหน้า");
  if (p?.unmapped_models?.length) why.push(`ยังไม่รู้หมวดของรุ่น ${p.unmapped_models.join(", ")}`);
  const conflicting = (p?.price_lines ?? []).filter((line) => line.conflicting_prices);
  if (conflicting.length) {
    why.push(`หมวด ${conflicting.map((l) => `${l.category_name} มีหลายราคาในไฟล์ (${l.conflicting_prices.join(", ")})`).join(" · ")}`);
  }
  if (why.length) return { body: null, reason: `สร้างสัญญา ${contract.contract_no} ให้เองไม่ได้: ${why.join(" · ")}` };
  return {
    body: {
      contract_no: p.contract_no,
      effective_from: p.effective_from,
      effective_to: p.effective_to,
      monthly_rental: p.monthly_rental,
      vat_rate: p.vat_rate,
      price_lines: p.price_lines.map((line) => ({ category_id: line.category_id, price_per_page: line.price_per_page })),
    },
    reason: null,
  };
}

/**
 * เหตุผลที่ยังบันทึกเองไม่ได้ แม้ทุกข้อจะผ่าน — สิ่งที่คนควรเห็นก่อนเขียน [] = บันทึกได้
 * แถวที่ข้ามและคำเตือนทั่วไปของทะเบียนไม่หยุด (แสดงในหน้าผลลัพธ์) เพราะไม่ทำข้อมูลเดิมเสีย
 */
function autoCommitBlockers(validation) {
  const reasons = [];
  if (!validation) return ["ยังไม่มีผลตรวจ"];
  for (const item of validation.checklist ?? []) {
    if (item.state === "blocking" || item.state === "waiting") reasons.push(item.title);
  }
  const overwrite = validation.readings?.counts?.overwrite ?? 0;
  if (overwrite) reasons.push(`ไฟล์จะเขียนทับยอดเดิม ${overwrite} รายการด้วยค่าที่ต่างจากเดิม — ดูค่าเดิม/ค่าใหม่ก่อนบันทึก`);
  for (const contract of validation.contracts ?? []) {
    if (contract.state === "warning" || contract.state === "mismatch") {
      reasons.push(`สัญญา ${contract.contract_no} ในระบบต่างจากไฟล์: ${contract.issues.map((i) => i.message).join(" · ")}`);
    }
  }
  const off = (validation.reconciliation ?? []).filter((line) => !line.matches);
  if (off.length) reasons.push(`ยอดตามใบแจ้งหนี้ต่างจากท้ายรายงาน ${off.length} งวด — ตรวจราคาหรือค่าเช่าก่อนบันทึก`);
  const lookAlike = validation.registry?.look_alike_count ?? 0;
  if (lookAlike) reasons.push(`มีเลขซีเรียลคล้ายเครื่องอื่น ${lookAlike} รายการ — ถ้าเป็นเครื่องเดียวกันที่พิมพ์ผิด การบันทึกจะสร้างเครื่องซ้ำ`);
  return [...new Set(reasons)];
}

module.exports = { looseKey, autoNameDecisions, autoModelDecisions, contractFromPrefill, autoCommitBlockers };
