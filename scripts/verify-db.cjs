// scripts/verify-db.cjs — รัน E2E ชุด db (DB_SPECS) กับฐาน MySQL ชั่วคราวในคำสั่งเดียว
//
//   npm run verify:db
//
// ต้องเปิด Docker ไว้ ทุกอย่างแยกจากเครื่องพัฒนา:
//   MySQL  127.0.0.1:3317 — ค่าเริ่มต้น container ชื่อ suth-verify-db สร้างจาก schema.sql + seed_ci.sql
//                            ใหม่ทุกรอบ แล้วลบทิ้งทุกครั้งที่จบ ไม่ว่าผ่านหรือล้ม
//   API    localhost:3310 — ค่าเริ่มต้น ต่อฐานข้างบนเท่านั้น ด้วย JWT_SECRET ที่สุ่มใหม่ทุกรอบ
//   เว็บ   localhost:5310 — ค่าเริ่มต้น preview ของ build แยกใน apps/web/dist-verify-db
//
// ห้ามใช้ API/เว็บที่เปิดค้างอยู่เด็ดขาด — ชุดนี้ตั้ง SUTH_E2E_ALLOW_WRITES=1 ถ้าไปเจอ
// dev API ที่ต่อฐานพัฒนา เทสจะเขียนทับข้อมูลจริง จึงเช็คว่าพอร์ตว่างก่อนเริ่ม และตั้ง
// CI=1 ให้ Playwright ปิด reuseExistingServer — มีอะไรใช้พอร์ตอยู่ให้หยุด ไม่ยึดต่อ

const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { assertReportFile } = require("./playwright-report.cjs");

const root = path.resolve(__dirname, "..");
// งานหลาย worktree อาจรันพร้อมกันได้ ใช้ suffix + พอร์ตของตัวเองเมื่อจำเป็น
// และห้ามลบ container ที่มีอยู่ก่อน เพราะอาจเป็นงานของอีก session
const instance = process.env.SUTH_VERIFY_DB_INSTANCE || "";
if (instance && !/^[a-z0-9-]{1,30}$/.test(instance)) {
  throw new Error("SUTH_VERIFY_DB_INSTANCE ต้องเป็น a-z, 0-9 หรือ - ยาวไม่เกิน 30 ตัว");
}
const container = `suth-verify-db${instance ? `-${instance}` : ""}`;
const database = "suth_ci";
function port(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error(`${name} ต้องเป็นพอร์ต 1024–65535`);
  return value;
}
const ports = {
  mysql: port("SUTH_VERIFY_MYSQL_PORT", 3317),
  api: port("SUTH_VERIFY_API_PORT", 3310),
  web: port("SUTH_VERIFY_WEB_PORT", 5310),
};
if (new Set(Object.values(ports)).size !== 3) throw new Error("พอร์ต MySQL, API และเว็บต้องไม่ซ้ำกัน");
const apiUrl = `http://localhost:${ports.api}/api`;
const webUrl = `http://localhost:${ports.web}`;
const webDist = "dist-verify-db";
const dbResultFile = path.join(root, "apps", "web", "e2e", ".artifacts", "db-results.json");

// รหัสไม่ว่าง เพราะบน Windows env ที่เป็นค่าว่างอาจไม่ถูกส่งต่อ แล้ว dotenv ของ API
// จะเติม DB_PASSWORD จาก apps/api/.env ของฐานพัฒนาแทน
const dbPassword = crypto.randomBytes(16).toString("hex");

function run(command, args, options = {}) {
  // npm บน Windows เป็น .cmd ซึ่ง Node รุ่นใหม่ไม่ยอม spawn ตรงๆ และการส่ง args ผ่าน
  // shell ก็ถูกเตือนว่าไม่ปลอดภัย (DEP0190) — ตอนรันผ่าน `npm run` จะมี npm_execpath
  // ชี้ไปที่ตัว npm-cli.js จึงเรียกผ่าน node ตรงๆ แทน
  if (command === "npm" && process.env.npm_execpath) {
    args = [process.env.npm_execpath, ...args];
    command = process.execPath;
  }
  const shell = process.platform === "win32" && command === "npm";
  const result = spawnSync(command, args, { stdio: "inherit", shell, ...options });
  if (result.error) throw result.error;
  return result.status;
}

function must(label, command, args, options) {
  const status = run(command, args, options);
  if (status !== 0) throw new Error(`${label} ล้ม (exit ${status})`);
}

function portFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(new Error(`พอร์ต ${port} มีโปรแกรมอื่นใช้อยู่ — ปิดก่อน สคริปต์นี้ไม่ยึด server ที่ไม่ได้สตาร์ตเอง`))
    );
    server.listen(port, () => server.close(resolve));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function removeContainer() {
  const result = spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  if (result.error || result.status !== 0) throw new Error(`ลบ container ทดสอบ ${container} ไม่สำเร็จ`);
}

