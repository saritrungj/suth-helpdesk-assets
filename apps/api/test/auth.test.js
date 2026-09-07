// apps/api/test/auth.test.js
//
// เทสของชั้นยืนยันตัวตน — ส่วนที่ตัดสินว่า "request นี้เป็นใคร" และ "cookie ปลอดภัยแค่ไหน"
// ใช้ test runner ที่ติดมากับ Node (node:test) ไม่ต้องติดตั้ง framework เพิ่ม
//
// รัน: npm test --workspace @suth/api   (หรือ npm test ที่ราก)

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-unit-tests";

const requireAuth = require("../src/auth/require-auth");
const { readToken } = requireAuth;
const { SESSION_COOKIE, sessionCookieOptions } = require("../src/auth/session-cookie");
const requireAdmin = require("../src/auth/require-admin");
const requireStaff = require("../src/auth/require-staff");

function makeReq({ cookies = {}, headers = {} } = {}) {
  return { cookies, headers };
}

/**
 * ดัก error ที่ middleware ส่งต่อไปที่ next()
 *
 * middleware ของชั้นยืนยันตัวตนไม่ตอบกลับเอง แต่โยน ApiError ให้ error handler
 * กลางใน index.js จัดการ (เพื่อให้ทุกคำตอบที่เป็นข้อผิดพลาดมีรูปแบบเดียวกัน
 * ตาม RFC 9457) เทสจึงต้องตรวจ "error ที่ถูกส่งต่อ" ไม่ใช่ "สถานะที่ตอบกลับ"
 */
function run(middleware, req) {
  let error = null;
  let passed = false;

  middleware(req, {}, (err) => {
    if (err) error = err;
    else passed = true;
  });

  return { error, passed };
}

const validToken = () =>
  jwt.sign({ id: 1, username: "admin", role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

// ------------------------------------------------------------------
// readToken — ลำดับความสำคัญของแหล่ง token
// ------------------------------------------------------------------

test("อ่าน token จาก cookie ได้", () => {
  const req = makeReq({ cookies: { [SESSION_COOKIE]: "abc" } });
  assert.equal(readToken(req), "abc");
});

test("อ่าน token จาก Authorization: Bearer ได้ เมื่อไม่มี cookie", () => {
  const req = makeReq({ headers: { authorization: "Bearer xyz" } });
  assert.equal(readToken(req), "xyz");
});

test("cookie มาก่อน header เสมอ", () => {
  const req = makeReq({
    cookies: { [SESSION_COOKIE]: "จาก-cookie" },
    headers: { authorization: "Bearer จาก-header" },
  });
  assert.equal(readToken(req), "จาก-cookie");
});

test("scheme ที่ไม่ใช่ Bearer ต้องไม่ถูกอ่านเป็น token", () => {
  assert.equal(readToken(makeReq({ headers: { authorization: "Basic xyz" } })), null);
  assert.equal(readToken(makeReq({ headers: { authorization: "xyz" } })), null);
  assert.equal(readToken(makeReq({ headers: { authorization: "Bearer" } })), null);
});

test("bearer ตัวพิมพ์เล็กก็ยังอ่านได้", () => {
  assert.equal(readToken(makeReq({ headers: { authorization: "bearer xyz" } })), "xyz");
});

test("ไม่มีทั้ง cookie และ header ได้ null", () => {
  assert.equal(readToken(makeReq()), null);
});

// ------------------------------------------------------------------
// requireAuth — ต้องปล่อยผ่านเฉพาะ token ที่ใช้ได้จริง
// ------------------------------------------------------------------

test("ไม่มี token ต้องถูกปฏิเสธด้วย 401 และไม่ปล่อยผ่าน", () => {
  const { error, passed } = run(requireAuth, makeReq());

  assert.equal(passed, false, "ห้ามปล่อยผ่านเมื่อไม่มี token");
  assert.equal(error.status, 401);
  assert.equal(error.code, "no_token");
});

test("token ปลอมต้องได้ 401", () => {
  const { error, passed } = run(requireAuth, makeReq({ cookies: { [SESSION_COOKIE]: "not.a.jwt" } }));

  assert.equal(passed, false);
  assert.equal(error.status, 401);
  assert.equal(error.code, "invalid_token");
});

test("token ที่เซ็นด้วยกุญแจอื่นต้องได้ 401", () => {
  const forged = jwt.sign({ id: 1, role: "admin" }, "กุญแจของคนอื่น");
  const { error, passed } = run(requireAuth, makeReq({ cookies: { [SESSION_COOKIE]: forged } }));

  assert.equal(passed, false);
  assert.equal(error.status, 401);
  assert.equal(error.code, "invalid_token");
});

test("token ที่หมดอายุแล้วต้องได้ 401 พร้อมรหัสที่แยกจาก token ปลอม", () => {
  const expired = jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "-1s" });
  const { error, passed } = run(requireAuth, makeReq({ cookies: { [SESSION_COOKIE]: expired } }));

  assert.equal(passed, false);
  assert.equal(error.status, 401);
  // แยก code กันเพราะฝั่งเว็บทำคนละอย่าง — หมดอายุคือเรื่องปกติของคนที่เปิดหน้า
  // ทิ้งไว้ข้ามวัน ส่วน token ปลอมคือสัญญาณของการปลอมแปลง
  assert.equal(error.code, "token_expired");
});

