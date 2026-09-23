// apps/api/src/import/session-service.js
//
// import session — หนึ่งไฟล์จากผู้ให้เช่า → ทะเบียนเครื่อง + ยอดมิเตอร์ ตรวจก่อน บันทึกทีหลัง (ADR-0027, ADR-0028)
//
// ## ขั้นตอน
//
//   อัปโหลด → ตรวจ (ลองเขียนจริงใน transaction ที่ย้อนกลับเสมอ) → ผู้ดูแลตัดสิน/แก้เงื่อนไข → ตรวจใหม่ → บันทึก
//
// การตรวจกับการบันทึกเรียก analyse() ตัวเดียวกัน ต่างกันแค่ transaction ของอย่างหลัง commit ได้ ตัวเลขที่ผู้ใช้เห็น
// ก่อนกดบันทึกจึงมาจากเส้นทางเขียนและ view คิดเงินชุดเดียวกับของจริง ลายนิ้วมือ (fingerprint) ของผลตรวจต้อง
// ตรงกับของตอนบันทึก ไม่ตรง = มีคนแก้ข้อมูลระหว่างนั้น → ย้อนกลับแล้วให้ผู้ใช้ดูผลใหม่ก่อน
//
// ## สิ่งที่ตรวจให้เองก่อนบันทึก (checklist)
//
//   ไฟล์อ่านได้ → สัญญาที่ไฟล์อ้างมีในระบบและตรงกับหัวไฟล์ → ชื่อยี่ห้อ/อาคาร/ฝ่ายที่ไม่รู้จัก → หมวดมิเตอร์ของรุ่น
//   → เครื่องที่จะสร้าง/เติม → ยอดที่จะเขียน (ราคา สัญญา ความต่อเนื่องของเลขมิเตอร์) → ยอดตามใบแจ้งหนี้เทียบท้ายแผ่น
//   → ปีงบที่ครอบเดือนในไฟล์

const fs = require("fs");
const crypto = require("crypto");
const db = require("../shared/db");
const { ApiError, badRequest, conflict } = require("../shared/http-error");
const { logger } = require("../shared/logger");
const { fiscalYearOfMonth, getFiscalYearRange } = require("@suth/domain");
const { today } = require("../devices/contract-history");
const { readAllSheets } = require("./workbook");
const { validateDecisions } = require("./decisions");
const { parseRegistryWorkbook } = require("./registry-sheet");
const { planRegistryImport, modelKey } = require("./registry-plan");
const { loadRegistryContext, applyRegistryPlan, describeRegistryPlan } = require("./registry-import");
const { parseVendorWorkbook, comparableContractNo } = require("./vendor-meter");
const { splitBrandModel } = require("./brand-model");
const { vendorTerms } = require("./vendor-terms");
const {
  parseMeterMonthHeader,
  loadMeters,
  readingsFromSheets,
  compareWithExisting,
  writeCandidates,
  checkWrittenReadings,
} = require("./readings-import");
const { contractBody, writeContract } = require("../contracts/contract-write");
const store = require("./session-store");
const { autoNameDecisions, autoModelDecisions, contractFromPrefill, autoCommitBlockers } = require("./auto-resolve");

/** เพดานรายการที่เก็บในผลตรวจ — ผลตรวจอยู่ในแถวเดียวของฐาน รายการเต็มดูจากไฟล์ได้เสมอ */
const KEEP = { rows: 300, warnings: 200, errors: 300, overwrite: 100 };
/** ความต่างของยอดตามใบแจ้งหนี้ที่ถือว่าเท่ากัน — ผู้ให้เช่าปัดยอดรวมที่ไม่ได้ปัดรายบรรทัด ต่างได้ 1 สตางค์ต่องวด */
const RECONCILE_TOLERANCE = 0.01;

class DryRun extends Error {}
class StaleImport extends Error {
  constructor(analysis) {
    super("stale");
    this.analysis = analysis;
  }
}

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const money = (value) => (value === null || value === undefined ? null : Number(value));

// ============================================================
// อ่านไฟล์และบอกชนิด
// ============================================================

/** ไฟล์เทมเพลตยอดรายเดือนแบบเดิม (SN. + meter M/YY) — ไม่มีข้อมูลเครื่อง มีแต่ยอด */
function isReadingsTemplate(raw) {
  const rows = raw[0]?.rows ?? [];
  return rows.slice(0, 15).some((row) =>
    row.some((cell) => /^sn\.?$/i.test(String(cell ?? "").trim())) &&
    row.some((cell) => parseMeterMonthHeader(cell))
  );
}

/**
 * @returns {{ kind: string, sheets: object[], raw: object[], registry: object|null, hasRegistry: boolean, hasReadings: boolean }}
 */
function inspectFile(session) {
  const path = store.absoluteFilePath(session);
  if (!fs.existsSync(path)) {
    throw badRequest("ไม่พบไฟล์ต้นฉบับของงานนำเข้านี้บนเซิร์ฟเวอร์", {
      code: "import_file_missing",
      detail: "อัปโหลดไฟล์ใหม่เป็นงานนำเข้าใหม่",
    });
  }
  const sheets = readAllSheets(path, session.file_name);
  const raw = sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rawRows }));

  const registry = parseRegistryWorkbook(sheets);
  let kind = null;
  if (registry?.sheets.some((sheet) => sheet.kind === "meter_report")) kind = "meter_report";
  else if (registry) kind = "registry";
  else if (isReadingsTemplate(raw)) kind = "readings_template";
  if (!kind) {
    throw badRequest("ไม่รู้จักรูปแบบไฟล์นี้", {
      code: "unknown_import_file",
      detail: "รับรายงานมิเตอร์หรือรายงานสถานะเครื่องของผู้ให้เช่า เทมเพลตทะเบียนของระบบ หรือเทมเพลตยอดรายเดือน (SN. + meter M/YY)",
    });
  }
  return {
    kind,
    sheets,
    raw,
    registry,
    hasRegistry: kind === "meter_report" || kind === "registry",
    hasReadings: kind === "meter_report" || kind === "readings_template",
  };
}

