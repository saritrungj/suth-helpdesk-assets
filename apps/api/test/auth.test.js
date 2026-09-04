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

function makeReq({ cookies = {}, headers = {} } = {}) {
  return { cookies, headers };
}

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
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

test("ไม่มี token ต้องได้ 401 และไม่เรียก next()", () => {
  const res = makeRes();
  let called = false;
  requireAuth(makeReq(), res, () => {
    called = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(called, false, "ห้ามปล่อยผ่านเมื่อไม่มี token");
});

test("token ปลอมต้องได้ 401", () => {
  const res = makeRes();
  let called = false;
  requireAuth(makeReq({ cookies: { [SESSION_COOKIE]: "not.a.jwt" } }), res, () => {
    called = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});

test("token ที่เซ็นด้วยกุญแจอื่นต้องได้ 401", () => {
  const forged = jwt.sign({ id: 1, role: "admin" }, "กุญแจของคนอื่น");
  const res = makeRes();
  let called = false;
  requireAuth(makeReq({ cookies: { [SESSION_COOKIE]: forged } }), res, () => {
    called = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});

test("token ที่หมดอายุแล้วต้องได้ 401", () => {
  const expired = jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: "-1s",
  });
  const res = makeRes();
  let called = false;
  requireAuth(makeReq({ cookies: { [SESSION_COOKIE]: expired } }), res, () => {
    called = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});

test("token ที่ใช้ได้ต้องผ่านและแนบ req.user ให้", () => {
  const req = makeReq({ cookies: { [SESSION_COOKIE]: validToken() } });
  const res = makeRes();
  let called = false;

  requireAuth(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(res.statusCode, null, "ห้ามตอบ error เมื่อ token ใช้ได้");
  assert.equal(req.user.username, "admin");
  assert.equal(req.user.role, "admin");
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
