// apps/api/src/shared/route-conventions.test.js — กฎ ADR-0010 ที่ตรวจด้วยเครื่องได้ (#268)
//
// เส้นทางต้องโยน ApiError ให้ error handler กลางสร้าง response เอง เพราะ handler กลางเป็นที่เดียวที่
// ตั้ง Content-Type แบบ problem+json และ Cache-Control: no-store (คนเขียน res.status(4xx).json เองลืมทั้งสองอย่าง)

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const API_ROOT = path.resolve(__dirname, "../..");
const SKIP_DIRS = new Set(["node_modules", "shared"]);
// ตัวจัดการข้อผิดพลาดกลางอยู่ใน index.js — เป็นที่เดียวนอก shared/ ที่ตอบ response error เองได้
const CENTRAL_HANDLER = "index.js";

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(full);
    return entry.name.endsWith(".js") && !entry.name.endsWith(".test.js") ? [full] : [];
  });
}

// ตรวจทั้งไฟล์ ไม่ใช่ทีละบรรทัด — ต้องจับสายที่ตัดขึ้นบรรทัดใหม่ (res\n.status(429)\n.json() ด้วย
const ERROR_RESPONSE = /\bres\s*\.status\(\s*[45]\d\d\s*\)(?:\s*\.type\([^)]*\))?\s*\.json\(/g;

test("ไม่มีเส้นทางหรือ middleware ตอบ error 4xx/5xx เองด้วย res.status(...).json — โยน ApiError", () => {
  const offenders = [];
  for (const file of sourceFiles(API_ROOT)) {
    const rel = path.relative(API_ROOT, file).split(path.sep).join("/");
    if (rel === CENTRAL_HANDLER) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(ERROR_RESPONSE)) {
      offenders.push(`${rel}:${source.slice(0, match.index).split("\n").length}`);
    }
  }
  assert.deepEqual(offenders, [], `ตอบ error เองแทนการโยน ApiError: ${offenders.join(", ")}`);
});

test("index.js ตอบ error เองได้เฉพาะใน error handler กลาง", () => {
  const source = fs.readFileSync(path.join(API_ROOT, CENTRAL_HANDLER), "utf8");
  const handlerStart = source.indexOf("app.use((err, req, res, next)");
  assert.ok(handlerStart > 0, "ไม่พบ error handler กลางใน index.js");
  const outside = source.slice(0, handlerStart);
  assert.doesNotMatch(outside, /res\s*\.status\(\s*[45]\d\d\s*\)/, "มี response error นอก error handler กลาง");
});

test("ตัวตรวจจับ res.status(4xx).json รวมสายที่ตัดขึ้นบรรทัดใหม่ และไม่จับ 2xx", () => {
  const chained = "handler: (req, res) => {\n  res\n    .status(429)\n    .type(PROBLEM_JSON)\n    .json({});\n}";
  assert.equal([...chained.matchAll(ERROR_RESPONSE)].length, 1);
  assert.equal([..."res.status(404).json({})".matchAll(ERROR_RESPONSE)].length, 1);
  assert.equal([..."res.status(200).json({})".matchAll(ERROR_RESPONSE)].length, 0);
});