// ============================================================
// เงื่อนไขล่วงหน้า: สัญญาและปีงบ
// ============================================================

/** ราคาต่อหน้าของแต่ละหมวดจากคอลัมน์ Cost/Click ของไฟล์ — ใช้เติมฟอร์มสร้างสัญญา */
function pricesFromFile(info, plan, decisions, categories) {
  const vendor = parseVendorWorkbook(info.raw);
  if (!vendor) return { price_lines: [], unmapped_models: [] };
  const color = categories.find((c) => c.is_color);
  const byCategory = new Map();
  const unmapped = new Set();
  for (const reading of vendor.readings) {
    if (reading.file_price === null) continue;
    let categoryId = null;
    if (reading.meter === "color") categoryId = color?.id ?? null;
    else {
      const split = splitBrandModel(reading.model);
      const key = modelKey(split.brand, split.model);
      categoryId = Number(decisions.models?.[key]?.meter_category_id) ||
        plan?.models.find((m) => m.key === key)?.meter_category_id || null;
      if (!categoryId) unmapped.add(`${split.brand} ${split.model}`.trim());
    }
    if (!categoryId) continue;
    const line = byCategory.get(categoryId) ?? { category_id: categoryId, prices: new Set() };
    line.prices.add(String(reading.file_price));
    byCategory.set(categoryId, line);
  }
  const price_lines = [...byCategory.values()].map(({ category_id, prices }) => ({
    category_id,
    category_name: categories.find((c) => c.id === category_id)?.name ?? "",
    price_per_page: [...prices][0],
    // สองราคาในหมวดเดียว = หมวดของรุ่นผิด หรือไฟล์มีราคาพิเศษเฉพาะเครื่อง — ให้คนดู ไม่เลือกให้
    conflicting_prices: prices.size > 1 ? [...prices] : undefined,
  }));
  return { price_lines, unmapped_models: [...unmapped] };
}

async function contractChecks(conn, info, plan, decisions, context) {
  const terms = vendorTerms(info.raw);
  const [systemRows] = await conn.query(
    `SELECT id, contract_no, DATE_FORMAT(effective_from, '%Y-%m-%d') AS effective_from,
            DATE_FORMAT(effective_to, '%Y-%m-%d') AS effective_to, monthly_rental, vat_rate
     FROM contracts`
  );
  const systemBy = new Map(systemRows.map((row) => [comparableContractNo(row.contract_no), row]));

  // สัญญาที่ไฟล์อ้าง: จากหัวแผ่น (รายงานมิเตอร์) หรือจากแถวทะเบียน (รายงานสถานะเครื่อง / เทมเพลต)
  const referenced = new Map();
  for (const term of terms) referenced.set(comparableContractNo(term.contract_no), { contract_no: term.contract_no, file: term });
  for (const c of plan?.contracts ?? []) {
    const key = comparableContractNo(c.contract_no);
    if (!referenced.has(key)) referenced.set(key, { contract_no: c.contract_no, file: null });
  }

  const acknowledged = decisions.acknowledged ?? {};
  return [...referenced.entries()].map(([key, { contract_no, file }]) => {
    const system = systemBy.get(key) ?? null;
    if (!system) {
      const { price_lines, unmapped_models } = pricesFromFile(info, plan, decisions, context.categories);
      return {
        key,
        contract_no,
        state: "missing",
        file,
        system: null,
        prefill: {
          contract_no,
          effective_from: file?.effective_from ?? "",
          effective_to: file?.effective_to ?? "",
          monthly_rental: file?.monthly_rental ?? null,
          vat_rate: file?.vat_rate ?? null,
          price_lines,
          unmapped_models,
          term_source: file?.term_source ?? null,
        },
        issues: [],
      };
    }

    const issues = [];
    const issue = (field, severity, fileValue, systemValue, message) => {
      const ackKey = `contract:${key}:${field}`;
      const reason = acknowledged[ackKey];
      issues.push({ field, key: ackKey, severity: reason ? "acknowledged" : severity, file: fileValue, system: systemValue, message, reason: reason ?? null });
    };
    if (file?.effective_from && (file.effective_from !== system.effective_from || file.effective_to !== system.effective_to)) {
      issue("term", "warning", `${file.effective_from} – ${file.effective_to}`, `${system.effective_from} – ${system.effective_to}`,
        "อายุสัญญาในไฟล์ต่างจากในระบบ — งวดที่อยู่นอกอายุสัญญาในระบบจะหาราคาไม่ได้");
    }
    if (file?.monthly_rental !== null && file?.monthly_rental !== undefined && money(file.monthly_rental) !== money(system.monthly_rental ?? 0)) {
      issue("rental", "blocking", file.monthly_rental, system.monthly_rental, "ค่าเช่าคงที่ต่อเดือนในไฟล์ต่างจากในระบบ — ยอดตามใบแจ้งหนี้จะไม่ตรงกับของผู้ให้เช่า");
    }
    if (file?.vat_rate !== null && file?.vat_rate !== undefined && money(file.vat_rate) !== money(system.vat_rate ?? 0)) {
      issue("vat", "blocking", file.vat_rate, system.vat_rate, "อัตรา VAT ในไฟล์ต่างจากในระบบ — ยอดตามใบแจ้งหนี้รวม VAT จะไม่ตรงกับของผู้ให้เช่า");
    }
    return {
      key,
      contract_no,
      state: issues.some((i) => i.severity === "blocking") ? "mismatch" : issues.length ? "warning" : "ok",
      file,
      system: { ...system, monthly_rental: system.monthly_rental === null ? null : String(system.monthly_rental), vat_rate: system.vat_rate === null ? null : String(system.vat_rate) },
      prefill: null,
      issues,
    };
  });
}