test("token ที่ใช้ได้ต้องผ่านและแนบ req.user ให้", () => {
  const req = makeReq({ cookies: { [SESSION_COOKIE]: validToken() } });
  const { error, passed } = run(requireAuth, req);

  assert.equal(passed, true);
  assert.equal(error, null, "ห้ามส่ง error เมื่อ token ใช้ได้");
  assert.equal(req.user.username, "admin");
  assert.equal(req.user.role, "admin");
});

// ------------------------------------------------------------------
// require-admin / require-staff — ด่านสิทธิ์
//
// การซ่อนเมนูฝั่งเว็บไม่ใช่ความปลอดภัย ไฟล์เหล่านี้คือตัวที่บังคับจริง
// ------------------------------------------------------------------

test("require-admin ปล่อยผ่านเฉพาะ admin", () => {
  assert.equal(run(requireAdmin, { user: { role: "admin" } }).passed, true);

  for (const role of ["staff", "viewer", undefined]) {
    const { error, passed } = run(requireAdmin, { user: role ? { role } : undefined });
    assert.equal(passed, false, `สิทธิ์ ${role} ต้องไม่ผ่าน require-admin`);
    assert.equal(error.status, 403);
  }
});

test("require-staff ปล่อย admin กับ staff แต่กัน viewer", () => {
  assert.equal(run(requireStaff, { user: { role: "admin" } }).passed, true);
  assert.equal(run(requireStaff, { user: { role: "staff" } }).passed, true);

  const { error, passed } = run(requireStaff, { user: { role: "viewer" } });
  assert.equal(passed, false, "viewer ต้องบันทึกข้อมูลไม่ได้");
  assert.equal(error.status, 403);
  assert.equal(error.code, "read_only");
});

// ------------------------------------------------------------------
// cookie ของ session — ค่าที่ตั้งผิดคือช่องโหว่ ไม่ใช่แค่ตั้งค่าไม่สวย
// ------------------------------------------------------------------

test("cookie ต้องเป็น httpOnly เสมอ", () => {
  assert.equal(sessionCookieOptions().httpOnly, true);
});

test("บนเครื่องพัฒนา cookie ไม่ต้อง secure (ยังเป็น http อยู่)", () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  delete process.env.COOKIE_SAMESITE;

  assert.equal(sessionCookieOptions().secure, false);

  process.env.NODE_ENV = original;
});

test("บน production cookie ต้อง secure", () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  assert.equal(sessionCookieOptions().secure, true);

  process.env.NODE_ENV = original;
});

test("sameSite=none ต้องบังคับ secure เสมอ ไม่ว่าจะอยู่ environment ไหน", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSameSite = process.env.COOKIE_SAMESITE;

  process.env.NODE_ENV = "development";
  process.env.COOKIE_SAMESITE = "none";

  const options = sessionCookieOptions();
  assert.equal(options.sameSite, "none");
  assert.equal(options.secure, true, "เบราว์เซอร์ทิ้ง cookie ที่ sameSite=none แต่ไม่ secure");

  process.env.NODE_ENV = originalEnv;
  if (originalSameSite === undefined) delete process.env.COOKIE_SAMESITE;
  else process.env.COOKIE_SAMESITE = originalSameSite;
});

test("อายุ cookie ตรงกับอายุ token คือ 8 ชั่วโมง", () => {
  assert.equal(sessionCookieOptions().maxAge, 8 * 60 * 60 * 1000);
});
