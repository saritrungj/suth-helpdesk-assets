// apps/mcp/api-client.js
//
// ตัวเรียก API ของระบบ สำหรับเซิร์ฟเวอร์ MCP
//
// ## ทำไมต้องเรียกผ่าน HTTP API ไม่ต่อฐานข้อมูลตรงๆ
//
// การต่อ MySQL ตรงจะเร็วกว่าและเขียนง่ายกว่า แต่จะสร้าง "ทางเข้าที่สอง" ของระบบ
// ที่ไม่ผ่านด่านสิทธิ์เดียวกับที่ทุกอย่างผ่าน — กฎอย่าง "viewer แก้ข้อมูลไม่ได้"
// หรือ "ต้องเหลือ admin หนึ่งคน" อยู่ในชั้น API ทั้งหมด การข้ามชั้นนั้นแปลว่า
// ต้องเขียนกฎเดิมซ้ำที่นี่แล้วรอวันที่มันไม่ตรงกัน
//
// คำแนะนำด้านความปลอดภัยของ MCP ที่ออกมาในปี 2026 ก็บอกตรงกันว่า เซิร์ฟเวอร์หนึ่ง
// ตัวควรมีขอบเขตสิทธิ์เดียวและชัดเจน — ที่นี่คือ "สิทธิ์เท่ากับบัญชีที่ใช้ล็อกอิน"
// ไม่มากกว่านั้น
//
// ## บัญชีที่ใช้
//
// อ่านจาก environment เท่านั้น (SUTH_API_USERNAME / SUTH_API_PASSWORD) — ห้ามเก็บ
// ในไฟล์ที่อยู่ใน repository ตามข้อกำหนดใน AGENTS.md แนะนำให้สร้างบัญชีแยกที่มี
// สิทธิ์ระดับ viewer ไว้ให้ตัวนี้โดยเฉพาะ เพื่อให้แม้ token หลุดก็อ่านได้อย่างเดียว

import { setTimeout as delay } from "node:timers/promises";

const BASE_URL = (process.env.SUTH_API_URL || "http://localhost:3000/api").replace(/\/$/, "");
const USERNAME = process.env.SUTH_API_USERNAME;
const PASSWORD = process.env.SUTH_API_PASSWORD;

/**
 * token ที่ออกไว้ล่วงหน้า — ทางเลือกแทนการเก็บรหัสผ่านไว้ใน environment
 *
 * เหมาะกับการติดตั้งที่ไม่อยากให้ไฟล์ตั้งค่าของเครื่องมือมีรหัสผ่านของบัญชีจริง
 * อยู่ในนั้น ข้อแลกเปลี่ยนคือ token มีอายุ 8 ชั่วโมงและไม่ต่ออายุเอง จึงเหมาะกับ
 * การใช้ชั่วคราวหรือการทดสอบมากกว่าการเปิดค้างไว้ทั้งวัน
 */
const STATIC_TOKEN = process.env.SUTH_API_TOKEN;

/** token ที่ได้จากการล็อกอินครั้งล่าสุด — ใช้ซ้ำจนกว่าจะหมดอายุ */
let token = STATIC_TOKEN || null;

/**
 * ล็อกอินเพื่อขอ token ใหม่
 *
 * API ตั้ง token ไว้ใน cookie แบบ httpOnly สำหรับเบราว์เซอร์ แต่ก็รับ
 * `Authorization: Bearer` ด้วยสำหรับเครื่องมือที่ไม่ใช่เบราว์เซอร์ (ดู
 * apps/api/src/auth/require-auth.js) — ตัวนี้เข้าข่ายนั้น
 *
 * ปัญหา: endpoint ล็อกอินตอบ token กลับมาใน cookie ไม่ใช่ใน body เราจึงต้องอ่าน
 * จาก header `set-cookie` ซึ่งเป็นวิธีที่ตรงกับพฤติกรรมจริงของ API มากกว่าการ
 * ขอให้ API เพิ่มช่องใหม่ในคำตอบเฉพาะเพื่อเครื่องมือตัวนี้ตัวเดียว
 */