async function fiscalYearCheck(conn, months) {
  const needed = [...new Set(months.map((month) => fiscalYearOfMonth(month)).filter(Boolean))].sort();
  const [rows] = await conn.query("SELECT year FROM fiscal_year");
  const existing = new Set(rows.map((row) => Number(row.year)));
  return { months, needed: needed.map(String), missing: needed.filter((year) => !existing.has(year)).map(String) };
}

/** ยอดตามใบแจ้งหนี้ของระบบ (หลังเขียนยอดใน transaction นี้) เทียบกับยอดท้ายแผ่นของไฟล์ */
async function reconcile(conn, contracts, months) {
  const lines = [];
  for (const contract of contracts) {
    if (!contract.system || !contract.file) continue;
    for (const period of contract.file.periods) {
      if (!months.includes(period.month)) continue;
      const [[row]] = await conn.query(
        "SELECT print_cost, invoice_total FROM v_contract_invoice WHERE contract_id = ? AND month = ?",
        [contract.system.id, period.month]
      );
      const basis = period.invoice_total !== null ? "invoice" : "print";
      const fileTotal = basis === "invoice" ? money(period.invoice_total) : money(period.print_total);
      if (fileTotal === null) continue;
      const systemTotal = row ? money(basis === "invoice" ? row.invoice_total : row.print_cost) : 0;
      const diff = Math.round((systemTotal - fileTotal) * 100) / 100;
      lines.push({
        contract_no: contract.contract_no,
        month: period.month,
        basis,
        file_total: fileTotal.toFixed(2),
        system_total: systemTotal.toFixed(2),
        diff: diff.toFixed(2),
        matches: Math.abs(diff) <= RECONCILE_TOLERANCE,
      });
    }
  }
  return lines;
}

// ============================================================
// วิเคราะห์ (ใช้ทั้งตรวจและบันทึก)
// ============================================================

/**
 * วางแผนทั้งไฟล์ แล้วเขียนลง conn — ผู้เรียกเป็นคนเลือกว่าจะ commit หรือย้อนกลับ
 *
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} session แถว import_session (ใช้ decisions และ file_sha256)
 * @param {ReturnType<typeof inspectFile>} info
 * @param {{ actorId: number|null, importSessionId: number|null }} options importSessionId = ที่มาของข้อมูล (เฉพาะตอนบันทึก)
 */
async function analyse(conn, session, info, { actorId, importSessionId }) {
  const decisions = session.decisions ?? {};
  const context = await loadRegistryContext(conn);
  const plan = info.hasRegistry
    ? planRegistryImport({ rows: info.registry.rows, ...context, decisions, today: today() })
    : null;
  const described = plan ? describeRegistryPlan(info.registry, plan, context) : null;
  const contracts = await contractChecks(conn, info, plan, decisions, context);

  const registryBlocked = Boolean(plan?.blocking.length);
  const registryChanges = plan ? plan.summary.create + plan.summary.fill : 0;
  const outcome = { devices_created: 0, devices_filled: 0, readings_new: 0, readings_overwritten: 0, readings_unchanged: 0, months: [] };

  let readings = { status: info.hasReadings ? "waiting" : "none" };
  let readingSignature = [];
  let reconciliation = [];
  let months = parseVendorWorkbook(info.raw)?.sheets.map((sheet) => sheet.month) ?? [];

  if (!registryBlocked) {
    if (plan && registryChanges) {
      const applied = await applyRegistryPlan(conn, plan, { userId: actorId, importSessionId });
      outcome.devices_created = applied.created;
      outcome.devices_filled = applied.filled;
    }
    if (info.hasReadings) {
      const meters = await loadMeters(conn);
      const mapped = readingsFromSheets(info.raw, meters);
      months = mapped.months;
      const compared = await compareWithExisting(conn, mapped.candidates, mapped.months);
      await writeCandidates(conn, [...compared.newRows, ...compared.overwriteRows], { importSessionId });
      const checked = await checkWrittenReadings(conn, mapped.candidates, mapped.months);
      reconciliation = await reconcile(conn, contracts, mapped.months);
      const errors = [...mapped.errors, ...checked.errors];
      Object.assign(outcome, {
        readings_new: compared.newRows.length,
        readings_overwritten: compared.overwriteRows.length,
        readings_unchanged: compared.unchangedRows.length,
        months: mapped.months,
      });
      readings = {
        status: "checked",
        format: mapped.format,
        months: mapped.months,
        counts: { new: compared.newRows.length, overwrite: compared.overwriteRows.length, unchanged: compared.unchangedRows.length },
        overwrite_rows: compared.overwriteRows.slice(0, KEEP.overwrite).map(({ serial_number, meter, month, pages, previous_pages, sheet, row }) =>
          ({ serial_number, meter, month, pages, previous_pages, sheet, row })),
        error_count: errors.length,
        errors: errors.slice(0, KEEP.errors),
        warning_count: checked.warnings.length,
        warnings: checked.warnings.slice(0, KEEP.warnings),
        invoice: checked.invoice,
      };
      // ไม่ใช้ id ของเครื่อง/มิเตอร์ — เครื่องใหม่ได้ id ใหม่ทุกครั้งที่ลองเขียน (InnoDB ไม่คืนเลขที่ย้อนกลับ)
      readingSignature = mapped.candidates.map((c) => [
        c.serial_number, c.meter, c.month, c.pages, c.meter_start, c.meter_end,
        compared.existingMap.get(`${c.meter_id}|${c.month}`) ?? null,
      ]);
    }
  }

  const fiscalYears = await fiscalYearCheck(conn, months);
  const validation = buildValidation({ info, plan, described, contracts, readings, reconciliation, fiscalYears, registryChanges });
  const fingerprint = sha256(JSON.stringify({
    file: session.file_sha256,
    decisions,
    registry: plan
      ? {
          rows: plan.rows.map((r) => [r.serial_number, r.action, r.device_id, r.fill, r.values]),
          unresolved: plan.unresolved,
          floors: plan.new_floors.map((f) => [f.ref, f.name]),
          departments: plan.new_departments.map((d) => [d.ref, d.name]),
        }
      : null,
    readings: readingSignature,
    contracts: contracts.map((c) => [c.key, c.state, c.system, c.issues.map((i) => [i.field, i.severity])]),
  }));
  return { validation, fingerprint, outcome: { ...outcome, reconciliation, invoice: readings.invoice ?? [] } };
}

