// apps/web/e2e/fixtures.js
//
// ตัวช่วยร่วมของเทสบนเบราว์เซอร์จริง
//
// ## เรื่องการเข้าสู่ระบบ
//
// ระบบเก็บ token ไว้ใน cookie แบบ httpOnly ที่ JavaScript อ่านไม่ได้ (ADR-0006)
// เทสจึงไม่สามารถ "ล็อกอินแล้วอ่าน token" ได้ ทางที่ใช้คือเซ็น token เองจาก
// `JWT_SECRET` เดียวกับที่ API ใช้ แล้ววาง cookie ลง browser context โดยตรง
//
// **ทำแบบนี้ได้เฉพาะบนเครื่องพัฒนา** — ถ้าจะรันกับเซิร์ฟเวอร์จริง ให้ตั้ง
// `SUTH_E2E_TOKEN` มาแทน อย่าเอา JWT_SECRET ของ production มาไว้ในเครื่องที่รันเทส

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_URL = process.env.SUTH_API_URL || "http://localhost:3000/api";

/** อ่าน JWT_SECRET จาก apps/api/.env — ไฟล์นี้ถูก gitignore ไว้และไม่เคยถูก commit */
function readSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  const envPath = path.resolve(HERE, "../../api/.env");
  if (!fs.existsSync(envPath)) return null;

  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((row) => row.startsWith("JWT_SECRET="));

  if (!line) return null;
  return line.slice("JWT_SECRET=".length).trim().replace(/^["']|["']$/g, "");
}

const base64url = (input) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** เซ็น JWT HS256 เอง — ไม่ต้องพึ่งไลบรารีฝั่งเว็บที่ไม่ได้ใช้ตอน build จริง */
function signToken(secret, payload) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${header}.${body}.${signature}`;
}

/** @returns {string|null} token ที่ใช้ได้ หรือ null ถ้าออกให้ไม่ได้ */
export function issueToken(role = "admin") {
  if (process.env.SUTH_E2E_TOKEN) return process.env.SUTH_E2E_TOKEN;

  const secret = readSecret();
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  return signToken(secret, {
    id: 1,
    username: "admin",
    role,
    iat: now,
    exp: now + 60 * 60 * 2,
  });
}

async function computeReasonToSkip() {
  if (!issueToken()) return "ออก token ไม่ได้ (ไม่มี JWT_SECRET และไม่ได้ตั้ง SUTH_E2E_TOKEN)";

  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return `API ตอบสถานะ ${res.status}`;
  } catch {
    return `ต่อ API ที่ ${API_URL} ไม่ได้`;
  }

  return null;
}

/**
 * @returns {Promise<string|null>} เหตุผลที่ต้องข้าม หรือ null ถ้ารันได้
 *
 * ค่าเริ่มต้นคือคืนเหตุผลให้แต่ละเทส `test.skip()` เอง เพราะเครื่องพัฒนาของใคร
 * บางคนอาจไม่ได้เปิด API/ฐานข้อมูลไว้ ซึ่งไม่ใช่ความผิดของโค้ด
 *
 * บนงาน CI ที่มีฐานข้อมูลจริง (#63) การ skip แบบนี้อันตราย — ถ้า service
 * container ต่อไม่ติดเพราะ config ผิด workflow จะรายงานว่า "ผ่าน" (skipped
 * ไม่ใช่ failed) ทั้งที่ไม่ได้ตรวจอะไรเลย ตั้ง `SUTH_E2E_REQUIRE_SERVICES=1`
 * ให้โยน error แทน — เทสจะแดงแทนที่จะข้ามเงียบๆ
 */
export async function reasonToSkip() {
  const reason = await computeReasonToSkip();
  if (reason && process.env.SUTH_E2E_REQUIRE_SERVICES === "1") {
    throw new Error(`SUTH_E2E_REQUIRE_SERVICES=1 แต่ยังรันไม่ได้: ${reason}`);
  }
  return reason;
}

/** วาง cookie เข้าสู่ระบบลงใน context — ต้องเรียกก่อน goto ครั้งแรกเสมอ */
export async function signIn(context, role = "admin") {
  await context.addCookies([
    {
      name: "suth_session",
      value: issueToken(role),
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

/** เรียก API ตรงๆ ในนามผู้ใช้ที่ล็อกอินแล้ว — ใช้เตรียมและคืนค่าข้อมูลของเทส */
export async function apiFetch(pathname, options = {}) {
  const res = await fetch(`${API_URL}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Cookie: `suth_session=${issueToken()}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) throw new Error(`${pathname} ตอบสถานะ ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * คืนค่ายอดพิมพ์ของเดือนหนึ่งกลับไปเป็นสถานะเดิม
 *
 * เทสที่เขียนข้อมูลจริงต้องเก็บกวาดเองเสมอ ไม่งั้นรันสองรอบแล้วผลต่างกัน และ
 * ที่แย่กว่านั้นคือทิ้งตัวเลขปลอมไว้ในรายงานที่คนเอาไปใช้จริง
 */
export async function restoreMonth(month, snapshot) {
  const items = snapshot.map(({ device_id, pages }) => ({ device_id, pages }));
  if (items.length === 0) return;
  await apiFetch("/print-transactions/bulk", {
    method: "POST",
    body: JSON.stringify({ month, items }),
  });
}

/** อ่านยอดของเดือนหนึ่งไว้ก่อนแก้ เพื่อเอาไว้คืนค่าทีหลัง */
export async function snapshotMonth(month, deviceIds) {
  const rows = await apiFetch(`/print-transactions?month=${encodeURIComponent(month)}`);
  const byDevice = new Map(rows.map((r) => [r.device_id, Number(r.pages)]));

  // เครื่องที่ยังไม่เคยมียอดต้องคืนเป็น null (ล้างทิ้ง) ไม่ใช่ 0
  return deviceIds.map((device_id) => ({
    device_id,
    pages: byDevice.has(device_id) ? byDevice.get(device_id) : null,
  }));
}

/**
 * ปีงบที่ "หน้าเว็บ" จะเลือกให้เอง
 *
 * ⚠️ ห้าม hardcode `fiscal_year_id=1` — store เลือก **ตัวสุดท้ายของรายการ**
 * (`list[list.length - 1]`) ไม่ใช่ id ที่น้อยที่สุดหรือมากที่สุด พอมีคนเพิ่มปีงบใหม่
 * ลำดับเปลี่ยน แล้วเทสจะไปอ่าน/คืนค่าคนละปีกับที่หน้าเว็บกำลังแก้อยู่ —
 * ซึ่งแปลว่าเทสเขียนข้อมูลลงเดือนหนึ่งแล้วไปคืนค่าอีกเดือนหนึ่ง
 *
 * ต้องคำนวณด้วยกฎเดียวกับ `apps/web/src/store/fiscalYear.js` เป๊ะๆ
 */
export async function activeFiscalYear() {
  const list = await apiFetch("/fiscal-years");
  if (!list.length) throw new Error("ไม่มีปีงบในระบบ");
  return list[list.length - 1];
}

/**
 * เทสที่ **เขียน** ข้อมูลจริงต้องเปิดใช้เองเท่านั้น
 *
 * ค่าเริ่มต้นคือข้าม เพราะฐานข้อมูลบนเครื่องพัฒนาคือฐานเดียวกับที่คนใช้ดูรายงาน
 * จริง การรันเทสที่เขียนข้อมูลโดยไม่ตั้งใจ = ตัวเลขในรายงานเปลี่ยนโดยไม่มีใครรู้
 *
 * เปิดด้วย `SUTH_E2E_ALLOW_WRITES=1` และควรชี้ไปที่ฐานทดสอบแยกเสมอ
 * (ตั้ง DB_NAME ของ API ให้เป็นฐานทดสอบก่อนรัน)
 */
export function writesAllowed() {
  return process.env.SUTH_E2E_ALLOW_WRITES === "1";
}