async function waitForMysql() {
  // ต้องต่อผ่าน TCP — ระหว่าง init image ของ MySQL เปิด server ชั่วคราวที่ปิด network
  // ไว้ก่อน ping ผ่าน socket จะผ่านเร็วเกินไปแล้วโหลด schema ชนตอนมัน restart
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const probe = spawnSync(
      "docker",
      ["exec", "-e", `MYSQL_PWD=${dbPassword}`, container, "mysql", "-h127.0.0.1", "--protocol=TCP", "-uroot", "-e", "SELECT 1"],
      { stdio: "ignore" }
    );
    if (probe.status === 0) return;
    await sleep(1000);
  }
  throw new Error("MySQL ไม่พร้อมภายใน 90 วินาที");
}

function load(file) {
  // --default-character-set=utf8mb4 จำเป็น ไม่งั้นชื่อแผนกภาษาไทยยาวจงใจใน seed ถูกนับ
  // เป็นไบต์แล้วล้มด้วย "Data too long" (ดู docs/how-to/verify-changes.md)
  must(`โหลด ${file}`, "docker", [
    "exec", "-i", "-e", `MYSQL_PWD=${dbPassword}`, container,
    "mysql", "--default-character-set=utf8mb4", "-uroot", database,
  ], { input: fs.readFileSync(path.join(root, "database", file)), stdio: ["pipe", "inherit", "inherit"] });
}

async function main() {
  const docker = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (docker.error || docker.status !== 0) {
    throw new Error("ต่อ Docker ไม่ได้ — เปิด Docker Desktop ก่อนแล้วรันใหม่");
  }

  for (const port of Object.values(ports)) await portFree(port);
  const existing = spawnSync("docker", ["ps", "-a", "--filter", `name=^/${container}$`, "--format", "{{.ID}}"], { encoding: "utf8" });
  if (existing.error || existing.status !== 0) throw new Error("ตรวจ container เดิมไม่ได้");
  if (existing.stdout.trim()) throw new Error(`พบ container ${container} อยู่ก่อน — หยุดเพื่อรักษางานของ session อื่น`);

  console.log(`verify:db — สร้าง MySQL ชั่วคราวที่พอร์ต ${ports.mysql}`);
  let created = false;
  try {
    must("สร้าง container", "docker", [
      "run", "-d", "--name", container,
      "-e", `MYSQL_ROOT_PASSWORD=${dbPassword}`, "-e", `MYSQL_DATABASE=${database}`,
      "-p", `127.0.0.1:${ports.mysql}:3306`, "mysql:8.4",
    ], { stdio: "ignore" });
    created = true;
    await waitForMysql();
    load("schema.sql");
    load("seed_ci.sql");

    console.log(`verify:db — build เว็บแยกใน apps/web/${webDist} ที่ชี้ API ${apiUrl}`);
    must("build เว็บ", "npm", ["run", "build", "--workspace", "@suth/web", "--", "--outDir", webDist], {
      cwd: root,
      env: { ...process.env, VITE_API_BASE_URL: apiUrl },
    });

    const env = {
      ...process.env,
      CI: "1",
      DB_HOST: "127.0.0.1",
      DB_PORT: String(ports.mysql),
      DB_USER: "root",
      DB_PASSWORD: dbPassword,
      DB_NAME: database,
      PORT: String(ports.api),
      CORS_ORIGIN: webUrl,
      JWT_SECRET: crypto.randomBytes(32).toString("hex"),
      // ชุด db ยิง API หลายร้อยครั้งในไม่กี่นาทีจาก IP เดียว การชน production
      // rate limit ทำให้เคสท้ายๆ ได้ 429 ทั้งที่ระบบและฐานทดสอบยังปกติ
      RATE_LIMIT_PER_MINUTE: "100000",
      SUTH_API_URL: apiUrl,
      SUTH_WEB_URL: webUrl,
      SUTH_WEB_DIST: webDist,
      SUTH_E2E_START_API: "1",
      SUTH_E2E_REQUIRE_SERVICES: "1",
      SUTH_E2E_ALLOW_WRITES: "1",
      // fiscal-year-cache.spec.js อาจต้องกู้แถวหลัง POST ที่ผลตอบกลับไม่ชัดเจน
      // จึงรันได้เฉพาะกับฐานชั่วคราวที่สคริปต์นี้สร้าง ไม่ใช่ฐานที่แชร์กัน
      SUTH_E2E_DISPOSABLE_DB: "1",
      SUTH_E2E_REPORT_FILE: dbResultFile,
    };
    // token ที่ตั้งไว้ก่อนหน้าอาจเป็นของ server อื่น fixtures.js ใช้ตัวนี้ก่อน JWT_SECRET
    delete env.SUTH_E2E_TOKEN;

    console.log("verify:db — รัน E2E โปรเจกต์ db");
    fs.rmSync(dbResultFile, { force: true });
    const status = run("npm", ["run", "test:e2e:db", "--workspace", "@suth/web"], { cwd: root, env });
    if (status !== 0) throw new Error(`E2E โปรเจกต์ db ล้ม (exit ${status ?? "unknown"})`);
    console.log(assertReportFile(dbResultFile, "verify:db"));
  } finally {
    if (created) {
      removeContainer();
      console.log("verify:db — ลบ MySQL ชั่วคราวแล้ว");
    }
  }
}

main().catch((error) => {
  console.error(`verify:db: ${error.message}`);
  process.exitCode = 1;
});