async function login() {
  if (STATIC_TOKEN) {
    // ตั้ง token ไว้ตายตัวแล้วแต่ใช้ไม่ได้ — ต่ออายุเองไม่ได้ ต้องบอกให้ชัดว่า
    // ต้องไปออก token ใหม่ ไม่ใช่ปล่อยให้ล้มเหลวเป็น "เข้าสู่ระบบไม่สำเร็จ" ลอยๆ
    throw new Error("SUTH_API_TOKEN ที่ตั้งไว้ใช้ไม่ได้หรือหมดอายุแล้ว — ออก token ใหม่ หรือเปลี่ยนไปใช้ SUTH_API_USERNAME/SUTH_API_PASSWORD แทน");
  }

  if (!USERNAME || !PASSWORD) {
    throw new Error(
      "ยังไม่ได้ตั้งค่าบัญชีสำหรับเซิร์ฟเวอร์ MCP — กำหนด SUTH_API_USERNAME และ SUTH_API_PASSWORD ใน environment ก่อน"
    );
  }

  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });

  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(`เข้าสู่ระบบไม่สำเร็จ: ${problem.title || response.status}`);
  }

  const cookie = response.headers.get("set-cookie") || "";
  const match = cookie.match(/suth_session=([^;]+)/);

  if (!match) throw new Error("เข้าสู่ระบบสำเร็จแต่ไม่พบ token ในคำตอบ");

  token = match[1];
}

/**
 * เรียก API หนึ่งครั้ง พร้อมล็อกอินใหม่อัตโนมัติเมื่อ token หมดอายุ
 *
 * token มีอายุ 8 ชั่วโมง ส่วนเซิร์ฟเวอร์ MCP อาจเปิดค้างไว้ข้ามวัน — ถ้าไม่ล็อกอิน
 * ใหม่เอง ผู้ใช้จะเจอ "หมดอายุ" แล้วต้องรีสตาร์ตเครื่องมือเองโดยไม่รู้สาเหตุ
 *
 * ลองใหม่แค่ครั้งเดียวเท่านั้น — ถ้าล็อกอินใหม่แล้วยังได้ 401 อีก แปลว่ารหัสผ่าน
 * ผิดจริง การวนลองต่อจะไปชนตัวจำกัดจำนวนครั้งล็อกอินแล้วล็อกบัญชีนี้ทิ้ง
 *
 * @param {string} path เส้นทางหลัง /api เช่น "/devices"
 * @param {Record<string, unknown>} [params] query string
 */
export async function apiGet(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    if (!token) await login();

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    if (response.status === 401 && attempt === 0) {
      token = null;
      continue;
    }

    // ชนตัวจำกัดจำนวนคำขอ — รอตามที่เซิร์ฟเวอร์บอกแล้วลองอีกครั้ง
    if (response.status === 429 && attempt === 0) {
      await delay(Number(response.headers.get("retry-after") || 2) * 1000);
      continue;
    }

    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw new Error(problem.title ? `${problem.title}${problem.detail ? ` — ${problem.detail}` : ""}` : `คำขอล้มเหลว (${response.status})`);
    }

    return response.json();
  }

  throw new Error("เรียก API ไม่สำเร็จหลังจากลองใหม่แล้ว");
}

/** ตรวจว่า API ตอบอยู่ไหม ใช้ตอนเริ่มเซิร์ฟเวอร์เพื่อล้มเร็วพร้อมข้อความที่ชัดเจน */
export async function checkApi() {
  const response = await fetch(`${BASE_URL}/health`);
  if (!response.ok) throw new Error(`API ที่ ${BASE_URL} ตอบกลับด้วยสถานะ ${response.status}`);
  return response.json();
}

export { BASE_URL };
