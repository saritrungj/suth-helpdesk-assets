// scripts/master-data/list-names.cjs — รวมชื่อยี่ห้อ อาคาร และฝ่ายทุกแบบที่พบในไฟล์ดิบ
//
//   node scripts/master-data/list-names.cjs <plan.json> <ไฟล์.xlsx|.xls ...> [--out รายงาน.xlsx]
//
// ใช้เตรียมและตรวจ plan.json ของ load-master-data.cjs — ไม่ต่อ API ไม่ต่อฐาน อ่านไฟล์อย่างเดียว
// ทุกชื่อที่พบถูกจับคู่กับชื่อหลักและชื่อเรียกอื่นใน plan ด้วยกติกาเดียวกับ API (ADR-0025)
// ชื่อที่ยังจับคู่ไม่ได้คือสิ่งที่คนต้องตัดสิน: เป็นรายการใหม่ หรือเป็นชื่อเรียกอื่นของรายการเดิม
//
// รายงานเขียนลง output/ (อยู่ใน .gitignore) เพราะชื่อในไฟล์ดิบเป็นข้อมูลของหน่วยงาน
//
// ## หาคอลัมน์อย่างไร
//
// หัวตารางของไฟล์ดิบไม่นิ่ง — อยู่แถว 2–4 และบางแผ่นไม่มีหัวของคอลัมน์ฝ่ายเลย จึงหาแถวหัวใน
// 15 แถวแรกจากคอลัมน์ Model/SN แล้วเลือกคอลัมน์ด้วยชื่อหัว ถ้าไม่เจอหัวของฝ่าย ใช้คอลัมน์ที่
// ค่าส่วนใหญ่ขึ้นต้นด้วย "ฝ่าย" แทน — เป็นการเดาเพื่อรายงานเท่านั้น ไม่ได้ใช้ตอนนำเข้าจริง

const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");

const ROOT = path.join(__dirname, "..", "..");
const { normalizeName, createNameResolver } = require(path.join(ROOT, "apps/api/src/master-data/names"));

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outFile = outIndex === -1 ? path.join(ROOT, "output", "master-data", "names-review.xlsx") : path.resolve(args[outIndex + 1]);
const [planPath, ...files] = args.filter((arg, i) => !arg.startsWith("--") && (outIndex === -1 || i !== outIndex + 1));
if (!planPath || !files.length) fail("ใช้: node scripts/master-data/list-names.cjs <plan.json> <ไฟล์...> [--out รายงาน.xlsx]");

const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));

// ยี่ห้ออยู่ในคอลัมน์รุ่น เช่น "HP MFP M430F" "Brother HL-L5210DN" "OKI ES5112" — บางแถว
// เขียนติดกันอย่าง "HPE72535DN" จึงจับยี่ห้อที่รู้จักจากต้นข้อความก่อน แล้วค่อยใช้คำแรก
const KNOWN_BRANDS = /^(brother|oki|hp|canon|epson|fuji\s*xerox|ricoh|kyocera|lexmark)/i;
const brandFromModel = (model) => {
  const text = normalizeName(model);
  return text.match(KNOWN_BRANDS)?.[1] ?? text.split(/[\s-]+/)[0] ?? "";
};

const header = (cell) => normalizeName(cell).toLowerCase();
const HEADERS = {
  building: ["building", "อาคาร"],
  division: ["division", "ฝ่าย"],
  model: ["model", "รุ่น"],
};

/** แถวหัวตารางและตำแหน่งคอลัมน์ของแผ่นหนึ่ง — null ถ้าไม่ใช่ตารางเครื่อง */
function findColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = rows[r].map(header);
    const at = (names) => cells.findIndex((cell) => names.includes(cell));
    const model = at(HEADERS.model);
    const serial = cells.findIndex((cell) => /^(sn\.?|serial (no\.?|number))$/.test(cell));
    if (model === -1 || serial === -1) continue;

    let division = at(HEADERS.division);
    let divisionGuessed = false;
    if (division === -1) {
      const body = rows.slice(r + 1).filter((row) => row.some((cell) => normalizeName(cell)));
      division = cells.findIndex((_, c) => {
        const values = body.map((row) => normalizeName(row[c])).filter(Boolean);
        return values.length > 0 && values.filter((v) => v.startsWith("ฝ่าย")).length / values.length >= 0.5;
      });
      divisionGuessed = division !== -1;
    }
    return { headerRow: r, model, serial, building: at(HEADERS.building), division, divisionGuessed };
  }
  return null;
}

