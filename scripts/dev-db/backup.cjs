// scripts/dev-db/backup.cjs — สำรองและกู้คืนฐานข้อมูลบน Docker (ADR-0024)
//
//   npm run db:dump                              สำรองเป็น output/db-backup/<ฐาน>-<เวลา>.sql
//   npm run db:restore -- <ไฟล์.sql> --confirm   แทนข้อมูลทั้งฐานด้วยไฟล์ (สำรองของเดิมให้ก่อนเสมอ)
//
// ใช้ย้ายข้อมูลไปเครื่องอื่น: เครื่องต้นทาง db:dump → ส่งไฟล์ → เครื่องปลายทาง db:up แล้ว db:restore
//
// คำสั่งทั้งหมดรันใน container ด้วยรหัส root ที่อยู่ใน env ของ container เอง รหัสจึงไม่ผ่าน
// command line ของเครื่อง host ไฟล์ .sql ต่อ/ดึงผ่าน stdin/stdout
//
// ## สิ่งที่ติดไปและไม่ติดไปกับไฟล์สำรอง
//
//   ติดไป     ทุกตาราง view และข้อมูลของฐาน รวมตาราง users — รหัส admin ของแอปจึงเป็นของเครื่องต้นทาง
//   ไม่ติดไป  บัญชีฐานข้อมูล (suth_app, suth_readonly, root) — เครื่องปลายทางใช้ของตัวเองตาม compose.env
//
// ⚠️ ไฟล์สำรองคือข้อมูลของหน่วยงาน อยู่ใน output/ ซึ่งไม่เข้า Git — ห้าม commit ห้ามส่งผ่านช่องทาง
// สาธารณะ ใช้ช่องทางที่หน่วยงานอนุญาต

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");
const ENV_FILE = path.join("database", "docker", "compose.env");
const BACKUP_DIR = path.join(ROOT, "output", "db-backup");

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

if (!fs.existsSync(path.join(ROOT, ENV_FILE))) {
  fail(`ไม่พบ ${ENV_FILE} — คัดลอกจาก compose.env.example แล้ว npm run db:up ก่อน`);
}

/** รันคำสั่งใน container db — ค่าจาก env ของ container ขยายใน sh ของ container ไม่ใช่ของ host */
function inDb(script, { stdin, stdout } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["compose", "--env-file", ENV_FILE, "exec", "-T", "db", "sh", "-c", script],
      { cwd: ROOT, stdio: [stdin ? "pipe" : "ignore", stdout ? "pipe" : "inherit", "inherit"] }
    );
    if (stdin) stdin.pipe(child.stdin);
    if (stdout) child.stdout.pipe(stdout);
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`คำสั่งใน container ล้ม (exit ${code}) — ฐานเปิดอยู่ไหม? npm run db:up`))
    );
  });
}

const ROOT_CLIENT = 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD"';