/** สรุปผลตรวจเป็นสิ่งที่หน้าเว็บแสดง — checklist เรียงตามลำดับที่ผู้ใช้ต้องทำ */
function buildValidation({ info, plan, described, contracts, readings, reconciliation, fiscalYears, registryChanges }) {
  const checklist = [];
  const add = (key, state, title, detail = null, action = null) => checklist.push({ key, state, title, detail, action });

  const sheetCount = info.registry?.sheets.length ?? info.raw.length;
  const kindLabel = { meter_report: "รายงานมิเตอร์", registry: "ทะเบียนเครื่อง", readings_template: "เทมเพลตยอดรายเดือน" }[info.kind];
  add("file", "ok", `อ่านไฟล์ได้: ${kindLabel} ${sheetCount} แผ่น`,
    fiscalYears.months.length ? `งวด ${fiscalYears.months[0]} ถึง ${fiscalYears.months.at(-1)}` : null);

  for (const contract of contracts) {
    if (contract.state === "missing") {
      add(`contract:${contract.key}`, "blocking", `ยังไม่มีสัญญา ${contract.contract_no} ในระบบ`,
        contract.file ? "สร้างจากหัวไฟล์ได้เลย — ตรวจวันที่ ค่าเช่า VAT และราคาก่อนบันทึก" : "สร้างสัญญาจากเอกสารสัญญา แล้วตรวจไฟล์อีกครั้ง",
        { type: "create_contract", contract_key: contract.key });
    } else if (contract.state === "mismatch") {
      add(`contract:${contract.key}`, "blocking", `สัญญา ${contract.contract_no} ในระบบไม่ตรงกับไฟล์`,
        contract.issues.filter((i) => i.severity === "blocking").map((i) => i.message).join(" · "),
        { type: "resolve_contract", contract_key: contract.key, contract_id: contract.system.id });
    } else if (contract.state === "warning") {
      add(`contract:${contract.key}`, "warning", `สัญญา ${contract.contract_no}: มีข้อที่ควรตรวจ`,
        contract.issues.map((i) => i.message).join(" · "), { type: "resolve_contract", contract_key: contract.key, contract_id: contract.system.id });
    } else {
      add(`contract:${contract.key}`, "ok", `สัญญา ${contract.contract_no} ตรงกับไฟล์`);
    }
  }

  if (plan) {
    const undecided = plan.blocking.filter((b) => /^undecided_(brand|building|division)$/.test(b.code));
    const count = undecided.reduce((sum, b) => sum + b.count, 0);
    add("names", count ? "blocking" : "ok",
      count ? `ยังต้องเลือกชื่อยี่ห้อ/อาคาร/ฝ่ายที่ไม่รู้จัก ${count} ชื่อ` : "ชื่อยี่ห้อ อาคาร ฝ่าย ครบแล้ว",
      count ? "สร้างใหม่ หรือบอกว่าเป็นชื่อเรียกอื่นของรายการเดิม ระบบจำไว้ใช้ครั้งหน้า" : null,
      count ? { type: "decide_names" } : null);
    const invalid = plan.blocking.find((b) => b.code === "invalid_name");
    if (invalid) add("names:invalid", "blocking", "ชื่อที่ตั้งใช้ไม่ได้", invalid.messages.join(" · "), { type: "decide_names" });
    // สัญญาที่ไฟล์อ้างยังไม่มี = ตัววางแผนยังไม่บังคับหมวดของรุ่น (ไม่มีสัญญาให้เทียบราคา) แต่ราคาของสัญญาที่จะสร้าง
    // จากไฟล์ขึ้นกับหมวดของรุ่น — ถ้าบอกว่า "ครบแล้ว" ตอนนี้ ผู้ใช้จะกดสร้างสัญญาที่ไม่มีรายการราคา (พบตอนทดสอบกับไฟล์จริง)
    const contractMissing = contracts.some((c) => c.state === "missing");
    const undecidedModels = contractMissing
      ? plan.models.filter((m) => !m.meter_category_id).length
      : plan.blocking.find((b) => b.code === "undecided_model")?.count ?? 0;
    add("models", undecidedModels ? "blocking" : "ok",
      undecidedModels ? `ยังต้องเลือกหมวดมิเตอร์ของรุ่นใหม่ ${undecidedModels} รุ่น` : "หมวดมิเตอร์ของทุกรุ่นครบแล้ว",
      undecidedModels && contractMissing ? "เลือกก่อนสร้างสัญญา — ราคาต่อหน้าของสัญญาที่เติมจากไฟล์ขึ้นกับหมวดของรุ่น" : null,
      undecidedModels ? { type: "decide_models" } : null);
    const s = plan.summary;
    if (plan.blocking.some((b) => b.code === "missing_contract")) {
      // ทุกแถวของสัญญาที่ยังไม่มีถูกนับเป็น "ข้าม" ซึ่งอ่านแล้วเหมือนไฟล์ผิด — จริงๆ แค่รอสัญญา
      add("devices", "waiting", "เครื่อง: รอสร้างสัญญาก่อน", "จำนวนเครื่องที่จะสร้างและเติมจะขึ้นหลังมีสัญญาในระบบ");
    } else {
      add("devices", s.skip ? "warning" : "ok",
        `เครื่อง: สร้างใหม่ ${s.create} · เติมข้อมูล ${s.fill} · ไม่เปลี่ยน ${s.unchanged}${s.skip ? ` · ข้าม ${s.skip}` : ""}`,
        s.skip ? "แถวที่ข้ามจะไม่ถูกนำเข้า ดูเหตุผลในรายการแถว" : null);
    }
    const warnings = described.warnings;
    if (warnings.length) {
      const lookAlike = warnings.filter((w) => /เลขซีเรียลคล้าย/.test(w.reason)).length;
      add("registry_warnings", "warning", `คำเตือนของทะเบียน ${warnings.length} รายการ`,
        lookAlike ? `รวมเลขซีเรียลที่คล้ายเครื่องที่มีอยู่ ${lookAlike} รายการ — ถ้าเป็นเครื่องเดียวกันที่พิมพ์ผิด การบันทึกจะสร้างเครื่องซ้ำ` : "บันทึกได้ แต่ควรตรวจก่อน");
    }
  }

  if (info.hasReadings) {
    if (readings.status === "waiting") {
      add("readings", "waiting", "ยอดมิเตอร์: รอให้ข้อมูลเครื่องพร้อมก่อน", "ตรวจยอดได้หลังตัดสินชื่อ หมวดมิเตอร์ และสัญญาครบ");
    } else {
      const { counts } = readings;
      add("readings", readings.error_count ? "blocking" : "ok",
        `ยอดมิเตอร์: ใหม่ ${counts.new} · เขียนทับ ${counts.overwrite} · ไม่เปลี่ยน ${counts.unchanged}`,
        readings.error_count ? `มี ${readings.error_count} รายการที่ต้องแก้ก่อน — ทั้งไฟล์ยังบันทึกไม่ได้` : null);
      const off = reconciliation.filter((line) => !line.matches);
      if (reconciliation.length) {
        add("reconciliation", off.length ? "warning" : "ok",
          off.length ? `ยอดตามใบแจ้งหนี้ต่างจากท้ายแผ่น ${off.length} งวด` : `ยอดตามใบแจ้งหนี้ตรงกับท้ายแผ่นทุกงวด (${reconciliation.length} งวด)`,
          off.length ? "ตรวจค่าเช่า VAT และราคาในสัญญา หรือยอดที่ผู้ให้เช่าแก้มือในไฟล์" : null);
      }
    }
  }

  if (fiscalYears.missing.length) {
    add("fiscal_years", "warning", `ยังไม่มีปีงบ ${fiscalYears.missing.join(", ")} ที่ครอบเดือนในไฟล์`,
      "บันทึกได้ แต่รายงานของปีงบนั้นจะเปิดไม่ได้จนกว่าจะสร้างปีงบ", { type: "create_fiscal_years", years: fiscalYears.missing });
  }

  const readingsToWrite = readings.status === "checked" ? readings.counts.new + readings.counts.overwrite : 0;
  const nothing = registryChanges === 0 && readingsToWrite === 0 && !checklist.some((c) => c.state === "blocking" || c.state === "waiting");
  if (nothing) add("nothing", "blocking", "ไม่มีอะไรใหม่ในไฟล์นี้", "ทุกเครื่องและยอดในไฟล์มีอยู่ในระบบแล้วด้วยค่าเดียวกัน");

  const canCommit = !checklist.some((c) => c.state === "blocking" || c.state === "waiting");
  return {
    validated_at: new Date().toISOString(),
    kind: info.kind,
    can_commit: canCommit,
    checklist,
    registry: described
      ? {
          sheets: described.sheets,
          errors: described.errors,
          summary: described.summary,
          blocking: described.blocking,
          unresolved: described.unresolved,
          models: described.models,
          contracts: described.contracts,
          new_floors: described.new_floors,
          new_departments: described.new_departments,
          warning_count: described.warnings.length,
          look_alike_count: described.warnings.filter((w) => /เลขซีเรียลคล้าย/.test(w.reason)).length,
          warnings: described.warnings.slice(0, KEEP.warnings),
          row_count: described.rows.length,
          attention_rows: described.rows.filter((r) => r.action === "skip" || r.action === "pending" || r.notes?.length).slice(0, KEEP.rows),
          choices: described.choices,
        }
      : null,
    readings,
    contracts,
    reconciliation,
    fiscal_years: fiscalYears,
  };
}

