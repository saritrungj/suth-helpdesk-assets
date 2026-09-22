// scripts/master-data/load-master-data.cjs — ลงยี่ห้อ อาคาร ฝ่าย และชื่อเรียกอื่นจาก plan.json
//
//   node scripts/master-data/load-master-data.cjs <plan.json>             ดูว่าจะสร้างอะไร (ไม่เขียน)
//   node scripts/master-data/load-master-data.cjs <plan.json> --confirm   สร้างจริง
//
// ทุกการอ่านและเขียนผ่าน HTTP API เดิม (AGENTS.md) — ด่านกันชื่อชนกันของ API (ADR-0025)
// จึงใช้กับสคริปต์นี้ด้วย รันซ้ำได้: รายการที่มีอยู่แล้วถูกข้าม ไม่สร้างซ้ำ
//
// บัญชีผู้ดูแลอ่านจาก SUTH_ADMIN_USER / SUTH_ADMIN_PASSWORD — ไม่เก็บในไฟล์
//
// ## plan.json
//
//   {
//     "api": "http://localhost:3004/api",
//     "brands":    [{ "name": "HP", "aliases": [] }],
//     "buildings": [{ "name": "อาคารตัวอย่าง", "aliases": ["ตัวอย่าง (EX)"] }],
//     "divisions": [{ "name": "ฝ่ายตัวอย่าง", "aliases": ["ฝ่ายตัวอยาง"] }]
//   }
//
// plan ของโรงพยาบาลจริงเก็บไว้ใน output/ (อยู่ใน .gitignore) ดู plan.example.json และตรวจว่า
// ครอบทุกชื่อในไฟล์ดิบแล้วด้วย list-names.cjs ก่อนลง
//
// ## สิ่งที่สคริปต์ไม่ทำ
//
//   - ไม่เปลี่ยนชื่อหรือลบข้อมูลหลักที่มีอยู่ ถ้าชื่อหลักใน plan ตรงกับชื่อเรียกอื่นของรายการอื่น
//     หรือชื่อเรียกอื่นใน plan ชี้ไปรายการอื่นอยู่แล้ว = หยุดทั้งหมดก่อนเขียน ให้คนตัดสิน
//   - ไม่แตะชั้นและแผนก (ยังไม่มีชื่อเรียกอื่น ดู ADR-0025)

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const { normalizeName, nameKey } = require(path.join(ROOT, "apps/api/src/master-data/names"));

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

const [planPath] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const confirm = process.argv.includes("--confirm");
if (!planPath) fail("ใช้: node scripts/master-data/load-master-data.cjs <plan.json> [--confirm]");

const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const { SUTH_ADMIN_USER, SUTH_ADMIN_PASSWORD } = process.env;
if (!plan.api) fail("plan.json ต้องมี api เช่น http://localhost:3004/api");
if (!SUTH_ADMIN_USER || !SUTH_ADMIN_PASSWORD) fail("ตั้ง SUTH_ADMIN_USER และ SUTH_ADMIN_PASSWORD ก่อน");

// รหัส admin ถูกส่งไปที่ plan.api — plan ที่รับต่อมาหรือพิมพ์ผิดต้องไม่พารหัสออกไปนอกเครื่อง
// แบบไม่เข้ารหัส ยอมเฉพาะเครื่องนี้ หรือที่อยู่ https
{
  const url = new URL(plan.api);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && url.protocol !== "https:") fail(`plan.api ต้องเป็นเครื่องนี้หรือ https (พบ ${url.origin})`);
}

let cookie = "";

