// apps/api/src/import/registry-plan.js
//
// วางแผนนำเข้าทะเบียนเครื่อง: แถวที่อ่านจากไฟล์ + ข้อมูลในระบบ + สิ่งที่ผู้ดูแลตัดสินแล้ว
// → จะสร้าง เติม ข้าม อะไรบ้าง และยังต้องตัดสินอะไรอีก (#132, ADR-0026)
//
// ไม่แตะฐานข้อมูล — controller โหลดข้อมูลมาให้ แล้วใช้แผนเดียวกันทั้งตอนตรวจ (preview)
// และตอนบันทึก (commit) ตัวเลขที่ผู้ใช้เห็นก่อนกดยืนยันจึงเป็นชุดเดียวกับที่บันทึกจริง
// และแผนที่บอกว่า valid ต้องบันทึกได้จริง ไม่ไปล้มกลางทางตอน commit
//
// ## หลักที่ยึด
//
//   - ไม่เดาชื่อ: ยี่ห้อ อาคาร ฝ่าย ที่จับคู่ไม่ได้ (ADR-0025) ต้องมีคนตัดสินว่า "สร้างใหม่" หรือ
//     "เป็นชื่อเรียกอื่นของ…" ก่อนบันทึก ชั้นและแผนกสร้างใหม่ใต้อาคาร/ฝ่ายที่ตัดสินแล้วได้เลย
//     เพราะชื่อซ้ำกันได้คนละอาคาร/ฝ่ายอยู่แล้ว และแสดงในหน้าตรวจให้เห็นก่อน
//   - ไม่เขียนทับเงียบ: เครื่องที่มีอยู่แล้วเติมได้เฉพาะช่องที่ยังว่าง ที่ตั้งที่ต่างจากระบบ
//     รายงานให้ย้ายผ่านหน้าทะเบียน เพราะการย้ายต้องเขียนประวัติ (ADR-0014)
//   - เครื่องที่มีสัญญาต้องรู้หมวดมิเตอร์ ไม่งั้นยอดพิมพ์ของเดือนแรกหาราคาไม่ได้ (ADR-0021)
//   - สถานะการติดตั้งยืนยันย้อนหลังได้เฉพาะเมื่อไฟล์ระบุวันติดตั้ง (ADR-0018 Q21)

const { MAX_LENGTH, monthIndex, formulaStarter, ZERO_WIDTH_CHARS } = require("@suth/domain");
const { normalizeName, nameKey, createNameResolver } = require("../master-data/names");
const { comparableContractNo } = require("./vendor-meter");

const NAME_KINDS = ["brand", "building", "division"];
const LOCATION_FIELDS = ["building_id", "floor_id", "location", "division_id", "department_id"];
const NAME_LIMIT = { brand: MAX_LENGTH.brand_name, building: MAX_LENGTH.name, division: MAX_LENGTH.name };
const KIND_LABEL = { brand: "ยี่ห้อ", building: "อาคาร", division: "ฝ่าย" };

/** คีย์ของรุ่น — ยี่ห้อ + รุ่น เพราะรุ่นชื่อซ้ำกันได้คนละยี่ห้อ */
const modelKey = (brand, model) => `${nameKey(brand)}|${nameKey(model)}`;

/** ชั้น "5" กับ "ชั้น 5" คือชั้นเดียวกัน */
const floorKey = (name) => nameKey(name).replace(/^ชั้น\s*/, "");

const plainSerial = (s) => s.toUpperCase().replace(/[\s-]/g, "");
const lookAlikeSerial = (s) => plainSerial(s).replace(/O/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2");

/** รูปแบบของเลขซีเรียลที่ได้จากการสลับตัวอักษรติดกันหนึ่งคู่ (ไม่สลับตัวเลข) */
function letterSwaps(serial) {
  const s = serial.toUpperCase();
  const out = [];
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === s[i + 1] || !/[A-Z]/.test(s[i] + s[i + 1])) continue;
    out.push(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2));
  }
  return out;
}

/**
 * เลขซีเรียลสองตัวที่น่าจะเป็นเครื่องเดียวกันแต่พิมพ์ผิด — สลับอักษรติดกันหนึ่งคู่
 * หรือต่างกันแค่ตัวที่หน้าตาคล้ายกัน (O/0, I/1, S/5, B/8, Z/2) หรือแค่ช่องว่างและขีด
 *
 * ไม่นับตัวเลขที่ต่างหรือสลับกัน เพราะเครื่องล็อตเดียวกันมีเลขเรียงกัน (…0066 กับ …0069 หรือ …57 กับ …75)
 */