// ============================================================
// ขั้นตอนของ session
// ============================================================

const actorId = (actor) => actor?.id ?? null;

async function detail(id) {
  const session = await store.getSession(id);
  const [duplicates, events] = await Promise.all([
    store.sameFileSessions(id, session.file_sha256),
    store.listEvents(id, 50),
  ]);
  return present(session, { duplicates, events });
}

function present(session, extra = {}) {
  return {
    id: session.id,
    status: session.status,
    file: {
      name: session.file_name,
      size: session.file_size,
      sha256: session.file_sha256,
      kind: session.file_kind,
    },
    owner: { id: session.created_by, username: session.owner_username },
    created_at: session.created_at,
    last_activity_at: session.last_activity_at,
    last_activity_by: session.last_activity_by ? { id: session.last_activity_by, username: session.last_activity_username } : null,
    completed_at: session.completed_at,
    decisions: session.decisions,
    validation: session.validation,
    can_commit: session.status === "ready" && Boolean(session.validation?.can_commit),
    result: session.result,
    error: session.error,
    ...(extra.duplicates
      ? {
          duplicates: extra.duplicates.map((other) => ({
            id: other.id,
            status: other.status,
            owner: other.owner_username,
            created_at: other.created_at,
            completed_at: other.completed_at,
          })),
        }
      : {}),
    ...(extra.events ? { events: extra.events } : {}),
  };
}

function problemOf(err) {
  if (err instanceof ApiError) return { code: err.code, message: err.title, detail: err.detail ?? null, errors: err.errors ?? undefined };
  return { code: "unexpected", message: "เกิดข้อผิดพลาดที่ไม่คาดไว้ ข้อมูลยังไม่ถูกบันทึก — แจ้งผู้ดูแลระบบพร้อมเลขงาน" };
}