/** จำนวนเครื่อง ยอด และสัญญาของฐาน — ให้เห็นก่อนและหลังว่ากำลังแทนอะไรด้วยอะไร */
async function captureSummary() {
  return new Promise((resolve) => {
    const child = spawn(
      "docker",
      ["compose", "--env-file", ENV_FILE, "exec", "-T", "db", "sh", "-c",
        `${ROOT_CLIENT} mysql -uroot -N --default-character-set=utf8mb4 "$MYSQL_DATABASE" -e ` +
        `"SELECT DATABASE(), (SELECT COUNT(*) FROM devices), (SELECT COUNT(*) FROM print_transactions), (SELECT COUNT(*) FROM contracts)"`],
      { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }
    );
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("close", () => {
      const [db, devices, readings, contracts] = out.trim().split(/\s+/);
      resolve(db ? `${db}: เครื่อง ${devices} · ยอดมิเตอร์ ${readings} · สัญญา ${contracts}` : "(อ่านไม่ได้)");
    });
    child.on("error", () => resolve("(อ่านไม่ได้)"));
  });
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function dump(target, label = "สำรอง") {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const partial = `${target}.partial`;
  const out = fs.createWriteStream(partial);
  // --single-transaction ได้ภาพของฐาน ณ จุดเดียวโดยไม่ล็อกตาราง (InnoDB)
  // utf8mb4 ชัดเจน — ไม่งั้นชื่อไทยเพี้ยนถาวรตอนกู้คืน (ดู docs/how-to/run-migrations.md)
  await inDb(
    `${ROOT_CLIENT} mysqldump -uroot --default-character-set=utf8mb4 --single-transaction --set-gtid-purged=OFF --no-tablespaces ` +
      `--routines --triggers --skip-dump-date "$MYSQL_DATABASE"`,
    { stdout: out }
  );
  await new Promise((resolve) => out.end(resolve));
  // เขียนเป็น .partial ก่อน แล้วค่อยเปลี่ยนชื่อ — ไฟล์ที่ค้างครึ่งทางต้องไม่หน้าตาเหมือนไฟล์สำรองที่ใช้ได้
  fs.renameSync(partial, target);

  const sha = crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
  const size = (fs.statSync(target).size / 1024 / 1024).toFixed(2);
  console.log(`${label}: ${path.relative(ROOT, target)} (${size} MB)`);
  console.log(`  sha256 ${sha}`);
  return target;
}

async function restore(file) {
  if (!fs.existsSync(file)) fail(`ไม่พบไฟล์ ${file}`);
  const head = fs.readFileSync(file, { encoding: "utf8" }).slice(0, 2000);
  if (!/MariaDB dump|MySQL dump/i.test(head)) fail("ไฟล์นี้ไม่ใช่ไฟล์จาก mysqldump / mariadb-dump");

  console.log(`ก่อนกู้คืน — ${await captureSummary()}`);
  // สำรองของเดิมเสมอ ไฟล์สำรองผิดตัวต้องย้อนกลับได้
  await dump(path.join(BACKUP_DIR, `before-restore-${stamp()}.sql`), "สำรองของเดิมก่อนกู้คืน");

  await inDb(`${ROOT_CLIENT} mysql -uroot --default-character-set=utf8mb4 "$MYSQL_DATABASE"`, {
    stdin: fs.createReadStream(file),
  });
  console.log(`หลังกู้คืน — ${await captureSummary()}`);
  console.log("\nรหัส admin ของแอปตอนนี้เป็นของเครื่องที่สำรองไฟล์นี้มา");
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const files = rest.filter((arg) => !arg.startsWith("--"));

  if (command === "dump") {
    const name = (await captureSummary()).split(":")[0] || "suth";
    await dump(files[0] ? path.resolve(files[0]) : path.join(BACKUP_DIR, `${name}-${stamp()}.sql`));
    return;
  }
  if (command === "restore") {
    if (!files[0]) fail("ใช้: npm run db:restore -- <ไฟล์.sql> --confirm");
    if (!rest.includes("--confirm")) {
      fail(`กู้คืนจะแทนข้อมูลทั้งฐาน (${await captureSummary()}) — เพิ่ม --confirm ถ้าแน่ใจ`);
    }
    await restore(path.resolve(files[0]));
    return;
  }
  if (command === "reset") {
    // ฐานนี้คือข้อมูลจริง (ADR-0024) — ลบ volume ได้ต่อเมื่อยืนยันและสำรองสำเร็จแล้วเท่านั้น
    if (!rest.includes("--confirm")) {
      fail(`reset ลบข้อมูลทั้งฐาน (${await captureSummary()}) — เพิ่ม --confirm ถ้าแน่ใจ ระบบจะสำรองให้ก่อน`);
    }
    const summary = await captureSummary();
    if (summary !== "(อ่านไม่ได้)") await dump(path.join(BACKUP_DIR, `before-reset-${stamp()}.sql`), "สำรองก่อน reset");
    else console.log("ฐานไม่ได้เปิดอยู่ ไม่มีอะไรให้สำรอง");
    await new Promise((resolve, reject) => {
      const child = spawn("docker", ["compose", "--env-file", ENV_FILE, "down", "--volumes"], { cwd: ROOT, stdio: "inherit" });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`docker compose down ล้ม (exit ${code})`))));
    });
    console.log("ลบฐานแล้ว — npm run db:up จะสร้างฐานใหม่จาก schema.sql");
    return;
  }
  fail("ใช้: node scripts/dev-db/backup.cjs dump [ไฟล์] | restore <ไฟล์> --confirm | reset --confirm");
}

main().catch((err) => fail(err.message));