// ------------------------------------------------------------------------------

const found = { brand: new Map(), building: new Map(), division: new Map() };
const notes = [];

function count(kind, raw, where) {
  const name = normalizeName(raw);
  if (!name) return;
  const entry = found[kind].get(name) ?? { count: 0, where: new Set() };
  entry.count += 1;
  entry.where.add(where);
  found[kind].set(name, entry);
}

for (const file of files) {
  const workbook = XLSX.readFile(file);
  const base = path.basename(file);
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
    const cols = findColumns(rows);
    const where = `${base} / ${sheetName.trim()}`;
    if (!cols) {
      notes.push({ แผ่น: where, หมายเหตุ: "ไม่พบหัวตาราง Model + SN — ข้าม" });
      continue;
    }
    if (cols.building === -1) notes.push({ แผ่น: where, หมายเหตุ: "ไม่มีคอลัมน์อาคาร" });
    if (cols.division === -1) notes.push({ แผ่น: where, หมายเหตุ: "ไม่มีคอลัมน์ฝ่าย" });
    if (cols.divisionGuessed) notes.push({ แผ่น: where, หมายเหตุ: `คอลัมน์ฝ่ายไม่มีหัว เดาจากค่าในคอลัมน์ที่ ${cols.division + 1}` });

    const headerCells = rows[cols.headerRow].map(header);
    for (const row of rows.slice(cols.headerRow + 1)) {
      if (!normalizeName(row[cols.serial])) continue; // แถวว่าง แถวสรุป แถวลายเซ็น
      // แถวหัวตารางซ้ำกลางแผ่น (พบในทะเบียน OKI) — ไม่ใช่ข้อมูล
      if (row.every((cell, c) => !normalizeName(cell) || header(cell) === headerCells[c])) continue;
      count("brand", brandFromModel(row[cols.model]), where);
      if (cols.building !== -1) count("building", row[cols.building], where);
      if (cols.division !== -1) count("division", row[cols.division], where);
    }
  }
}

// ------------------------------------------------------------------------------

const PLAN_KEY = { brand: "brands", building: "buildings", division: "divisions" };
const LABEL = { brand: "ยี่ห้อ", building: "อาคาร", division: "ฝ่าย" };
const sheets = {};
let unresolved = 0;

for (const kind of Object.keys(found)) {
  const entries = plan[PLAN_KEY[kind]] ?? [];
  const resolver = createNameResolver({
    names: entries.map((entry, i) => ({ id: i, name: entry.name })),
    aliases: entries.flatMap((entry, i) => (entry.aliases ?? []).map((alias) => ({ target_id: i, alias }))),
  });

  sheets[LABEL[kind]] = [...found[kind]]
    .sort(([a], [b]) => a.localeCompare(b, "th"))
    .map(([name, entry]) => {
      const hit = resolver.resolve(name);
      if (!hit) unresolved += 1;
      return {
        ชื่อในไฟล์: name,
        จำนวนแถว: entry.count,
        จับคู่กับ: hit ? entries[hit.id].name : "",
        ผ่าน: hit ? (hit.via === "name" ? "ชื่อหลัก" : "ชื่อเรียกอื่น") : "ยังไม่มีใน plan",
        พบใน: [...entry.where].join("; "),
      };
    });
}

const workbook = XLSX.utils.book_new();
for (const [name, rows] of Object.entries(sheets)) {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
}
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(notes.length ? notes : [{ แผ่น: "", หมายเหตุ: "" }]), "หมายเหตุ");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
XLSX.writeFile(workbook, outFile);

for (const [name, rows] of Object.entries(sheets)) {
  const missing = rows.filter((row) => !row.จับคู่กับ);
  console.log(`${name}: พบ ${rows.length} ชื่อ จับคู่ไม่ได้ ${missing.length}`);
  for (const row of missing) console.log(`    - ${row.ชื่อในไฟล์} (${row.จำนวนแถว} แถว)`);
}
for (const note of notes) console.log(`หมายเหตุ ${note.แผ่น}: ${note.หมายเหตุ}`);
console.log(`\nรายงาน: ${path.relative(ROOT, outFile)}`);
process.exitCode = unresolved ? 2 : 0;