function likelyTypo(a, b) {
  if (a.toUpperCase() === b.toUpperCase()) return false;
  if (plainSerial(a) === plainSerial(b) || lookAlikeSerial(a) === lookAlikeSerial(b)) return true;
  return a.length >= 6 && letterSwaps(a).includes(b.toUpperCase());
}

/**
 * ดัชนีของเลขซีเรียลที่ค้นหาเลขที่น่าจะพิมพ์ผิดได้ในเวลาคงที่ต่อแถว — ไฟล์ 50,000 แถวต้องไม่
 * เทียบทุกคู่ (พันล้านครั้ง ทำให้ API ค้างทั้งระบบ)
 */
function serialIndex(serials) {
  const byKey = new Map();
  const add = (key, serial) => {
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(serial);
  };
  for (const serial of serials) {
    if (!serial) continue;
    add(`p:${plainSerial(serial)}`, serial);
    add(`l:${lookAlikeSerial(serial)}`, serial);
    add(`x:${serial.toUpperCase()}`, serial);
  }
  return {
    similar(serial) {
      const found = new Set();
      const keys = [`p:${plainSerial(serial)}`, `l:${lookAlikeSerial(serial)}`];
      if (serial.length >= 6) keys.push(...letterSwaps(serial).map((s) => `x:${s}`));
      for (const key of keys) for (const other of byKey.get(key) ?? []) {
        if (other.toUpperCase() !== serial.toUpperCase()) found.add(other);
      }
      return [...found];
    },
  };
}

function tooLong(value, limit) {
  return limit && String(value ?? "").length > limit;
}

/** ชุดอักขระขีดกลางทุกรูปแบบ (Hyphen/Dash) และช่องว่าง */
const DASH_AND_SPACE_PATTERN = "-–—\\s";

/** ตรวจว่าซีเรียลเป็นขีดกลางล้วน ช่องว่าง หรืออักขระล่องหน (Zero-width) ล้วนหรือไม่ */
const DASH_OR_EMPTY_SERIAL_REGEX = new RegExp(`^[${DASH_AND_SPACE_PATTERN}${ZERO_WIDTH_CHARS}]+$`);

/**
 * รูปแบบข้อความตัวแทน "ไม่มีข้อมูล" ในภาษาไทย เช่น -, --, --- หรือ -ไม่มี-
 * ซึ่งไม่ใช่สูตรคำนวณและปลอดภัยที่จะใช้ในฟิลด์เสริมอย่างชื่อรุ่นหรือตำแหน่ง
 *
 * ⚠️ ต้อง anchor ทั้งหัวและท้าย (^...$) เสมอเพื่อป้องกัน payload ซ่อนท้าย เช่น "-ไม่มี=1+1"
 */
const THAI_PLACEHOLDER_REGEX = new RegExp(
  `^[${DASH_AND_SPACE_PATTERN}]+$|^-\\s*(ไม่มี|ไม่ระบุ|ว่าง)\\s*[-–—]?$`
);

/**
 * ตรวจสอบตัวเริ่มสูตรโดยคำนึงถึง placeholder สำหรับฟิลด์เสริม
 *
 * @param {unknown} value
 * @param {{ allowPlaceholder?: boolean }} [options]
 * @returns {string|null}
 */
function checkFormulaStarter(value, { allowPlaceholder = false } = {}) {
  const raw = String(value ?? "");
  if (allowPlaceholder && THAI_PLACEHOLDER_REGEX.test(raw.trim())) {
    return null;
  }
  return formulaStarter(raw);
}

/** ข้อความปฏิเสธแถวที่ขึ้นต้นด้วยอักขระสูตรคำนวณ */
function formulaProblem(fieldLabel, starter) {
  return `${fieldLabel}ขึ้นต้นด้วยอักขระสูตรคำนวณ ("${starter}") ซึ่งไม่อนุญาตเพื่อความปลอดภัย`;
}

/** อ่านค่าจาก object ที่มาจากภายนอก — ชื่ออย่าง "constructor" ต้องไม่ไปเจอของใน prototype */
const own = (object, key) => (object && Object.hasOwn(object, key) ? object[key] : undefined);

