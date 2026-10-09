// scripts/check-docs.cjs — จับเอกสารที่ตามโค้ดไม่ทันในรูปแบบที่ตรวจแบบตายตัวได้ (#320)
//
//   node scripts/check-docs.cjs
//
// เอกสารชุดนี้ล้าสมัยเงียบๆ มาแล้วหลายจุด: data-model.md ขาดตารางและ view ที่อยู่ใน
// schema.sql ชื่อ constraint ที่อ้างไม่มีจริง ลิงก์ชี้ไฟล์ที่ย้ายไปแล้ว และคำที่
// CONTEXT.md ให้เลิกใช้ยังอยู่ในหน้าอธิบายกฎ ทั้งหมดเป็นรูปแบบที่เครื่องตรวจได้
//
// สิ่งที่ตรวจไม่ได้และไม่พยายามตรวจ: ข้อเท็จจริงนอก repo (เช่น สถานะของเซิร์ฟเวอร์จริง)
// และคำที่ผิดเฉพาะบางความหมาย (CONTEXT.md ให้เลี่ยง "ยอดพิมพ์" เมื่อหมายถึงจำนวนพิมพ์
// แต่คำเดียวกันถูกต้องในความหมายอื่น) — ส่วนนั้นเป็นงานของผู้รีวิว

const fs = require("node:fs");
const path = require("node:path");

/**
 * คำที่ CONTEXT.md ให้เลี่ยงและไม่มีความหมายอื่นที่ถูกต้อง จึงห้ามแบบตายตัวได้
 * ตรวจเฉพาะ docs/explanation/ — ADR คือบันทึก ณ วันที่ตัดสิน ไม่แก้ย้อนหลัง
 */
const RETIRED_TERMS = ["หน้าสุทธิ"];

/** ลิงก์ markdown ที่ชี้ไฟล์ใน repo — ข้าม URL, mailto และ anchor ในหน้าเดียวกัน */
function relativeLinks(markdown) {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  const links = [];
  for (const match of withoutCode.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    links.push(decodeURIComponent(target));
  }
  return links;
}

/** ชื่อตารางและ view ที่ schema สร้าง */
function schemaObjects(schemaSql) {
  const names = [];
  for (const match of schemaSql.matchAll(/^CREATE (?:OR REPLACE )?(?:TABLE|VIEW) (\w+)/gm)) names.push(match[1]);
  return names;
}

/** ชื่อ CHECK constraint ที่ schema ประกาศ */
function schemaConstraints(schemaSql) {
  return new Set(Array.from(schemaSql.matchAll(/CONSTRAINT (chk_\w+)/g), (match) => match[1]));
}

/**
 * ตรวจเอกสารชุดหนึ่งเทียบ schema แล้วคืนรายการปัญหา (ว่าง = ผ่าน)
 *
 * @param {object} input
 * @param {Array<{ file: string, text: string }>} input.docs ไฟล์ markdown พร้อมเนื้อหา (file เป็น path จากราก repo)
 * @param {string} input.schemaSql เนื้อหาของ database/schema.sql
 * @param {(file: string) => boolean} input.exists บอกว่า path จากราก repo มีอยู่จริงไหม
 * @returns {string[]}
 */
function findProblems({ docs, schemaSql, exists }) {
  const problems = [];

  for (const { file, text } of docs) {
    for (const link of relativeLinks(text)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), link));
      if (!exists(target)) problems.push(`${file}: ลิงก์ชี้ไฟล์ที่ไม่มี — ${link}`);
    }

    // `chk_foo_*` คือการอ้างทั้งกลุ่ม ไม่ใช่ชื่อจริง — ตรวจเฉพาะชื่อเต็ม
    const constraints = schemaConstraints(schemaSql);
    for (const match of text.matchAll(/\b(chk_\w+)/g)) {
      const name = match[1];
      if (name.endsWith("_")) continue;
      if (!constraints.has(name)) problems.push(`${file}: อ้าง constraint ที่ไม่มีใน schema.sql — ${name}`);
    }

    if (file.startsWith("docs/explanation/")) {
      for (const term of RETIRED_TERMS) {
        if (text.includes(term)) problems.push(`${file}: ใช้คำที่ CONTEXT.md ให้เลิกใช้ — "${term}"`);
      }
    }
  }

  const dataModel = docs.find((doc) => doc.file === "docs/reference/data-model.md");
  if (!dataModel) {
    problems.push("docs/reference/data-model.md: ไม่พบไฟล์");
  } else {
    const mentioned = new Set(Array.from(dataModel.text.matchAll(/`(\w+)`/g), (match) => match[1]));
    for (const name of schemaObjects(schemaSql)) {
      if (!mentioned.has(name)) problems.push(`docs/reference/data-model.md: ไม่มี ${name} ที่อยู่ใน schema.sql`);
    }
  }

  return problems;
}

/** ไฟล์ markdown ที่ตรวจ: เอกสารที่รากและทุกไฟล์ใต้ docs/ */
function collectDocs(root) {
  const files = [];
  for (const name of fs.readdirSync(root)) {
    if (name.endsWith(".md")) files.push(name);
  }
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(relative);
      else if (entry.name.endsWith(".md")) files.push(relative);
    }
  };
  walk("docs");
  return files.sort().map((file) => ({ file, text: fs.readFileSync(path.join(root, file), "utf8") }));
}

function main() {
  const root = path.resolve(__dirname, "..");
  const problems = findProblems({
    docs: collectDocs(root),
    schemaSql: fs.readFileSync(path.join(root, "database/schema.sql"), "utf8"),
    exists: (file) => fs.existsSync(path.join(root, file)),
  });

  if (problems.length) {
    console.error(`check-docs: พบ ${problems.length} จุดที่เอกสารไม่ตรงกับ repo`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log("check-docs: ผ่าน");
}

if (require.main === module) main();

module.exports = { findProblems, relativeLinks, schemaObjects, schemaConstraints, RETIRED_TERMS };