/**
 * ตรวจไฟล์กับข้อมูลปัจจุบันและการตัดสินใจล่าสุด — ลองเขียนจริงแล้วย้อนกลับเสมอ
 * @param {string} reason ทำไมตรวจ (uploaded / decisions / contract_created / manual …) — เก็บในประวัติ
 */
async function validateSession(id, actor, reason = "manual") {
  const session = await store.getSession(id);
  await store.transition(db, id, ["draft", "ready", "failed"], "validating", actorId(actor),
    "งานนำเข้านี้กำลังตรวจหรือบันทึกอยู่ หรือปิดไปแล้ว — รีเฟรชแล้วดูสถานะล่าสุด");
  const startedAt = Date.now();
  try {
    const info = inspectFile(session);
    let analysis;
    try {
      await db.withTransaction(async (conn) => {
        analysis = await analyse(conn, session, info, { actorId: actorId(actor), importSessionId: null });
        throw new DryRun();
      });
    } catch (err) {
      if (!(err instanceof DryRun)) throw err;
    }
    const status = analysis.validation.can_commit ? "ready" : "draft";
    await store.saveOutcome(db, id, actorId(actor), {
      status,
      file_kind: info.kind,
      validation: analysis.validation,
      fingerprint: analysis.fingerprint,
      error: null,
    });
    await store.addEvent(db, id, "validated", actorId(actor), {
      reason,
      status,
      duration_ms: Date.now() - startedAt,
      checklist: analysis.validation.checklist.map(({ key, state }) => ({ key, state })),
    });
  } catch (err) {
    const error = problemOf(err);
    if (error.code === "unexpected") logger.error("ตรวจงานนำเข้าไม่สำเร็จ", { import_session_id: id, error: err.message, stack: err.stack });
    await store.saveOutcome(db, id, actorId(actor), { status: "failed", error });
    await store.addEvent(db, id, "failed", actorId(actor), { stage: "validate", reason, ...error });
  }
  return detail(id);
}

/**
 * @param {{ auto?: "commit"|"resolve"|null }} [options] ADR-0030 — commit = ตัดสินแทนแล้วบันทึกถ้าไม่เหลืออะไรต้องถาม,
 *   resolve = ตัดสินแทนอย่างเดียว, ไม่ส่ง = ผู้ดูแลทำเองทุกขั้น (#180)
 */
async function createFromUpload(file, actor, { auto = null } = {}) {
  const digest = sha256(fs.readFileSync(file.path));
  const id = await store.createSession(file, digest, actorId(actor));
  const detail = await validateSession(id, actor, "uploaded");
  if (!auto || detail.status === "failed") return detail;
  return autoProcess(id, actor, { commit: auto === "commit" });
}

const OPEN_FOR_CHANGES = ["draft", "ready", "failed"];

async function assertOpenForChanges(session) {
  if (!OPEN_FOR_CHANGES.includes(session.status)) {
    throw conflict("งานนำเข้านี้แก้ไม่ได้ในสถานะนี้", { code: "import_session_state" });
  }
}

/** เก็บการตัดสินใจชุดใหม่ทั้งชุด แล้วตรวจใหม่ — ประวัติเก็บเฉพาะสิ่งที่เปลี่ยน */
async function saveDecisions(id, actor, rawDecisions) {
  const decisions = validateDecisions(rawDecisions);
  const session = await store.getSession(id);
  await assertOpenForChanges(session);
  const changes = diffDecisions(session.decisions ?? {}, decisions);
  await store.saveOutcome(db, id, actorId(actor), { decisions });
  if (changes.length) await store.addEvent(db, id, "decisions_changed", actorId(actor), { changes: changes.slice(0, 200) });
  return validateSession(id, actor, "decisions");
}

/** รายการสิ่งที่เปลี่ยนระหว่างการตัดสินใจสองชุด: [{ path, before, after }] */
function diffDecisions(before, after) {
  const flat = (value, prefix = "", out = new Map()) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) flat(v, prefix ? `${prefix}.${k}` : k, out);
    } else out.set(prefix, value);
    return out;
  };
  const a = flat(before);
  const b = flat(after);
  const paths = new Set([...a.keys(), ...b.keys()]);
  return [...paths]
    .filter((p) => JSON.stringify(a.get(p)) !== JSON.stringify(b.get(p)))
    .map((p) => ({ path: p, before: a.get(p) ?? null, after: b.get(p) ?? null }));
}

/** สร้างสัญญาที่ไฟล์อ้างถึงจากหน้านำเข้า — กฎเดียวกับหน้าสัญญา (contract-write.js) */
async function createContract(id, actor, body) {
  const session = await store.getSession(id);
  await assertOpenForChanges(session);
  const parsed = contractBody.safeParse(body);
  if (!parsed.success) {
    throw badRequest("ข้อมูลสัญญาไม่ถูกต้อง", {
      code: "validation_failed",
      errors: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    });
  }
  const referenced = (session.validation?.contracts ?? []).some(
    (c) => c.state === "missing" && c.key === comparableContractNo(parsed.data.contract_no)
  );
  if (!referenced) {
    throw badRequest("สร้างได้เฉพาะสัญญาที่ไฟล์อ้างถึงและยังไม่มีในระบบ", { code: "contract_not_referenced" });
  }
  const contractId = await db.withTransaction((conn) => writeContract(conn, null, parsed.data));
  await store.addEvent(db, id, "contract_created", actorId(actor), {
    contract_id: contractId,
    contract_no: parsed.data.contract_no,
    effective_from: parsed.data.effective_from,
    effective_to: parsed.data.effective_to,
    monthly_rental: parsed.data.monthly_rental,
    vat_rate: parsed.data.vat_rate,
    price_lines: parsed.data.price_lines,
  });
  return validateSession(id, actor, "contract_created");
}