/**
 * ตัดสินชื่อข้อมูลหลักของชนิดหนึ่งทั้งไฟล์ในครั้งเดียว — ก่อนวนทีละแถว
 *
 * ลำดับสำคัญ ไม่งั้นแผนที่ผ่านการตรวจไปล้มตอนบันทึก:
 *   1. ชื่อที่ตรงชื่อหลักหรือชื่อเรียกอื่นในระบบ
 *   2. "สร้างใหม่" — ชื่อทางการ (as) ที่มีในระบบแล้วกลายเป็นชื่อเรียกอื่นของรายการนั้น
 *      สองชื่อที่ตั้งชื่อทางการเดียวกันกลายเป็นรายการเดียว
 *   3. ชื่อในไฟล์ที่ตรงกับชื่อทางการของรายการใหม่ — จับคู่ได้เองโดยไม่ต้องเลือก
 *   4. "ชื่อเรียกอื่นของ…" — ตามเป้าหมายไปจนเจอรายการในระบบหรือรายการที่สร้างจริงในไฟล์นี้
 */
function decideNames(kind, entries, resolver, existingIds, chosen) {
  const refOf = new Map(); // nameKey(ชื่อในไฟล์) → id | "new:<kind>:<key ของผู้สร้าง>"
  const creators = new Map(); // nameKey(ชื่อทางการ) → ชื่อในไฟล์ของรายการที่สร้าง
  const creatorOfRef = new Map(); // "new:<kind>:<key>" → ชื่อในไฟล์ของรายการที่สร้าง
  const problems = [];

  for (const entry of entries) {
    const hit = resolver.resolve(entry.name);
    if (hit) {
      entry.resolved = hit;
      refOf.set(nameKey(entry.name), hit.id);
    }
  }

  for (const entry of entries) {
    if (entry.resolved) continue;
    const decision = own(chosen, entry.name);
    if (decision?.action !== "create") continue;
    const as = normalizeName(decision.as) || entry.name;
    if (tooLong(as, NAME_LIMIT[kind])) {
      problems.push(`ชื่อ${KIND_LABEL[kind]} "${as.slice(0, 40)}…" ยาวเกิน ${NAME_LIMIT[kind]} ตัวอักษร`);
      continue;
    }
    const hit = resolver.resolve(as);
    if (hit) {
      entry.decision = { action: "alias", target_id: hit.id };
      refOf.set(nameKey(entry.name), hit.id);
      continue;
    }
    const first = creators.get(nameKey(as));
    if (first) {
      // ชื่อในไฟล์ตรงกับชื่อทางการของรายการที่สร้างอยู่แล้ว = ชื่อเดียวกัน ไม่ต้องเพิ่มชื่อเรียกอื่น
      // (ถ้าเพิ่ม จะชนชื่อหลักของรายการใหม่ตอนบันทึก)
      entry.decision = nameKey(as) === nameKey(entry.name)
        ? { action: "same_as_new", target_new: first }
        : { action: "alias", target_new: first };
      refOf.set(nameKey(entry.name), `new:${kind}:${nameKey(first)}`);
      continue;
    }
    creators.set(nameKey(as), entry.name);
    entry.decision = { action: "create", ...(nameKey(as) !== nameKey(entry.name) ? { as } : {}) };
    refOf.set(nameKey(entry.name), `new:${kind}:${nameKey(entry.name)}`);
    creatorOfRef.set(`new:${kind}:${nameKey(entry.name)}`, entry.name);
  }

  for (const entry of entries) {
    if (entry.resolved || refOf.has(nameKey(entry.name))) continue;
    const creator = creators.get(nameKey(entry.name));
    if (creator) {
      // ชื่อในไฟล์คือชื่อทางการของรายการที่กำลังสร้าง — ไม่ต้องเพิ่มชื่อเรียกอื่น
      entry.decision = { action: "same_as_new", target_new: creator };
      refOf.set(nameKey(entry.name), `new:${kind}:${nameKey(creator)}`);
    }
  }

  // ชื่อเรียกอื่นชี้ต่อกันเป็นทอดได้ (ก → ข → รายการใหม่) — วนจนไม่มีอะไรเปลี่ยน
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) {
      if (entry.resolved || refOf.has(nameKey(entry.name))) continue;
      const decision = own(chosen, entry.name);
      if (decision?.action !== "alias") continue;
      if (decision.target_id && existingIds.has(Number(decision.target_id))) {
        entry.decision = { action: "alias", target_id: Number(decision.target_id) };
        refOf.set(nameKey(entry.name), Number(decision.target_id));
        changed = true;
        continue;
      }
      const target = normalizeName(decision.target_new);
      const targetRef = target && nameKey(target) !== nameKey(entry.name) ? refOf.get(nameKey(target)) : undefined;
      if (targetRef === undefined) continue;
      entry.decision = typeof targetRef === "number"
        ? { action: "alias", target_id: targetRef }
        : { action: "alias", target_new: creatorOfRef.get(targetRef) };
      refOf.set(nameKey(entry.name), targetRef);
      changed = true;
    }
  }

  return { refOf, problems };
}

