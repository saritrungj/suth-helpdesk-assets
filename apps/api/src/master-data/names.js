// apps/api/src/master-data/names.js
//
// จับคู่ชื่อที่เขียนในไฟล์กับข้อมูลหลัก ด้วยชื่อหลักหรือชื่อเรียกอื่น (ADR-0025)
//
// ไฟล์แต่ละชุดเรียกอาคารเดียวกันต่างกัน เช่น "อาคารรัตนเวชพัฒน์" กับ "รัตนเวชพัฒน์ (RVP)"
// ตัวนำเข้าเคยจับคู่ด้วยชื่อที่ต้องตรงทุกตัวอักษร จึงได้ข้อมูลหลักซ้ำหรือแถวถูกปฏิเสธ
//
// ไม่แตะฐานข้อมูล — ผู้เรียกโหลดชื่อหลักกับชื่อเรียกอื่นมาเอง แล้วใช้ resolver ซ้ำทั้งไฟล์
// ไม่มีการเดาชื่อใกล้เคียง ชื่อที่ไม่รู้จักคืน null ให้คนตัดสินว่าเป็นของใหม่หรือเป็นชื่อเรียกอื่น

// zero-width space / joiner / BOM — ติดมากับการคัดลอกจากเว็บหรือ PDF มองไม่เห็นแต่ทำให้ชื่อไม่ตรง
const INVISIBLE = /[​-‍⁠﻿]/g;

/** ชื่อในรูปที่เก็บลงฐาน — NFC ยุบช่องว่างทุกชนิดเหลือหนึ่งตัว ตัดหัวท้าย */
function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * คีย์สำหรับเทียบ — ไม่สนตัวพิมพ์เล็กใหญ่ ใกล้เคียง utf8mb4_unicode_ci ของฐานแต่ไม่เท่ากันทุกกรณี
 * ด่านของ API ที่ใช้คีย์นี้คือตัวกันหลักว่าชื่อหนึ่งชี้ได้รายการเดียว UNIQUE ของฐานเป็นแค่ชั้นสำรอง
 *
 * ใช้ NFKC (ไม่ใช่ NFC แบบตอนเก็บ) เพราะ "ำ" ตัวเดียวกับ "ํ" + "า" เท่ากันเฉพาะระดับ
 * compatibility — ใช้กับคีย์เทียบเท่านั้น ไม่เปลี่ยนชื่อที่เก็บ
 */
const nameKey = (value) => normalizeName(value).normalize("NFKC").toLowerCase();

/**
 * @param {object} input
 * @param {Array<{ id: number, name: string }>} input.names ชื่อหลัก
 * @param {Array<{ target_id: number, alias: string }>} input.aliases ชื่อเรียกอื่น
 * @returns {{ resolve(text: unknown): { id: number, via: "name" | "alias" } | null }}
 */
function createNameResolver({ names, aliases = [] }) {
  const byKey = new Map();
  // ชื่อเรียกอื่นก่อน แล้วชื่อหลักเขียนทับ — API กันไม่ให้ชนกันอยู่แล้ว แต่ถ้ามีคนแก้
  // ฐานตรงจนชนกัน ชื่อหลักต้องชนะ เพราะเป็นชื่อที่คนเห็นในหน้าจอ
  for (const row of aliases) byKey.set(nameKey(row.alias), { id: row.target_id, via: "alias" });
  for (const row of names) byKey.set(nameKey(row.name), { id: row.id, via: "name" });

  return {
    resolve(text) {
      const key = nameKey(text);
      return key ? byKey.get(key) ?? null : null;
    },
  };
}

module.exports = { normalizeName, nameKey, createNameResolver };