/** ปีงบที่ยังไม่มี → สร้าง คืนเฉพาะปีที่สร้างจริง */
async function insertFiscalYears(years) {
  const created = [];
  for (const year of years) {
    const { startMonth, endMonth } = getFiscalYearRange(year);
    const [result] = await db.query(
      "INSERT IGNORE INTO fiscal_year (year, start_month, end_month) VALUES (?, ?, ?)",
      [year, startMonth, endMonth]
    );
    if (result.affectedRows) created.push(year);
  }
  return created;
}

/** สร้างปีงบที่ครอบเดือนในไฟล์ แต่ยังไม่มี */
async function createFiscalYears(id, actor, years) {
  const session = await store.getSession(id);
  await assertOpenForChanges(session);
  const missing = new Set(session.validation?.fiscal_years?.missing ?? []);
  const wanted = [...new Set((years ?? []).map(String))].filter((year) => missing.has(year));
  if (!wanted.length) throw badRequest("ไม่มีปีงบที่ต้องสร้างสำหรับไฟล์นี้", { code: "nothing_to_create" });
  const created = await insertFiscalYears(wanted);
  await store.addEvent(db, id, "fiscal_years_created", actorId(actor), { years: created });
  return validateSession(id, actor, "fiscal_years_created");
}

async function abandonSession(id, actor, reason) {
  await store.transition(db, id, OPEN_FOR_CHANGES, "expired", actorId(actor), "ยกเลิกไม่ได้ — งานนี้กำลังทำงานอยู่หรือปิดไปแล้ว");
  await store.addEvent(db, id, "abandoned", actorId(actor), { reason: reason || null });
  return detail(id);
}

// หนึ่ง commit ต่อครั้งทั้งระบบ (ADR-0028) — ระบบมี API โปรเซสเดียว คิวในโปรเซสจึงพอ
let commitChain = Promise.resolve();
function oneAtATime(work) {
  const run = commitChain.then(work, work);
  commitChain = run.catch(() => {});
  return run;
}

/**
 * บันทึกจริง — วางแผนซ้ำใน transaction เดียวกับการเขียน ลายนิ้วมือต้องตรงกับผลตรวจที่ผู้ใช้เห็น
 */
