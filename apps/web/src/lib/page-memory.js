import { readSession, writeSession } from "./session-memory";

/**
 * page-memory.js — เปิดหน้าจากเมนูแล้วได้มุมมองล่าสุดของหน้านั้นในแท็บนี้ (#115)
 *
 * หน้าที่เก็บตัวเลือกไว้ใน URL (ภาพรวม เปรียบเทียบ ทะเบียน …) จำ query ล่าสุดของแต่ละหน้าไว้
 * แล้วเติมกลับเมื่อผู้ใช้เข้าหน้านั้นด้วยลิงก์ที่ไม่มี query ของตัวเอง เช่น กดเมนู ส่วนลิงก์ที่
 * ระบุค่ามาเอง (ปุ่ม "วิเคราะห์ส่วนต่าง" หรือลิงก์ที่มีคนส่งให้) ชนะความจำเสมอ
 *
 * `fy` ไม่ใช่มุมมองของหน้า แต่เป็นปีงบของทั้งแอป — ไม่จำและไม่เติมกลับ ไม่งั้นกลับมาหน้าเดิม
 * แล้วปีงบจะเด้งกลับไปปีเก่าที่เคยดูไว้
 */

const GLOBAL_KEYS = new Set(["fy"]);

/**
 * ค่าที่ลิงก์ส่งมาเพื่อสั่งงานครั้งเดียว ไม่ใช่มุมมอง — เปิดฟอร์มแก้ไข/ย้ายเครื่อง ตัวกรองตั้งต้น
 * จากคำเตือน หรือปลายทางหลังล็อกอิน หน้าที่รับค่าเหล่านี้อ่านครั้งเดียวตอนเปิด ถ้าจำไว้แล้ว
 * เติมกลับ กดเมนูครั้งถัดไปจะเปิดฟอร์มเดิมซ้ำหรือทับตัวกรองที่ผู้ใช้เปลี่ยนไปแล้ว
 */
const ONE_SHOT_KEYS = new Set(["edit", "move", "billing_from", "contract_id", "unassigned", "status", "fill", "redirect"]);

/** query ของมุมมองหน้านั้นเอง — ตัดค่าของทั้งแอป ค่าสั่งงานครั้งเดียว และค่าว่างออก */
export function ownQuery(query = {}) {
  return Object.fromEntries(Object.entries(query)
    .filter(([key, value]) => !GLOBAL_KEYS.has(key) && !ONE_SHOT_KEYS.has(key) && value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b)));
}

export function sameQuery(a, b) {
  return JSON.stringify(ownQuery(a)) === JSON.stringify(ownQuery(b));
}

export function hasActionQuery(query = {}) {
  return Object.keys(query).some(key => ONE_SHOT_KEYS.has(key));
}

const pageKey = (route) => `route:${String(route.name ?? route.path)}`;

/** ติดตั้งกับ router หลังด่านตรวจสิทธิ์ — หน้าที่ตั้ง meta.remember = false ไม่ถูกจำ */
export function installPageMemory(router) {
  router.beforeEach((to, from) => {
    if (to.meta.remember === false || to.name === from.name) return true;
    if (hasActionQuery(to.query) || Object.keys(ownQuery(to.query)).length) return true;
    const saved = readSession(pageKey(to), null);
    if (!saved || !Object.keys(saved).length) return true;
    return { path: to.path, query: { ...to.query, ...saved }, hash: to.hash, replace: true };
  });
  router.afterEach((to, from, failure) => {
    if (failure || to.meta.remember === false) return;
    writeSession(pageKey(to), ownQuery(to.query));
  });
}