async function api(method, route, body) {
  const response = await fetch(`${plan.api}${route}`, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${route} → ${response.status} ${data?.title ?? text} ${data?.detail ?? ""}`);
  return data;
}

const KINDS = [
  { key: "brands", route: "/brands", label: "ยี่ห้อ" },
  { key: "buildings", route: "/buildings", label: "อาคาร" },
  { key: "divisions", route: "/divisions", label: "ฝ่าย" },
];

/**
 * เทียบ plan กับของที่มีในระบบ แล้วคืนรายการที่ต้องสร้าง — ไม่เขียนอะไร
 * เจอชื่อชนกันข้อไหน = หยุดทั้งหมด ไม่เขียนครึ่งเดียว
 */
function diff(kind, entries, existing, aliases) {
  const byName = new Map(existing.map((row) => [nameKey(row.name), row]));
  const byAlias = new Map(aliases.map((row) => [nameKey(row.alias), row]));
  const seenInPlan = new Map();
  const problems = [];
  const createNames = [];
  const createAliases = [];

  const claim = (text, owner) => {
    const key = nameKey(text);
    const previous = seenInPlan.get(key);
    if (previous && previous !== owner) problems.push(`"${text}" อยู่ทั้งใน "${previous}" และ "${owner}" ของ plan`);
    seenInPlan.set(key, owner);
  };

  for (const entry of entries) {
    const name = normalizeName(entry.name);
    if (!name) {
      problems.push("มีรายการที่ไม่มีชื่อ");
      continue;
    }
    claim(name, name);
    const aliasOwner = byAlias.get(nameKey(name));
    if (aliasOwner) problems.push(`ชื่อหลัก "${name}" เป็นชื่อเรียกอื่นในระบบอยู่แล้ว`);
    const target = byName.get(nameKey(name));
    if (!target) createNames.push(name);

    for (const raw of entry.aliases ?? []) {
      const alias = normalizeName(raw);
      claim(alias, name);
      const clashName = byName.get(nameKey(alias));
      if (clashName) {
        problems.push(`ชื่อเรียกอื่น "${alias}" ของ "${name}" เป็นชื่อหลักของ${kind.label} "${clashName.name}" ในระบบ`);
        continue;
      }
      const existingAlias = byAlias.get(nameKey(alias));
      if (existingAlias) {
        const owner = existing.find((row) => row.id === existingAlias.target_id);
        if (!target || existingAlias.target_id !== target.id) {
          problems.push(`ชื่อเรียกอื่น "${alias}" ชี้ไปที่ "${owner?.name}" ในระบบอยู่แล้ว ไม่ใช่ "${name}"`);
        }
        continue;
      }
      createAliases.push({ name, alias });
    }
  }
  return { problems, createNames, createAliases };
}

async function main() {
  await api("POST", "/auth/login", { username: SUTH_ADMIN_USER, password: SUTH_ADMIN_PASSWORD });
  console.log(`เชื่อม ${plan.api} แล้ว${confirm ? "" : " — โหมดดูอย่างเดียว เพิ่ม --confirm เพื่อสร้างจริง"}\n`);

  const work = [];
  for (const kind of KINDS) {
    const entries = plan[kind.key] ?? [];
    const [existing, aliases] = await Promise.all([api("GET", kind.route), api("GET", `${kind.route}/aliases`)]);
    work.push({ kind, ...diff(kind, entries, existing, aliases) });
  }

  const problems = work.flatMap((w) => w.problems.map((p) => `${w.kind.label}: ${p}`));
  if (problems.length) fail(`plan ขัดกับข้อมูลในระบบ ยังไม่ได้เขียนอะไร:\n  - ${problems.join("\n  - ")}`);

  for (const { kind, createNames, createAliases } of work) {
    console.log(`${kind.label}: สร้างใหม่ ${createNames.length} · ชื่อเรียกอื่นใหม่ ${createAliases.length}`);
    for (const name of createNames) console.log(`    + ${name}`);
    for (const { name, alias } of createAliases) console.log(`    ~ ${alias}  →  ${name}`);
  }
  if (!confirm) return;

  for (const { kind, createNames, createAliases } of work) {
    for (const name of createNames) await api("POST", kind.route, { name });
    if (!createAliases.length) continue;
    const ids = new Map((await api("GET", kind.route)).map((row) => [nameKey(row.name), row.id]));
    for (const { name, alias } of createAliases) {
      await api("POST", `${kind.route}/${ids.get(nameKey(name))}/aliases`, { alias });
    }
  }
  console.log("\nบันทึกแล้ว");
}

main().catch((err) => fail(err.message));