async function commitSession(id, actor) {
  const session = await store.getSession(id);
  if (session.status !== "ready" || !session.validation?.can_commit) {
    throw conflict("ยังบันทึกไม่ได้ — ตรวจไฟล์ให้ผ่านทุกข้อก่อน", { code: "import_not_ready" });
  }
  await store.transition(db, id, ["ready"], "processing", actorId(actor), "งานนี้กำลังบันทึกอยู่ หรือถูกเปลี่ยนไปแล้ว — รีเฟรชแล้วดูสถานะล่าสุด");
  await store.addEvent(db, id, "commit_started", actorId(actor), { fingerprint: session.fingerprint });

  return oneAtATime(async () => {
    const startedAt = Date.now();
    try {
      const info = inspectFile(session);
      const analysis = await db.withTransaction(async (conn) => {
        const result = await analyse(conn, session, info, { actorId: actorId(actor), importSessionId: id });
        if (result.fingerprint !== session.fingerprint || !result.validation.can_commit) throw new StaleImport(result);
        return result;
      });
      const result = { ...analysis.outcome, duration_ms: Date.now() - startedAt };
      await store.saveOutcome(db, id, actorId(actor), { status: "completed", result, error: null });
      await db.query("UPDATE import_session SET completed_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
      await store.addEvent(db, id, "completed", actorId(actor), {
        devices_created: result.devices_created,
        devices_filled: result.devices_filled,
        readings_new: result.readings_new,
        readings_overwritten: result.readings_overwritten,
        months: result.months,
        duration_ms: result.duration_ms,
      });
    } catch (err) {
      if (err instanceof StaleImport) {
        // ข้อมูลในระบบเปลี่ยนระหว่างตรวจกับบันทึก — ไม่เขียนอะไร ให้ผู้ใช้เห็นผลตรวจใหม่ก่อนกดอีกครั้ง
        const { validation, fingerprint } = err.analysis;
        const notice = { code: "data_changed", message: "ข้อมูลในระบบเปลี่ยนระหว่างที่ตรวจไฟล์อยู่ — ยังไม่ได้บันทึกอะไร ตรวจผลใหม่ด้านล่างแล้วกดบันทึกอีกครั้ง" };
        await store.saveOutcome(db, id, actorId(actor), {
          status: validation.can_commit ? "ready" : "draft",
          validation: { ...validation, notice },
          fingerprint,
        });
        await store.addEvent(db, id, "stale", actorId(actor), { checklist: validation.checklist.map(({ key, state }) => ({ key, state })) });
      } else {
        const error = problemOf(err);
        if (error.code === "unexpected") logger.error("บันทึกงานนำเข้าไม่สำเร็จ", { import_session_id: id, error: err.message, stack: err.stack });
        await store.saveOutcome(db, id, actorId(actor), { status: "failed", error });
        await store.addEvent(db, id, "failed", actorId(actor), { stage: "commit", ...error });
      }
    }
    return detail(id);
  });
}

// ============================================================
// นำเข้าอัตโนมัติ (#190, ADR-0030)
// ============================================================

const mergeKinds = (base = {}, extra = {}) => {
  const out = { ...base };
  for (const [kind, entries] of Object.entries(extra)) out[kind] = { ...(base[kind] ?? {}), ...entries };
  return out;
};

/**
 * ตัดสินแทนผู้ดูแลเท่าที่ไม่มีทางเลือกอื่นที่สมเหตุสมผล (auto-resolve.js) ทีละชั้น แล้วบันทึกถ้าไม่เหลืออะไรต้องถาม
 *
 *   ชื่อและหมวดของรุ่น → สัญญาจากหัวไฟล์ → ปีงบ → ตรวจ → (บันทึก)
 *
 * ชื่อและรุ่นต้องมาก่อนสัญญา เพราะราคาต่อหน้าที่เติมจากไฟล์ผูกกับหมวดของรุ่น ทุกขั้นตรวจไฟล์ใหม่แบบเดียวกับ
 * ที่คนกดเอง และเขียนประวัติว่าระบบทำอะไรให้ — ผลที่ได้ต่างจากทำเองแค่ไม่ต้องกด
 *
 * @param {{ commit: boolean }} options
 */
async function autoProcess(id, actor, { commit }) {
  const who = actorId(actor);
  const made = { names: [], models: [], contracts: [], fiscal_years: [] };
  let questions = [];

  for (let pass = 0; pass < 6; pass++) {
    const session = await store.getSession(id);
    if (!["draft", "ready"].includes(session.status) || !session.validation) break;
    const { validation } = session;
    const decisions = session.decisions ?? {};
    questions = [];

    if (validation.registry) {
      const context = await loadRegistryContext(db);
      const names = autoNameDecisions({ unresolved: validation.registry.unresolved, master: context.master, chosen: decisions.names ?? {} });
      const models = autoModelDecisions({ models: validation.registry.models, categories: context.categories, chosen: decisions.models ?? {} });
      questions.push(...names.questions, ...models.questions);
      if (names.made.length || models.made.length) {
        const next = validateDecisions({
          ...decisions,
          names: mergeKinds(decisions.names, names.decided),
          models: { ...(decisions.models ?? {}), ...models.decided },
        });
        await store.saveOutcome(db, id, who, { decisions: next });
        await store.addEvent(db, id, "auto_decided", who, { names: names.made.slice(0, 200), models: models.made });
        made.names.push(...names.made);
        made.models.push(...models.made);
        await validateSession(id, actor, "auto");
        continue;
      }
    }

    let contractCreated = false;
    for (const contract of (validation.contracts ?? []).filter((c) => c.state === "missing")) {
      const { body, reason } = contractFromPrefill(contract);
      const parsed = body ? contractBody.safeParse(body) : null;
      if (!parsed?.success) {
        questions.push({
          kind: "contract",
          name: contract.contract_no,
          reason: reason ?? `สร้างสัญญา ${contract.contract_no} ให้เองไม่ได้: ${parsed.error.issues.map((issue) => issue.message).join(" · ")}`,
        });
        continue;
      }
      const contractId = await db.withTransaction((conn) => writeContract(conn, null, parsed.data));
      const summary = {
        contract_id: contractId,
        contract_no: parsed.data.contract_no,
        effective_from: parsed.data.effective_from,
        effective_to: parsed.data.effective_to,
        monthly_rental: parsed.data.monthly_rental,
        vat_rate: parsed.data.vat_rate,
        price_lines: parsed.data.price_lines,
      };
      await store.addEvent(db, id, "contract_created", who, { auto: true, ...summary });
      made.contracts.push(summary);
      contractCreated = true;
    }
    if (contractCreated) {
      await validateSession(id, actor, "auto");
      continue;
    }

    const missingYears = validation.fiscal_years?.missing ?? [];
    if (missingYears.length) {
      const years = await insertFiscalYears(missingYears);
      await store.addEvent(db, id, "fiscal_years_created", who, { auto: true, years });
      made.fiscal_years.push(...years);
      await validateSession(id, actor, "auto");
      if (years.length) continue;
    }
    break;
  }

  const session = await store.getSession(id);
  const stopped = session.status === "failed"
    ? [session.error?.message ?? "ตรวจไฟล์ไม่สำเร็จ"]
    : [...new Set([...questions.map((q) => q.reason), ...autoCommitBlockers(session.validation)])];
  const auto = { commit, made, stopped, finished_at: new Date().toISOString() };
  await store.addEvent(db, id, "auto_finished", who, {
    commit,
    made: {
      names: made.names.length,
      models: made.models.length,
      contracts: made.contracts.map((c) => c.contract_no),
      fiscal_years: made.fiscal_years,
    },
    stopped,
  });
  if (session.validation) await store.saveOutcome(db, id, who, { validation: { ...session.validation, auto } });

  if (!commit || stopped.length || session.status !== "ready") return detail(id);
  const committed = await commitSession(id, actor);
  if (committed.status === "completed") await store.saveOutcome(db, id, who, { result: { ...committed.result, auto } });
  return detail(id);
}

/** ให้ระบบตัดสินส่วนที่เหลือของงานที่เปิดอยู่ (ปุ่มในหน้างาน) */
async function autoResolveSession(id, actor, { commit }) {
  const session = await store.getSession(id);
  await assertOpenForChanges(session);
  if (session.status === "failed") await validateSession(id, actor, "auto");
  return autoProcess(id, actor, { commit });
}

async function listForAdmins({ includeClosed }) {
  await store.sweep();
  const rows = await store.listSessions({ includeClosed });
  return rows.map((session) => {
    const summary = session.validation?.registry?.summary;
    const counts = session.validation?.readings?.counts;
    return {
      id: session.id,
      status: session.status,
      file_name: session.file_name,
      file_kind: session.file_kind,
      owner: { id: session.created_by, username: session.owner_username },
      created_at: session.created_at,
      last_activity_at: session.last_activity_at,
      last_activity_by: session.last_activity_by ? { id: session.last_activity_by, username: session.last_activity_username } : null,
      completed_at: session.completed_at,
      headline: session.result
        ? { devices_created: session.result.devices_created, readings_new: session.result.readings_new, readings_overwritten: session.result.readings_overwritten }
        : { devices_create: summary?.create ?? 0, devices_fill: summary?.fill ?? 0, readings_new: counts?.new ?? 0, readings_overwrite: counts?.overwrite ?? 0 },
      blocking: (session.validation?.checklist ?? []).filter((c) => c.state === "blocking").length,
    };
  });
}

async function detailForAdmins(id) {
  await store.sweep();
  return detail(id);
}

module.exports = {
  inspectFile,
  analyse,
  diffDecisions,
  createFromUpload,
  validateSession,
  saveDecisions,
  createContract,
  createFiscalYears,
  abandonSession,
  commitSession,
  autoResolveSession,
  listForAdmins,
  detailForAdmins,
};
