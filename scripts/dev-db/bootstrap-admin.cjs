// scripts/dev-db/bootstrap-admin.cjs — ตั้งรหัสผู้ดูแลของฐานบน Docker ที่เพิ่งสร้าง
//
//   npm run db:bootstrap
//
// schema.sql ใส่บัญชี prototype ที่ไม่มีใครรู้รหัส (admin, user1) ฐานใหม่จึงล็อกอินไม่ได้
// และระบบไม่มี endpoint ตั้งรหัสให้บัญชีที่ยังล็อกอินไม่ได้ — ซึ่งไม่ควรมี สคริปต์นี้จึงต่อ
// ฐานตรงเพื่อแตะ "บัญชี" อย่างเดียว ในขอบเขตเดียวกับ ADR-0016 และ ADR-0024
//
//   1. ยืนยันว่าชี้ฐานบน Docker ของ compose.env — พอร์ตและชื่อฐานต้องตรง ไม่ใช่ XAMPP 3306
//   2. ยืนยันว่าบัญชีแอป (SUTH_APP_USER) ต่อได้ — entrypoint ไม่หยุดเมื่อสคริปต์สร้างบัญชีล้ม
//   3. ทำเฉพาะฐานที่ยังเป็นบัญชี prototype ล้วน ถ้ามีบัญชีอื่นหรือรหัสถูกเปลี่ยนแล้ว = ปฏิเสธ
//   4. ตั้งรหัส admin จาก SUTH_ADMIN_PASSWORD และลบ user1 (รหัส prototype ที่ไม่มีใครรู้)
//
// ข้อมูลธุรกิจทุกชิ้นลงผ่าน HTTP API เท่านั้น — ดู scripts/master-data/load-master-data.cjs

const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");

const ROOT = path.join(__dirname, "..", "..");
const ENV_FILE = path.join(ROOT, "database", "docker", "compose.env");

// hash ของบัญชี prototype ใน schema.sql — ใช้เป็น sentinel ว่าฐานยังไม่เคยถูกตั้งค่า
const PROTOTYPE = {
  admin: "$2b$10$yRofvUyNetzokkLKJAcqw.qRPIFUEdvi7eoqTkeSM4IQRKhZ7WsyC",
  user1: "$2b$10$5RJWHc6Ky55Rxuyjyc/o5Op0z.o9RpKC/g5KPHK/tjPpKNBNh4yEu",
};

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

/** อ่าน KEY=VALUE จาก compose.env — ไม่ใช้ dotenv เพราะไม่อยากให้ไปอ่าน apps/api/.env ผิดไฟล์ */
function readEnvFile(file) {
  if (!fs.existsSync(file)) {
    fail(`ไม่พบ ${path.relative(ROOT, file)} — คัดลอกจาก compose.env.example แล้วตั้งรหัสก่อน`);
  }
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

async function main() {
  const env = readEnvFile(ENV_FILE);
  const port = Number(env.SUTH_DB_PORT || 3307);
  const database = env.SUTH_DB_NAME || "hospital_it_asset";
  const adminPassword = env.SUTH_ADMIN_PASSWORD;

  if (port === 3306) fail("SUTH_DB_PORT เป็น 3306 ซึ่งชนกับ XAMPP — สคริปต์นี้ใช้กับฐานบน Docker เท่านั้น");
  // docker compose แปล $ และตัดเครื่องหมายคำพูดใน env file เอง ส่วนสคริปต์นี้อ่านตรงตัว
  // ถ้ายอมให้มี รหัสที่ container เห็นกับที่สคริปต์และ API ใช้จะไม่ตรงกันโดยไม่มีใครรู้
  for (const key of Object.keys(env).filter((k) => k.endsWith("_PASSWORD"))) {
    if (/['"\\$]/.test(env[key])) fail(`${key} ห้ามมี ' " \\ หรือ $`);
  }
  if (!adminPassword || adminPassword.length < 12) fail("ตั้ง SUTH_ADMIN_PASSWORD ใน compose.env อย่างน้อย 12 ตัวอักษร");

  const connect = (user, password) =>
    mysql.createConnection({ host: "127.0.0.1", port, user, password, database });

  // 2. บัญชีแอปต้องต่อได้ก่อน ไม่งั้น API จะเปิดไม่ขึ้นทั้งที่ฐานดูปกติ
  try {
    const app = await connect(env.SUTH_APP_USER || "suth_app", env.SUTH_APP_PASSWORD);
    await app.end();
  } catch (err) {
    fail(`บัญชีแอปต่อฐานไม่ได้ (${err.code}) — ดู npm run db:logs แล้วสร้างฐานใหม่ด้วย npm run db:reset -- --confirm`);
  }

  const root = await connect("root", env.SUTH_DB_ROOT_PASSWORD);
  try {
    // 1. ยืนยันตัวตนของฐานก่อนแตะอะไร
    const [[identity]] = await root.query("SELECT DATABASE() AS db, VERSION() AS version");
    if (identity.db !== database) fail(`ต่อได้ฐาน ${identity.db} ไม่ใช่ ${database}`);
    console.log(`ฐาน ${identity.db} บน 127.0.0.1:${port} (${identity.version})`);

    // 3. sentinel — บัญชีต้องเป็น prototype ล้วน
    const [users] = await root.query("SELECT username, password FROM users ORDER BY username");
    const untouched =
      users.length === 2 && users.every((user) => PROTOTYPE[user.username] === user.password);
    if (!untouched) {
      const names = users.map((user) => user.username).join(", ");
      fail(`ฐานนี้ถูกตั้งบัญชีไปแล้ว (${names}) — ไม่แตะซ้ำ ถ้าจะเริ่มใหม่ใช้ npm run db:reset -- --confirm`);
    }

    // 4. ตั้งรหัส admin และลบบัญชี prototype ที่ไม่มีใครรู้รหัส
    const hash = await bcrypt.hash(adminPassword, 10);
    await root.beginTransaction();
    await root.query("UPDATE users SET password = ? WHERE username = 'admin'", [hash]);
    await root.query("DELETE FROM users WHERE username = 'user1'");
    await root.commit();
  } finally {
    await root.end();
  }

  console.log("ตั้งรหัส admin แล้ว (รหัสอยู่ใน compose.env) และลบบัญชี prototype user1");
  console.log("\nให้ API ต่อฐานนี้ ตั้งใน apps/api/.env:");
  console.log(`  DB_HOST=127.0.0.1\n  DB_PORT=${port}\n  DB_NAME=${database}`);
  console.log(`  DB_USER=${env.SUTH_APP_USER || "suth_app"}\n  DB_PASSWORD=<SUTH_APP_PASSWORD ใน compose.env>`);
}

main().catch((err) => fail(err.message));