/**
 * @param {object} input
 * @param {object[]} input.rows แถวจาก parseRegistryWorkbook
 * @param {Record<string, { names: object[], aliases: object[] }>} input.master brand/building/division
 * @param {Array<{ id, building_id, name }>} input.floors
 * @param {Array<{ id, division_id, name }>} input.departments
 * @param {Array<{ id, contract_no, effective_from, category_ids: number[] }>} input.contracts
 * @param {Array<{ id, code, name, is_color }>} input.categories
 * @param {object[]} input.devices เครื่องในระบบ (ดู registry-import.js loadRegistryContext)
 * @param {object} [input.decisions] ดู docs/reference/import-format.md
 * @param {string} input.today "YYYY-MM-DD"
 */
function planRegistryImport(input) {
  const { rows, master, floors, departments, contracts, categories, devices, today } = input;
  const decisions = input.decisions ?? {};
  const blocking = [];
  const warnings = [];

  // ---------- ชื่อข้อมูลหลัก (ตัดสินทั้งไฟล์ก่อน) ----------

  const entries = Object.fromEntries(NAME_KINDS.map((kind) => [kind, new Map()]));
  for (const row of rows) {
    for (const kind of NAME_KINDS) {
      const text = normalizeName(row[kind]);
      if (!text) continue;
      const entry = entries[kind].get(nameKey(text)) ?? { name: text, rows: 0, resolved: null, decision: null };
      entry.rows += 1;
      entries[kind].set(nameKey(text), entry);
    }
  }
  const refs = {};
  for (const kind of NAME_KINDS) {
    const resolver = createNameResolver(master[kind]);
    const ids = new Set(master[kind].names.map((row) => row.id));
    const { refOf, problems } = decideNames(kind, [...entries[kind].values()], resolver, ids, own(decisions.names, kind));
    refs[kind] = refOf;
    if (problems.length) blocking.push({ code: "invalid_name", messages: problems });
  }
  /** id จริง, "new:…" ของรายการที่จะสร้าง, null = ไม่มีค่า, undefined = ยังไม่ตัดสิน */
  const refOfName = (kind, raw) => {
    const text = normalizeName(raw);
    return text ? refs[kind].get(nameKey(text)) : null;
  };

  // ---------- ชั้นและแผนก (สร้างใหม่ใต้รายการแม่ได้) ----------

  const newFloors = new Map();
  const newDepartments = new Map();
  function resolveChild(list, parentField, parentRef, name, created, keyOf) {
    const text = normalizeName(name);
    if (!text || parentRef === null || parentRef === undefined) return null;
    const hit = typeof parentRef === "number"
      ? list.find((row) => row[parentField] === parentRef && keyOf(row.name) === keyOf(text))
      : null;
    if (hit) return hit.id;
    const key = `${parentRef}|${keyOf(text)}`;
    if (!created.has(key)) created.set(key, { ref: `new:${key}`, parent: parentRef, name: text, rows: 0 });
    created.get(key).rows += 1;
    return `new:${key}`;
  }

  // ---------- สัญญา ----------

  const contractByNo = new Map(contracts.map((c) => [comparableContractNo(c.contract_no), c]));
  const contractsSeen = new Map();
  function resolveContract(raw) {
    const text = normalizeName(raw);
    if (!text) return null;
    const key = comparableContractNo(text);
    const contract = contractByNo.get(key) ?? null;
    if (!contractsSeen.has(key)) contractsSeen.set(key, { contract_no: text, contract_id: contract?.id ?? null, rows: 0 });
    contractsSeen.get(key).rows += 1;
    return contract ?? undefined;
  }

  // ---------- หมวดมิเตอร์ต่อรุ่น ----------

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const categoryByText = new Map();
  for (const c of categories) {
    categoryByText.set(nameKey(c.code), c);
    categoryByText.set(nameKey(c.name), c);
  }
  const deviceBySerial = new Map(devices.map((d) => [d.serial_number.toUpperCase(), d]));
  const brandNameById = new Map(master.brand.names.map((b) => [b.id, b.name]));

  // รุ่นที่มีอยู่ในระบบแล้ว → หมวดที่ใช้บ่อยที่สุด (ไฟล์ถัดไปของรุ่นเดิมไม่ต้องถามซ้ำ)
  const knownModels = new Map();
  for (const d of devices) {
    if (!d.model || !d.meter_category_id) continue;
    const key = modelKey(brandNameById.get(d.brand_id) ?? "", d.model);
    const counts = knownModels.get(key) ?? { categories: new Map(), color: false };
    counts.categories.set(d.meter_category_id, (counts.categories.get(d.meter_category_id) ?? 0) + 1);
    counts.color ||= Boolean(d.has_color_meter);
    knownModels.set(key, counts);
  }
  const models = new Map();

  // ---------- ทีละแถว ----------

  const planned = [];
  for (const row of rows) {
    const reasons = [];
    const notes = [];
    const serial = String(row.serial_number ?? "").trim();
    const existing = serial ? deviceBySerial.get(serial.toUpperCase()) : undefined;

    if (!serial || DASH_OR_EMPTY_SERIAL_REGEX.test(serial)) {
      reasons.push("ไม่มีเลขซีเรียล");
    } else {
      const serialStarter = checkFormulaStarter(serial);
      if (serialStarter) {
        reasons.push(formulaProblem("เลขซีเรียล", serialStarter));
      }
    }

    const modelStarter = checkFormulaStarter(row.model, { allowPlaceholder: true });
    if (modelStarter) {
      reasons.push(formulaProblem("ชื่อรุ่น", modelStarter));
    }

    const locationStarter = checkFormulaStarter(row.location, { allowPlaceholder: true });
    if (locationStarter) {
      reasons.push(formulaProblem("ตำแหน่ง", locationStarter));
    }

    // ฐานเดิมไม่ strict — ค่าที่ยาวเกินเคยถูกตัดทิ้งเงียบๆ แล้วตอบว่านำเข้าสำเร็จ (#85)
    // บอกความยาวจริงกับเพดาน คนแก้ไฟล์จะรู้ว่าต้องตัดเท่าไร
    for (const [field, label, limit] of [
      ["serial_number", "เลขซีเรียล", MAX_LENGTH.serial_number],
      ["model", "ชื่อรุ่น", MAX_LENGTH.model],
      ["location", "ตำแหน่ง", MAX_LENGTH.location],
      ["brand", "ชื่อยี่ห้อ", MAX_LENGTH.brand_name],
      ["building", "ชื่ออาคาร", MAX_LENGTH.name],
      ["division", "ชื่อฝ่าย", MAX_LENGTH.name],
      ["floor", "ชื่อชั้น", MAX_LENGTH.floor_name],
      ["department", "ชื่อแผนก", MAX_LENGTH.name],
    ]) {
      if (tooLong(row[field], limit)) {
        reasons.push(`${label}ยาว ${String(row[field]).length} ตัวอักษร เกิน ${limit} ที่ระบบเก็บได้`);
      }
    }

    const brandRef = refOfName("brand", row.brand);
    const buildingRef = refOfName("building", row.building);
    const divisionRef = refOfName("division", row.division);
    const floorId = resolveChild(floors, "building_id", buildingRef, row.floor, newFloors, floorKey);
    const departmentId = resolveChild(departments, "division_id", divisionRef, row.department, newDepartments, nameKey);
    if (row.department && !row.division) notes.push("มีแผนกแต่ไม่มีฝ่าย — ไม่บันทึกแผนก");
    if (row.floor && !row.building) notes.push("มีชั้นแต่ไม่มีอาคาร — ไม่บันทึกชั้น");

    const contract = resolveContract(row.contract_no);
    if (contract === undefined) reasons.push(`ไม่พบสัญญา "${row.contract_no}" ในระบบ`);

    let priceOverride = null;
    if (row.price_override) {
      const value = Number(row.price_override);
      if (!Number.isFinite(value) || value < 0) reasons.push(`ราคาพิเศษเฉพาะเครื่อง "${row.price_override}" ไม่ใช่ตัวเลข`);
      else priceOverride = value;
    }

    // วันเริ่มรับผิดชอบยอด: วันที่ในไฟล์ (ยืนยันย้อนหลังได้) หรือวันแรกที่มีหลักฐาน (ยืนยันไม่ได้)
    // วันก่อนเริ่มสัญญาใช้วันเริ่มสัญญาแทน — เดือนก่อนสัญญาไม่มีราคา ยอดของเดือนนั้นบันทึกไม่ได้เลย
    let installedOn = row.installed_on || today;
    if (row.installation === "installed" && contract && monthIndex(installedOn.slice(0, 7)) < monthIndex(contract.effective_from.slice(0, 7))) {
      notes.push(`วันติดตั้ง ${installedOn} อยู่ก่อนเดือนเริ่มสัญญา — เริ่มนับยอดที่วันเริ่มสัญญา ${contract.effective_from}`);
      installedOn = contract.effective_from;
    }

    // หมวดมิเตอร์: คอลัมน์ในไฟล์ → ที่ผู้ดูแลเลือก → รุ่นเดียวกันในระบบ
    const key = modelKey(row.brand, row.model);
    let categoryId = null;
    if (row.meter_category) {
      const found = categoryByText.get(nameKey(row.meter_category));
      if (!found || found.is_color) reasons.push(`ไม่พบหมวดมิเตอร์ขาวดำ "${row.meter_category}" ในระบบ`);
      else categoryId = found.id;
    } else if (row.model) {
      const model = models.get(key) ?? { key, brand: row.brand, model: row.model, rows: 0, contracts: new Set(), has_color_meter: false };
      model.rows += 1;
      if (contract) model.contracts.add(contract.id);
      model.has_color_meter ||= Boolean(row.has_color_meter);
      models.set(key, model);
    }

    planned.push({
      source: row,
      existing,
      reasons,
      notes,
      key,
      values: {
        serial_number: row.serial_number,
        brand_id: brandRef,
        model: row.model || null,
        building_id: buildingRef,
        floor_id: floorId,
        location: row.location || null,
        division_id: divisionRef,
        department_id: departmentId,
        contract_id: contract?.id ?? null,
        contract_start: contract?.effective_from ?? null,
        price_override: priceOverride,
        status: row.status,
        installation_status: row.installation,
        installed_on: installedOn,
        installed_on_known: Boolean(row.installed_on_known),
        meter_category_id: categoryId,
        has_color_meter: Boolean(row.has_color_meter),
      },
    });
  }

  // ---------- ตัดสินหมวดของแต่ละรุ่น ----------

  for (const model of models.values()) {
    const decided = own(decisions.models, model.key);
    const decidedCategory = decided && categoryById.get(Number(decided.meter_category_id));
    const known = knownModels.get(model.key);
    if (decidedCategory && !decidedCategory.is_color) {
      model.meter_category_id = decidedCategory.id;
      model.has_color_meter = Boolean(decided.has_color_meter) || model.has_color_meter;
      model.source = "decision";
    } else if (known) {
      model.meter_category_id = [...known.categories].sort((a, b) => b[1] - a[1])[0][0];
      model.has_color_meter ||= known.color;
      model.source = "existing";
    } else {
      model.meter_category_id = null;
      model.source = null;
    }
    // รุ่นที่ไม่มีสัญญาใช้หมวดทั่วไปของระบบได้ รุ่นที่มีสัญญาต้องรู้หมวดก่อนบันทึก
    model.required = model.contracts.size > 0;
  }

  // ---------- ข้อสรุปรายแถว ----------

  const result = [];
  for (const item of planned) {
    const { source, existing, reasons, notes, values } = item;
    const model = models.get(item.key);
    if (model && !source.meter_category) {
      values.meter_category_id = model.meter_category_id;
      values.has_color_meter = values.has_color_meter || model.has_color_meter;
    }

    // ตรวจราคา: สัญญาต้องมีราคาของหมวดที่เครื่องจะใช้ ไม่งั้นยอดแรกถูกปฏิเสธ
    if (values.contract_id && values.meter_category_id) {
      const contract = contracts.find((c) => c.id === values.contract_id);
      const category = categoryById.get(values.meter_category_id);
      if (!contract.category_ids.includes(values.meter_category_id)) {
        reasons.push(`สัญญา ${contract.contract_no} ไม่มีราคาหมวด "${category.name}"`);
      }
      const color = categories.find((c) => c.is_color);
      if (values.has_color_meter && color && !contract.category_ids.includes(color.id)) {
        reasons.push(`เครื่องมีมิเตอร์สีแต่สัญญา ${contract.contract_no} ไม่มีราคาหมวด "${color.name}"`);
      }
    }

    const waiting = NAME_KINDS.filter((kind) => values[`${kind}_id`] === undefined);
    if (model?.required && !model.meter_category_id && !source.meter_category) waiting.push("model");

    let action;
    const fill = [];
    if (reasons.length) action = "skip";
    else if (waiting.length) action = "pending";
    else if (!existing) action = "create";
    else action = planFill(existing, values, fill, source, warnings);

    result.push({
      sheet: source.sheet,
      row: source.row,
      serial_number: source.serial_number,
      device_id: existing?.id ?? null,
      action,
      reasons,
      notes,
      waiting,
      fill,
      installation: action === "create" ? values.installation_status : null,
      values,
      display: {
        brand: source.brand,
        model: source.model,
        building: source.building,
        floor: source.floor,
        division: source.division,
        department: source.department,
        location: source.location,
        contract_no: source.contract_no,
      },
    });
  }

  // ---------- เลขซีเรียลที่น่าจะพิมพ์ผิด ----------

  const known = new Set(devices.map((d) => d.serial_number.toUpperCase()));
  const index = serialIndex([...devices.map((d) => d.serial_number), ...result.map((r) => r.serial_number)]);
  const reported = new Set();
  for (const row of result.filter((r) => r.action === "create")) {
    for (const other of index.similar(row.serial_number)) {
      const pair = [row.serial_number.toUpperCase(), other.toUpperCase()].sort().join("|");
      if (reported.has(pair)) continue;
      reported.add(pair);
      warnings.push({
        sheet: row.sheet,
        row: row.row,
        serial_number: row.serial_number,
        reason: `เลขซีเรียลคล้าย "${other}"${known.has(other.toUpperCase()) ? " ที่มีในระบบแล้ว" : " ในไฟล์เดียวกัน"} — ตรวจว่าพิมพ์ผิดหรือไม่`,
      });
    }
  }

  // ---------- สิ่งที่ยังต้องตัดสิน ----------

  const unresolved = Object.fromEntries(NAME_KINDS.map((kind) => [
    kind,
    [...entries[kind].values()].filter((e) => !e.resolved).map((e) => ({ name: e.name, rows: e.rows, decision: e.decision })),
  ]));
  for (const kind of NAME_KINDS) {
    const open = unresolved[kind].filter((e) => !e.decision);
    if (open.length) blocking.push({ code: `undecided_${kind}`, count: open.length });
  }
  const modelList = [...models.values()].map((m) => ({
    key: m.key,
    brand: m.brand,
    model: m.model,
    rows: m.rows,
    meter_category_id: m.meter_category_id,
    has_color_meter: Boolean(m.has_color_meter),
    source: m.source,
    required: m.required,
  }));
  const openModels = modelList.filter((m) => m.required && !m.meter_category_id);
  if (openModels.length) blocking.push({ code: "undecided_model", count: openModels.length });
  const missingContracts = [...contractsSeen.values()].filter((c) => !c.contract_id);
  if (missingContracts.length) blocking.push({ code: "missing_contract", contracts: missingContracts.map((c) => c.contract_no) });

  const count = (action) => result.filter((r) => r.action === action).length;
  const created = result.filter((r) => r.action === "create");
  return {
    valid: blocking.length === 0 && (count("create") + count("fill") > 0),
    blocking,
    unresolved,
    models: modelList,
    contracts: [...contractsSeen.values()],
    new_floors: [...newFloors.values()],
    new_departments: [...newDepartments.values()],
    rows: result,
    warnings,
    summary: {
      create: count("create"),
      fill: count("fill"),
      unchanged: count("unchanged"),
      skip: count("skip"),
      pending: count("pending"),
      installed: created.filter((r) => r.installation === "installed").length,
      not_installed: created.filter((r) => r.installation === "not_installed").length,
      unverified: created.filter((r) => !r.installation).length,
    },
  };
}

