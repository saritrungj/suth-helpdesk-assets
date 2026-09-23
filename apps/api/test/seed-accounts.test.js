// apps/api/test/seed-accounts.test.js
//
// schema.sql ต้องไม่สร้างบัญชีที่ล็อกอินได้ (#138)
//
// repository นี้เป็นสาธารณะ hash ใดที่อยู่ใน schema.sql ใครก็เอาไปเดารหัสแบบออฟไลน์ได้ และทุกฐาน
// ที่สร้างจากไฟล์นี้จะมีผู้ดูแลที่รหัสไม่ได้มาจากคนติดตั้ง — เคยเกิดจริง: hash ตัวอย่างสองตัวที่เคย
// อยู่ในไฟล์นี้เดาออกได้ด้วยรายการรหัสยอดนิยมไม่กี่สิบคำ
//
// รัน: npm test --workspace @suth/api

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcrypt");

const schemaSql = fs.readFileSync(path.resolve(__dirname, "../../../database/schema.sql"), "utf8");

/** รูปของ bcrypt hash ทุกรุ่น ($2a$ $2b$ $2y$) */
const BCRYPT_HASH = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/;

test("schema.sql ไม่มี bcrypt hash ของบัญชีใดเลย", () => {
  assert.doesNotMatch(schemaSql, BCRYPT_HASH);
});

test("บัญชี admin ที่ schema.sql สร้างไว้ล็อกอินไม่ได้ด้วยรหัสใดๆ", async () => {
  const match = schemaSql.match(/INSERT\s+IGNORE\s+INTO\s+users\s*\([^)]*\)\s*VALUES\s*\('admin',\s*'([^']*)',\s*'admin'\)\s*;/i);
  assert.ok(match, "ต้องมีแถว admin (id 1) ให้ FK verified_by และ npm run db:bootstrap");

  const stored = match[1];
  for (const guess of ["", "admin", "admin123", stored]) {
    assert.equal(await bcrypt.compare(guess, stored), false, `รหัส "${guess}" ต้องล็อกอินไม่ได้`);
  }
});

test("schema.sql สร้างบัญชีผู้ใช้แถวเดียว — ไม่มีบัญชีตัวอย่างอื่นติดมา", () => {
  const inserts = schemaSql.match(/INSERT\s+(IGNORE\s+)?INTO\s+users\b[\s\S]*?;/gi) ?? [];
  assert.equal(inserts.length, 1);
  assert.equal((inserts[0].match(/\('/g) ?? []).length, 1);
});
