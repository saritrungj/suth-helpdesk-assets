const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { check, initialScripts, INITIAL_JS_GZIP_BUDGET_KB } = require("./check-bundle-budget.cjs");

/** build จำลอง: index.html + ไฟล์ใน assets/ */
function fakeDist(files, html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-budget-"));
  fs.mkdirSync(path.join(dir, "assets"));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, "assets", name), content);
  fs.writeFileSync(path.join(dir, "index.html"), html);
  return dir;
}

const HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-a.js"></script>
<link rel="modulepreload" crossorigin href="/assets/shared-b.js">
<link rel="stylesheet" href="/assets/index.css">
</head><body></body></html>`;

test("อ่านเฉพาะ JS ที่ index.html โหลดตอนเริ่ม — ไม่นับ CSS และ chunk ที่โหลดทีหลัง", () => {
  assert.deepEqual(initialScripts(HTML), ["/assets/index-a.js", "/assets/shared-b.js"]);
});

test("ผ่านเมื่ออยู่ในงบและไม่มีไลบรารีต้องห้าม", () => {
  const dir = fakeDist({ "index-a.js": "console.log(1)", "shared-b.js": "export const x = 1", "chart-c.js": "Canvas is already in use" }, HTML);
  const result = check(dir);
  assert.equal(result.ok, true, result.problems.join("\n"));
  assert.equal(result.rows.length, 2);
});

test("ล้มเมื่อ chart.js อยู่ในไฟล์ที่ทุกหน้าโหลด และบอกวิธีแก้", () => {
  const dir = fakeDist({ "index-a.js": "x", "shared-b.js": "throw new Error('Canvas is already in use')" }, HTML);
  const result = check(dir);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /chart\.js is in \/assets\/shared-b\.js/);
  assert.match(result.problems.join("\n"), /UiChart\.vue/);
});

test("ล้มเมื่อรวมเกินงบ", () => {
  // ข้อมูลสุ่มบีบอัดไม่ลง ขนาด gzip จึงใกล้ขนาดจริง
  const big = require("node:crypto").randomBytes((INITIAL_JS_GZIP_BUDGET_KB + 10) * 1024).toString("base64");
  const dir = fakeDist({ "index-a.js": big, "shared-b.js": "x" }, HTML);
  const result = check(dir);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /over the \d+ KB budget/);
});

test("ไม่มี build — ล้มพร้อมบอกให้ build ก่อน ไม่ผ่านเงียบๆ", () => {
  const dir = fakeDist({}, "<html></html>");
  const result = check(dir);
  assert.equal(result.ok, false);
  assert.match(result.problems[0], /npm run build/);
});