/**
 * เครื่องที่มีอยู่แล้ว: เติมทีละช่องเฉพาะช่องที่ในระบบยังว่าง ช่องที่มีค่าแล้วไม่แตะ
 *
 * เครื่องสัญญา SUTH 86 ที่ลงจากรายงานมิเตอร์มีแค่ชื่อจุดติดตั้ง ไม่มีอาคาร/ฝ่าย — ไฟล์ทะเบียน
 * เติมสองช่องนั้นได้โดยไม่ต้องย้ายเครื่อง แต่ห้ามเติมชั้นของอาคารอื่นหรือแผนกของฝ่ายอื่น และห้าม
 * แตะที่ตั้งของเครื่องที่เคยย้ายแล้ว เพราะไม่รู้ว่าไฟล์นี้หมายถึงช่วงไหนของประวัติ (ADR-0014)
 *
 * @returns {"fill"|"unchanged"}
 */
function planFill(existing, values, fill, source, warnings) {
  const where = { sheet: source.sheet, row: source.row, serial_number: source.serial_number };
  const empty = (value) => value === null || value === undefined || value === "";
  const same = (a, b) => (typeof a === "number" ? a === b : nameKey(a) === nameKey(b));
  const differs = [];

  for (const field of ["brand_id", "model"]) {
    if (!empty(values[field]) && empty(existing[field])) fill.push(field);
  }

  const moved = Number(existing.history_rows ?? 0) > 1;
  // ชั้นเติมได้เมื่ออาคารของเครื่องเป็นอาคารเดียวกับในไฟล์ (หรือกำลังเติมอาคารในแถวนี้) — แผนกกับฝ่ายเช่นกัน
  const parentMatches = {
    floor_id: empty(existing.building_id) || same(values.building_id, existing.building_id),
    department_id: empty(existing.division_id) || same(values.division_id, existing.division_id),
  };
  const locationFill = [];
  for (const field of LOCATION_FIELDS) {
    const incoming = values[field];
    if (empty(incoming)) continue;
    const current = existing[field];
    if (empty(current)) {
      if (field in parentMatches && !parentMatches[field]) differs.push(field);
      else locationFill.push(field);
      continue;
    }
    // ข้อความจุดติดตั้งของแต่ละไฟล์เขียนไม่เหมือนกันเสมอ ("หอ ก_เคาน์เตอร์" กับ "เคาน์เตอร์")
    // การย้ายจริงคืออาคาร ชั้น ฝ่าย หรือแผนกเปลี่ยน จึงเตือนเฉพาะช่องเหล่านั้น
    if (!same(incoming, current) && field !== "location") differs.push(field);
  }
  if (moved && locationFill.length) {
    warnings.push({ ...where, reason: "เครื่องนี้เคยย้ายแล้ว — ไม่เติมที่ตั้งจากไฟล์ เพราะไม่รู้ว่าไฟล์หมายถึงช่วงไหน แก้ที่หน้าทะเบียน" });
  } else {
    fill.push(...locationFill);
  }

  if (existing.contract_id && values.contract_id && existing.contract_id !== values.contract_id) {
    warnings.push({ ...where, reason: "สัญญาในไฟล์ต่างจากในระบบ — ไม่เปลี่ยนสัญญาจากการนำเข้า แก้ที่หน้าทะเบียน" });
  }
  // การผูกสัญญาต้องระบุวันเริ่มคิดเงิน (ADR-0019) การนำเข้าจึงไม่ผูกให้เครื่องที่มีอยู่แล้ว — แต่ต้องบอก
  // ไม่งั้นเครื่องยังคิดเงินไม่ได้ต่อไปโดยไม่มีใครรู้ (#155)
  if (!existing.contract_id && values.contract_id) {
    warnings.push({
      ...where,
      reason: `เครื่องนี้ยังไม่ผูกสัญญา แต่ไฟล์ระบุสัญญา ${source.contract_no} — การนำเข้าไม่ผูกสัญญาให้เครื่องที่มีอยู่แล้ว ผูกที่หน้าทะเบียนพร้อมวันเริ่มคิดเงิน`,
    });
  }
  if (differs.length) {
    warnings.push({ ...where, reason: "ที่ตั้งหรือหน่วยงานในไฟล์ต่างจากในระบบ — ไม่ย้ายเครื่องจากการนำเข้า ถ้าย้ายจริงให้ย้ายที่หน้าทะเบียน" });
  }
  return fill.length ? "fill" : "unchanged";
}

module.exports = { planRegistryImport, likelyTypo, serialIndex, modelKey, floorKey };
